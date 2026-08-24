#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkoutsDir,
  fail,
  git,
  readDocument,
  readManifest,
  root,
} from './lib.mjs';

export const capabilityStates = new Set([
  'default',
  'optional',
  'extension',
  'external',
  'absent',
  'unknown',
  'not-applicable',
]);
export const evidenceLevels = new Set(['A', 'B', 'C', 'D', 'U']);

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function lockedCommit(context, sourceId) {
  const entry = context.locks?.get(sourceId);
  return typeof entry === 'string' ? entry : entry?.commit;
}

function parseLineRange(value) {
  const match = /^(\d+)(?:-(\d+))?$/u.exec(value ?? '');
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return start >= 1 && end >= start ? { start, end } : null;
}

function normalized(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

function validateSourceEvidence(evidence, context, index, errors) {
  const label = `evidence[${index}]`;
  if (!context.sourceIds?.has(evidence.source)) {
    errors.push(`${label}: source 不在来源清单中`);
    return;
  }
  if (!/^[0-9a-f]{40}$/u.test(evidence.commit ?? '')) {
    errors.push(`${label}: commit 必须是完整 SHA`);
    return;
  }
  const locked = lockedCommit(context, evidence.source);
  if (evidence.commit !== locked) {
    errors.push(`${label}: ${evidence.source} 的 commit 与 lock 不一致`);
    return;
  }
  if (!nonemptyString(evidence.path)
    || evidence.path.startsWith('/')
    || evidence.path.includes('..')
    || evidence.path.includes('\\')) {
    errors.push(`${label}: path 必须是安全的仓库相对 POSIX 路径`);
    return;
  }
  const range = parseLineRange(evidence.lines);
  if (!range) {
    errors.push(`${label}: lines 必须是正整数或起止区间`);
    return;
  }
  if (!nonemptyString(evidence.excerpt)) {
    errors.push(`${label}: 缺少 excerpt`);
    return;
  }

  const content = context.readSource?.(evidence.source, evidence.path, evidence.commit);
  if (typeof content !== 'string') {
    errors.push(`${label}: 无法读取锁定提交中的源码路径`);
    return;
  }
  const lines = content.split('\n');
  if (range.end > lines.length) {
    errors.push(`${label}: lines 超出文件范围`);
    return;
  }
  const region = normalized(lines.slice(range.start - 1, range.end).join('\n'));
  if (!region.includes(normalized(evidence.excerpt))) {
    errors.push(`${label}: 摘录与源码区间不匹配`);
  }
}

function validateOfficialDocument(evidence, index, errors) {
  const label = `evidence[${index}]`;
  if (!nonemptyString(evidence.title)) errors.push(`${label}: 官方文档缺少 title`);
  if (!/^https:\/\//u.test(evidence.url ?? '')) errors.push(`${label}: 官方文档必须使用 HTTPS URL`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(evidence.accessed ?? '')) {
    errors.push(`${label}: 官方文档 accessed 必须是 YYYY-MM-DD`);
  }
}

function validateExperiment(evidence, context, index, errors) {
  const label = `evidence[${index}]`;
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(evidence.id ?? '')) {
    errors.push(`${label}: 实验 ID 非法`);
  } else if (!context.experimentExists?.(evidence.id)) {
    errors.push(`${label}: 实验记录不存在：${evidence.id}`);
  }
}

export function validateClaim(claim, context) {
  const errors = [];
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return ['Claim 必须是对象'];

  for (const field of [
    'id',
    'harness',
    'dimension',
    'statement',
    'version',
    'surface',
    'platform',
    'mode',
    'evidence_level',
    'last_verified',
  ]) {
    if (!nonemptyString(claim[field])) errors.push(`缺少 ${field}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/u.test(claim.id ?? '')) {
    errors.push('id 必须是稳定的点分小写标识');
  } else if (nonemptyString(claim.harness) && !claim.id.startsWith(`${claim.harness}.`)) {
    errors.push('id 必须以 harness 开头');
  }
  if (!/^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*$/u.test(claim.dimension ?? '')) {
    errors.push('dimension 必须是点分小写标识');
  }
  if (!capabilityStates.has(claim.capability)) {
    errors.push(`capability 非法：${claim.capability}`);
  }
  if (!evidenceLevels.has(claim.evidence_level)) {
    errors.push(`evidence_level 非法：${claim.evidence_level}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(claim.last_verified ?? '')) {
    errors.push('last_verified 必须是 YYYY-MM-DD');
  }
  if (!Array.isArray(claim.evidence)) {
    errors.push('evidence 必须是数组');
    return errors;
  }
  if (claim.evidence.length === 0 && claim.evidence_level !== 'U') {
    errors.push('除 U 外的证据等级必须至少有一项 evidence');
  }

  const types = new Set();
  claim.evidence.forEach((evidence, index) => {
    if (!evidence || typeof evidence !== 'object') {
      errors.push(`evidence[${index}]: 必须是对象`);
      return;
    }
    types.add(evidence.type);
    if (evidence.type === 'source' || evidence.type === 'upstream-test') {
      validateSourceEvidence(evidence, context, index, errors);
    } else if (evidence.type === 'official-doc') {
      validateOfficialDocument(evidence, index, errors);
    } else if (evidence.type === 'experiment') {
      validateExperiment(evidence, context, index, errors);
    } else {
      errors.push(`evidence[${index}]: 未知证据类型 ${evidence.type}`);
    }
  });

  if (claim.evidence_level === 'A') {
    for (const required of ['source', 'upstream-test', 'experiment']) {
      if (!types.has(required)) errors.push(`A 级证据缺少 ${required}`);
    }
  }
  if (claim.evidence_level === 'B') {
    for (const required of ['source', 'upstream-test']) {
      if (!types.has(required)) errors.push(`B 级证据缺少 ${required}`);
    }
  }
  if (claim.evidence_level === 'C' && !types.has('source') && !types.has('official-doc')) {
    errors.push('C 级证据至少需要 source 或 official-doc');
  }
  if (claim.evidence_level === 'D' && !nonemptyString(claim.inference)) {
    errors.push('D 级证据必须提供 inference 推断说明');
  }
  return errors;
}

function claimFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return claimFiles(path);
      return entry.isFile() && /\.(?:json|ya?ml)$/u.test(entry.name) && !['schema.example.yml', 'evidence-map.yml'].includes(entry.name)
        ? [path]
        : [];
    })
    .sort();
}

function repositoryContext() {
  const { manifest, locks } = readManifest();
  const experiments = join(root, 'evidence', 'experiments');
  return {
    sourceIds: new Set(manifest.sources.map(({ id }) => id)),
    locks,
    readSource(source, path, commit) {
      try {
        return git(join(checkoutsDir, source), ['show', `${commit}:${path}`]);
      } catch {
        return null;
      }
    },
    experimentExists(id) {
      return ['json', 'yml', 'yaml'].some((extension) => existsSync(join(experiments, `${id}.${extension}`)));
    },
  };
}

function main() {
  const directory = join(root, 'evidence', 'claims');
  const context = repositoryContext();
  const files = claimFiles(directory);
  const ids = new Map();
  const errors = [];

  for (const path of files) {
    const claim = readDocument(path);
    for (const error of validateClaim(claim, context)) errors.push(`${path.slice(root.length + 1)}: ${error}`);
    if (nonemptyString(claim.id)) {
      if (ids.has(claim.id)) errors.push(`${path.slice(root.length + 1)}: Claim ID 与 ${ids.get(claim.id)} 重复：${claim.id}`);
      else ids.set(claim.id, path.slice(root.length + 1));
    }
  }

  if (!fail(errors)) console.log(`已校验 ${files.length} 条关键结论；Claim ID 无重复`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
