import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGitlink, parseGitmodules } from '../lib.mjs';

test('accepts an exact mode-160000 index entry', () => {
  assert.equal(parseGitlink('160000 0123456789012345678901234567890123456789 0\tsources/checkouts/x'), '0123456789012345678901234567890123456789');
});

test('rejects ordinary tracked files and malformed entries', () => {
  assert.equal(parseGitlink('100644 0123456789012345678901234567890123456789 0\tsources/checkouts/x'), undefined);
  assert.equal(parseGitlink(''), undefined);
});

test('preserves gitmodule stanza identity, path, URL, and duplicate values', () => {
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
