#!/usr/bin/env node
// 校验 docs/ 下每篇文章的 frontmatter：
// - sources 里的每个条目必须指向 sources.yml 里存在的仓库、完整 SHA、且与 lock 一致
// - 声明的路径必须在该 commit 下真实存在
// - last_verified 必须是日期，status 必须在允许集合内
import { join } from 'node:path';
import {
  analysisFiles,
  articleKind,
  articleMetadataFailures,
  parseFrontmatter,
  validOfficialDocumentSource,
} from './analysis-metadata.mjs';
import { checkoutsDir, fail, git, readManifest } from './lib.mjs';

const { manifest, locks } = readManifest();
const sourceIds = new Set(manifest.sources.map(({ id }) => id));
const allowedStatus = new Set(['draft', 'reviewed', 'stale']);
const errors = [];
const files = analysisFiles();

for (const file of files) {
  const { metadata } = parseFrontmatter(file.content);
  if (!metadata) {
    errors.push(`${file.relativePath}: 缺少 YAML frontmatter`);
    continue;
  }
  const kind = articleKind(file.relativePath);
  if (kind) {
    errors.push(...articleMetadataFailures(file.relativePath, metadata));
  } else {
    for (const field of ['title', 'sources', 'last_verified', 'status']) {
      if (!metadata[field] || (Array.isArray(metadata[field]) && !metadata[field].length)) {
        errors.push(`${file.relativePath}: 缺少 ${field}`);
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(metadata.last_verified ?? '')) {
      errors.push(`${file.relativePath}: last_verified 必须是 YYYY-MM-DD`);
    }
    if (!allowedStatus.has(metadata.status)) {
      errors.push(`${file.relativePath}: status 非法（允许 ${[...allowedStatus].join(' / ')}）：${metadata.status}`);
    }
  }
  if (!Array.isArray(metadata.sources)) continue;
  for (const source of metadata.sources) {
    if (source?.type === 'official-doc') {
      if (!validOfficialDocumentSource(source)) {
        errors.push(`${file.relativePath}: official-doc 来源必须包含标题、HTTPS URL 和 YYYY-MM-DD 访问日期`);
      }
      continue;
    }
    if (!source || typeof source !== 'object' || !sourceIds.has(source.repo)) {
      errors.push(`${file.relativePath}: source 条目的 repo 不在 sources.yml 中`);
      continue;
    }
    if (!/^[0-9a-f]{40}$/u.test(source.commit ?? '')) {
      errors.push(`${file.relativePath}: ${source.repo} 的 commit 必须是完整 SHA`);
      continue;
    }
    if (typeof source.path !== 'string' || !source.path || source.path.startsWith('/') || source.path.includes('..')) {
      errors.push(`${file.relativePath}: ${source.repo} 的 path 必须是仓库相对路径`);
      continue;
    }
    const locked = locks.get(source.repo)?.commit;
    if (source.commit !== locked && metadata.status !== 'stale') {
      errors.push(`${file.relativePath}: ${source.repo} 绑定的 commit 与 lock 不一致（lock=${locked}）；请复核后更新，或把 status 改为 stale`);
      continue;
    }
    if (source.path !== '.' && source.commit === locked) {
      try {
        git(join(checkoutsDir, source.repo), ['cat-file', '-e', `${source.commit}:${source.path}`]);
      } catch {
        errors.push(`${file.relativePath}: ${source.repo}@${source.commit.slice(0, 12)} 下没有 ${source.path}`);
      }
    }
  }
}

if (!fail(errors)) console.log(`已校验 ${files.length} 篇文章的来源绑定与状态`);
