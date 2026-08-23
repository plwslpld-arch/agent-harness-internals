import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findPreviousLocks,
  canAutoRelocate,
  unchangedCurrentReferenceIndices,
  findUniqueNormalizedLine,
  findUniqueNormalizedWindow,
} from '../review-history.mjs';

test('finds the first different lock beyond four intervening commits', () => {
  const current = new Map([['deepseek-harness', 'new']]);
  const load = (rev) => ({
    sources: [{
      id: 'deepseek-harness',
      commit: rev === 'HEAD~6' ? 'old' : 'new',
    }],
  });

  const result = findPreviousLocks(current, load, 10);

  assert.equal(result.rev, 'HEAD~6');
  assert.equal(result.map.get('deepseek-harness'), 'old');
});

test('marks only references that remain unchanged from the pre-lock document', () => {
  const oldReferences = ['a.ts:1', 'b.ts:2', 'c.ts:3'];
  const currentReferences = ['a.ts:1', 'b.ts:9', 'c.ts:3', 'd.ts:4'];

  assert.deepEqual([...unchangedCurrentReferenceIndices(oldReferences, currentReferences)], [0, 2]);
});

test('auto-relocation requires a quoted fragment at the destination', () => {
  const lines = ['const value = 1', 'return value'];

  assert.equal(canAutoRelocate(null, lines, 0, 0), false);
  assert.equal(canAutoRelocate('value = 1', lines, 0, 0), true);
  assert.equal(canAutoRelocate('missing text', lines, 0, 1), false);
});

test('refuses to relocate an anchor when the source line is ambiguous', () => {
  assert.equal(findUniqueNormalizedLine(['/**', 'target()', '/**'], '/**'), null);
  assert.equal(findUniqueNormalizedLine(['/**', '  target()  ', '/**'], 'target()'), 1);
});

test('uses neighboring lines to disambiguate a repeated anchor line', () => {
  const oldLines = ['before', '/**', 'unique neighbor', 'after'];
  const newLines = ['other', '/**', 'other neighbor', 'before', '/**', 'unique neighbor', 'after'];

  assert.equal(findUniqueNormalizedWindow(oldLines, newLines, 1), 4);
});
