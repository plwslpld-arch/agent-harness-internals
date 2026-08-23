import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleKind,
  markContentStale,
  parseFrontmatter,
  validArticleStatus,
} from '../analysis-metadata.mjs';

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

test('parses JSON object frontmatter used by coverage thresholds', () => {
  const { metadata } = parseFrontmatter(`---
title: coverage
coverage_min: {"deepseek-harness":2,"codex":1}
---
body
`);

  assert.deepEqual(metadata.coverage_min, {
    'deepseek-harness': 2,
    codex: 1,
  });
});

test('marks only analysis bound to the changed source as stale', () => {
  assert.match(markContentStale(sample, 'deepseek-harness'), /^status: stale$/mu);
  assert.equal(markContentStale(sample, 'cordis'), sample);
});

test('识别新目录的文章类型', () => {
  assert.equal(articleKind('docs/foundations/01-one-turn.md'), 'foundation');
  assert.equal(articleKind('docs/harnesses/codex/03-tools.md'), 'harness');
  assert.equal(articleKind('docs/comparisons/02-agent-loop.md'), 'comparison');
  assert.equal(articleKind('docs/roles/researcher.md'), 'role');
  assert.equal(articleKind('docs/labs/01-trace.md'), 'lab');
  assert.equal(articleKind('docs/appendix/glossary.md'), 'appendix');
  assert.equal(articleKind('docs/a1-system-prompt.md'), null);
});

test('接受五种新状态并拒绝其他值', () => {
  for (const status of ['outline', 'draft', 'reviewed', 'verified', 'stale']) {
    assert.equal(validArticleStatus(status), true);
  }
  assert.equal(validArticleStatus('complete'), false);
  assert.equal(validArticleStatus(''), false);
});
