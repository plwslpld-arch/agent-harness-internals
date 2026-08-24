import { createHash } from 'node:crypto';

export function runControlledExperiment() {
  return {
    trial_denominator: 2,
    trials: [
      {
        trial_id: 'trial-infrastructure-recovery',
        canonical_attempt_id: 'attempt-recovery-2',
        outcome: 'passed',
        attempts: [
          { attempt_id: 'attempt-recovery-1', classification: 'infrastructure_error', included_in_score: false },
          { attempt_id: 'attempt-recovery-2', classification: 'product_pass', included_in_score: true },
        ],
      },
      {
        trial_id: 'trial-product-failure',
        canonical_attempt_id: 'attempt-product-1',
        outcome: 'failed',
        attempts: [
          { attempt_id: 'attempt-product-1', classification: 'product_failure', included_in_score: true },
        ],
      },
    ],
  };
}

export function buildArtifactLineage(trialId, attemptId, content) {
  return {
    artifact_id: `artifact-${trialId}`,
    trial_id: trialId,
    attempt_id: attemptId,
    media_type: 'text/plain',
    sha256: createHash('sha256').update(content, 'utf8').digest('hex'),
  };
}

export function scoreArtifact(artifact) {
  const passed = artifact.content === 'PASS\n';
  return {
    scorer_id: 'exact-result-scorer',
    scorer_version: '1.0.0',
    status: passed ? 'scored' : 'indeterminate',
    score: passed ? 1 : null,
    reason: passed ? '产物包含精确通过标记' : '产物不包含可判定标记',
    evidence: [artifact.artifact_id],
  };
}

export function adaptReward(score, semantics) {
  const required = ['direction', 'range', 'missing_value', 'aggregation', 'clipping', 'version'];
  const missing = required.filter((key) => semantics[key] === undefined);
  if (missing.length > 0 || score.status !== 'scored') {
    return { capability: missing.length > 0 ? 'partial' : 'unavailable', reward: null, missing };
  }
  return { capability: 'available', reward: score.score, adapter_version: semantics.version };
}

function requireRecord(condition, message) {
  if (!condition) throw new Error(message);
}

export function verifyEvidenceRecords(controlled, pipeline) {
  requireRecord(controlled.experiment_id === 'controlled-task-contract-v1', '控制实验标识不匹配');
  requireRecord(controlled.environment?.paid_model_called === false, '控制实验不得调用付费模型');
  requireRecord(controlled.result?.trial_denominator === 2, 'Trial 分母必须固定为 2');
  requireRecord(controlled.result?.trials?.length === 2, '必须保留两个 Trial');
  const recovery = controlled.result.trials.find((trial) => trial.trial_id === 'trial-infrastructure-recovery');
  const product = controlled.result.trials.find((trial) => trial.trial_id === 'trial-product-failure');
  requireRecord(recovery?.attempts?.length === 2, '基础设施恢复必须保留两个 Attempt');
  requireRecord(recovery?.canonical_attempt_id === 'attempt-recovery-2', '规范恢复 Attempt 不匹配');
  requireRecord(product?.attempts?.length === 1, '产品失败只能保留一个 Attempt');
  requireRecord(product?.attempts?.[0]?.classification === 'product_failure', '产品失败分类不匹配');
  requireRecord(controlled.result.artifact?.trial_id === 'trial-infrastructure-recovery', 'Artifact Trial 血缘不匹配');
  requireRecord(controlled.result.artifact?.attempt_id === 'attempt-recovery-2', 'Artifact Attempt 血缘不匹配');
  requireRecord(/^[a-f0-9]{64}$/u.test(controlled.result.artifact?.sha256 ?? ''), 'Artifact 缺少 SHA-256');

  requireRecord(pipeline.experiment_id === 'independent-eval-pipeline-v1', '评测实验标识不匹配');
  requireRecord(pipeline.environment?.paid_model_called === false, '评测实验不得调用付费模型');
  requireRecord(pipeline.input?.scorer_version === '1.0.0', 'Scorer 版本不匹配');
  requireRecord(JSON.stringify(pipeline.result?.score_statuses) === '["scored","indeterminate"]', '评分状态不完整');
  requireRecord(JSON.stringify(pipeline.result?.reward_capabilities) === '["partial","available"]', 'RewardAdapter 能力状态不完整');
  return { records: 2, trials: 2, scorer_version: '1.0.0' };
}
