import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { listProjectFiles, posixPath, root } from './lib.mjs';

export const analysisPrefixes = [
  'docs/13-source-studies/',
  'docs/20-decisions-and-postmortems/',
];

export function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return { metadata: null, bodyStart: 0 };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { metadata: null, bodyStart: 0 };
  const metadata = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([a-z_]+):\s*(.*)$/u.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    metadata[key] = raw.startsWith('[') && raw.endsWith(']')
      ? raw.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean)
      : raw.replace(/^['"]|['"]$/gu, '');
  }
  return { metadata, bodyStart: end + 1 };
}

export function markContentStale(content, sourceId) {
  const { metadata } = parseFrontmatter(content);
  if (!metadata || metadata.source_repo !== sourceId || metadata.status === 'stale') return content;
  return content.replace(/^status:\s*[^\n]+$/mu, 'status: stale');
}

export function analysisFiles() {
  return listProjectFiles().map((path) => ({
    path,
    relativePath: posixPath(relative(root, path)),
    content: readFileSync(path, 'utf8'),
  })).filter(({ relativePath }) => relativePath.endsWith('.md') && analysisPrefixes.some((prefix) => relativePath.startsWith(prefix)));
}
