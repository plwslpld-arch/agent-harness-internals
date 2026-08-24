import assert from 'node:assert/strict';
import test from 'node:test';
import { matrixFailures } from '../verify-comparison-matrices.mjs';

const harnesses = ['deepseek-harness', 'codex', 'gemini-cli', 'claude', 'pi', 'opencode'];
const claims = new Map(harnesses.map((harness) => [`${harness}.example.claim`, {
  id: `${harness}.example.claim`, harness, capability: 'optional', evidence_level: 'B',
}]));

function completeMatrix() {
  return {
    id: 'runtime-config-model-input',
    title: '运行边界、配置与模型输入',
    article: 'docs/comparisons/01-runtime-config-model-input.md',
    question: '六条主线怎样形成一次真实模型请求？',
    control_variables: ['任务目标', '模型条件', '工作区'],
    entries: harnesses.map((harness) => ({
      harness,
      capability: 'optional',
      evidence_level: 'B',
      claims: [`${harness}.example.claim`],
      statement: `${harness} 的可核对比较结论。`,
      conditions: ['只约束锁定版本和已登记表面。'],
    })),
  };
}

test('完整矩阵要求六条主线、同属 Claim、能力状态和证据等级一致', () => {
  assert.deepEqual(matrixFailures(completeMatrix(), claims), []);

  const missing = completeMatrix();
  missing.entries.pop();
  assert.match(matrixFailures(missing, claims).join('\n'), /必须且只能包含六条主线/u);

  const crossed = completeMatrix();
  crossed.entries[0].claims = ['codex.example.claim'];
  assert.match(matrixFailures(crossed, claims).join('\n'), /不属于 deepseek-harness/u);

  const drifted = completeMatrix();
  drifted.entries[1].evidence_level = 'A';
  assert.match(matrixFailures(drifted, claims).join('\n'), /证据等级与主 Claim 不一致/u);
});

test('比较矩阵拒绝总分、排名、赢家和缺少条件的无边界结论', () => {
  for (const forbidden of ['score', 'total_score', 'rank', 'winner']) {
    const matrix = completeMatrix();
    matrix[forbidden] = 1;
    assert.match(matrixFailures(matrix, claims).join('\n'), /禁止字段/u, forbidden);
  }

  const unbounded = completeMatrix();
  unbounded.entries[2].conditions = [];
  assert.match(matrixFailures(unbounded, claims).join('\n'), /conditions 至少包含一项/u);
});

test('比较文章路径必须位于正式比较目录且矩阵标识稳定', () => {
  const unsafe = completeMatrix();
  unsafe.article = '../README.md';
  unsafe.id = 'Runtime Config';
  const errors = matrixFailures(unsafe, claims).join('\n');
  assert.match(errors, /id 非法/u);
  assert.match(errors, /article 必须位于 docs\/comparisons/u);
});
