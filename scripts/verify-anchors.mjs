#!/usr/bin/env node
// 抽查正文里的「路径:行号」引用是否真的指向那一行。
//
// 旧版校验只确认「文件存在」，于是行号写错也能过 CI，
// 「每句话都能追到证据」就成了空话。这个脚本把行号也纳入门禁：
//
//   1. 扫描 docs/ 正文里形如 `packages/a/b/src/c.ts:123` 或 `:123-145` 的引用；
//   2. 在锁定的 checkout 里读出那一行（区间取首行）；
//   3. 如果该行是空行，就往下找 3 行内的第一行非空内容（注释块与
//      多行声明常见的偏移），仍找不到才算失败；
//   4. 路径不存在、行号越界一律失败。
//
// 正文里还有两种简写，写作时用得很多，此前全都在门禁之外：
//
//   `tool-calls.ts:237-242`   给过完整路径之后，只写文件名
//   `:249-259`                连文件名都省掉，跟着上一处引用
//
// 全仓四百多处走的是这两种写法。README 说「抽查正文里每一处路径:行号」，
// 不把它们算进来这句话就不成立。所以这里维护一个「当前在讲哪个文件」的
// 游标：完整路径、裸文件名、以及不带行号的路径提及都会刷新它，简写引用
// 挂在游标上。
//
// 内容是否「对得上」仍需人读，但至少「指到了一个真实存在的行」由机器保证。
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, fail, readManifest } from './lib.mjs';

const { manifest } = readManifest();
const defaultRepo = 'deepseek-harness';
const knownRepos = new Set(manifest.sources.map(({ id }) => id));
const TOLERANCE = 3;

const EXT = '(?:ts|tsx|mjs|js|rs|py|md|yml|yaml|json|css|html)';
// 完整路径，前面可带 repo 前缀，后面可带行号。
const FULL = new RegExp(`(?:([a-z0-9][a-z0-9-]*)!)?((?:[\\w.-]+/)+[\\w.-]+\\.${EXT})(?::(\\d+)(?:-(\\d+))?)?`, 'gu');
// 反引号里的裸文件名，后面可带行号。
const BARE = new RegExp('`([\\w.-]+\\.' + EXT + ')(?::(\\d+)(?:-(\\d+))?)?`', 'gu');
// 反引号里只剩行号的简写。
const SHORT = /`:(\d+)(?:-(\d+))?`/gu;

const fileCache = new Map();
function readLines(repo, path) {
  const key = `${repo}:${path}`;
  if (!fileCache.has(key)) {
    const absolute = join(checkoutsDir, repo, path);
    fileCache.set(key, existsSync(absolute) ? readFileSync(absolute, 'utf8').split('\n') : null);
  }
  return fileCache.get(key);
}

// 一行里的三种写法按出现位置合并，重叠的以完整路径优先。
function tokensIn(line) {
  const found = [];
  const covers = (at, length) => found.some((item) => at >= item.at && at < item.at + item.length);
  for (const match of line.matchAll(FULL)) {
    found.push({ at: match.index, length: match[0].length, kind: 'full', match });
  }
  for (const match of line.matchAll(BARE)) {
    if (covers(match.index + 1)) continue;
    found.push({ at: match.index, length: match[0].length, kind: 'bare', match });
  }
  for (const match of line.matchAll(SHORT)) {
    if (covers(match.index)) continue;
    found.push({ at: match.index, length: match[0].length, kind: 'short', match });
  }
  return found.sort((a, b) => a.at - b.at);
}

const errors = [];
// stale 的篇目照样查行号，只是查出来的问题降级成提醒。
//
// 原来的做法是整篇跳过，于是重锁之后全仓标 stale，这个脚本会报「已抽查
// 0 处引用」而 CI 全绿——仓库最硬的那条保证被无声关掉了。stale 的语义是
// 「结论待人复核」，该豁免的是 verify-analysis 里的 commit 一致性，不是
// 行号本身。照查照报，才能拿到那份「哪些行号已经漂了」的清单；等这篇改回
// reviewed，同一批问题立刻变成会让 CI 红的错误。
const staleWarnings = [];
let checked = 0;
let staleChecked = 0;
const files = analysisFiles();

for (const file of files) {
  const { metadata } = parseFrontmatter(file.content);
  const isStale = metadata?.status === 'stale';
  const sink = isStale ? staleWarnings : errors;
  const boundRepos = new Set((metadata?.sources ?? []).map(({ repo }) => repo).filter(Boolean));
  const fallback = [...(boundRepos.size ? boundRepos : [defaultRepo])];
  const lines = file.content.split('\n');
  // 「当前在讲哪个文件」的游标，以及本篇出现过的全部完整路径，
  // 用来把裸文件名还原成完整路径。
  let current = null;
  const seen = [];
  let inFence = false;

  lines.forEach((line, index) => {
    if (/^\s*```/u.test(line)) inFence = !inFence;
    // 代码块里的行号多半是 sed/grep 命令参数，不当作引用。
    if (inFence) return;
    const where = `${file.relativePath}:${index + 1}`;

    for (const { kind, match } of tokensIn(line)) {
      let repoHint = null;
      let path = null;
      let startRaw = null;
      let endRaw = null;

      if (kind === 'full') {
        [, repoHint, path, startRaw, endRaw] = match;
      } else if (kind === 'bare') {
        const [, name, s, e] = match;
        // 裸文件名按 basename 回指本篇出现过的完整路径。同名多个就放弃，
        // 猜错比不猜更糟。
        const hits = seen.filter((entry) => basename(entry.path) === name);
        if (hits.length !== 1) continue;
        ({ repoHint, path } = hits[0]);
        startRaw = s;
        endRaw = e;
      } else {
        if (!current) continue;
        ({ repoHint, path } = current);
        [, startRaw, endRaw] = match;
      }

      const candidates = repoHint ? [repoHint] : fallback;
      if (!candidates.every((id) => knownRepos.has(id))) continue;
      const repo = candidates.find((id) => readLines(id, path) !== null);

      // 记住这个文件，供后面的简写回指。不带行号的提及也算，正文里
      // 「`apps/cli/src/args.ts` 解析出三种 mode：`:22`、`:32`」就是这么写的。
      if (repo !== undefined && (kind === 'full' || kind === 'bare')) {
        const entry = { path, repoHint: repoHint ?? repo };
        current = entry;
        if (!seen.some((item) => item.path === path)) seen.push(entry);
      }

      if (startRaw === undefined || startRaw === null) continue;

      if (repo === undefined) {
        // checkout 未拉取时不误报；verify-sources 已经负责这件事。
        if (!candidates.every((id) => existsSync(join(checkoutsDir, id, '.git')))) continue;
        sink.push(`${where}: ${candidates.join(' / ')} 中都没有 ${path}`);
        continue;
      }
      const source = readLines(repo, path);
      const start = Number(startRaw);
      const end = endRaw ? Number(endRaw) : start;
      checked += 1;
      if (isStale) staleChecked += 1;
      if (start < 1 || end < start || end > source.length) {
        sink.push(`${where}: ${path}:${startRaw}${endRaw ? `-${endRaw}` : ''} 越界（该文件共 ${source.length} 行）`);
        continue;
      }
      const window = source.slice(start - 1, Math.min(source.length, start - 1 + TOLERANCE + 1));
      if (!window.some((text) => text.trim().length > 0)) {
        sink.push(`${where}: ${path}:${startRaw} 指向空行（其后 ${TOLERANCE} 行也为空），行号可能已经漂移`);
        continue;
      }
      // 可选的强校验：引用后面紧跟「原文片段」时，要求它真的出现在被引区间里。
      // 行号对、语义错（指到了相邻的另一个声明）是纯行号校验挡不住的一类错误，
      // 写作时多复制几个词就能让 CI 替你挡住。
      const quoted = /^`?[\s（(]*「([^」]{4,})」/u.exec(line.slice(match.index + match[0].length));
      if (quoted) {
        const region = source.slice(start - 1, end).join('\n').replace(/\s+/gu, ' ');
        const needle = quoted[1].replace(/\s+/gu, ' ').trim();
        if (!region.includes(needle)) {
          sink.push(`${where}: ${path}:${startRaw}${endRaw ? `-${endRaw}` : ''} 的引文「${needle}」在该区间里找不到`);
        }
      }
    }
  });
}

for (const warning of staleWarnings) console.warn(`WARN(stale): ${warning}`);
if (!fail(errors)) {
  const note = staleChecked
    ? `，其中 ${staleChecked} 处在 stale 篇目里，${staleWarnings.length} 处待修（只提醒不拦）`
    : '';
  console.log(`已抽查 ${files.length} 篇文章中的 ${checked} 处行号引用${note}`);
}
