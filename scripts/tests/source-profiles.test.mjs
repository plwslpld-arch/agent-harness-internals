import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSourceProfiles, selectManifestSources } from '../lib.mjs';

const manifest = {
  sources: [
    { id: 'codex', profiles: ['core'] },
    { id: 'cline', profiles: ['samples'] },
    { id: 'inspect-ai', profiles: ['eval'] },
  ],
};

test('来源配置默认只选择 core', () => {
  const profiles = parseSourceProfiles([]);

  assert.deepEqual([...profiles], ['core']);
  assert.deepEqual(
    selectManifestSources(manifest, profiles).map(({ id }) => id),
    ['codex'],
  );
});

test('重复的 --profile 合并多个来源组', () => {
  const profiles = parseSourceProfiles(['--profile', 'samples', '--profile', 'eval']);

  assert.deepEqual([...profiles], ['samples', 'eval']);
  assert.deepEqual(
    selectManifestSources(manifest, profiles).map(({ id }) => id),
    ['cline', 'inspect-ai'],
  );
});

test('all 选择全部来源', () => {
  const selected = selectManifestSources(manifest, parseSourceProfiles(['--profile', 'all']));

  assert.deepEqual(selected, manifest.sources);
});

test('非法或缺失的来源配置被拒绝', () => {
  assert.throws(
    () => parseSourceProfiles(['--profile', 'unknown']),
    /非法来源配置：unknown/u,
  );
  assert.throws(
    () => parseSourceProfiles(['--profile']),
    /非法来源配置：\(缺失\)/u,
  );
});

