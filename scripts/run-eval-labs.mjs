import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adaptReward,
  buildArtifactLineage,
  runControlledExperiment,
  scoreArtifact,
} from './lib/eval-lab.mjs';

const outputFlag = process.argv.indexOf('--output');
const outputDir = resolve(outputFlag >= 0 ? process.argv[outputFlag + 1] : 'evidence/experiments');
mkdirSync(outputDir, { recursive: true });

const executedAt = new Date().toISOString();
const environment = {
  node: process.version,
  platform: process.platform,
  paid_model_called: false,
  network_required: false,
};
const command = 'node scripts/run-eval-labs.mjs --output evidence/experiments';

const controlledResult = runControlledExperiment();
const controlled = {
  schema_version: '1.0.0',
  experiment_id: 'controlled-task-contract-v1',
  executed_at: executedAt,
  command,
  environment,
  input: {
    dataset_id: 'two-controlled-trials-v1',
    target_id: 'deterministic-fixture-v1',
    retry_policy: '仅基础设施错误允许新 Attempt',
  },
  result: {
    ...controlledResult,
    artifact: buildArtifactLineage('trial-infrastructure-recovery', 'attempt-recovery-2', 'PASS\n'),
  },
  injected_failures: [
    { attempt_id: 'attempt-recovery-1', type: 'infrastructure_error', expected: '允许恢复且不计分' },
    { attempt_id: 'attempt-product-1', type: 'product_failure', expected: '保留失败且禁止重试洗分' },
  ],
  scope: '本地确定性夹具；未调用真实模型、远端工具或生产系统',
};

const scored = scoreArtifact({ artifact_id: 'artifact-pass', content: 'PASS\n' });
const indeterminate = scoreArtifact({ artifact_id: 'artifact-unknown', content: 'UNKNOWN\n' });
const partial = adaptReward(scored, { direction: 'higher-is-better' });
const available = adaptReward(scored, {
  direction: 'higher-is-better',
  range: [0, 1],
  missing_value: 'drop',
  aggregation: 'mean',
  clipping: [0, 1],
  version: '1.0.0',
});
const pipeline = {
  schema_version: '1.0.0',
  experiment_id: 'independent-eval-pipeline-v1',
  executed_at: executedAt,
  command,
  environment,
  input: {
    scorer_id: 'exact-result-scorer',
    scorer_version: '1.0.0',
    artifacts: ['artifact-pass', 'artifact-unknown'],
  },
  result: {
    scores: [scored, indeterminate],
    reward_adapters: [partial, available],
    score_statuses: [scored.status, indeterminate.status],
    reward_capabilities: [partial.capability, available.capability],
  },
  failures: [
    { artifact_id: 'artifact-unknown', type: 'indeterminate', handling: '不伪造零分' },
    { adapter_case: 'missing-semantics', type: 'partial', handling: '不生成训练 Reward' },
  ],
  scope: '本地确定性规则评分；未证明任何真实模型、训练管线或发布系统效果',
};

writeFileSync(resolve(outputDir, 'controlled-task-contract-v1.json'), `${JSON.stringify(controlled, null, 2)}\n`, 'utf8');
writeFileSync(resolve(outputDir, 'independent-eval-pipeline-v1.json'), `${JSON.stringify(pipeline, null, 2)}\n`, 'utf8');
process.stdout.write('已写出 2 份本地实验记录；未调用付费模型或网络服务。\n');
