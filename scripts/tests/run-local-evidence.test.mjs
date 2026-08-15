import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import test from 'node:test';
import { root } from '../lib.mjs';

test('local evidence draft records credential presence without leaking the value', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'dsha-evidence-'));
  const stdout = execFileSync(
    process.execPath,
    ['scripts/run-local-evidence.mjs', '--scenario', 'secret-smoke', '--out-dir', outputDir],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, DEEPSEEK_API_KEY: 'example-secret-value-should-not-appear' },
    },
  ).trim();
  // 脚本可能打印绝对路径（Windows 下形如 C:\...），也可能打印仓库相对路径。
  const file = isAbsolute(stdout) || stdout.startsWith('..') ? stdout : join(root, stdout);
  const content = readFileSync(file, 'utf8');
  assert.match(content, /DEEPSEEK_API_KEY; value redacted/u);
  assert.doesNotMatch(content, /example-secret-value-should-not-appear/u);
});
