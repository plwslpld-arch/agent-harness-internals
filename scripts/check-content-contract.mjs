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
  harness: { characters: 6500, paragraphs: 18 },
  foundation: { characters: 4500, paragraphs: 16 },
  comparison: { characters: 3800, paragraphs: 14 },
  role: { characters: 3200, paragraphs: 12 },
  lab: { characters: 3800, paragraphs: 14 },
  sample: { characters: 3200, paragraphs: 14 },
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

function unorderedItems(content) {
  return (content?.match(/^\s*[-*+]\s+\S.+$/gmu) ?? []).length;
}

function markdownTableDataRows(content) {
  const rows = content?.split('\n').filter((line) => /^\|.+\|\s*$/u.test(line.trim())) ?? [];
  return rows.filter((line) => !/^\|(?:\s*:?-+:?\s*\|)+\s*$/u.test(line.trim())).length - 1;
}

function requireSectionDepth(content, name, errors, minimum) {
  const found = requireSection(content, name, errors);
  if (found === null) return null;
  const actual = explanatoryDepth(found);
  if (actual.characters < minimum.characters || actual.paragraphs < minimum.paragraphs) {
    errors.push(`“${name}”讲解不足：至少 ${minimum.characters} 个非空白字符和 ${minimum.paragraphs} 个有效段落，当前为 ${actual.characters} / ${actual.paragraphs}`);
  }
  return found;
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
  const concepts = requireSectionDepth(content, '核心概念', errors, { characters: 600, paragraphs: 3 });
  if (concepts !== null && markdownTableDataRows(concepts) < 4) {
    errors.push('“核心概念”必须用表格解释至少 4 个概念、含义与重要性');
  }
  requireSectionDepth(content, '为什么这样设计', errors, { characters: 500, paragraphs: 3 });
  const implementation = requireSectionDepth(content, '实现思路', errors, { characters: 700, paragraphs: 3 });
  if (implementation !== null && orderedSteps(implementation) < 4) {
    errors.push('“实现思路”必须包含至少 4 步实现流程');
  }
  if (implementation !== null && fencedBlocks(implementation) < 1) {
    errors.push('“实现思路”必须包含可核对的伪代码或接口数据围栏');
  }
  const workedExample = requireSectionDepth(content, '贯穿案例', errors, { characters: 700, paragraphs: 3 });
  if (workedExample !== null && orderedSteps(workedExample) < 4) {
    errors.push('“贯穿案例”必须包含至少 4 步状态演进');
  }
  if (workedExample !== null && fencedBlocks(workedExample) < 2) {
    errors.push('“贯穿案例”必须同时给出至少两份输入、状态或输出数据');
  }
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

function claudeEntryFailures(content, errors) {
  if (!/(?:Claude Code[^\n。；]{0,40}闭源产品|闭源产品[^\n。；]{0,40}Claude Code)/u.test(content)) {
    errors.push('Claude 一级入口必须声明 Claude Code 是闭源产品，并限定为官方公开契约');
  }
  if (!/Python Agent SDK[^\n。；]{0,80}(?:主体源码|源码与测试)/u.test(content)) {
    errors.push('Claude 一级入口必须声明 Python Agent SDK 具有可核对的主体源码与测试');
  }
  if (!/TypeScript Agent SDK[^\n。；]{0,120}(?:没有|不包含)[^\n。；]{0,40}主体源码/u.test(content)
      || !/README/u.test(content)
      || !/CHANGELOG/u.test(content)
      || !/Session Store/u.test(content)) {
    errors.push('Claude 一级入口必须声明 TypeScript Agent SDK 主体源码不可用，并限定 README、CHANGELOG 与 Session Store 示例边界');
  }
  const claims = new Set(content.match(/\bClaim:\s*[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/gu) ?? []);
  if (claims.size < 2) errors.push('Claude 一级入口必须引用至少两个正式 Claim');
}

function piEntryFailures(content, errors) {
  if (!/ai、agent 与 coding-agent/u.test(content)
      || !/Session/u.test(content)
      || !/Protocol/u.test(content)
      || !/Telemetry/u.test(content)
      || !/Evals/u.test(content)) {
    errors.push('pi 一级入口必须声明 ai、agent 与 coding-agent 三层组合，以及 Session、Protocol、Telemetry 与 Evals 横切表面');
  }
  if (!/现行运行时源码[\s\S]{0,120}设计文档[\s\S]{0,120}扩展示例[\s\S]{0,120}外部项目/u.test(content)
      || !/(?:不等于|不能证明)[^\n。；]{0,50}默认运行能力/u.test(content)) {
    errors.push('pi 一级入口必须分开现行运行时源码、设计文档、扩展示例和外部项目');
  }
  if (!/默认继承[^\n。；]{0,50}宿主进程权限/u.test(content)
      || !/不内建[^\n。；]{0,80}(?:文件系统|进程|网络|凭据)[^\n。；]{0,80}隔离/u.test(content)
      || !/(?:外部容器|外部[^\n。；]{0,20}沙箱)/u.test(content)) {
    errors.push('pi 一级入口必须声明默认宿主权限以及外部容器或沙箱边界');
  }
  const claims = new Set(content.match(/\bClaim:\s*[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/gu) ?? []);
  if (claims.size < 2) errors.push('pi 一级入口必须引用至少两个正式 Claim');
}

function opencodeEntryFailures(content, errors) {
  if (!/Project\/Config[\s\S]{0,260}Provider[\s\S]{0,260}Session[\s\S]{0,260}(?:Processor|工具)/u.test(content)) {
    errors.push('OpenCode 一级入口必须声明 Project/Config、Provider、Session 与 Processor/工具的服务化任务主链');
  }
  if (!/权限[\s\S]{0,180}(?:不等于|不是)[\s\S]{0,80}(?:沙箱|操作系统隔离)/u.test(content)) {
    errors.push('OpenCode 一级入口必须声明权限询问不等于操作系统沙箱');
  }
  if (!/(?:测试|Telemetry|遥测|Share|分享)[\s\S]{0,260}(?:不等于|不能替代)[\s\S]{0,120}(?:独立评测|发布门禁|Scorer)/u.test(content)) {
    errors.push('OpenCode 一级入口必须声明测试、遥测或分享不能替代独立评测与发布门禁');
  }
  const claims = new Set(content.match(/^Claim:\s+[a-z0-9.-]+$/gmu) ?? []);
  if (claims.size < 2) errors.push('OpenCode 一级入口必须引用至少两个正式 Claim');
}

function harnessEntryFailures(content, errors, relativePath) {
  const course = requireSection(content, '课程状态与顺序', errors);
  if (course !== null && !/^\|[^\n]*状态[^\n]*\|/mu.test(course)) {
    errors.push('“课程状态与顺序”必须包含状态表');
  }
  if (!/!\[[^\]]*系统架构[^\]]*\]\((?:\.\.\/)+assets\/diagrams\/[a-z0-9/_.-]+\/system-architecture\.svg\)/u.test(content)) {
    errors.push('一级主线入口必须嵌入正式中文系统架构图');
  }
  if (!/!\[[^\]]*端到端任务[^\]]*\]\((?:\.\.\/)+assets\/diagrams\/[a-z0-9/_.-]+\/end-to-end-task\.svg\)/u.test(content)) {
    errors.push('一级主线入口必须嵌入正式中文端到端任务流程图');
  }
  if (!/\bClaim:\s*[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/u.test(content)) {
    errors.push('一级主线入口必须引用至少一个正式 Claim');
  }
  if (relativePath === 'docs/harnesses/claude/README.md') claudeEntryFailures(content, errors);
  if (relativePath === 'docs/harnesses/pi/README.md') piEntryFailures(content, errors);
  if (relativePath === 'docs/harnesses/opencode/README.md') opencodeEntryFailures(content, errors);
}

function foundationFailures(content, errors) {
  for (const heading of ['读者会得到什么', '核心概念', '为什么这样设计', '最小例子', '最小实现', '常见误区', '验证方法', '验证练习']) {
    requireSection(content, heading, errors);
  }
  const implementation = section(content, '最小实现');
  if (implementation !== null && orderedSteps(implementation) < 4) errors.push('“最小实现”必须包含至少 4 步实现流程');
  if (implementation !== null && fencedBlocks(implementation) < 1) errors.push('“最小实现”必须包含接口或伪代码围栏');
  if (!/!\[[^\]]*[\u3400-\u9fff][^\]]*\]\((?:\.\.\/)+assets\/diagrams\/[a-z0-9/_.-]+\.svg\)/u.test(content)) {
    errors.push('共同基础必须嵌入带中文替代文本的正式中文 SVG');
  }
  if (!/\bClaim:\s*[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/u.test(content)) {
    errors.push('共同基础必须引用至少一个正式 Claim');
  }
  checkSelfReview(content, errors);
}

function comparisonFailures(content, errors) {
  for (const heading of ['比较问题', '共同抽象', '控制变量', '对照证据', '差异解释', '失败与限制', '验证方法', '迁移练习']) {
    requireSection(content, heading, errors);
  }
  const evidence = section(content, '对照证据');
  if (evidence !== null && markdownTableDataRows(evidence) < 6) errors.push('“对照证据”必须包含六条主线的独立证据行');
  checkSelfReview(content, errors);
}

function roleFailures(content, errors) {
  for (const heading of ['适用角色', '学习目标', '前置知识', '决策问题', '实践任务', '风险与边界', '验收清单', '作品证据']) {
    requireSection(content, heading, errors);
  }
  const workflow = requireSection(content, '工作流', errors);
  if (workflow !== null && orderedSteps(workflow) < 4) errors.push('工作流必须包含至少 4 步有序步骤');
  const acceptance = section(content, '验收清单');
  if (acceptance !== null && unorderedItems(acceptance) < 4) errors.push('“验收清单”必须包含至少 4 条可检查标准');
  checkSelfReview(content, errors);
}

function labFailures(content, errors) {
  for (const heading of ['实验目标', '前置条件', '输入与环境', '变量控制', '预期结果', '失败与排查', '失败判定', '原始记录', '证据记录']) {
    requireSection(content, heading, errors);
  }
  const steps = requireSection(content, '操作步骤', errors);
  if (steps !== null && orderedSteps(steps) < 4) errors.push('操作步骤必须包含至少 4 步有序步骤');
  if (fencedBlocks(content) < 2) errors.push('实验文章必须同时包含可执行命令和原始数据围栏');
  checkSelfReview(content, errors);
}

function sampleFailures(content, errors) {
  for (const heading of ['样本定位', '独特机制', '源码入口', '实现接缝', '与一级主线的关系', '适用边界', '失败与限制', '验证方法']) {
    requireSection(content, heading, errors);
  }
  const chain = requireSection(content, '运行链', errors);
  if (chain !== null && orderedSteps(chain) < 3) errors.push('运行链必须包含至少 3 步有序步骤');
  if (!/!\[[^\]]*[\u3400-\u9fff][^\]]*\]\((?:\.\.\/)+assets\/diagrams\/samples\/[a-z0-9/_.-]+\.svg\)/u.test(content)) {
    errors.push('扩展样本必须嵌入带中文替代文本的正式中文 SVG');
  }
  const claims = new Set(content.match(/\bClaim:\s*[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+/gu) ?? []);
  if (claims.size < 2) errors.push('扩展样本必须引用至少两条正式 Claim');
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
  else if (kind === 'harness') {
    harnessFailures(content, errors);
    if (article.relativePath.endsWith('/README.md')) harnessEntryFailures(content, errors, article.relativePath);
  }
  else if (kind === 'foundation') foundationFailures(content, errors);
  else if (kind === 'comparison') comparisonFailures(content, errors);
  else if (kind === 'role') roleFailures(content, errors);
  else if (kind === 'lab') labFailures(content, errors);
  else if (kind === 'sample') sampleFailures(content, errors);
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
