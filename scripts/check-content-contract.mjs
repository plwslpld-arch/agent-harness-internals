#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analysisFiles,
  articleKind,
  parseFrontmatter,
} from './analysis-metadata.mjs';
import { fail } from './lib.mjs';

const depthRules = {
  start: { characters: 2200, paragraphs: 10 },
  harness: { characters: 2400, paragraphs: 12 },
  foundation: { characters: 1800, paragraphs: 8 },
  comparison: { characters: 2200, paragraphs: 10 },
  role: { characters: 1600, paragraphs: 8 },
  lab: { characters: 2000, paragraphs: 8 },
  appendix: { characters: 1000, paragraphs: 5 },
};

function bodyWithoutFrontmatter(content) {
  const { bodyStart } = parseFrontmatter(content);
  return content.split('\n').slice(bodyStart).join('\n');
}

function withoutCode(content) {
  return content.replace(/```[\s\S]*?```/gu, '').replace(/~~~[\s\S]*?~~~/gu, '');
}

function explanatoryDepth(content) {
  const prose = withoutCode(bodyWithoutFrontmatter(content));
  const characters = prose
    .replace(/^#{1,6}\s+.*$/gmu, '')
    .replace(/[\s`*_>|#-]/gu, '')
    .length;
  const paragraphs = prose.split(/\n\s*\n/gu).filter((block) => {
    const text = block.trim();
    if (!text || /^(?:#{1,6}\s|\d+\.\s|[-*+]\s|\|)/u.test(text)) return false;
    return text.replace(/[\s`*_>|#-]/gu, '').length >= 40;
  }).length;
  return { characters, paragraphs };
}

function section(content, names) {
  const accepted = new Set(Array.isArray(names) ? names : [names]);
  const lines = content.split('\n');
  const start = lines.findIndex((line) => {
    const match = /^##\s+(.+?)\s*#*\s*$/u.exec(line);
    return match && accepted.has(match[1]);
  });
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/u.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function requireSection(content, name, errors, label = name) {
  const found = section(content, name);
  if (found === null) errors.push(`缺少“## ${label}”`);
  return found;
}

function orderedSteps(content) {
  return (content?.match(/^\s*\d+\.\s+\S.+$/gmu) ?? []).length;
}

function fencedBlocks(content) {
  return (content?.match(/```[^\n]*\n[\s\S]*?```/gu) ?? []).length;
}

function checkSelfReview(content, errors) {
  const selfReview = requireSection(content, '自检', errors);
  if (selfReview === null) return;
  const questions = selfReview.match(/^###\s+问题(?:\s+\d+)?\s*$/gmu) ?? [];
  const answers = selfReview.match(/^\*\*答案[：:]\*\*\s+\S.+$/gmu) ?? [];
  if (questions.length < 3 || questions.length > 4 || answers.length !== questions.length) {
    errors.push('自检必须包含 3 至 4 个问题及逐题完整答案');
  }
}

function harnessFailures(content, errors) {
  requireSection(content, '读者会得到什么', errors);
  const io = requireSection(content, '真实输入与输出', errors);
  if (io !== null && (!/^###\s+输入\s*$/mu.test(io) || !/^###\s+输出\s*$/mu.test(io) || fencedBlocks(io) < 2)) {
    errors.push('“真实输入与输出”必须同时给出输入、输出和对应数据围栏');
  }
  const chain = requireSection(content, '调用链', errors);
  if (chain !== null && orderedSteps(chain) < 3) errors.push('调用链必须包含至少 3 步有序步骤');
  const source = requireSection(content, '源码证据', errors);
  if (source !== null && fencedBlocks(source) < 1) errors.push('“源码证据”必须包含源码围栏');
  requireSection(content, '失败与限制', errors);
  requireSection(content, '验证方法', errors);
  checkSelfReview(content, errors);
}

function foundationFailures(content, errors) {
  for (const heading of ['读者会得到什么', '核心概念', '最小例子', '常见误区', '验证方法']) {
    requireSection(content, heading, errors);
  }
  checkSelfReview(content, errors);
}

function comparisonFailures(content, errors) {
  for (const heading of ['比较问题', '控制变量', '对照证据', '差异解释', '失败与限制', '验证方法']) {
    requireSection(content, heading, errors);
  }
  checkSelfReview(content, errors);
}

function roleFailures(content, errors) {
  for (const heading of ['适用角色', '决策问题', '风险与边界', '验收清单']) {
    requireSection(content, heading, errors);
  }
  const workflow = requireSection(content, '工作流', errors);
  if (workflow !== null && orderedSteps(workflow) < 3) errors.push('工作流必须包含至少 3 步有序步骤');
  checkSelfReview(content, errors);
}

function labFailures(content, errors) {
  for (const heading of ['实验目标', '前置条件', '输入与环境', '预期结果', '失败与排查', '证据记录']) {
    requireSection(content, heading, errors);
  }
  const steps = requireSection(content, '操作步骤', errors);
  if (steps !== null && orderedSteps(steps) < 3) errors.push('操作步骤必须包含至少 3 步有序步骤');
  if (fencedBlocks(content) < 1) errors.push('实验文章必须包含可执行命令或数据围栏');
  checkSelfReview(content, errors);
}

function appendixFailures(content, errors) {
  for (const heading of ['使用范围', '条目', '失败与限制']) requireSection(content, heading, errors);
}

function startFailures(content, errors) {
  for (const heading of ['这个入口解决什么', '概念地图', '六条主线', '阅读路径', '状态与导航', '证据方法', '本地验证', '边界']) {
    requireSection(content, heading, errors);
  }
  const map = section(content, '概念地图');
  if (map !== null && !/!\[[^\]]*[\u3400-\u9fff][^\]]*\]\(\.\.\/assets\/diagrams\/[a-z0-9/_.-]+\.svg\)/u.test(map)) {
    errors.push('“概念地图”必须嵌入带中文替代文本的正式 SVG');
  }
  checkSelfReview(content, errors);
}

export function contentContractFailures(article) {
  const kind = articleKind(article.relativePath);
  if (!kind) return [];
  const errors = [];
  const content = article.content ?? '';

  if (kind === 'start') startFailures(content, errors);
  else if (kind === 'harness') harnessFailures(content, errors);
  else if (kind === 'foundation') foundationFailures(content, errors);
  else if (kind === 'comparison') comparisonFailures(content, errors);
  else if (kind === 'role') roleFailures(content, errors);
  else if (kind === 'lab') labFailures(content, errors);
  else if (kind === 'appendix') appendixFailures(content, errors);

  const minimum = depthRules[kind];
  const actual = explanatoryDepth(content);
  if (minimum && (actual.characters < minimum.characters || actual.paragraphs < minimum.paragraphs)) {
    errors.push(`解释性正文不足：至少 ${minimum.characters} 个非空白字符和 ${minimum.paragraphs} 个有效段落，当前为 ${actual.characters} / ${actual.paragraphs}`);
  }
  return errors;
}

export function contentContractDisposition(article) {
  const failures = contentContractFailures(article);
  if (['reviewed', 'verified'].includes(article.metadata?.status)) {
    return { errors: failures, warnings: [] };
  }
  if (['draft', 'stale'].includes(article.metadata?.status)) {
    return { errors: [], warnings: failures };
  }
  if (article.metadata?.status === 'outline') return { errors: [], warnings: [] };
  return { errors: [`内容契约无法接受 status=${article.metadata?.status ?? '(缺失)'}`, ...failures], warnings: [] };
}

function main() {
  const files = analysisFiles().filter(({ relativePath }) => articleKind(relativePath));
  const errors = [];
  const warnings = [];
  for (const file of files) {
    const { metadata } = parseFrontmatter(file.content);
    const result = contentContractDisposition({ ...file, metadata });
    for (const error of result.errors) errors.push(`${file.relativePath}: ${error}`);
    for (const warning of result.warnings) warnings.push(`${file.relativePath}: ${warning}`);
  }
  for (const warning of warnings) console.warn(`WARN(draft): ${warning}`);
  if (!fail(errors)) {
    console.log(`内容契约：检查 ${files.length} 篇新结构文章，${warnings.length} 项草稿提示；结构通过不代表结论正确`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
