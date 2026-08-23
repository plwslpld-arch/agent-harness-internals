import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_REPOS,
  EVAL_REPOS,
  countCoverage,
  coverageFailures,
  coverageTargets,
} from '../check-coverage.mjs';

test('selects the expected coverage dimensions from the article name', () => {
  assert.deepEqual(coverageTargets('docs/a1-orchestration.md'), AGENT_REPOS);
  assert.deepEqual(coverageTargets('docs/e2-release-gates.md'), EVAL_REPOS);
  assert.equal(coverageTargets('docs/appendix-a-glossary.md'), null);
  assert.equal(coverageTargets('docs/14-comparison.md'), null);
  assert.equal(coverageTargets('README.md'), null);
});

test('counts repository anchors while excluding fenced examples', () => {
  const content = `
默认来源：\`packages/core/src/session.ts:12\`
Codex：\`codex!codex-rs/core/src/context_manager.rs:40\`，后续同文件 \`:52\`
Claude：\`claude-agent-sdk-python!src/claude_agent_sdk/types.py:88\`

\`\`\`md
Gemini 示例：\`gemini-cli!packages/core/src/core/client.ts:9\`
\`\`\`
`;

  assert.deepEqual(countCoverage(content, AGENT_REPOS), {
    'deepseek-harness': 1,
    codex: 2,
    'gemini-cli': 0,
    'claude-agent-sdk-python': 1,
  });
});

test('reports every repository below its article threshold', () => {
  assert.deepEqual(coverageFailures([{
    article: 'docs/a1-system-prompt.md',
    counts: { 'deepseek-harness': 2, codex: 1 },
    minimums: { 'deepseek-harness': 2, codex: 2 },
  }]), ['docs/a1-system-prompt.md: codex=1 < 2']);
});
