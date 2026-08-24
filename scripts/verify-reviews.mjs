#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, git, posixPath, readDocument, root } from './lib.mjs';

const evidenceTypes = new Set(['test', 'command', 'file', 'source', 'render', 'manual']);
const priorities = new Set(['high', 'medium', 'low']);
const findingStatuses = new Set(['open', 'resolved']);
const results = new Set(['pass', 'fail']);

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function uniqueIds(items, label, errors) {
  const ids = new Set();
  for (const item of items) {
    if (!nonempty(item?.id)) continue;
    if (ids.has(item.id)) errors.push(`${label} 存在重复 ID：${item.id}`);
    ids.add(item.id);
  }
  return ids;
}

export function reviewFailures(review) {
  const errors = [];
  if (!review || typeof review !== 'object' || Array.isArray(review)) return ['复核记录必须是对象'];
  for (const field of ['stage', 'date', 'commit', 'result']) {
    if (!nonempty(review[field])) errors.push(`缺少 ${field}`);
  }
  for (const field of ['promises', 'evidence', 'findings', 'resolutions', 'commands']) {
    if (!Array.isArray(review[field])) errors.push(`${field} 必须是数组`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(review.stage ?? '')) errors.push('stage 必须是小写连字符标识');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(review.date ?? '')) errors.push('date 必须是 YYYY-MM-DD');
  if (!/^[0-9a-f]{40}$/u.test(review.commit ?? '')) errors.push('commit 必须是完整 SHA');
  if (!results.has(review.result)) errors.push(`result 非法：${review.result}`);
  if (!Array.isArray(review.promises)
    || !Array.isArray(review.evidence)
    || !Array.isArray(review.findings)
    || !Array.isArray(review.resolutions)
    || !Array.isArray(review.commands)) return errors;
  if (review.promises.length === 0) errors.push('promises 至少包含一项阶段承诺');
  if (review.evidence.length === 0) errors.push('evidence 至少包含一项复核证据');
  if (review.commands.length === 0) errors.push('commands 至少包含一项实际命令');

  const promiseIds = uniqueIds(review.promises, 'promises', errors);
  const evidenceIds = uniqueIds(review.evidence, 'evidence', errors);
  const findingIds = uniqueIds(review.findings, 'findings', errors);
  const resolutionIds = uniqueIds(review.resolutions, 'resolutions', errors);

  review.promises.forEach((promise, index) => {
    if (!/^p-[a-z0-9][a-z0-9-]*$/u.test(promise?.id ?? '')) errors.push(`promises[${index}]: id 非法`);
    if (!nonempty(promise?.statement)) errors.push(`promises[${index}]: 缺少 statement`);
  });
  review.evidence.forEach((evidence, index) => {
    if (!/^e-[a-z0-9][a-z0-9-]*$/u.test(evidence?.id ?? '')) errors.push(`evidence[${index}]: id 非法`);
    if (!promiseIds.has(evidence?.promise)) errors.push(`evidence[${index}]: 指向不存在的 Promise：${evidence?.promise}`);
    if (!evidenceTypes.has(evidence?.type)) errors.push(`evidence[${index}]: type 非法：${evidence?.type}`);
    if (!nonempty(evidence?.reference)) errors.push(`evidence[${index}]: 缺少 reference`);
    if (!nonempty(evidence?.summary)) errors.push(`evidence[${index}]: 缺少 summary`);
  });
  for (const promise of review.promises) {
    if (!review.evidence.some((evidence) => evidence.promise === promise.id)) {
      errors.push(`Promise ${promise.id} 没有 Evidence`);
    }
  }

  review.findings.forEach((finding, index) => {
    if (!/^f-[a-z0-9][a-z0-9-]*$/u.test(finding?.id ?? '')) errors.push(`findings[${index}]: id 非法`);
    if (!priorities.has(finding?.priority)) errors.push(`findings[${index}]: priority 非法：${finding?.priority}`);
    if (!findingStatuses.has(finding?.status)) errors.push(`findings[${index}]: status 非法：${finding?.status}`);
    if (!nonempty(finding?.summary)) errors.push(`findings[${index}]: 缺少 summary`);
  });
  review.resolutions.forEach((resolution, index) => {
    if (!findingIds.has(resolution?.id)) errors.push(`resolutions[${index}]: 指向不存在的 Finding：${resolution?.id}`);
    if (!nonempty(resolution?.action)) errors.push(`resolutions[${index}]: 缺少 action`);
    if (!Array.isArray(resolution?.evidence) || resolution.evidence.length === 0) {
      errors.push(`resolutions[${index}]: evidence 必须至少引用一项复核证据`);
    } else {
      for (const id of resolution.evidence) {
        if (!evidenceIds.has(id)) errors.push(`resolutions[${index}]: 引用了不存在的 Evidence：${id}`);
      }
    }
  });
  for (const finding of review.findings) {
    if (finding.status === 'resolved' && !resolutionIds.has(finding.id)) {
      errors.push(`Finding ${finding.id} 标记 resolved 但没有同 ID Resolution`);
    }
    if (review.result === 'pass' && finding.priority === 'high'
      && (finding.status !== 'resolved' || !resolutionIds.has(finding.id))) {
      errors.push(`pass 仍存在未解决的高优先级发现：${finding.id}`);
    }
  }

  review.commands.forEach((command, index) => {
    if (!nonempty(command?.command)) errors.push(`commands[${index}]: 缺少 command`);
    if (!Number.isInteger(command?.exit_code)) errors.push(`commands[${index}]: exit_code 必须是整数`);
    else if (review.result === 'pass' && command.exit_code !== 0) {
      errors.push(`result=pass 但 commands[${index}] 的退出码 ${command.exit_code} 非零`);
    }
    if (!nonempty(command?.summary)) errors.push(`commands[${index}]: 缺少 summary`);
  });
  return errors;
}

export function reviewCommitFailures(commit, isReachable) {
  if (!/^[0-9a-f]{40}$/u.test(commit ?? '')) return [];
  return isReachable(commit) ? [] : [`commit 不在当前主线历史中：${commit}`];
}

function reviewFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:json|ya?ml)$/u.test(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function main() {
  const directory = join(root, 'evidence', 'reviews');
  const files = reviewFiles(directory);
  const errors = [];
  const stages = new Map();
  for (const path of files) {
    const relativePath = posixPath(relative(root, path));
    const review = readDocument(path);
    for (const error of reviewFailures(review)) errors.push(`${relativePath}: ${error}`);
    const commitErrors = reviewCommitFailures(review.commit, (commit) => {
      try {
        git(root, ['merge-base', '--is-ancestor', commit, 'HEAD']);
        return true;
      } catch {
        return false;
      }
    });
    for (const error of commitErrors) errors.push(`${relativePath}: ${error}`);
    if (nonempty(review.stage)) {
      if (stages.has(review.stage)) errors.push(`${relativePath}: stage 与 ${stages.get(review.stage)} 重复：${review.stage}`);
      else stages.set(review.stage, relativePath);
    }
  }
  if (!fail(errors)) console.log(`已校验 ${files.length} 份阶段对抗复核记录；高优先级发现无伪通过`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
