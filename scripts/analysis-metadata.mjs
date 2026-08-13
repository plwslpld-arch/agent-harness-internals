import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { listProjectFiles, posixPath, root } from './lib.mjs';

export const analysisPrefixes = ['docs/'];

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
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        metadata[key] = JSON.parse(raw);
      } catch {
        metadata[key] = raw.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean);
      }
    } else {
      metadata[key] = raw.replace(/^['"]|['"]$/gu, '');
    }
  }
  return { metadata, bodyStart: end + 1 };
}

export function markContentStale(content, sourceId) {
  const { metadata } = parseFrontmatter(content);
  const boundSources = Array.isArray(metadata?.sources)
    ? metadata.sources
    : metadata?.source_repo ? [{ repo: metadata.source_repo }] : [];
  if (!boundSources.some(({ repo }) => repo === sourceId) || metadata.status === 'stale') return content;
  return content.replace(/^status:\s*[^\n]+$/mu, 'status: stale');
}

export function analysisFiles() {
  return listProjectFiles().map((path) => ({
    path,
    relativePath: posixPath(relative(root, path)),
    content: readFileSync(path, 'utf8'),
  })).filter(({ relativePath }) => relativePath.endsWith('.md')
    && analysisPrefixes.some((prefix) => relativePath.startsWith(prefix))
    && !relativePath.startsWith('docs/14-file-reference/generated/'));
}
