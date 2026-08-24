#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, posixPath, readDocument, root } from './lib.mjs';

const expectedHarnesses = ['deepseek-harness', 'codex', 'gemini-cli', 'claude', 'pi', 'opencode'];
const capabilityStates = new Set(['default', 'optional', 'extension', 'external', 'absent', 'unknown', 'not-applicable']);
const evidenceLevels = new Set(['A', 'B', 'C', 'D', 'U']);
const forbiddenKeys = new Set(['score', 'total_score', 'totalscore', 'rank', 'ranking', 'winner', 'winners']);

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function forbiddenFields(value, path = 'matrix', found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenFields(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKeys.has(key.toLowerCase())) found.push(`${path}.${key}`);
    forbiddenFields(item, `${path}.${key}`, found);
  }
  return found;
}

export function matrixFailures(matrix, claims) {
  const errors = [];
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return ['比较矩阵必须是对象'];
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(matrix.id ?? '')) errors.push('id 非法');
  if (!nonempty(matrix.title)) errors.push('缺少 title');
  if (!/^docs\/comparisons\/[a-z0-9][a-z0-9-]*\.md$/u.test(matrix.article ?? '')) {
    errors.push('article 必须位于 docs/comparisons/ 且使用安全相对路径');
  }
  if (!nonempty(matrix.question)) errors.push('缺少 question');
  if (!Array.isArray(matrix.control_variables) || matrix.control_variables.length < 2
      || matrix.control_variables.some((item) => !nonempty(item))) {
    errors.push('control_variables 至少包含两个非空控制变量');
  }
  for (const field of forbiddenFields(matrix)) errors.push(`禁止字段：${field}`);

  if (!Array.isArray(matrix.entries)) return [...errors, 'entries 必须是数组'];
  const harnesses = matrix.entries.map((entry) => entry?.harness);
  if (harnesses.length !== expectedHarnesses.length
      || new Set(harnesses).size !== expectedHarnesses.length
      || expectedHarnesses.some((harness) => !harnesses.includes(harness))) {
    errors.push('entries 必须且只能包含六条主线');
  }

  matrix.entries.forEach((entry, index) => {
    const label = `entries[${index}]`;
    if (!expectedHarnesses.includes(entry?.harness)) errors.push(`${label}: harness 非法`);
    if (!capabilityStates.has(entry?.capability)) errors.push(`${label}: capability 非法`);
    if (!evidenceLevels.has(entry?.evidence_level)) errors.push(`${label}: evidence_level 非法`);
    if (!nonempty(entry?.statement)) errors.push(`${label}: 缺少 statement`);
    if (!Array.isArray(entry?.conditions) || entry.conditions.length === 0
        || entry.conditions.some((item) => !nonempty(item))) {
      errors.push(`${label}: conditions 至少包含一项`);
    }
    if (!Array.isArray(entry?.claims) || entry.claims.length === 0) {
      errors.push(`${label}: claims 至少包含一项`);
      return;
    }
    if (new Set(entry.claims).size !== entry.claims.length) errors.push(`${label}: claims 不能重复`);
    entry.claims.forEach((id, claimIndex) => {
      const claim = claims.get(id);
      if (!claim) {
        errors.push(`${label}: Claim 不存在：${id}`);
      } else if (claim.harness !== entry.harness) {
        errors.push(`${label}: Claim ${id} 不属于 ${entry.harness}`);
      } else if (claimIndex === 0) {
        if (claim.capability !== entry.capability) errors.push(`${label}: capability 与主 Claim 不一致`);
        if (claim.evidence_level !== entry.evidence_level) errors.push(`${label}: 证据等级与主 Claim 不一致`);
      }
    });
  });
  return errors;
}

function documentFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:json|ya?ml)$/u.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function claimRegistry() {
  const claims = new Map();
  for (const path of documentFiles(join(root, 'evidence', 'claims'))) {
    const claim = readDocument(path);
    if (nonempty(claim?.id)) claims.set(claim.id, claim);
  }
  return claims;
}

function main() {
  const directory = join(root, 'evidence', 'matrices');
  const files = documentFiles(directory);
  const claims = claimRegistry();
  const errors = [];
  const ids = new Set();
  const articles = new Set();
  if (files.length !== 5) errors.push(`比较矩阵必须恰好为五份，当前 ${files.length} 份`);
  for (const path of files) {
    const matrix = readDocument(path);
    const label = posixPath(relative(root, path));
    for (const error of matrixFailures(matrix, claims)) errors.push(`${label}: ${error}`);
    if (ids.has(matrix.id)) errors.push(`${label}: id 重复：${matrix.id}`);
    else ids.add(matrix.id);
    if (articles.has(matrix.article)) errors.push(`${label}: article 重复：${matrix.article}`);
    else articles.add(matrix.article);
  }
  if (!fail(errors)) console.log(`已校验 ${files.length} 份比较矩阵、${files.length * expectedHarnesses.length} 个六方证据单元；无总分或赢家字段`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
