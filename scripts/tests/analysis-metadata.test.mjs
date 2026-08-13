import assert from 'node:assert/strict';
import test from 'node:test';
import { markContentStale, parseFrontmatter } from '../analysis-metadata.mjs';

const sample = `---
sources: [{"repo":"deepseek-harness","path":"packages","commit":"0123456789012345678901234567890123456789"}]
status: reviewed
evidence: [code, test]
---
# Study
`;

test('parses the required scalar and list frontmatter forms', () => {
  const { metadata } = parseFrontmatter(sample);
  assert.equal(metadata.sources[0].repo, 'deepseek-harness');
  assert.deepEqual(metadata.evidence, ['code', 'test']);
});

test('marks only analysis bound to the changed source as stale', () => {
  assert.match(markContentStale(sample, 'deepseek-harness'), /^status: stale$/mu);
  assert.equal(markContentStale(sample, 'cordis'), sample);
});
