#!/usr/bin/env node
// 把某个源重新锁到新的 commit。
//
// 重锁要同时改四处，漏一处 `npm run check` 就会红：
//   1. sources/sources.lock.yml 里的 commit
//   2. 该源的许可证哈希（换了 commit，LICENSE 也可能换）
//   3. submodule 的 gitlink（git index 里那条 160000 记录）
//   4. 绑定这个源的每篇正文
//
// 第 4 条不改 commit 字段，而是把 status 改成 stale。理由写在 AGENTS.md 里：
// 绑定旧 commit 的结论需要人重新审核，机器不该替人把结论标成「已核」。
// verify-analysis 对 stale 放行 commit 不一致，等人复核完再改回 reviewed
// 并同时更新 commit 与行号。analysis-metadata 里的 markContentStale 早就
// 写好了，之前没有脚本调用它，这里把它接上。
//
// 用法：
//   node scripts/relock.mjs --all                    全部重锁到各自默认分支 HEAD
//   node scripts/relock.mjs --source codex           只重锁一个
//   node scripts/relock.mjs --source pi --to <sha>   锁到指定 commit
//   node scripts/relock.mjs --all --dry-run          只看会改什么
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, markContentStale, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, fail, git, readManifest, root, sha256Text, sourcesDir, writeDocument } from './lib.mjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const all = argv.includes('--all');
const wanted = new Set();
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === '--source') wanted.add(argv[index + 1]);
}
const toIndex = argv.indexOf('--to');
const pinned = toIndex >= 0 ? argv[toIndex + 1] : null;

if (!all && !wanted.size) {
  console.error('要么给 --all，要么给至少一个 --source <id>。');
  process.exit(2);
}
if (pinned && wanted.size !== 1) {
  console.error('--to 只能配合恰好一个 --source 使用。');
  process.exit(2);
}

const { manifest, lock, locks } = readManifest();
const targets = manifest.sources.filter(({ id }) => all || wanted.has(id));
const unknown = [...wanted].filter((id) => !manifest.sources.some((source) => source.id === id));
if (unknown.length) {
  console.error(`sources.yml 里没有这些源：${unknown.join(', ')}`);
  process.exit(2);
}

const errors = [];
const moved = [];

for (const source of targets) {
  const checkout = join(checkoutsDir, source.id);
  if (!existsSync(join(checkout, '.git'))) {
    errors.push(`${source.id}: checkout 不存在，先跑 npm run bootstrap`);
    continue;
  }
  if (git(checkout, ['status', '--porcelain'])) {
    errors.push(`${source.id}: checkout 有本地改动，先清理`);
    continue;
  }
  const locked = locks.get(source.id);
  let target = pinned;
  if (!target) {
    git(checkout, ['fetch', '--filter=blob:none', '--no-tags', 'origin', source.defaultBranch], { capture: false });
    target = git(checkout, ['rev-parse', 'FETCH_HEAD']);
  }
  if (!/^[0-9a-f]{40}$/u.test(target)) {
    errors.push(`${source.id}: 解析不出完整 SHA（拿到 ${target}）`);
    continue;
  }
  if (target === locked.commit) {
    console.log(`不动 ${source.id}：已经在 ${target.slice(0, 12)}`);
    continue;
  }
  const before = locked.commit;
  const date = git(checkout, ['show', '-s', '--format=%cs', target]);
  console.log(`${source.id}: ${before.slice(0, 12)} → ${target.slice(0, 12)}（${date}）`);
  if (dryRun) {
    moved.push({ id: source.id, before, after: target });
    continue;
  }
  git(checkout, ['checkout', '--detach', target], { capture: false });
  locked.commit = target;
  const licenseFile = source.license?.file;
  if (licenseFile && existsSync(join(checkout, licenseFile))) {
    const hash = sha256Text(join(checkout, licenseFile));
    if (hash !== locked.licenseSha256) {
      console.log(`  许可证哈希变了，已刷新（改的是换行还是条款，自己看一眼 ${licenseFile}）`);
      locked.licenseSha256 = hash;
    }
  }
  git(root, ['add', '--', `sources/checkouts/${source.id}`], { capture: false });
  moved.push({ id: source.id, before, after: target });
}

if (fail(errors)) process.exit(1);
if (!moved.length) {
  console.log('没有源需要重锁。');
  process.exit(0);
}

if (dryRun) {
  console.log('\n--dry-run：lock、gitlink、正文 status 都没动。');
  process.exit(0);
}

lock.generatedAt = git(join(checkoutsDir, moved[0].id), ['show', '-s', '--format=%cI', moved[0].after]);
writeDocument(join(sourcesDir, 'sources.lock.yml'), lock);

// 绑定了被重锁源的正文，一律标 stale，等人复核。
const movedIds = new Set(moved.map(({ id }) => id));
const staled = [];
for (const file of analysisFiles()) {
  const { metadata } = parseFrontmatter(file.content);
  if (!metadata || metadata.status === 'stale') continue;
  let content = file.content;
  for (const id of movedIds) content = markContentStale(content, id);
  if (content === file.content) continue;
  writeFileSync(file.path, content);
  staled.push(file.relativePath);
}

console.log(`\n已重锁 ${moved.length} 个源，${staled.length} 篇正文标成 stale：`);
for (const path of staled) console.log(`  ${path}`);
console.log('\n接下来：');
console.log('  1. node scripts/check-drift.mjs --write   看逐篇复核优先级');
console.log('  2. 逐篇复核。行号能靠 check:anchors 挡越界，语义变没变只能人读；');
console.log('     发现结论不成立就重写那一节，别只把行号推到新位置。');
console.log('  3. 复核完的把 frontmatter 的 commit 更新到新值、status 改回 reviewed。');
console.log('  4. npm run check');
