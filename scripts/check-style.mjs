#!/usr/bin/env node
// 中文文风门禁。
//
// 这个仓库有十一道门禁守事实，文风一道都没有。上一轮人工改写把破折号从
// 478 处压到 44 处、把引号统一成「」，但没有门禁，`docs/14` 和 `docs/02`
// 里仍有残留，而且新写的文章会让它涨回去。
//
// 规则表在 scripts/style-rules.json，阈值由现有正文标定。词汇层的病灶
// 这里查得住；句子节奏那一层查不住，只能靠「说人话」skill 改写，两者互补。
//
// protected spans 与 check:anchors 用同一套定义：frontmatter、代码块、
// 行内 code、`路径:行号` 引用。它们一律不参与文风判断。
//
// 用法：
//   node scripts/check-style.mjs            门禁模式，error 级规则不过就失败
//   node scripts/check-style.mjs --report    只报告，列出每篇的全部指标
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { listProjectFiles, posixPath, root, fail } from './lib.mjs';

const reportOnly = process.argv.includes('--report');
const config = JSON.parse(readFileSync(join(root, 'scripts', 'style-rules.json'), 'utf8'));
const { rules } = config;

const HAN = /[一-龥]/gu;

// docs/ 下的正文，加根目录几篇中文说明。AGENTS.md 与 CHANGELOG 是给写作者
// 看的规则与流水账，不按正文标准要求。
function targetFiles() {
  const roots = new Set(['README.md', 'CONTRIBUTING.md']);
  return listProjectFiles()
    .map((path) => posixPath(relative(root, path)))
    .filter((rel) => (rel.startsWith('docs/') && rel.endsWith('.md')) || roots.has(rel))
    .sort();
}

// 划掉 protected spans。行号保持不变，方便报错时指位置。
function stripProtected(content) {
  const lines = content.split('\n');
  const out = [];
  let inFrontmatter = lines[0] === '---';
  let inFence = false;
  lines.forEach((line, index) => {
    if (inFrontmatter) {
      out.push('');
      if (index > 0 && line === '---') inFrontmatter = false;
      return;
    }
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      out.push('');
      return;
    }
    if (inFence) {
      out.push('');
      return;
    }
    // `> —— 路径:行号` 是引用块的出处行，破折号在这里是引用格式不是连接符。
    if (/^\s*>\s*——/u.test(line)) {
      out.push('');
      return;
    }
    out.push(line
      .replace(/`[^`\n]*`/gu, ' ')
      .replace(/(?:[\w.-]+\/)+[\w.-]+\.\w+:\d+(?:-\d+)?/gu, ' ')
      .replace(/https?:\/\/\S+/gu, ' '));
  });
  return out;
}

function hanCount(text) {
  return (text.match(HAN) || []).length;
}

// 以 ASCII 为主的行多半是上游英文原文，中文标点规则不适用。
function isAsciiDominant(line) {
  const letters = (line.match(/[A-Za-z]/gu) || []).length;
  const han = hanCount(line);
  return letters > 0 && letters / (letters + han * 2 + 1) >= rules.englishNeedsChinese.minAsciiRatio;
}

function sentenceStats(lines) {
  const lengths = lines.join('\n')
    .split(/[。！？\n]/u)
    .map(hanCount)
    .filter((n) => n > 4);
  if (!lengths.length) return { count: 0, mean: 0, cv: 0 };
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
  return { count: lengths.length, mean, cv: mean ? sd / mean : 0 };
}

const errors = [];
const warnings = [];
const report = [];

function record(severity, message) {
  (severity === 'error' ? errors : warnings).push(message);
}

for (const rel of targetFiles()) {
  const lines = stripProtected(readFileSync(join(root, rel), 'utf8'));
  const body = lines.join('\n');
  const chars = hanCount(body);
  if (chars < 200) continue;
  const perK = chars / 1000;
  const row = { file: rel, chars };

  // 破折号密度
  const dashes = (body.match(/——/gu) || []).length;
  row.dash = dashes;
  row.dashPerK = dashes / perK;
  if (dashes >= rules.dashDensity.minCount && row.dashPerK > rules.dashDensity.maxPerThousandChars) {
    record(rules.dashDensity.severity,
      `${rel}: 破折号 ${dashes} 处，每千字 ${row.dashPerK.toFixed(2)}，超过 ${rules.dashDensity.maxPerThousandChars}`);
  }

  // 禁用词
  const banned = [];
  for (const phrase of rules.bannedPhrases.phrases) {
    const hits = body.match(new RegExp(phrase, 'gu'));
    if (hits) banned.push(`${phrase}×${hits.length}`);
  }
  row.banned = banned;
  if (banned.length > rules.bannedPhrases.max) {
    lines.forEach((line, index) => {
      for (const phrase of rules.bannedPhrases.phrases) {
        if (new RegExp(phrase, 'u').test(line)) {
          record(rules.bannedPhrases.severity, `${rel}:${index + 1}: 禁用表达「${line.match(new RegExp(phrase, 'u'))[0]}」`);
        }
      }
    });
  }

  // 对仗句
  const anti = (body.match(new RegExp(rules.antithesis.pattern, 'gu')) || []);
  row.antithesis = anti.length;
  row.antiPerK = anti.length / perK;
  if (anti.length >= rules.antithesis.minCount && row.antiPerK > rules.antithesis.maxPerThousandChars) {
    record(rules.antithesis.severity,
      `${rel}: 「不是 X，而是 Y」对仗 ${anti.length} 处，每千字 ${row.antiPerK.toFixed(2)}，超过 ${rules.antithesis.maxPerThousandChars}（${anti.slice(0, 3).join(' / ')}）`);
  }

  // 引号统一
  let straight = 0;
  lines.forEach((line, index) => {
    if (isAsciiDominant(line)) return;
    const hits = line.match(/[“”‘’]/gu);
    if (!hits) return;
    straight += hits.length;
    record(rules.quoteStyle.severity, `${rel}:${index + 1}: 中文正文里出现弯引号，应统一为「」`);
  });
  row.straightQuotes = straight;

  // 英文引用块之后必须紧跟中文
  let missingTranslation = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*>/u.test(lines[index])) continue;
    const start = index;
    while (index < lines.length && /^\s*>/u.test(lines[index])) index += 1;
    const quoted = lines.slice(start, index).join(' ');
    if (!isAsciiDominant(quoted) || hanCount(quoted) > 4) continue;
    const after = lines.slice(index, index + rules.englishNeedsChinese.lookaheadLines + 1).join(' ');
    if (hanCount(after) >= 4) continue;
    missingTranslation += 1;
    record(rules.englishNeedsChinese.severity,
      `${rel}:${start + 1}: 英文引用块之后 ${rules.englishNeedsChinese.lookaheadLines} 行内没有中文译文`);
  }
  row.missingTranslation = missingTranslation;

  // 句子节奏（实验性，只报告）
  const stats = sentenceStats(lines);
  row.sentences = stats.count;
  row.meanLen = stats.mean;
  row.cv = stats.cv;
  if (stats.count >= rules.sentenceRhythm.minSentences) {
    if (stats.cv < rules.sentenceRhythm.minCoefficientOfVariation) {
      record(rules.sentenceRhythm.severity,
        `${rel}: 句长变异系数 ${stats.cv.toFixed(2)}，低于 ${rules.sentenceRhythm.minCoefficientOfVariation}，句子被写得太齐`);
    }
    if (stats.mean < rules.sentenceLength.minMeanChars) {
      record(rules.sentenceLength.severity,
        `${rel}: 均句长 ${stats.mean.toFixed(1)} 字，短于 ${rules.sentenceLength.minMeanChars}`);
    }
    if (stats.mean > rules.sentenceLength.maxMeanChars) {
      record(rules.sentenceLength.severity,
        `${rel}: 均句长 ${stats.mean.toFixed(1)} 字，长于 ${rules.sentenceLength.maxMeanChars}`);
    }
  }

  report.push(row);
}

if (reportOnly) {
  const pad = (value, width) => String(value).padStart(width);
  console.log('文件'.padEnd(32) + pad('中文字', 7) + pad('破折/千', 8) + pad('弯引号', 7) + pad('对仗', 5) + pad('缺译', 5) + pad('句数', 5) + pad('均句长', 7) + pad('变异', 6));
  for (const row of report) {
    console.log(
      row.file.padEnd(32)
      + pad(row.chars, 7)
      + pad(row.dashPerK.toFixed(2), 8)
      + pad(row.straightQuotes, 7)
      + pad(row.antithesis, 5)
      + pad(row.missingTranslation, 5)
      + pad(row.sentences, 5)
      + pad(row.meanLen.toFixed(1), 7)
      + pad(row.cv.toFixed(2), 6),
    );
  }
  const withBanned = report.filter((row) => row.banned.length);
  if (withBanned.length) {
    console.log('\n禁用表达：');
    for (const row of withBanned) console.log(`  ${row.file}: ${row.banned.join('  ')}`);
  }
  process.exit(0);
}

for (const warning of warnings) console.warn(`提醒：${warning}`);
if (!fail(errors)) console.log(`已检查 ${report.length} 篇的文风，${warnings.length} 条提醒`);
