#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { fail, readManifest, root } from './lib.mjs';

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
  for (const field of ['source_repo', 'source_path', 'source_commit', 'last_verified', 'status', 'depth', 'evidence']) {
    if (!metadata[field] || (Array.isArray(metadata[field]) && !metadata[field].length)) errors.push(`${file.relativePath}: missing ${field}`);
  }
  if (!sourceIds.has(metadata.source_repo)) {
    errors.push(`${file.relativePath}: unknown source_repo ${metadata.source_repo}`);
    continue;
  }
  if (!/^[0-9a-f]{40}$/u.test(metadata.source_commit ?? '')) errors.push(`${file.relativePath}: source_commit must be a full SHA`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(metadata.last_verified ?? '')) errors.push(`${file.relativePath}: last_verified must be YYYY-MM-DD`);
  if (!allowedStatus.has(metadata.status)) errors.push(`${file.relativePath}: invalid status ${metadata.status}`);
  if (!allowedDepth.has(metadata.depth)) errors.push(`${file.relativePath}: invalid depth ${metadata.depth}`);
  if (!Array.isArray(metadata.evidence) || metadata.evidence.some((item) => !allowedEvidence.has(item))) errors.push(`${file.relativePath}: invalid evidence list`);
  const locked = locks.get(metadata.source_repo)?.commit;
  if (metadata.source_commit !== locked && metadata.status !== 'stale') {
    errors.push(`${file.relativePath}: analysis commit differs from lock; set status: stale or review against ${locked}`);
  }
  if (metadata.status === 'stale' && !staleLedger.includes(`\`${file.relativePath}\``)) {
    errors.push(`${file.relativePath}: stale analysis is missing from sources/stale-documents.md`);
  }
}

if (!fail(errors)) console.log(`verified source binding and review state for ${analysisFiles().length} human analysis documents`);
