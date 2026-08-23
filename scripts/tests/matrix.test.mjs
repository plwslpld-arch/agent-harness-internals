import assert from 'node:assert/strict';
import test from 'node:test';
import { matrixCellHasEvidence, matrixFailures } from '../check-matrix.mjs';

test('accepts the three allowed evidence forms in matrix cells', () => {
  assert.equal(matrixCellHasEvidence('`codex!codex-rs/core/src/lib.rs:10`'), true);
  assert.equal(matrixCellHasEvidence('[官方文档](https://docs.anthropic.com/example)'), true);
  assert.equal(matrixCellHasEvidence('这是推断：可能由运行时完成'), true);
  assert.equal(matrixCellHasEvidence('支持插件'), false);
});

test('reports unsupported cells only inside marked evidence matrices', () => {
  const content = `
| 普通表 | 值 |
| --- | --- |
| 不检查 | 无证据 |

<!-- evidence-matrix -->
| 维度 | DSH | Codex |
| --- | --- | --- |
| prompt | \`packages/core/src/index.ts:2\` | 支持分层 prompt |
`;

  assert.deepEqual(matrixFailures(content, 'docs/a1-system-prompt.md'), [
    'docs/a1-system-prompt.md:9: matrix cell 3 lacks an anchor, an HTTPS URL, or 明确的推断标记',
  ]);
});
