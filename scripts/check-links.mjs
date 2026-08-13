#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fail, listProjectFiles, posixPath, root } from './lib.mjs';

const errors = [];
const markdownFiles = listProjectFiles().filter((path) => path.endsWith('.md'));
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
for (const path of markdownFiles) {
  const content = readFileSync(path, 'utf8');
  for (const match of content.matchAll(linkPattern)) {
    const raw = match[1];
    if (raw.startsWith('#') || /^(?:https?:|mailto:)/u.test(raw)) continue;
    let target;
    try {
      target = decodeURI(raw.split('#')[0].split('?')[0]);
    } catch {
      errors.push(`${posixPath(relative(root, path))}: invalid encoded link ${raw}`);
      continue;
    }
    const absolute = resolve(dirname(path), target);
    const rel = posixPath(relative(root, absolute));
    if (rel.startsWith('sources/checkouts/') && !existsSync(absolute)) continue;
    if (!existsSync(absolute)) errors.push(`${posixPath(relative(root, path))}: missing link target ${raw}`);
  }
}
if (!fail(errors)) console.log(`checked local links in ${markdownFiles.length} Markdown files`);
