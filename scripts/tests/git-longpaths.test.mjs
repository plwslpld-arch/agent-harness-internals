import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { git } from '../lib.mjs';

test('Git 辅助函数可以暂存超过 260 字符的 Windows 路径', { skip: process.platform !== 'win32' }, () => {
  const repository = mkdtempSync(join(tmpdir(), 'harness-longpaths-'));
  try {
    git(repository, ['init']);
    const segment = 'snapshot-name-that-is-intentionally-long-for-windows-regression';
    const directory = join(repository, segment, segment, segment, segment);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'evidence.snap.svg'), '<svg/>\n');

    git(repository, ['add', '.']);

    assert.match(git(repository, ['ls-files']), /evidence\.snap\.svg$/u);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
