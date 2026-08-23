#!/usr/bin/env node
// 重锁之后，把「需要人读的锚点」从几百处压到几十处。
//
// check:drift 说 396 处锚点落在已变化的文件上，但文件变了不等于被引的那一行
// 变了。这个脚本对每一处锚点，取旧 commit 和新 commit 在同一行上的内容做比对，
// 分成四档：
//
//   same     行号和内容都没动。不用读。
//   moved    内容还在，挪到了别的行。给出新行号，改完还是要人扫一眼上下文。
//   changed  行号还在，内容变了。必须人读：这一行现在讲的还是原来那件事吗。
//   gone     内容在新版本里找不到了。多半是实现换了，正文结论要重写。
//
// 只有 changed 和 gone 需要人逐条读，moved 可以先按新行号改再抽查。
//
// 用法：
//   node scripts/review-anchors.mjs                     全部 stale 篇
//   node scripts/review-anchors.mjs docs/04-llm-adapter.md
//   node scripts/review-anchors.mjs --write             写进 research/drift/
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, fail, git, readManifest, root } from './lib.mjs';
import {
  canAutoRelocate,
  findPreviousLocks,
  findUniqueNormalizedLine,
  findUniqueNormalizedWindow,
  unchangedCurrentReferenceIndices,
} from './review-history.mjs';

const argv = process.argv.slice(2);
const doWrite = argv.includes('--write');
const doApply = argv.includes('--apply');
const only = argv.filter((arg) => !arg.startsWith('--'));

const { manifest, locks } = readManifest();
const defaultRepo = 'deepseek-harness';
const knownRepos = new Set(manifest.sources.map(({ id }) => id));
const REFERENCE = /(?:([a-z0-9][a-z0-9-]*)!)?((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|mjs|js|rs|py|md|yml|yaml|json)):(\d+)(?:-(\d+))?/gu;

// 上一版 lock 从 git 历史里读，不用手输 SHA。允许中间隔着文档修复提交。
const { map: before, rev } = findPreviousLocks(
  locks,
  (revision) => JSON.parse(git(root, ['show', `${revision}:sources/sources.lock.yml`])),
);
if (!before.size) {
  console.error('从 git 历史里找不到更早的 sources.lock.yml，无从比对。');
  process.exit(2);
}

const blobCache = new Map();
function blobLines(repo, commit, path) {
  const key = `${repo}:${commit}:${path}`;
  if (!blobCache.has(key)) {
    let value = null;
    try {
      value = git(join(checkoutsDir, repo), ['show', `${commit}:${path}`]).split('\n');
    } catch {
      value = null;
    }
    blobCache.set(key, value);
  }
  return blobCache.get(key);
}

function normalize(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

const buckets = { same: [], moved: [], updated: [], changed: [], gone: [] };
const perDoc = new Map();

function referenceTokens(content) {
  const tokens = [];
  let inFence = false;
  for (const line of content.split('\n')) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) tokens.push(...[...line.matchAll(REFERENCE)].map((match) => match[0]));
  }
  return tokens;
}

for (const file of analysisFiles()) {
  if (only.length && !only.some((needle) => file.relativePath.endsWith(needle))) continue;
  const { metadata } = parseFrontmatter(file.content);
  const bound = new Set((metadata?.sources ?? []).map(({ repo }) => repo).filter(Boolean));
  const candidates = bound.size ? [...bound] : [defaultRepo];
  const lines = file.content.split('\n');
  let oldDocument = null;
  try {
    oldDocument = git(root, ['show', `${rev}:${file.relativePath}`]);
  } catch {
    // 新增文章没有上一版，全部视为已经人工写过，不做机械迁移。
  }
  const untouched = oldDocument === null
    ? new Set()
    : unchangedCurrentReferenceIndices(referenceTokens(oldDocument), referenceTokens(file.content));
  let referenceIndex = 0;
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/u.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    for (const match of line.matchAll(REFERENCE)) {
      const [, explicitRepo, path, startRaw, endRaw] = match
      const currentReferenceIndex = referenceIndex;
      referenceIndex += 1;
      const repos = explicitRepo ? [explicitRepo] : candidates;
      const repo = repos.find((id) => knownRepos.has(id) && existsSync(join(checkoutsDir, id, path)))
        ?? repos.find((id) => knownRepos.has(id));
      if (!repo || !knownRepos.has(repo)) continue;
      const oldCommit = before.get(repo);
      const newCommit = locks.get(repo)?.commit;
      if (!oldCommit || !newCommit || oldCommit === newCommit) continue;
      const oldLines = blobLines(repo, oldCommit, path);
      const newLines = blobLines(repo, newCommit, path);
      const start = Number(startRaw);
      const where = `${file.relativePath}:${index + 1}`;
      const ref = `${repo}!${path}:${startRaw}`;
      if (!oldLines || start > oldLines.length) continue;
      const oldText = normalize(oldLines[start - 1]);
      if (!oldText) continue;
      const quoted = /^`?[\s（(]*「([^」]{4,})」/u.exec(line.slice(match.index + match[0].length))?.[1] ?? null;
      const entry = { where, ref, oldText, file: file.path, docLine: index, path, startRaw, endRaw, quoted };
      if (!untouched.has(currentReferenceIndex)) {
        buckets.updated.push(entry);
        const row = perDoc.get(file.relativePath) ?? { same: 0, moved: 0, updated: 0, changed: 0, gone: 0 };
        row.updated += 1;
        perDoc.set(file.relativePath, row);
        continue;
      }
      let bucket;
      if (!newLines) {
        buckets.gone.push({ ...entry, note: '文件在新版本里不存在' });
        bucket = 'gone';
      } else if (start <= newLines.length && normalize(newLines[start - 1]) === oldText) {
        buckets.same.push(entry);
        bucket = 'same';
      } else {
        const at = findUniqueNormalizedLine(newLines, oldText)
          ?? findUniqueNormalizedWindow(oldLines, newLines, start - 1);
        if (at !== null) {
          const rangeLength = endRaw ? Number(endRaw) - start : 0;
          buckets.moved.push({
            ...entry,
            to: at + 1,
            canApply: canAutoRelocate(quoted, newLines, at, at + rangeLength),
          });
          bucket = 'moved';
        } else if (start <= newLines.length) {
          buckets.changed.push({ ...entry, newText: normalize(newLines[start - 1]) });
          bucket = 'changed';
        } else {
          buckets.gone.push({ ...entry, note: `新版本只有 ${newLines.length} 行` });
          bucket = 'gone';
        }
      }
      const row = perDoc.get(file.relativePath) ?? { same: 0, moved: 0, updated: 0, changed: 0, gone: 0 };
      row[bucket] += 1;
      perDoc.set(file.relativePath, row);
    }
  });
}

const total = Object.values(buckets).reduce((sum, list) => sum + list.length, 0);
const needsReading = buckets.changed.length + buckets.gone.length;

const out = [];
out.push(`# 锚点复核工作量：${rev} → 当前 lock`, '');
out.push(`比对了 ${total} 处落在已变化文件上的锚点。**真正需要人读的是 ${needsReading} 处**；${buckets.updated.length} 处已在中间提交里更新，${buckets.same.length} 处行号内容没动，${buckets.moved.length} 处仍可机械平移。`, '');
out.push('| 档 | 数量 | 怎么处理 |');
out.push('| --- | ---: | --- |');
out.push(`| same 未动 | ${buckets.same.length} | 不用读 |`);
out.push(`| moved 挪位 | ${buckets.moved.length} | 按新行号改，改完抽查上下文 |`);
out.push(`| updated 已更新 | ${buckets.updated.length} | 中间提交已经改过，不再自动触碰 |`);
out.push(`| changed 内容变了 | ${buckets.changed.length} | **必须人读**：这一行现在讲的还是原来那件事吗 |`);
out.push(`| gone 找不到了 | ${buckets.gone.length} | **必须人读**：多半实现换了，正文结论要重写 |`);
out.push('');

out.push('## 逐篇', '');
out.push('| 篇目 | 需要人读 | same | moved | updated | changed | gone |');
out.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [path, row] of [...perDoc].sort((a, b) => (b[1].changed + b[1].gone) - (a[1].changed + a[1].gone))) {
  out.push(`| \`${path}\` | ${row.changed + row.gone} | ${row.same} | ${row.moved} | ${row.updated} | ${row.changed} | ${row.gone} |`);
}
out.push('');

if (buckets.gone.length) {
  out.push('## gone：内容在新版本里找不到了', '');
  for (const item of buckets.gone) {
    out.push(`- \`${item.where}\` 引 \`${item.ref}\`（${item.note}）`);
    out.push(`  - 原行：\`${item.oldText.slice(0, 120)}\``);
  }
  out.push('');
}

if (buckets.changed.length) {
  out.push('## changed：行号还在，内容变了', '');
  for (const item of buckets.changed) {
    out.push(`- \`${item.where}\` 引 \`${item.ref}\``);
    out.push(`  - 旧：\`${item.oldText.slice(0, 120)}\``);
    out.push(`  - 新：\`${item.newText.slice(0, 120)}\``);
  }
  out.push('');
}

if (buckets.moved.length) {
  out.push('## moved：内容没变，行号要改', '');
  out.push('| 出处 | 引用 | 新行号 |');
  out.push('| --- | --- | ---: |');
  for (const item of buckets.moved) out.push(`| \`${item.where}\` | \`${item.ref}\` | ${item.to} |`);
  out.push('');
}

// moved 那一档内容逐字未变，只是位置挪了，可以机器改。区间引用按同一位移
// 平移终点，免得 `:120-130` 被改成 `:88-130` 这种跨了半个文件的假区间。
if (doApply) {
  const applicable = buckets.moved.filter(item => item.canApply);
  const byFile = new Map();
  for (const item of applicable) {
    if (!byFile.has(item.file)) byFile.set(item.file, []);
    byFile.get(item.file).push(item);
  }
  let applied = 0;
  for (const [path, items] of byFile) {
    const lines = readFileSync(path, 'utf8').split('\n');
    for (const item of items) {
      const from = item.endRaw ? `${item.path}:${item.startRaw}-${item.endRaw}` : `${item.path}:${item.startRaw}`;
      const shift = item.to - Number(item.startRaw);
      const to = item.endRaw
        ? `${item.path}:${item.to}-${Number(item.endRaw) + shift}`
        : `${item.path}:${item.to}`;
      const line = lines[item.docLine];
      if (!line?.includes(from)) continue;
      lines[item.docLine] = line.split(from).join(to);
      applied += 1;
    }
    writeFileSync(path, lines.join('\n'));
  }
  console.log(`已把 ${applied} 处带原文引句、且新位置匹配的引用改到新行号。`);
  console.log(`另有 ${buckets.moved.length - applicable.length} 处无可核引句，只报告不自动改；changed 与 gone 两档也不动。`);
  process.exit(0);
}

const report = `${out.join('\n')}\n`;
if (doWrite) {
  const dir = join(root, 'research', 'drift');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'anchor-review.md'), report);
  console.log('报告已写入 research/drift/anchor-review.md');
  console.log(`需要人读 ${needsReading} 处（changed ${buckets.changed.length} + gone ${buckets.gone.length}），moved ${buckets.moved.length} 处可按新行号直接改。`);
} else {
  console.log(report);
}
fail([]);
