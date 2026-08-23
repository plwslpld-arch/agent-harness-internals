import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import {
  parseSourceProfiles,
  readDocument,
  root,
  selectManifestSources,
} from '../lib.mjs';

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

test('来源 Manifest v2 为每个来源声明合法配置', () => {
  const actual = readDocument(join(root, 'sources', 'sources.yml'));
  const legalProfiles = new Set(['core', 'samples', 'eval']);

  assert.equal(actual.schemaVersion, 2);
  for (const source of actual.sources) {
    assert.ok(Array.isArray(source.profiles) && source.profiles.length > 0, `${source.id} 缺少 profiles`);
    assert.ok(source.profiles.every((profile) => legalProfiles.has(profile)), `${source.id} 含非法 profile`);
  }
});

test('核心配置包含 Claude 双 SDK，默认配置不要求评测来源', () => {
  const actual = readDocument(join(root, 'sources', 'sources.yml'));
  const coreIds = selectManifestSources(actual, parseSourceProfiles([])).map(({ id }) => id);
  const evalIds = selectManifestSources(actual, new Set(['eval'])).map(({ id }) => id);

  assert.ok(coreIds.includes('claude-agent-sdk-python'));
  assert.ok(coreIds.includes('claude-agent-sdk-typescript'));
  assert.deepEqual(evalIds, [
    'lm-evaluation-harness',
    'inspect-ai',
    'terminal-bench',
    'swe-bench',
  ]);
  assert.equal(coreIds.some((id) => evalIds.includes(id)), false);
});
