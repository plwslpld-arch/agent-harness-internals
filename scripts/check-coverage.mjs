#!/usr/bin/env node
// 多仓文章的证据覆盖率门禁。每篇 a/e 文章在 frontmatter 声明四个来源的最低锚点数。
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analysisFiles, parseFrontmatter } from './analysis-metadata.mjs';
import { fail } from './lib.mjs';

export const AGENT_REPOS = [
  'deepseek-harness',
  'codex',
  'gemini-cli',
  'claude-agent-sdk',
];

export const EVAL_REPOS = [
  'lm-evaluation-harness',
  'inspect-ai',
  'terminal-bench',
  'swe-bench',
];

const EXT = '(?:ts|tsx|mjs|js|rs|py|md|yml|yaml|json|css|html)';
const FULL = new RegExp(`(?:([a-z0-9][a-z0-9-]*)!)?((?:[\\w.-]+/)+[\\w.-]+\\.${EXT})(?::(\\d+)(?:-(\\d+))?)?`, 'gu');
const BARE = new RegExp('`([\\w.-]+\\.' + EXT + ')(?::(\\d+)(?:-(\\d+))?)?`', 'gu');
const SHORT = /`:(\d+)(?:-(\d+))?`/gu;

export function coverageTargets(relativePath) {
  if (/^docs\/a\d[^/]*\.md$/u.test(relativePath)) return AGENT_REPOS;
  if (/^docs\/e\d[^/]*\.md$/u.test(relativePath)) return EVAL_REPOS;
  return null;
}

function tokensIn(line) {
  const found = [];
  const covered = (at) => found.some((item) => at >= item.at && at < item.at + item.length);

  for (const match of line.matchAll(FULL)) {
    found.push({ at: match.index, length: match[0].length, kind: 'full', match });
  }
  for (const match of line.matchAll(BARE)) {
    if (!covered(match.index + 1)) {
      found.push({ at: match.index, length: match[0].length, kind: 'bare', match });
    }
  }
  for (const match of line.matchAll(SHORT)) {
    if (!covered(match.index)) {
      found.push({ at: match.index, length: match[0].length, kind: 'short', match });
    }
  }

  return found.sort((left, right) => left.at - right.at);
}

export function countCoverage(content, targets, defaultRepo = targets[0]) {
  const counts = Object.fromEntries(targets.map((repo) => [repo, 0]));
  let currentRepo = defaultRepo;
  let inFence = false;

  for (const line of content.split('\n')) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const { kind, match } of tokensIn(line)) {
      let repo = currentRepo;
      let lineNumber;

      if (kind === 'full') {
        repo = match[1] ?? defaultRepo;
        lineNumber = match[3];
        currentRepo = repo;
      } else if (kind === 'bare') {
        lineNumber = match[2];
      } else {
        lineNumber = match[1];
      }

      if (lineNumber && Object.hasOwn(counts, repo)) counts[repo] += 1;
    }
  }

  return counts;
}

export function coverageRows(files = analysisFiles()) {
  return files.flatMap((file) => {
    const targets = coverageTargets(file.relativePath);
    if (!targets) return [];
    const { metadata } = parseFrontmatter(file.content);
    const boundRepo = metadata?.sources?.find(({ repo }) => targets.includes(repo))?.repo;
    return [{
      article: file.relativePath,
      counts: countCoverage(file.content, targets, boundRepo ?? targets[0]),
      minimums: metadata?.coverage_min,
      targets,
    }];
  });
}

export function coverageFailures(rows) {
  const errors = [];
  for (const { article, counts, minimums, targets = Object.keys(counts) } of rows) {
    for (const repo of targets) {
      const minimum = minimums?.[repo];
      if (!Number.isInteger(minimum) || minimum < 1) {
        errors.push(`${article}: coverage_min.${repo} must be a positive integer`);
      } else if ((counts[repo] ?? 0) < minimum) {
        errors.push(`${article}: ${repo}=${counts[repo] ?? 0} < ${minimum}`);
      }
    }
  }
  return errors;
}

function main() {
  const rows = coverageRows();
  if (rows.length === 0) {
    console.log('覆盖率门禁：当前没有 docs/aN-*.md 或 docs/eN-*.md 目标');
    return;
  }

  console.log('覆盖率门禁');
  for (const { article, counts } of rows) {
    const summary = Object.entries(counts).map(([repo, count]) => `${repo}=${count}`).join('  ');
    console.log(`${article}: ${summary}`);
  }
  fail(coverageFailures(rows));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
