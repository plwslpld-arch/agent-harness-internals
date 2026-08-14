import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  const file = stdout.startsWith('..') || stdout.startsWith('/')
    ? stdout
    : join(root, stdout);
  const content = readFileSync(file, 'utf8');
  assert.match(content, /DEEPSEEK_API_KEY; value redacted/u);
  assert.doesNotMatch(content, /example-secret-value-should-not-appear/u);
});
