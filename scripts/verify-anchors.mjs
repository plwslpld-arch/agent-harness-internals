#!/usr/bin/env node
// 抽查正文里的「路径:行号」引用是否真的指向那一行。
//
// 旧版校验只确认「文件存在」，于是行号写错也能过 CI，
// 「每句话都能追到证据」就成了空话。这个脚本把行号也纳入门禁：
//
//   1. 扫描 docs/ 正文里形如 `packages/a/b/src/c.ts:123` 或 `:123-145` 的引用；
//   2. 在锁定的 checkout 里读出那一行（区间取首行）；
//   3. 如果该行是空行，就往下找 3 行内的第一行非空内容（注释块与
//      多行声明常见的偏移），仍找不到才算失败；
//   4. 路径不存在、行号越界一律失败。
//
// 内容是否「对得上」仍需人读，但至少「指到了一个真实存在的行」由机器保证。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, fail, readManifest } from './lib.mjs';

const { manifest } = readManifest();
const defaultRepo = 'deepseek-harness';
const knownRepos = new Set(manifest.sources.map(({ id }) => id));
const TOLERANCE = 3;

// 形如 packages/core/agent-loop/src/agent.ts:332 或 …:332-401，前面可带 repo 前缀。
const REFERENCE = /(?:([a-z0-9][a-z0-9-]*)!)?((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|mjs|js|rs|py|md|yml|yaml|json)):(\d+)(?:-(\d+))?/gu;

const fileCache = new Map();
function readLines(repo, path) {
  const key = `${repo}:${path}`;
  if (!fileCache.has(key)) {
    const absolute = join(checkoutsDir, repo, path);
    fileCache.set(key, existsSync(absolute) ? readFileSync(absolute, 'utf8').split('\n') : null);
  }
  return fileCache.get(key);
}

const errors = [];
let checked = 0;
const files = analysisFiles();

for (const file of files) {
  const { metadata } = parseFrontmatter(file.content);
  if (metadata?.status === 'stale') continue;
  const boundRepos = new Set((metadata?.sources ?? []).map(({ repo }) => repo).filter(Boolean));
  const lines = file.content.split('\n');
  let inFence = false;
  lines.forEach((line, index) => {
    if (/^\s*```/u.test(line)) inFence = !inFence;
    // 代码块里的行号多半是 sed/grep 命令参数，不当作引用。
    if (inFence) return;
    for (const match of line.matchAll(REFERENCE)) {
      const [, explicitRepo, path, startRaw, endRaw] = match;
      // 一篇文章可以绑定多个仓库（横向对照篇就是）。先按显式前缀，
      // 否则在本篇绑定的仓库里找第一个真有这个路径的。
      const candidates = explicitRepo
        ? [explicitRepo]
        : [...(boundRepos.size ? boundRepos : [defaultRepo])];
      if (!candidates.every((id) => knownRepos.has(id))) continue;
      const where = `${file.relativePath}:${index + 1}`;
      const repo = candidates.find((id) => readLines(id, path) !== null);
      if (repo === undefined) {
        // checkout 未拉取时不误报；verify-sources 已经负责这件事。
        if (!candidates.every((id) => existsSync(join(checkoutsDir, id, '.git')))) continue;
        errors.push(`${where}: ${candidates.join(' / ')} 中都没有 ${path}`);
        continue;
      }
      const source = readLines(repo, path);
      const start = Number(startRaw);
      const end = endRaw ? Number(endRaw) : start;
      checked += 1;
      if (start < 1 || end < start || end > source.length) {
        errors.push(`${where}: ${path}:${startRaw}${endRaw ? `-${endRaw}` : ''} 越界（该文件共 ${source.length} 行）`);
        continue;
      }
      const window = source.slice(start - 1, Math.min(source.length, start - 1 + TOLERANCE + 1));
      if (!window.some((text) => text.trim().length > 0)) {
        errors.push(`${where}: ${path}:${startRaw} 指向空行（其后 ${TOLERANCE} 行也为空），行号可能已经漂移`);
      }
    }
  });
}

if (!fail(errors)) console.log(`已抽查 ${files.length} 篇文章中的 ${checked} 处行号引用`);
