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

## 变量控制

Scorer 的自变量是 Artifact 内容：`PASS\n` 与 `UNKNOWN\n`。Scorer ID、版本、匹配规则、证据引用格式和执行环境保持固定，因此两个状态差异只能归到输入是否包含可判定标记。若同时修改 Scorer 提示或版本，必须生成新的评分血缘，不能与本轮结果直接比较。

RewardAdapter 的自变量是语义声明完整度。输入 Score 固定为同一个 scored 结果；部分配置只声明方向，完整配置再补范围、缺失值、聚合、裁剪与版本。这样可以证明能力状态来自显式契约，而不是输入分数或隐藏默认值。不可判定 Score 的额外负例固定使用完整语义，用来确认输入证据不足时仍返回 unavailable。

控制项还包括 Artifact ID、媒体类型、执行次序和无网络环境。时间、平台与 Node 补丁版本作为环境记录，不参与 Score。实验没有模型裁判，所以温度、重试和裁判提示不适用；未来接入模型 Scorer 时，这些字段必须被冻结并加入校准集，不能沿用本实验的确定性声明。

训练、选点和发布均不在本实验执行范围内。Reward 数值只是 Adapter 输出夹具，不会调用优化器，也不构成 Checkpoint 改善证据。发布 Holdout 未运行，因此即使 Scorer 与 Adapter 通过，也不能写成模型已提升或候选可发布。

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

## 失败判定

实验通过要求两个 Score 顺序、状态和引用全部正确：`artifact-pass` 得到 scored、1 和明确理由；`artifact-unknown` 得到 indeterminate、null 和证据不足理由。任何 Score 缺少 Scorer ID、版本或 Artifact 引用都判失败，因为后续无法重放或审计。不可判定被补零、丢弃或加入平均同样判失败。

Adapter 侧要求部分配置返回 partial、null Reward 与五个缺失项，完整配置返回 available、Reward 1 和版本，indeterminate 输入返回 unavailable。只要某个缺失语义被默认补齐，或不可判定输入生成数值 Reward，实验失败。这里不评价 Reward 1 是否适合真实训练，只评价能力声明是否诚实。

脚本无法执行、记录无法写入或版本不符时标为 blocked；Score 引用的 Artifact 缺失或散列无法核对时标为 inconclusive。两种状态都不得复用历史成功记录。规则本身若对新输入没有定义，应扩展 Scorer 契约并升级版本，而不是把 UNKNOWN 强行归到零分。

对抗复核至少做三次修改：删除 Score 版本、让 partial Adapter 输出 Reward、把 indeterminate 分数改成零。门禁应分别指出血缘、能力和评分语义错误。再把 Scorer 版本从 `1.0.0` 改为 `1.0.1` 而不重建记录，确认版本门禁拒绝旧结果。

## 原始记录

下面展示机器记录的最小字段关系。实际理由、环境和失败列表以已提交 JSON 为准：

```json
{
  "scorer": {"id": "exact-result-scorer", "version": "1.0.0"},
  "scores": [
    {"artifact_id": "artifact-pass", "status": "scored", "value": 1},
    {"artifact_id": "artifact-unknown", "status": "indeterminate", "value": null}
  ],
  "reward_adapters": [
    {"semantics": "partial", "capability": "partial", "reward": null},
    {"semantics": "complete", "capability": "available", "reward": 1}
  ]
}
```

原始 JSON 同时保存 `failures`，把不可判定和语义缺失作为预期分支。报告不能只抽取 scored 与 available 两行，否则读者看不到防止伪造分数和训练信号的关键证据。复核时先核对 Artifact ID，再检查 Score 版本与理由，最后检查 Adapter 是否仅消费允许状态。

重复执行应得到相同 Score、缺失字段列表和能力状态。若 Scorer 实现或夹具变化，必须更新版本、重建 JSON 并解释差异；只要一个环节的血缘不一致，旧 Reward 就不能继续用于训练数据。此规则将来同样适用于模型 Scorer 和人工标签，只是它们还需要校准与复核记录。

报告还应并列展示 Scorer 输出与 Adapter 输出，避免 Reward 反向覆盖原 Score。每条记录保存生成时间、代码 Commit、输入 Artifact 散列和命令退出码；复核者能够在不运行训练的前提下重放评分与能力判断。若机器文件只剩 Reward 1，却找不到原始理由和证据引用，本实验判为血缘断裂。

增加一项人工复核练习：让复核者在不知道 Adapter 状态的情况下只读两个 Artifact 和 Scorer 契约，独立判断 scored 或 indeterminate。人与规则不一致时，先登记分歧并升级 Scorer 版本，不允许直接修改机器结果。这个步骤不把单人判断变成金标准，只验证理由是否足以支持复核。

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
