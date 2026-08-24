---
title: 实验一：固定 Trial、Attempt 与 Artifact 血缘
article_type: lab
status: verified
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/telemetry/src/index.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# 实验一：固定 Trial、Attempt 与 Artifact 血缘

## 实验目标

本实验用两个完全确定的本地任务验证三个评测不变量：Trial 是固定统计单位，Attempt 只用于基础设施恢复，产品失败不能通过重复尝试改写成通过。实验还为规范 Attempt 生成 Artifact SHA-256，使最终评分能够沿 Trial、Attempt 和文件散列回到原始证据。

实验不调用 DSH、Codex、Gemini CLI、Claude、pi 或 OpenCode 的真实模型运行时。它验证的是跨 Harness 评测适配层应遵守的数据契约，不是六个项目的速度、正确率或生产可靠性。确定性夹具让读者无需账号、密钥和网络即可复现边界。

## 前置条件

只需要仓库指定的 Node 24 运行时，不安装依赖，也不需要模型 API Key。先确认源码、实验脚本和机器记录处于同一提交，再从仓库根目录执行命令。若使用其他 Node 主版本，结果不作为本仓库复核证据。

实验脚本由门禁测试覆盖：测试先验证缺少实现时失败，再验证基础设施恢复、产品失败、Artifact 血缘和机器记录写出行为。运行器不会访问网络，输出目录中只保存合成标识与固定文本。

## 输入与环境

Dataset `two-controlled-trials-v1` 含两个 Trial。第一个 Trial 的首个 Attempt 被注入 `infrastructure_error`，第二个 Attempt 产生 `PASS` Artifact；第二个 Trial 直接产生 `product_failure`，策略禁止再建一个「碰运气」Attempt。分母在运行前固定为二。

环境记录包含 Node 版本、平台、是否调用付费模型、是否需要网络、Dataset ID、Target ID 和恢复策略。真实执行记录位于 [控制任务机器记录](../../evidence/experiments/controlled-task-contract-v1.json)，实现位于 `scripts/lib/eval-lab.mjs`，写出命令位于 `scripts/run-eval-labs.mjs`。

## 操作步骤

1. 先运行专用测试，确认恢复、失败保留和血缘断言全部通过。测试使用真实本地函数与临时目录，没有模型或网络 Mock。
2. 运行实验写出命令，覆盖两份机器记录。脚本把实际 UTC 时间、Node 版本和平台写入记录，同时明确 `paid_model_called: false`。
3. 运行实验门禁，重新读取保存的 JSON，核对 Trial 分母、两个 Trial、规范 Attempt、产品失败 Attempt 数量与 Artifact SHA-256。
4. 打开机器记录，手工确认注入失败、预期处理和范围声明。把任何字段变成生产结果之前，必须另行接入真实 Harness 和隔离环境。

```powershell
node --test scripts/tests/eval-lab.test.mjs
node scripts/run-eval-labs.mjs --output evidence/experiments
node scripts/verify-eval-labs.mjs
```

## 预期结果

门禁输出「已核对 2 份实验记录、2 个 Trial」。恢复 Trial 保留两个 Attempt，只有第二个规范 Attempt 进入评分；产品失败 Trial 只有一个 Attempt，并继续标记为 failed。两个 Trial 的统计分母始终为二。

Artifact 记录引用 `trial-infrastructure-recovery` 和 `attempt-recovery-2`，媒体类型为纯文本，SHA-256 对应精确内容 `PASS\n`。如果内容、Trial 或 Attempt 任一项变化，血缘检查应要求重新生成证据，不能沿用旧评分。

## 失败与排查

若 Node 报主版本不符，切换到仓库约定的 Node 24 后重跑，不使用版本管理器弹窗。若写出命令失败，先检查输出目录是否可写；脚本不会自动提升权限，也不会修改目录之外的文件。

若门禁提示 Trial 分母变化，检查是否把 Attempt 数量当成 Trial 数量。提示「产品失败只能保留一个 Attempt」说明产品失败后又追加了尝试；应保留原失败并修正任务或创建新的版本化 Trial，而不是在同一 Trial 内洗分。

若 SHA-256 不匹配，先核对换行、编码和精确 Artifact 内容。评分器应引用重新计算后的散列，不能只修改 JSON 让门禁变绿。机器记录中的注入错误属于预期对抗条件，不代表脚本运行失败。

## 证据记录

本次记录显示 Node v24.19.0、Windows 平台、未调用付费模型、无需网络。恢复错误被标记为不进入评分；产品错误进入评分且没有后续 Attempt。该证据证明本仓库的合成契约和门禁可运行，不证明任何真实 Harness 已接入该契约。

可核对入口包括 [机器结果](../../evidence/experiments/controlled-task-contract-v1.json)、测试 `scripts/tests/eval-lab.test.mjs`、运行器 `scripts/run-eval-labs.mjs` 和门禁 `scripts/verify-eval-labs.mjs`。提交复核时应同时保存命令退出码，不能只截取成功行。

## 自检

### 问题 1

第一个 Trial 为什么有两个 Attempt？

**答案：** 首次失败被明确分类为基础设施错误，恢复策略允许同一 Trial 新建 Attempt；两次尝试仍只占一个统计单位。

### 问题 2

产品失败为何不再尝试一次？

**答案：** 重试会改变观测到的产品质量并抬高通过率。要改任务或配置，应创建新版本 Trial。

### 问题 3

Artifact 散列解决了什么？

**答案：** 它把评分绑定到精确字节，防止产物变化后继续引用旧结论。

### 问题 4

这个实验能证明哪个 Harness 更好吗？

**答案：** 不能。实验只验证本仓库的统计、恢复和血缘契约，没有运行真实模型或比较六条主线。
