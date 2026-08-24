import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

async function loadLab() {
  try {
    return await import('../lib/eval-lab.mjs');
  } catch {
    return {};
  }
}

test('基础设施恢复保留同一 Trial 和固定分母', async () => {
  const lab = await loadLab();
  assert.equal(typeof lab.runControlledExperiment, 'function');
  const result = lab.runControlledExperiment();
  assert.equal(result.trial_denominator, 2);
  assert.deepEqual(result.trials[0], {
    trial_id: 'trial-infrastructure-recovery',
    canonical_attempt_id: 'attempt-recovery-2',
    outcome: 'passed',
    attempts: [
      { attempt_id: 'attempt-recovery-1', classification: 'infrastructure_error', included_in_score: false },
      { attempt_id: 'attempt-recovery-2', classification: 'product_pass', included_in_score: true },
    ],
  });
});

test('产品失败不会通过重试改写成通过', async () => {
  const lab = await loadLab();
  assert.equal(typeof lab.runControlledExperiment, 'function');
  const result = lab.runControlledExperiment();
  assert.deepEqual(result.trials[1], {
    trial_id: 'trial-product-failure',
    canonical_attempt_id: 'attempt-product-1',
    outcome: 'failed',
    attempts: [
      { attempt_id: 'attempt-product-1', classification: 'product_failure', included_in_score: true },
    ],
  });
});

test('Artifact 血缘从评分结果回到规范 Attempt', async () => {
  const lab = await loadLab();
  assert.equal(typeof lab.buildArtifactLineage, 'function');
  assert.deepEqual(lab.buildArtifactLineage('trial-infrastructure-recovery', 'attempt-recovery-2', 'PASS\n'), {
    artifact_id: 'artifact-trial-infrastructure-recovery',
    trial_id: 'trial-infrastructure-recovery',
    attempt_id: 'attempt-recovery-2',
    media_type: 'text/plain',
    sha256: 'c26de83abdc9496cd1301470918ec39ecca1cf389ef0ae1c6504da1800d1c431',
  });
});

test('独立 Scorer 输出版本、分数、理由和证据引用', async () => {
  const lab = await loadLab();
  assert.equal(typeof lab.scoreArtifact, 'function');
  assert.deepEqual(lab.scoreArtifact({ artifact_id: 'artifact-pass', content: 'PASS\n' }), {
    scorer_id: 'exact-result-scorer',
    scorer_version: '1.0.0',
    status: 'scored',
    score: 1,
    reason: '产物包含精确通过标记',
    evidence: ['artifact-pass'],
  });
  assert.deepEqual(lab.scoreArtifact({ artifact_id: 'artifact-unknown', content: 'UNKNOWN\n' }), {
    scorer_id: 'exact-result-scorer',
    scorer_version: '1.0.0',
    status: 'indeterminate',
    score: null,
    reason: '产物不包含可判定标记',
    evidence: ['artifact-unknown'],
  });
});

test('RewardAdapter 仅在语义完整时生成训练信号', async () => {
  const lab = await loadLab();
  assert.equal(typeof lab.adaptReward, 'function');
  const score = { status: 'scored', score: 1 };
  assert.deepEqual(lab.adaptReward(score, { direction: 'higher-is-better' }), {
    capability: 'partial',
    reward: null,
    missing: ['range', 'missing_value', 'aggregation', 'clipping', 'version'],
  });
  assert.deepEqual(lab.adaptReward(score, {
    direction: 'higher-is-better', range: [0, 1], missing_value: 'drop', aggregation: 'mean', clipping: [0, 1], version: '1.0.0',
  }), {
    capability: 'available',
    reward: 1,
    adapter_version: '1.0.0',
  });
});

test('实验命令写出两份可核对的机器记录', () => {
  const output = mkdtempSync(join(tmpdir(), 'agent-harness-eval-lab-'));
  try {
    const run = spawnSync(process.execPath, ['scripts/run-eval-labs.mjs', '--output', output], {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const controlled = JSON.parse(readFileSync(join(output, 'controlled-task-contract-v1.json'), 'utf8'));
    const pipeline = JSON.parse(readFileSync(join(output, 'independent-eval-pipeline-v1.json'), 'utf8'));
    assert.equal(controlled.environment.paid_model_called, false);
    assert.equal(controlled.result.trial_denominator, 2);
    assert.deepEqual(pipeline.result.reward_capabilities, ['partial', 'available']);
    assert.deepEqual(pipeline.result.score_statuses, ['scored', 'indeterminate']);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('实验记录门禁拒绝把产品失败追加重试', async () => {
  const lab = await loadLab();
  assert.equal(typeof lab.verifyEvidenceRecords, 'function');
  const controlled = {
    experiment_id: 'controlled-task-contract-v1',
    environment: { paid_model_called: false },
    result: {
      trial_denominator: 2,
      trials: [
        { trial_id: 'trial-infrastructure-recovery', canonical_attempt_id: 'attempt-recovery-2', attempts: [{ classification: 'infrastructure_error' }, { classification: 'product_pass' }] },
        { trial_id: 'trial-product-failure', canonical_attempt_id: 'attempt-product-1', attempts: [{ classification: 'product_failure' }, { classification: 'product_pass' }] },
      ],
      artifact: { trial_id: 'trial-infrastructure-recovery', attempt_id: 'attempt-recovery-2', sha256: 'c26de83abdc9496cd1301470918ec39ecca1cf389ef0ae1c6504da1800d1c431' },
    },
  };
  const pipeline = {
    experiment_id: 'independent-eval-pipeline-v1',
    environment: { paid_model_called: false },
    input: { scorer_version: '1.0.0' },
    result: { score_statuses: ['scored', 'indeterminate'], reward_capabilities: ['partial', 'available'] },
  };
  assert.throws(() => lab.verifyEvidenceRecords(controlled, pipeline), /产品失败只能保留一个 Attempt/u);
});

test('实验记录门禁可以独立核对已保存结果', () => {
  const run = spawnSync(process.execPath, ['scripts/verify-eval-labs.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /已核对 2 份实验记录/u);
});
