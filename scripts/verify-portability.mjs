#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fail, listProjectFiles, posixPath, root } from './lib.mjs';

const errors = [];
for (const path of listProjectFiles()) {
  const rel = posixPath(relative(root, path));
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  const content = buffer.toString('utf8');
  if (content.includes('\r\n')) errors.push(`${rel}: CRLF line endings`);
  if (/\/(Users|home)\/[A-Za-z0-9._-]+\//u.test(content)) errors.push(`${rel}: contains a machine-specific home path`);
  if (/[A-Za-z]:\\(?:Users|Documents|Projects)\\/u.test(content)) errors.push(`${rel}: contains a Windows machine-specific path`);
  if (content.includes(`file:${'//'}`)) errors.push(`${rel}: contains a file URL`);
}

const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
if (Object.keys(packageJson.dependencies ?? {}).length || Object.keys(packageJson.devDependencies ?? {}).length) {
  errors.push('package.json: automation must remain zero-dependency');
}
if (!fail(errors)) console.log('portability checks passed (relative paths, LF, zero dependencies)');
