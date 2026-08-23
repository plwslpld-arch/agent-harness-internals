#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { root } from './lib.mjs';

export function testFiles() {
  const directory = join(root, 'scripts', 'tests');
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
    .map((entry) => join(directory, entry.name))
    .sort();
}

function main() {
  const files = testFiles();
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
