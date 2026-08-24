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
  if (/\/(Users|home)\/[A-Za-z0-9._-]+\//u.test(content)) errors.push(`${rel}: 包含机器相关的用户目录路径`);
  if (/[A-Za-z]:\\(?:Users|Documents|Projects)\\/u.test(content)) errors.push(`${rel}: 包含 Windows 机器相关路径`);
  if (content.includes(`file:${'//'}`)) errors.push(`${rel}: contains a file URL`);
}

const packageJson = JSON.parse(readFileSync(`${root}/package.json`, 'utf8'));
if (Object.keys(packageJson.dependencies ?? {}).length || Object.keys(packageJson.devDependencies ?? {}).length) {
  errors.push('package.json: automation must remain zero-dependency');
}
if (!fail(errors)) console.log('可移植性检查通过：相对路径、LF 换行、零依赖');
