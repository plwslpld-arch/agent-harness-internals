#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fail, listProjectFiles, posixPath, root } from './lib.mjs';

const errors = [];
const markdownFiles = listProjectFiles().filter((path) => path.endsWith('.md'));
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
for (const path of markdownFiles) {
  // 代码块里的 `[...](...)` 多半是 shell 片段或被引用的上游 Markdown，不是本仓库的链接。
  let inFence = false;
  const content = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => {
      if (/^\s*```/u.test(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join('\n')
    // 行内代码里的 `foo[bar](baz)` 是代码，不是链接。
    .replace(/`[^`\n]*`/gu, '`code`');
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
