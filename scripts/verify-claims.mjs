#!/usr/bin/env node
// 核对论断台账：verification/*.md 里每条 passed 的记录，锚点行区间内必须真的
// 出现「期望片段」声明的字符串。锚点漂移、行号写错、论断改了却忘换证据，都在这里失败。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutsDir, fail, readManifest, root } from './lib.mjs';

const ANCHOR = /https:\/\/github\.com\/([^/\s)]+)\/([^/\s)]+)\/blob\/([0-9a-f]{40})\/([^\s)#]+)#L(\d+)(?:-L(\d+))?/u;
const ledgerDir = join(root, 'verification');

function sourceIdFor(owner, repository) {
  const { manifest } = readManifest();
  const key = `${owner}/${repository}`.toLowerCase();
  const hit = manifest.sources.find((source) => source.url
    .replace(/\.git$/u, '').replace(/^https:\/\/github\.com\//u, '').toLowerCase() === key);
  return hit?.id;
}

// 本地锁定 Checkout 优先；没准备来源时回退到网络，方便在干净机器上单独核对一条。
async function readSlice({ owner, repository, commit, path, start, end }) {
  const id = sourceIdFor(owner, repository);
  const local = id ? join(checkoutsDir, id, ...path.split('/')) : undefined;
  let text;
  if (local && existsSync(local)) {
    text = readFileSync(local, 'utf8');
  } else {
    const url = `https://raw.githubusercontent.com/${owner}/${repository}/${commit}/${path}`;
    const response = await fetch(url);
    if (!response.ok) return { error: `无法读取 ${path}（HTTP ${response.status}）` };
    text = await response.text();
  }
  const lines = text.split(/\r?\n/u);
  if (end > lines.length) return { error: `${path}#L${start}-L${end} 越界（共 ${lines.length} 行）` };
  return { slice: lines.slice(start - 1, end).join('\n') };
}

function parseRows(content) {
  return content.split('\n')
    .filter((line) => line.startsWith('|') && ANCHOR.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());
      const [, owner, repository, commit, encoded, startRaw, endRaw] = line.match(ANCHOR);
      const fragment = cells[5]?.match(/`([^`]+)`/u)?.[1];
      return {
        id: cells[1],
        status: cells[6],
        fragment,
        owner,
        repository,
        commit,
        path: decodeURIComponent(encoded),
        start: Number(startRaw),
        end: Number(endRaw ?? startRaw),
      };
    });
}

const errors = [];
let checked = 0;
const ledgers = existsSync(ledgerDir)
  ? readdirSync(ledgerDir).filter((name) => name.endsWith('.md')) : [];

for (const name of ledgers) {
  const rows = parseRows(readFileSync(join(ledgerDir, name), 'utf8'));
  if (rows.length === 0) errors.push(`verification/${name}: 没有解析到带锚点的台账记录`);
  for (const row of rows) {
    if (row.status !== 'passed') continue;      // partial / blocked 不做片段核对
    if (!row.fragment) {
      errors.push(`${row.id}: 标为 passed 但没有声明期望片段`);
      continue;
    }
    checked += 1;
    const { slice, error } = await readSlice(row);
    if (error) { errors.push(`${row.id}: ${error}`); continue; }
    if (!slice.includes(row.fragment)) {
      errors.push(`${row.id}: ${row.path}#L${row.start}-L${row.end} 里找不到期望片段「${row.fragment}」`);
    }
  }
}

if (ledgers.length === 0) errors.push('verification/ 下没有台账文件');
if (!fail(errors)) console.log(`已核对 ${ledgers.length} 份台账中的 ${checked} 条 passed 论断`);
