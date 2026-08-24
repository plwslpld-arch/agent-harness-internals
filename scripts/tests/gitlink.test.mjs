import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseGitlink, parseGitmodules, root } from '../lib.mjs';

test('接受准确的 mode-160000 索引记录', () => {
  assert.equal(parseGitlink('160000 0123456789012345678901234567890123456789 0\tsources/checkouts/x'), '0123456789012345678901234567890123456789');
});

test('拒绝普通跟踪文件与格式错误记录', () => {
  assert.equal(parseGitlink('100644 0123456789012345678901234567890123456789 0\tsources/checkouts/x'), undefined);
  assert.equal(parseGitlink(''), undefined);
});

test('保留子模块段落身份、路径、URL 与重复值', () => {
  const entries = parseGitmodules(`[submodule "sources/checkouts/x"]
  path = sources/checkouts/x
  path = wrong/x
  url = https://example.com/x.git
[submodule "extra"]
  path = sources/checkouts/extra
  url = https://example.com/extra.git
`);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0].paths, ['sources/checkouts/x', 'wrong/x']);
  assert.equal(entries[0].urls[0], 'https://example.com/x.git');
  assert.equal(entries[1].name, 'extra');
});

test('Claude 双 SDK 的子模块名称、路径和 URL 一致', () => {
  const entries = parseGitmodules(readFileSync(join(root, '.gitmodules'), 'utf8'));
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  for (const [id, url] of [
    ['claude-agent-sdk-python', 'https://github.com/anthropics/claude-agent-sdk-python.git'],
    ['claude-agent-sdk-typescript', 'https://github.com/anthropics/claude-agent-sdk-typescript.git'],
  ]) {
    const name = `sources/checkouts/${id}`;
    assert.deepEqual(byName.get(name)?.paths, [name]);
    assert.deepEqual(byName.get(name)?.urls, [url]);
  }
});
