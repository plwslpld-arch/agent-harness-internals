#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkoutsDir,
  fail,
  listProjectFiles,
  posixPath,
  readManifest,
  root,
} from './lib.mjs';

const { manifest, locks } = readManifest();
const lockedRepositories = manifest.sources.map((source) => ({
  id: source.id,
  base: source.url.replace(/\.git$/u, ''),
  commit: locks.get(source.id)?.commit,
}));
const mechanismSampleSources = new Map([
  ['docs/samples/aider.md', 'aider'],
  ['docs/samples/cline.md', 'cline'],
  ['docs/samples/goose.md', 'goose'],
  ['docs/samples/mini-swe-agent.md', 'mini-swe-agent'],
  ['docs/samples/openhands-agent-canvas.md', 'openhands'],
  ['docs/samples/qwen-code.md', 'qwen-code'],
]);

const forbiddenProgress = [
  /当前状态/u,
  /阶段验收/u,
  /课程状态/u,
  /正式课程/u,
  /通过门禁/u,
  /门禁通过/u,
  /\breviewed\b/iu,
  /\bverified\b/iu,
  /\bpublished\b/iu,
];

function withoutFencedCode(content) {
  return content.replace(/```[\s\S]*?```/gu, '').replace(/~~~[\s\S]*?~~~/gu, '');
}

function proseOnly(content) {
  return withoutFencedCode(content)
    .replace(/`[^`\n]+`/gu, '')
    .replace(/\[[^\]]*\]\([^)]*\)/gu, '')
    .replace(/<[^>]+>/gu, '');
}

export function publicLanguageFailures(relativePath, content) {
  const errors = [];
  if (/^---\s*$/mu.test(content.split('\n').slice(0, 2).join('\n'))) {
    errors.push(`${relativePath}: 公共文章不得包含状态 Frontmatter`);
  }

  const prose = proseOnly(content);
  if (forbiddenProgress.some((pattern) => pattern.test(prose))) {
    errors.push(`${relativePath}: 公共文章包含内部进度或阶段验收语言`);
  }
  if (/\bClaim:\s*[a-z0-9.-]+/iu.test(content)) {
    errors.push(`${relativePath}: 公共文章不得展示内部 Claim ID`);
  }
  if (/\bDSH\b|\bdsh\b/u.test(prose)) {
    errors.push(`${relativePath}: 普通文案必须使用 DeepSeek Harness 全称`);
  }
  if (/(?:^|[\s("'`])(?:[A-Za-z]:[\\/]|\/Users\/|\/home\/)[^\s)"'`]+/mu.test(content)) {
    errors.push(`${relativePath}: 用户可见内容不得出现本机绝对路径`);
  }
  return errors;
}

function sourceGuideFailures(relativePath, content) {
  const isHarnessGuide = /^docs\/harnesses\/[^/]+\/(?!README\.md$).+\.md$/u.test(relativePath);
  const isMechanismSample = /^docs\/samples\/.+\.md$/u.test(relativePath);
  if (!isHarnessGuide && !isMechanismSample) return [];
  const errors = [];
  const sourceLinks = [...content.matchAll(/https:\/\/github\.com\/[^\s)]+\/blob\/[0-9a-f]{40}\/[^\s)#]+#L\d+(?:-L\d+)?/giu)];
  const minimumLinks = isMechanismSample ? 2 : 1;
  if (sourceLinks.length < minimumLinks) errors.push(`${relativePath}: 至少需要 ${minimumLinks} 个带行号的锁定 GitHub 源码永久链接`);
  const linkPattern = /https:\/\/github\.com\/[^\s)]+\/blob\/([0-9a-f]{40})\/([^\s)#]+)#L\d+(?:-L\d+)?/giu;
  for (const match of content.matchAll(linkPattern)) {
    const full = match[0];
    const source = lockedRepositories.find(({ base }) => full.startsWith(`${base}/blob/`));
    if (!source || match[1] !== source.commit) {
      errors.push(`${relativePath}: 源码永久链接不属于 sources 中的锁定来源：${full}`);
      continue;
    }
    const expectedSource = mechanismSampleSources.get(relativePath);
    if (expectedSource && source.id !== expectedSource) {
      errors.push(`${relativePath}: 机制样本应引用 ${expectedSource}，实际链接属于 ${source.id}`);
      continue;
    }
    let sourcePath;
    try {
      sourcePath = decodeURI(match[2]);
    } catch {
      errors.push(`${relativePath}: 源码永久链接路径编码无效：${full}`);
      continue;
    }
    if (!existsSync(join(checkoutsDir, source.id, ...sourcePath.split('/')))) {
      errors.push(`${relativePath}: 锁定 Checkout 中不存在源码路径 ${source.id}!${sourcePath}`);
    }
  }
  if (isHarnessGuide && /^```source\s*$/mu.test(content)) {
    errors.push(`${relativePath}: 源码代码块必须使用真实语言标记，不能使用 source`);
  }
  if (isHarnessGuide && !/^```(?:rust|rs|typescript|ts|tsx|javascript|js|python|py|json|yaml|yml|toml|bash|powershell|text)\s*$/mu.test(content)) {
    errors.push(`${relativePath}: 源码课程需要至少一个带正确语言标记的代码块`);
  }
  if (isHarnessGuide && /^###\s+第\s*\d+\s*站/mu.test(content)) {
    const labelText = content.replaceAll('**', '');
    for (const label of ['调用者：', '输入：', '状态变化：', '返回：', '下一站：']) {
      if (!labelText.includes(label)) errors.push(`${relativePath}: 源码站点缺少“${label}”说明`);
    }
  }
  return errors;
}

export function contentContractFailures({ relativePath, content }) {
  const errors = publicLanguageFailures(relativePath, content);
  if (!/^#\s+\S+/mu.test(content)) errors.push(`${relativePath}: 缺少清晰的一级标题`);
  errors.push(...sourceGuideFailures(relativePath, content));
  return errors;
}

export function contentContractDisposition(article) {
  return { errors: contentContractFailures(article), warnings: [] };
}

function main() {
  const files = listProjectFiles().filter((path) => {
    const relativePath = posixPath(relative(root, path));
    return relativePath === 'README.md' || (relativePath.startsWith('docs/') && relativePath.endsWith('.md'));
  });
  const errors = [];
  for (const path of files) {
    const relativePath = posixPath(relative(root, path));
    const content = readFileSync(path, 'utf8');
    errors.push(...contentContractFailures({ relativePath, content }));
  }
  if (!fail(errors)) console.log(`已检查 ${files.length} 篇公共文章的读者内容契约`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
