import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { listProjectFiles, posixPath, root } from './lib.mjs';

export const analysisPrefixes = ['docs/'];
export const articleStatuses = new Set(['outline', 'draft', 'reviewed', 'verified', 'stale']);

const articleDirectories = [
  ['docs/00-start-here.md', 'start'],
  ['docs/foundations/', 'foundation'],
  ['docs/harnesses/', 'harness'],
  ['docs/comparisons/', 'comparison'],
  ['docs/roles/', 'role'],
  ['docs/labs/', 'lab'],
  ['docs/samples/', 'sample'],
  ['docs/appendix/', 'appendix'],
];

export function articleKind(relativePath) {
  return articleDirectories.find(([prefix]) => relativePath.startsWith(prefix))?.[1] ?? null;
}

export function validArticleStatus(status) {
  return articleStatuses.has(status);
}

export function validOfficialDocumentSource(source) {
  return source?.type === 'official-doc'
    && typeof source.title === 'string'
    && source.title.trim().length > 0
    && typeof source.url === 'string'
    && /^https:\/\//u.test(source.url)
    && /^\d{4}-\d{2}-\d{2}$/u.test(source.accessed ?? '');
}

export function articleMetadataFailures(relativePath, metadata) {
  const kind = articleKind(relativePath);
  if (!kind) return [];

  const errors = [];
  if (!metadata || typeof metadata !== 'object') return [`${relativePath}: 缺少 YAML frontmatter`];
  for (const field of ['title', 'article_type', 'status', 'last_verified']) {
    if (typeof metadata[field] !== 'string' || !metadata[field].trim()) {
      errors.push(`${relativePath}: 缺少 ${field}`);
    }
  }
  if (!Array.isArray(metadata.sources)) errors.push(`${relativePath}: sources 必须是数组`);
  if (metadata.article_type && metadata.article_type !== kind) {
    errors.push(`${relativePath}: article_type 必须是 ${kind}`);
  }
  if (kind === 'harness' && (typeof metadata.harness !== 'string' || !metadata.harness.trim())) {
    errors.push(`${relativePath}: 缺少 harness`);
  }
  if (!validArticleStatus(metadata.status)) {
    errors.push(`${relativePath}: status 非法（允许 ${[...articleStatuses].join(' / ')}）：${metadata.status}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(metadata.last_verified ?? '')) {
    errors.push(`${relativePath}: last_verified 必须是 YYYY-MM-DD`);
  }
  if (Array.isArray(metadata.sources) && metadata.sources.length === 0 && metadata.status !== 'outline' && kind !== 'start') {
    errors.push(`${relativePath}: 只有 outline 可以使用空 sources`);
  }
  return errors;
}

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
    if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
      try {
        metadata[key] = JSON.parse(raw);
      } catch {
        metadata[key] = raw.startsWith('[')
          ? raw.slice(1, -1).split(',').map((item) => item.trim()).filter(Boolean)
          : raw;
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
    && analysisPrefixes.some((prefix) => relativePath.startsWith(prefix)));
}
