---
title: 实验二：独立 Scorer 与 RewardAdapter 能力契约
article_type: lab
status: verified
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/telemetry/src/index.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# 实验二：独立 Scorer 与 RewardAdapter 能力契约

## 实验目标

本实验把冻结 Artifact 交给进程外规则 Scorer，验证评分结果必须包含 Scorer ID、版本、状态、分数、理由和证据引用。它同时构造一个可判定产物与一个不可判定产物，确保缺少有效标记时返回 indeterminate，而不是伪造零分。

第二个目标是验证 RewardAdapter 的能力契约。只有方向、范围、缺失值、聚合、裁剪和版本六项语义完整时，Adapter 才输出训练 Reward；只有 direction 时返回 partial。这样可以把评测分数送往 DPO、GRPO 或 RFT 之前暴露缺口，并保留独立发布评测。

## 前置条件

前置条件与实验一相同：Node 24、无需依赖、无需账号和网络。建议先阅读 [可观测性、独立评测与部署维护](../comparisons/05-observability-eval-deployment.md)，明确 Trace、Telemetry、Feedback、Score、Reward 和 Release Eval 的责任不同。

本实验使用精确字符串规则，不使用模型裁判。它可以证明 Schema、分支和失败处理可重复，却无法代表开放式任务的语义评分质量。接入模型评分器时还需固定提示、模型、重试、温度、校准集和人工分歧处理。

## 输入与环境

Scorer `exact-result-scorer` 的版本固定为 `1.0.0`。第一个 Artifact 内容精确为 `PASS\n`，预期得到 scored 与分数 1；第二个内容为 `UNKNOWN\n`，预期得到 indeterminate、null 分数和明确理由。两个输出都引用输入 Artifact ID。

RewardAdapter 接收第一个 Score。部分语义只声明 higher-is-better；完整语义再声明 `[0,1]` 范围、drop 缺失值策略、mean 聚合、`[0,1]` 裁剪和 `1.0.0` 版本。机器结果位于 [独立评测机器记录](../../evidence/experiments/independent-eval-pipeline-v1.json)。

## 操作步骤

1. 运行专用测试，观察 Scorer 对可判定和不可判定 Artifact 的分支，以及 RewardAdapter 对部分和完整语义的能力状态。
2. 执行本地实验写出命令，让控制实验和独立评分实验共享一次执行时间与环境记录，但保持各自输入、结果、失败和范围声明。
3. 运行实验门禁，确认 Scorer 版本为 `1.0.0`，评分状态依次为 scored、indeterminate，能力状态依次为 partial、available。
4. 手工沿 Score 的 evidence 回到 Artifact ID，再核对 Reward 只来自 scored 结果。不可判定结果不得静默进入均值或训练批次。

```powershell
node --test scripts/tests/eval-lab.test.mjs
node scripts/run-eval-labs.mjs --output evidence/experiments
node scripts/verify-eval-labs.mjs
```

## 预期结果

可判定产物输出分数 1，理由为「产物包含精确通过标记」，证据引用 `artifact-pass`。不可判定产物输出 null，理由说明缺少可判定标记，证据仍引用 `artifact-unknown`，方便人工复核或重新评分。

部分 RewardAdapter 输出 partial、null Reward，并列出 range、missing_value、aggregation、clipping 和 version 五个缺失项。完整 Adapter 输出 available、Reward 1 和版本 `1.0.0`。两者的区别来自显式语义，不来自隐藏默认值。

## 失败与排查

若 UNKNOWN 被打成零分，评分器错误地把「无法判断」混入「确定失败」。恢复 indeterminate 分支，并在聚合器中为不可判定设置单独策略；没有策略时停止统计，不要默认丢弃或补零。

若部分语义仍生成 Reward，检查 Adapter 是否暗中假设范围、缺失值或聚合。删除隐式默认，返回 partial 与缺失列表。若 Score 本身是 indeterminate，即使语义字段完整也应返回 unavailable，不能生成训练信号。

若门禁报告版本不匹配，确认机器记录由当前脚本重建，Scorer 代码、夹具和版本应作为一个发布单元。单独修改版本字符串不会证明评分行为兼容；真实迁移需要对锁定校准集双跑并比较差异。

## 证据记录

本次记录保留两个 Score、两种 Adapter 结果、环境、命令和两个预期失败分支。`failures` 字段把不可判定处理和缺失语义处理写成机器可读事实，避免报告只展示成功路径。

该证据只证明确定性规则评分和能力门禁。它没有训练模型、选择 Checkpoint 或执行发布 Holdout，因此不能声称训练收益、模型提升或生产可用。真实接入还应把 Dataset、Target、Scorer、RewardAdapter 和 Release Eval 的版本血缘连起来。

## 自检

### 问题 1

为什么不可判定不等于零分？

**答案：** 零分表示评分器确认失败，不可判定表示证据或规则不足；两者混合会改变统计与训练语义。

### 问题 2

RewardAdapter 至少要知道哪些字段？

**答案：** 方向、范围、缺失值、聚合、裁剪和版本；实际训练还可能需要归一化与样本权重契约。

### 问题 3

训练 Reward 能否直接作为发布门槛？

**答案：** 不能。训练会适应 Reward，发布需要隔离数据和独立 Scorer 检查投机与回归。

### 问题 4

规则 Scorer 通过说明开放任务也能可靠评分吗？

**答案：** 不能。这里只验证数据契约和失败分支，开放任务的语义有效性需要另外校准。
