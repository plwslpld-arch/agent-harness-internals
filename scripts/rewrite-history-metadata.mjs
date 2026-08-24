#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const coAuthorPattern = /^Co-Authored-By:\s*(.*?)\s*<([^>]+)>\s*$/iu;
const claudeSessionPattern = /^Claude[-_ ]Session\s*:/iu;

function isTargetCoAuthor(line) {
  const match = coAuthorPattern.exec(line);
  if (!match) return false;
  const name = match[1].trim();
  const email = match[2].trim().toLowerCase();
  return /(?:^|@)(?:openai|anthropic)\.com$/u.test(email)
    || /^Codex(?:\s|$)/iu.test(name)
    || /^Claude(?:$|\s+(?:Code|Opus|Sonnet|Haiku|Fable)\b)/iu.test(name);
}

function isForbiddenLine(line) {
  return claudeSessionPattern.test(line) || isTargetCoAuthor(line);
}

export function forbiddenMetadataLines(message) {
  return message.split(/\r?\n/u).filter(isForbiddenLine);
}

export function cleanCommitMessage(message) {
  return message
    .split(/(?<=\n)/u)
    .filter((chunk) => !isForbiddenLine(chunk.replace(/\r?\n$/u, '')))
    .join('');
}

export function verifyRewriteInvariants(before, after) {
  const errors = [];
  if (before.length !== after.length) {
    return [`commit count changed: ${before.length} -> ${after.length}`];
  }
  const keys = ['tree', 'subject', 'author', 'committer', 'parentCount'];
  for (let index = 0; index < before.length; index += 1) {
    for (const key of keys) {
      if (before[index][key] !== after[index][key]) {
        errors.push(`commit[${index}] ${key} changed`);
      }
    }
  }
  return errors;
}

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trimEnd();
}

function parseIdentity(value, label) {
  const match = /^(.*) <([^<>]+)> (\d+) ([+-]\d{4})$/u.exec(value);
  if (!match) throw new Error(`无法解析 ${label}：${value}`);
  return { name: match[1], email: match[2], timestamp: match[3], timezone: match[4], raw: value };
}

function readCommit(commit, cwd = process.cwd()) {
  const raw = execFileSync('git', ['cat-file', 'commit', commit], { cwd, encoding: 'utf8' });
  const separator = raw.indexOf('\n\n');
  if (separator < 0) throw new Error(`提交对象缺少消息分隔符：${commit}`);
  const headers = raw.slice(0, separator).split('\n');
  const message = raw.slice(separator + 2);
  const tree = headers.find((line) => line.startsWith('tree '))?.slice(5);
  const parents = headers.filter((line) => line.startsWith('parent ')).map((line) => line.slice(7));
  const authorLine = headers.find((line) => line.startsWith('author '))?.slice(7);
  const committerLine = headers.find((line) => line.startsWith('committer '))?.slice(10);
  if (!tree || !authorLine || !committerLine) throw new Error(`提交对象头不完整：${commit}`);
  return {
    commit,
    tree,
    parents,
    author: parseIdentity(authorLine, '作者'),
    committer: parseIdentity(committerLine, '提交者'),
    message,
  };
}

function snapshot(parsed) {
  return {
    tree: parsed.tree,
    subject: parsed.message.split(/\r?\n/u)[0] ?? '',
    author: parsed.author.raw,
    committer: parsed.committer.raw,
    parentCount: parsed.parents.length,
  };
}

function orderedCommits(ref, cwd) {
  const output = git(['rev-list', '--reverse', '--topo-order', ref], { cwd });
  return output ? output.split('\n') : [];
}

function audit(ref, cwd) {
  const commits = orderedCommits(ref, cwd);
  const offenders = [];
  for (const commit of commits) {
    const parsed = readCommit(commit, cwd);
    const lines = forbiddenMetadataLines(parsed.message);
    if (lines.length) offenders.push({ commit, subject: snapshot(parsed).subject, lines });
  }
  return {
    ref,
    head: git(['rev-parse', ref], { cwd }),
    commitCount: commits.length,
    offendingCommitCount: offenders.length,
    offendingLineCount: offenders.reduce((sum, item) => sum + item.lines.length, 0),
    offenders,
  };
}

function refExists(ref, cwd) {
  return spawnSync('git', ['show-ref', '--verify', '--quiet', ref], { cwd }).status === 0;
}

function createCommit(parsed, parents, message, cwd) {
  const args = ['commit-tree', parsed.tree];
  for (const parent of parents) args.push('-p', parent);
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    input: message,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: parsed.author.name,
      GIT_AUTHOR_EMAIL: parsed.author.email,
      GIT_AUTHOR_DATE: `${parsed.author.timestamp} ${parsed.author.timezone}`,
      GIT_COMMITTER_NAME: parsed.committer.name,
      GIT_COMMITTER_EMAIL: parsed.committer.email,
      GIT_COMMITTER_DATE: `${parsed.committer.timestamp} ${parsed.committer.timezone}`,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || 'git commit-tree 失败');
  return result.stdout.trim();
}

function rewrite({ ref, backupRef, cwd }) {
  const status = git(['status', '--porcelain'], { cwd });
  if (status) throw new Error('工作树必须干净后才能改写历史');
  const branch = git(['symbolic-ref', '--short', 'HEAD'], { cwd });
  if (branch !== ref) throw new Error(`当前分支必须是 ${ref}，实际为 ${branch}`);
  if (!backupRef?.startsWith('refs/heads/local-backup/')) {
    throw new Error('必须通过 --backup-ref 提供 refs/heads/local-backup/ 下的仅本地备份引用');
  }
  if (refExists(backupRef, cwd)) throw new Error(`备份引用已存在：${backupRef}`);

  const oldHead = git(['rev-parse', ref], { cwd });
  const commits = orderedCommits(ref, cwd);
  const before = commits.map((commit) => snapshot(readCommit(commit, cwd)));
  git(['update-ref', backupRef, oldHead], { cwd });

  const rewritten = new Map();
  let changedMessages = 0;
  for (const commit of commits) {
    const parsed = readCommit(commit, cwd);
    const parents = parsed.parents.map((parent) => rewritten.get(parent) ?? parent);
    const cleaned = cleanCommitMessage(parsed.message);
    const parentsUnchanged = parents.every((parent, index) => parent === parsed.parents[index]);
    if (cleaned === parsed.message && parentsUnchanged) {
      rewritten.set(commit, commit);
      continue;
    }
    if (cleaned !== parsed.message) changedMessages += 1;
    rewritten.set(commit, createCommit(parsed, parents, cleaned, cwd));
  }

  const newHead = rewritten.get(oldHead);
  if (!newHead) throw new Error('未生成新的分支头');
  const afterCommits = commits.map((commit) => rewritten.get(commit));
  const after = afterCommits.map((commit) => snapshot(readCommit(commit, cwd)));
  const invariantErrors = verifyRewriteInvariants(before, after);
  if (invariantErrors.length) throw new Error(`重写不变量失败：\n${invariantErrors.join('\n')}`);
  const remaining = afterCommits.flatMap((commit) => forbiddenMetadataLines(readCommit(commit, cwd).message));
  if (remaining.length) throw new Error(`重写后仍有 ${remaining.length} 行目标元数据`);

  git(['update-ref', `refs/heads/${ref}`, newHead, oldHead], { cwd });
  return {
    ref,
    backupRef,
    oldHead,
    newHead,
    commitCount: commits.length,
    changedMessages,
    invariantErrors,
    remainingForbiddenLines: remaining.length,
    finalTree: after.at(-1)?.tree,
  };
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function main() {
  const args = process.argv.slice(2);
  const cwd = resolve(optionValue(args, '--cwd', process.cwd()));
  const ref = optionValue(args, '--ref', 'main');
  if (!args.includes('--apply')) {
    console.log(JSON.stringify(audit(ref, cwd), null, 2));
    return;
  }
  const backupRef = optionValue(args, '--backup-ref');
  console.log(JSON.stringify(rewrite({ ref, backupRef, cwd }), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
