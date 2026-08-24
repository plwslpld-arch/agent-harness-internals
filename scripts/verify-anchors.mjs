#!/usr/bin/env node
// 验证课程正文中的 GitHub 源码链接：来源、提交、文件和行号都必须可核对。
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkoutsDir, fail, listProjectFiles, readManifest, root } from './lib.mjs';

const LOCKED_LINK = /https:\/\/github\.com\/([^/\s)]+)\/([^/\s)]+)\/blob\/([0-9a-f]{40})\/([^\s)#]+)#L(\d+)(?:-L(\d+))?/gu;

function repositoryKey(url) {
  return url.replace(/\.git$/u, '').replace(/^https:\/\/github\.com\//u, '').toLowerCase();
}

export function lockedSourceLinkFailures() {
  const { manifest, locks } = readManifest();
  const sources = new Map(manifest.sources.map((source) => [repositoryKey(source.url), source]));
  const errors = [];
  let checked = 0;
  const markdownFiles = listProjectFiles(join(root, 'docs')).filter((path) => path.endsWith('.md'));

  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8');
    const display = relative(root, file).replaceAll('\\', '/');
    for (const match of content.matchAll(LOCKED_LINK)) {
      const [, owner, repository, commit, encodedPath, startRaw, endRaw] = match;
      const key = `${owner}/${repository}`.toLowerCase();
      const source = sources.get(key);
      checked += 1;
      if (!source) {
        errors.push(`${display}: 源码链接 ${owner}/${repository} 未登记在 sources/sources.yml`);
        continue;
      }
      const lock = locks.get(source.id);
      if (lock?.commit !== commit) {
        errors.push(`${display}: ${source.name} 链接使用 ${commit.slice(0, 10)}，锁定提交是 ${lock?.commit?.slice(0, 10) ?? '缺失'}`);
        continue;
      }

      const sourcePath = decodeURIComponent(encodedPath);
      const checkout = join(checkoutsDir, source.id);
      // 本地只准备 core 时，样本来源可以暂缺；CI 会先准备全部来源。
      if (!existsSync(join(checkout, '.git'))) continue;
      const absolute = join(checkout, ...sourcePath.split('/'));
      if (!existsSync(absolute)) {
        errors.push(`${display}: ${source.id} 中找不到 ${sourcePath}`);
        continue;
      }
      const lines = readFileSync(absolute, 'utf8').split(/\r?\n/u);
      const start = Number(startRaw);
      const end = endRaw ? Number(endRaw) : start;
      if (start < 1 || end < start || end > lines.length) {
        errors.push(`${display}: ${sourcePath}#L${startRaw}${endRaw ? `-L${endRaw}` : ''} 越界（共 ${lines.length} 行）`);
        continue;
      }
      if (!lines.slice(start - 1, end).some((line) => line.trim())) {
        errors.push(`${display}: ${sourcePath}#L${startRaw}${endRaw ? `-L${endRaw}` : ''} 只指向空行`);
      }
    }
  }

  if (checked === 0) errors.push('docs/ 中没有找到带提交和行号的 GitHub 源码链接');
  return { errors, checked, files: markdownFiles.length };
}

const result = lockedSourceLinkFailures();
if (!fail(result.errors)) console.log(`已核对 ${result.files} 篇文档中的 ${result.checked} 个锁定源码链接`);
