#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, fail, git, readManifest, root } from './lib.mjs';

const { manifest, locks } = readManifest();
const sourceIds = new Set(manifest.sources.map(({ id }) => id));
const allowedStatus = new Set(['draft', 'reviewed', 'verified', 'stale']);
const allowedDepth = new Set(['L0', 'L1', 'L2', 'L3']);
const allowedEvidence = new Set(['code', 'test', 'runtime', 'official-doc', 'community', 'inference']);
const stalePath = join(root, 'sources', 'stale-documents.md');
const staleLedger = existsSync(stalePath) ? readFileSync(stalePath, 'utf8') : '';
const errors = [];

for (const file of analysisFiles()) {
  const { metadata } = parseFrontmatter(file.content);
  if (!metadata) {
    errors.push(`${file.relativePath}: missing YAML frontmatter`);
    continue;
  }
  for (const field of ['sources', 'last_verified', 'status', 'depth', 'evidence']) {
    if (!metadata[field] || (Array.isArray(metadata[field]) && !metadata[field].length)) errors.push(`${file.relativePath}: missing ${field}`);
  }
  if (!Array.isArray(metadata.sources) || !metadata.sources.length) continue;
  for (const source of metadata.sources) {
    if (!source || typeof source !== 'object' || !sourceIds.has(source.repo)) {
      errors.push(`${file.relativePath}: unknown or malformed source binding`);
      continue;
    }
    if (!/^[0-9a-f]{40}$/u.test(source.commit ?? '')) errors.push(`${file.relativePath}: ${source.repo} commit must be a full SHA`);
    if (typeof source.path !== 'string' || !source.path || source.path.startsWith('/') || source.path.includes('..')) {
      errors.push(`${file.relativePath}: ${source.repo} path must be repository-relative`);
    }
    const locked = locks.get(source.repo)?.commit;
    if (source.commit !== locked && metadata.status !== 'stale') {
      errors.push(`${file.relativePath}: ${source.repo} analysis commit differs from lock; set status: stale or review against ${locked}`);
    }
    if (source.path && source.path !== '.' && source.commit === locked) {
      try {
        git(join(checkoutsDir, source.repo), ['cat-file', '-e', `${source.commit}:${source.path}`]);
      } catch {
        errors.push(`${file.relativePath}: ${source.repo}@${source.commit.slice(0, 12)} has no path ${source.path}`);
      }
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(metadata.last_verified ?? '')) errors.push(`${file.relativePath}: last_verified must be YYYY-MM-DD`);
  if (!allowedStatus.has(metadata.status)) errors.push(`${file.relativePath}: invalid status ${metadata.status}`);
  if (!allowedDepth.has(metadata.depth)) errors.push(`${file.relativePath}: invalid depth ${metadata.depth}`);
  if (!Array.isArray(metadata.evidence) || metadata.evidence.some((item) => !allowedEvidence.has(item))) errors.push(`${file.relativePath}: invalid evidence list`);
  if (metadata.status === 'stale' && !staleLedger.includes(`\`${file.relativePath}\``)) {
    errors.push(`${file.relativePath}: stale analysis is missing from sources/stale-documents.md`);
  }
}

if (!fail(errors)) console.log(`verified source binding and review state for ${analysisFiles().length} human analysis documents`);
