import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGitlink } from '../lib.mjs';

test('accepts an exact mode-160000 index entry', () => {
  assert.equal(parseGitlink('160000 0123456789012345678901234567890123456789 0\tsources/checkouts/x'), '0123456789012345678901234567890123456789');
});

test('rejects ordinary tracked files and malformed entries', () => {
  assert.equal(parseGitlink('100644 0123456789012345678901234567890123456789 0\tsources/checkouts/x'), undefined);
  assert.equal(parseGitlink(''), undefined);
});
