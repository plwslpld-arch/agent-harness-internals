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

## 变量控制

本实验的自变量只有故障分类：`infrastructure_error` 允许在同一 Trial 内创建恢复 Attempt，`product_failure` 直接成为可评分产品结果。Dataset、Target、Artifact 内容、Scorer、Node 主版本和 Trial 清单全部固定。若同时修改 Artifact、评分规则或任务数量，就无法判断分母与恢复行为为何变化。

受控常量包括两个 Trial ID、每个 Trial 的预期初始状态、恢复策略、规范 Attempt 选择规则和 `PASS\n` 的精确字节。执行时间、临时目录位置和平台名称属于记录变量，不参与正确性判断；它们仍写入环境对象，帮助复核者解释不可预期差异。机器记录不能包含本机密钥或用户目录细节。

实验不比较六类 Harness，也不采样真实模型，因此模型质量、随机种子、Provider 延迟和工具选择能力均标为不适用。若把本实验接到真实 Target，新增变量必须进入 manifest：Harness Commit、模型版本、采样参数、工具 Schema、镜像、网络与凭据范围。接入前后的结果不能直接合并成同一统计序列。

每次运行前先保存 Git Commit 和工作树状态。实验脚本或夹具有未提交修改时，机器记录只能用于开发诊断，不能替换仓库中已复核证据。重复运行预期得到相同 Trial、Attempt、状态和 SHA-256；只有执行时间与平台字段可以合理变化。

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

## 失败判定

实验整体通过需要同时满足六项条件：Trial 分母为二；清单恰好包含两个稳定 Trial ID；基础设施 Trial 有两个 Attempt 且第二个是规范 Attempt；产品失败 Trial 只有一个 Attempt；Artifact 引用规范 Trial 与 Attempt；散列与 `PASS\n` 精确一致。任一条件不满足，实验判失败，即使命令退出码为零或最终文件看起来正确。

预期注入的基础设施错误不让实验失败，因为它是实验输入；真正的失败是系统没有按契约保存它、错误地把它计入产品分子，或恢复后丢失第一次 Attempt。产品错误同样是预期输入，若实现又创建成功 Attempt 或把 Trial 从分母删除，门禁必须失败。这里判的是评测管线行为，不是要求两个产品任务都通过。

环境无法满足 Node 24、机器记录无法写入或实验在中途退出时，结果标为 blocked，不能沿用旧 JSON 宣称本轮通过。记录字段缺失、Artifact 状态未知或散列无法复算时标为 inconclusive；修复基础设施后重新执行并保留原失败日志。blocked 与 inconclusive 都不进入通过结果，却仍出现在运行健康记录。

对抗复核还要手工尝试三种篡改：把分母改成三、给产品失败追加第二个 Attempt、只改 Artifact 内容不改散列。门禁必须逐一拒绝，并给出指向统计、恢复或血缘的不同错误。若三种篡改只返回笼统 JSON 错误，虽然安全失败，教学诊断仍需要改进。

## 原始记录

机器结果以 JSON 保存。下面是需要手工核对的最小形状示例，值应以实际文件为准；示例不是另一份权威结果：

```json
{
  "dataset_id": "two-controlled-trials-v1",
  "trial_denominator": 2,
  "trials": [
    {"trial_id": "trial-infrastructure-recovery", "attempt_count": 2, "canonical_attempt_id": "attempt-recovery-2"},
    {"trial_id": "trial-product-failure", "attempt_count": 1, "outcome": "failed"}
  ],
  "artifact": {"attempt_id": "attempt-recovery-2", "media_type": "text/plain", "sha256": "以机器记录为准"}
}
```

原始记录必须与命令标准输出、退出码和当前 Commit 一起保存。JSON 是机器事实，Markdown 只解释它；若二者冲突，以可重跑脚本和已提交 JSON 为调查起点，不手改说明掩盖差异。复核时从 Artifact 散列回到精确字节，再沿 Attempt 回到 Trial，最后确认 Trial 仍在冻结 manifest 中。

为了观察重复执行，将写出目录复制到临时位置连续运行两次。第二次可以更新时间字段和重建同值记录，却不能增加 Trial、Attempt 或改变规范结果。两次 JSON 的语义差异应为空；若只因对象顺序不同产生大段差异，可以规范化排序，但不能因此删除原始记录。

实验报告还要列出原始命令、退出码、开始与结束时间、Node 版本、Commit 和工作树是否干净。复核者先运行门禁，再抽查 JSON；如果命令输出与机器文件不是同一轮生成，证据标为不可判定。截图可以辅助交流，却不能替代可解析记录、散列与重跑命令。

所有判断都应由另一位复核者独立重现。

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
