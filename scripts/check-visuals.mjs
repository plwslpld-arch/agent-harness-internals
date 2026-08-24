#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, posixPath, readDocument, root } from './lib.mjs';

const diagramTypes = new Set(['architecture', 'flow', 'sequence', 'state', 'data-flow', 'decision-tree', 'brand']);
const han = /[\u3400-\u9fff]/u;
const allowedPhrases = [
  'Claude Agent SDK',
  'LM Evaluation Harness',
  'DeepSeek Harness',
  'Terminal-Bench',
  'mini-swe-agent',
  'Inspect AI',
  'SWE-bench',
  'Gemini CLI',
  'Qwen Code',
  'Claude Code',
  'Claude',
  'Agent Loop',
  'OpenHands',
  'OpenCode',
  'Anthropic',
  'DeepSeek',
  'OpenAI',
  'Google',
  'Gemini',
  'Aider',
  'Cline',
  'goose',
  'Codex',
  'DSH',
  'MCP',
  'MCP Server',
  'App Server',
  'Cloud',
  'OTel',
  'Feedback',
  'RewardAdapter',
  'Reward',
  'Artifact',
  'Scorer',
  'holdout',
  'LSP',
  'JSONL',
  'JSON',
  'YAML',
  'HTTP',
  'HTTPS',
  'SSE',
  'WebSocket',
  'Session',
  'Thread',
  'Turn',
  'Rollout',
  'Trial',
  'Context',
  'Memory',
  'Prompt',
  'Agent',
  'Harness',
  'Eval',
  'Tool',
  'Trace',
  'Hook',
  'Skill',
  'Plugin',
  'Connector',
  'Feature',
  'Schema',
  'Code Mode',
  'Policy',
  'Sandbox',
  'GitHub',
  'Node.js',
  'TypeScript',
  'Python',
  'Rust',
  'Bash',
  'PowerShell',
  'Docker',
  'Kubernetes',
  'macOS',
  'Linux',
  'Windows',
  'SQLite',
  'KV-Cache',
  'RAG',
  'SDK',
  'API',
  'CLI',
  'pi',
  'default',
  'optional',
  'extension',
  'external',
  'absent',
  'unknown',
  'not-applicable',
];

function stripTags(value) {
  return value.replace(/<[^>]+>/gu, ' ').replace(/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/giu, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function unexplainedEnglish(value) {
  let remaining = value;
  for (const phrase of [...allowedPhrases].sort((a, b) => b.length - a.length)) {
    remaining = remaining.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'giu'), ' ');
  }
  remaining = remaining
    .replace(/[\u3400-\u9fff]/gu, ' ')
    .replace(/\b[A-Z][A-Z0-9_-]+\b/gu, ' ')
    .replace(/\b[a-z]+[A-Z][A-Za-z0-9_$]*\b/gu, ' ')
    .replace(/\b[A-Za-z0-9_@$.-]+[./:_-][A-Za-z0-9_@./:$-]+\b/gu, ' ')
    .replace(/\bv?\d+(?:\.\d+)+\b/giu, ' ');
  return remaining.match(/[A-Za-z]{2,}/gu) ?? [];
}

function manifestEntryFailures(entry, index) {
  const label = `diagrams[${index}]`;
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [`${label}: 必须是对象`];
  for (const field of ['id', 'path', 'type', 'scope', 'alt']) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) errors.push(`${label}: 缺少 ${field}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.id ?? '')) errors.push(`${label}: id 非法`);
  if (!diagramTypes.has(entry.type)) errors.push(`${label}: type 非法：${entry.type}`);
  if (!/^assets\/(?:brand|diagrams)\/[a-z0-9][a-z0-9/_.-]*\.svg$/u.test(entry.path ?? '')
    || entry.path?.includes('..')
    || entry.path?.includes('\\')) {
    errors.push(`${label}: path 必须指向正式品牌或图示目录中的 SVG`);
  }
  if (!han.test(entry.alt ?? '')) errors.push(`${label}: 缺少中文 alt`);
  else if (unexplainedEnglish(entry.alt).length) errors.push(`${label}: alt 含未解释的英文自然语言`);
  if (!Array.isArray(entry.claims)) {
    errors.push(`${label}: claims 必须是数组`);
  } else {
    for (const claim of entry.claims) {
      if (!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u.test(claim)) {
        errors.push(`${label}: Claim ID 非法：${claim}`);
      }
    }
  }
  return errors;
}

export function manifestFailures(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push('图示 Manifest schemaVersion 必须是 1');
  if (!Array.isArray(manifest?.diagrams)) return [...errors, '图示 Manifest diagrams 必须是数组'];
  const ids = new Set();
  const paths = new Set();
  manifest.diagrams.forEach((entry, index) => {
    errors.push(...manifestEntryFailures(entry, index));
    if (typeof entry?.id === 'string') {
      if (ids.has(entry.id)) errors.push(`重复的图示 id：${entry.id}`);
      ids.add(entry.id);
    }
    if (typeof entry?.path === 'string') {
      if (paths.has(entry.path)) errors.push(`重复的图示 path：${entry.path}`);
      paths.add(entry.path);
    }
  });
  return errors;
}

export function visualFailures(asset, manifestEntry) {
  const errors = manifestEntryFailures(manifestEntry, 0).map((error) => error.replace(/^diagrams\[0\]:\s*/u, ''));
  if (!asset) return [...errors, `${manifestEntry?.path ?? '(缺失 path)'}: 源文件不存在`];
  if (asset.path !== manifestEntry?.path) errors.push(`资产路径 ${asset.path} 与 Manifest 不一致`);
  const content = asset.content ?? '';
  if (!/<svg\b/iu.test(content)) errors.push('文件不是 SVG');

  const title = stripTags(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/iu.exec(content)?.[1] ?? '');
  const desc = stripTags(/<desc(?:\s[^>]*)?>([\s\S]*?)<\/desc>/iu.exec(content)?.[1] ?? '');
  if (!han.test(title)) errors.push('SVG 必须包含中文 <title>');
  if (!han.test(desc)) errors.push('SVG 必须包含中文 <desc>');

  const visible = [
    title,
    desc,
    ...[...content.matchAll(/<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/giu)].map((match) => stripTags(match[1])),
    ...[...content.matchAll(/\baria-label\s*=\s*["']([^"']+)["']/giu)].map((match) => stripTags(match[1])),
  ].filter(Boolean);
  for (const text of visible) {
    const words = unexplainedEnglish(text);
    if (words.length) errors.push(`可见文字含未解释的英文自然语言：${text}`);
  }

  if (/<(?:script|foreignObject)\b|<!DOCTYPE\b/iu.test(content)) errors.push('SVG 含不安全元素');
  if (/\son[a-z]+\s*=/iu.test(content)) errors.push('SVG 含事件处理器');
  if (/(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/iu.test(content)
    || /url\(\s*["']?(?:https?:|data:|\/\/)/iu.test(content)) {
    errors.push('SVG 含外部资源');
  }
  return errors;
}

function svgFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.svg')) files.push(path);
    }
  }
  visit(directory);
  return files.sort();
}

function main() {
  const manifestPath = join(root, 'assets', 'diagrams', 'manifest.yml');
  const manifest = readDocument(manifestPath);
  const errors = manifestFailures(manifest);
  const entriesByPath = new Map((manifest.diagrams ?? []).map((entry) => [entry.path, entry]));
  const files = [
    ...svgFiles(join(root, 'assets', 'brand')),
    ...svgFiles(join(root, 'assets', 'diagrams')),
  ];
  const scanned = new Set(files.map((path) => posixPath(relative(root, path))));

  for (const path of scanned) {
    const entry = entriesByPath.get(path);
    if (!entry) {
      errors.push(`${path}: 正式 SVG 未登记到图示 Manifest`);
      continue;
    }
    errors.push(...visualFailures({ path, content: readFileSync(join(root, path), 'utf8') }, entry).map((error) => `${path}: ${error}`));
  }
  for (const entry of manifest.diagrams ?? []) {
    if (typeof entry.path !== 'string' || scanned.has(entry.path)) continue;
    errors.push(...visualFailures(null, entry).map((error) => `${entry.id ?? '(缺失 id)'}: ${error}`));
  }
  if (!fail(errors)) console.log(`视觉门禁：已校验 ${files.length} 个正式 SVG 和 ${manifest.diagrams.length} 条 Manifest 记录`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
