#!/usr/bin/env node
// 上游漂移体检。
//
// 结论绑在固定 commit 上，所以上游怎么变都不会让 CI 变红。代价是漂移无声：
// 锁定的快照和上游 HEAD 越差越远，正文里的结论还看着像是新的。这个脚本
// 把差距量出来，让它变成一件能看见的事。
//
// 它回答三个问题：
//   1. 每个源的 lock 比上游 HEAD 旧多少天；
//   2. 正文引用到的那些文件里，有多少个在这段区间里变过；
//   3. 一千多处行号引用里，有多少处落在已变化的文件上，逐篇排出优先级。
//
// 报日期差而不报提交距离，是因为 .gitmodules 把 submodule 声明成 shallow，
// 本地只有锁定的那一个 commit，`rev-list A..B` 只会给出 1。
//
// 变的文件不等于结论错了，但它是唯一值得人去复核的那一批。行号能靠
// check:anchors 挡住越界，语义变没变只能人读。
//
// 用法：
//   node scripts/check-drift.mjs --fetch     先抓上游最新，再算（要网络）
//   node scripts/check-drift.mjs             用本地已有的 remote ref 算
//   node scripts/check-drift.mjs --write     把报告写进 research/drift/
//   node scripts/check-drift.mjs --max-anchor-ratio 0.25   超过比例即失败
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, fail, git, readManifest, root } from './lib.mjs';

const argv = process.argv.slice(2);
const doFetch = argv.includes('--fetch');
const doWrite = argv.includes('--write');
const ratioIndex = argv.indexOf('--max-anchor-ratio');
const maxAnchorRatio = ratioIndex >= 0 ? Number(argv[ratioIndex + 1]) : null;

const { manifest, locks } = readManifest();
const defaultRepo = 'deepseek-harness';
const knownRepos = new Set(manifest.sources.map(({ id }) => id));
const REFERENCE = /(?:([a-z0-9][a-z0-9-]*)!)?((?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|mjs|js|rs|py|md|yml|yaml|json)):(\d+)(?:-(\d+))?/gu;

// 收集正文里每一处行号引用，按 repo 归堆。与 verify-anchors 用同一条正则，
// 两边对「什么算一处引用」的判断必须一致。
function collectAnchors() {
  const perRepo = new Map();
  const perFile = [];
  for (const file of analysisFiles()) {
    const { metadata } = parseFrontmatter(file.content);
    if (metadata?.status === 'stale') continue;
    const bound = new Set((metadata?.sources ?? []).map(({ repo }) => repo).filter(Boolean));
    const candidates = bound.size ? [...bound] : [defaultRepo];
    const counts = new Map();
    let inFence = false;
    for (const line of file.content.split('\n')) {
      if (/^\s*```/u.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      for (const [, explicitRepo, path] of line.matchAll(REFERENCE)) {
        const repos = explicitRepo ? [explicitRepo] : candidates;
        // 与 verify-anchors 一样，按「哪个 checkout 里真有这个路径」归属。
        const repo = repos.find((id) => knownRepos.has(id) && existsSync(join(checkoutsDir, id, path)));
        const target = repo ?? repos.find((id) => knownRepos.has(id));
        if (!target) continue;
        if (!perRepo.has(target)) perRepo.set(target, new Map());
        const bucket = perRepo.get(target);
        bucket.set(path, (bucket.get(path) ?? 0) + 1);
        counts.set(`${target}!${path}`, (counts.get(`${target}!${path}`) ?? 0) + 1);
      }
    }
    perFile.push({ relativePath: file.relativePath, counts });
  }
  return { perRepo, perFile };
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

const rows = [];
const errors = [];
const { perRepo, perFile } = collectAnchors();

for (const source of manifest.sources) {
  const checkout = join(checkoutsDir, source.id);
  const locked = locks.get(source.id)?.commit;
  if (!locked || !existsSync(join(checkout, '.git'))) continue;
  if (doFetch) {
    tryGit(checkout, ['fetch', '--filter=blob:none', '--no-tags', 'origin', source.defaultBranch]);
  }
  const head = tryGit(checkout, ['rev-parse', 'FETCH_HEAD'])
    ?? tryGit(checkout, ['rev-parse', `origin/${source.defaultBranch}`]);
  if (!head) {
    rows.push({ id: source.id, locked, head: null, note: '本地没有上游 ref，用 --fetch 抓一次' });
    continue;
  }
  // submodule 按 shallow 拉，本地只有锁定的那一个 commit，提交距离算不出来。
  // 日期差同样说明问题，而且不依赖提交图完整。
  const lockedDate = tryGit(checkout, ['show', '-s', '--format=%cs', locked]);
  const headDate = tryGit(checkout, ['show', '-s', '--format=%cs', head]);
  const dayGap = lockedDate && headDate
    ? Math.round((Date.parse(headDate) - Date.parse(lockedDate)) / 86400000)
    : null;
  const nameStatus = tryGit(checkout, ['diff', '--name-status', locked, head]);
  if (nameStatus === null) {
    rows.push({ id: source.id, locked, head, note: '本地缺少对比所需的树对象，用 --fetch 抓一次' });
    continue;
  }
  const changed = new Set(nameStatus.split('\n').filter(Boolean)
    .flatMap((line) => line.split('\t').slice(1)));
  const cited = perRepo.get(source.id) ?? new Map();
  let citedChanged = 0;
  let anchorsTotal = 0;
  let anchorsChanged = 0;
  const changedCited = new Set();
  for (const [path, count] of cited) {
    anchorsTotal += count;
    if (!changed.has(path)) continue;
    citedChanged += 1;
    anchorsChanged += count;
    changedCited.add(`${source.id}!${path}`);
  }
  rows.push({
    id: source.id,
    locked,
    head,
    lockedDate,
    headDate,
    dayGap,
    filesChanged: changed.size,
    citedTotal: cited.size,
    citedChanged,
    anchorsTotal,
    anchorsChanged,
    changedCited,
  });
}

const allChangedCited = new Set(rows.flatMap((row) => [...(row.changedCited ?? [])]));
const perDoc = perFile.map(({ relativePath, counts }) => {
  let total = 0;
  let stale = 0;
  for (const [key, count] of counts) {
    total += count;
    if (allChangedCited.has(key)) stale += count;
  }
  return { relativePath, total, stale, ratio: total ? stale / total : 0 };
}).filter((row) => row.total).sort((a, b) => b.ratio - a.ratio || b.stale - a.stale);

const lines = [];
lines.push('# 上游漂移体检', '');
lines.push('由 `node scripts/check-drift.mjs --write` 生成。变的文件不等于结论错了，但它是唯一值得人去复核的那一批。', '');
lines.push('## 各源与上游的差距', '');
lines.push('| 源 | lock | 上游 HEAD | 锁定日期 → HEAD 日期 | 相隔 | 变化文件 | 被引文件变化 | 锚点受影响 |');
lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: |');
for (const row of rows) {
  if (row.note) {
    lines.push(`| \`${row.id}\` | \`${row.locked.slice(0, 10)}\` | — | — | — | — | — | ${row.note} |`);
    continue;
  }
  const citedPct = row.citedTotal ? ` (${Math.round(100 * row.citedChanged / row.citedTotal)}%)` : '';
  const anchorPct = row.anchorsTotal ? ` (${Math.round(100 * row.anchorsChanged / row.anchorsTotal)}%)` : '';
  lines.push(`| \`${row.id}\` | \`${row.locked.slice(0, 10)}\` | \`${row.head.slice(0, 10)}\` | ${row.lockedDate} → ${row.headDate} | ${row.dayGap} 天 | ${row.filesChanged} | ${row.citedChanged} / ${row.citedTotal}${citedPct} | ${row.anchorsChanged} / ${row.anchorsTotal}${anchorPct} |`);
}
lines.push('');
lines.push('## 逐篇复核优先级', '');
lines.push('比例高的先看。落在变化文件上的锚点，行号可能还指得中，但那一段讲的机制未必还成立。', '');
lines.push('| 篇目 | 受影响锚点 / 总锚点 | 比例 |');
lines.push('| --- | ---: | ---: |');
for (const row of perDoc) {
  lines.push(`| \`${row.relativePath}\` | ${row.stale} / ${row.total} | ${(100 * row.ratio).toFixed(0)}% |`);
}
lines.push('');
const report = `${lines.join('\n')}\n`;

if (doWrite) {
  const dir = join(root, 'research', 'drift');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'latest.md');
  writeFileSync(path, report);
  console.log(`报告已写入 research/drift/latest.md`);
} else {
  console.log(report);
}

if (maxAnchorRatio !== null) {
  for (const row of rows) {
    if (!row.anchorsTotal) continue;
    const ratio = row.anchorsChanged / row.anchorsTotal;
    if (ratio > maxAnchorRatio) {
      errors.push(`${row.id}: ${row.anchorsChanged} / ${row.anchorsTotal} 处锚点落在已变化的文件上（${(100 * ratio).toFixed(0)}%），超过阈值 ${(100 * maxAnchorRatio).toFixed(0)}%，该重新锁定并复核了`);
    }
  }
}
fail(errors);
