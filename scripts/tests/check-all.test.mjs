import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCommands } from '../check-all.mjs';
import { testFiles } from '../run-tests.mjs';

test('聚合检查显式使用 core 来源并包含全部新门禁', () => {
  assert.deepEqual(checkCommands[0].args, ['scripts/verify-sources.mjs', '--profile', 'core']);
  const scripts = new Set(checkCommands.flatMap(({ args }) => args.filter((arg) => arg.endsWith('.mjs'))));

  for (const required of [
    'scripts/verify-analysis.mjs',
    'scripts/verify-claims.mjs',
    'scripts/verify-comparison-matrices.mjs',
    'scripts/check-navigation.mjs',
    'scripts/check-content-contract.mjs',
    'scripts/check-visuals.mjs',
    'scripts/verify-reviews.mjs',
    'scripts/run-tests.mjs',
  ]) {
    assert.ok(scripts.has(required), `聚合检查缺少 ${required}`);
  }
});

test('测试运行器动态发现全部测试文件', () => {
  const files = testFiles().map((path) => path.replaceAll('\\', '/'));

  assert.ok(files.some((path) => path.endsWith('/scripts/tests/check-all.test.mjs')));
  assert.ok(files.some((path) => path.endsWith('/scripts/tests/visuals.test.mjs')));
  assert.equal(files.every((path) => path.endsWith('.test.mjs')), true);
});
