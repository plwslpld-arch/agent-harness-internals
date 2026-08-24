#!/usr/bin/env node
// 比较课程锁定提交与上游分支。它只提示“值得重读的来源”，不改写课程。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutsDir, git, readManifest } from './lib.mjs';

const shouldFetch = process.argv.includes('--fetch');
const { manifest, locks } = readManifest();
const rows = [];

function tryGit(directory, args) {
  try { return git(directory, args); } catch { return null; }
}

for (const source of manifest.sources.filter((entry) => entry.profiles?.includes('core'))) {
  const checkout = join(checkoutsDir, source.id);
  const locked = locks.get(source.id)?.commit;
  if (!locked || !existsSync(join(checkout, '.git'))) continue;
  if (shouldFetch) tryGit(checkout, ['fetch', '--filter=blob:none', '--no-tags', 'origin', source.defaultBranch]);
  const head = tryGit(checkout, ['rev-parse', 'FETCH_HEAD'])
    ?? tryGit(checkout, ['rev-parse', `origin/${source.defaultBranch}`]);
  if (!head) {
    rows.push({ name: source.name, locked, note: '本地没有上游引用' });
    continue;
  }
  const lockedDate = tryGit(checkout, ['show', '-s', '--format=%cs', locked]);
  const headDate = tryGit(checkout, ['show', '-s', '--format=%cs', head]);
  rows.push({ name: source.name, locked, head, lockedDate, headDate, changed: locked !== head });
}

console.log('# 上游来源更新提示\n');
console.log('| 来源 | 课程提交 | 上游提交 | 日期 | 是否有更新 |');
console.log('| --- | --- | --- | --- | --- |');
for (const row of rows) {
  if (row.note) console.log(`| ${row.name} | \`${row.locked.slice(0, 10)}\` | — | — | ${row.note} |`);
  else console.log(`| ${row.name} | \`${row.locked.slice(0, 10)}\` | \`${row.head.slice(0, 10)}\` | ${row.lockedDate} → ${row.headDate} | ${row.changed ? '是' : '否'} |`);
}
console.log('\n有更新不表示课程错误；它表示维护者应重新阅读相关调用链，再决定是否更新锁定提交。');
