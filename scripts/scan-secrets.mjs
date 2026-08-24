#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fail, listProjectFiles, posixPath, root } from './lib.mjs';

const rules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/u],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/u],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/u],
  ['credential in URL', /https?:\/\/[^\s/:]+:[^\s/@]+@/u],
  ['assigned secret', /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|PASSWORD|SECRET)\s*[=:]\s*["'](?!your-|example|placeholder|<|\$\{)[A-Za-z0-9_./+=-]{16,}["']/iu],
];
const errors = [];
for (const path of listProjectFiles()) {
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8192).includes(0)) continue;
  const content = buffer.toString('utf8');
  for (const [name, pattern] of rules) {
    if (pattern.test(content)) errors.push(`${posixPath(relative(root, path))}: 疑似包含 ${name}`);
  }
}
if (!fail(errors)) console.log('敏感信息扫描通过');
