---
title: pi 遥测、评测与数据契约
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/telemetry/src/index.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/telemetry/src/memory.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/src/harness/telemetry.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/evals/src/pi-harness.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/evals/src/vitest-evals/artifacts.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/evals/src/vitest-evals/summary.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/modes/interactive/interactive-mode.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi 遥测、评测与数据契约

## 读者会得到什么

本篇回答三个容易混在一起的问题：一次 Agent 运行怎样被观察，一条 Eval 样本怎样被执行和留证，以及谁有权把产物变成分数、训练信号或发布决定。

pi 的 `TelemetryContext` 只有开启 Span、增加 Event、设置 Attributes 和 Status 的职责。Schema 进一步约束 Span 名称、父子关系、必填字段、敏感性与错误条件；Noop Adapter 让未配置后端的应用仍可执行，Memory Adapter 为测试保存进程内快照。这是一份可移植的观测契约，不是 Scorer。

`packages/evals` 把 Coding Agent 包装成 Vitest Eval Harness：选择模型、创建隔离临时目录和无 Extension Session、执行 Prompt、归一 Transcript Event 与 Usage，并把 `session.jsonl` 作为 Artifact 保存。Summary 接收已经标为 `scored` 的 Observation，再计算基线与候选的通过率、Token、耗时和成本差异；遇到 `unscored` 只登记 `missing-score`。因此 Summary 会消费分数，却不产生任务判定规则。

完整质量链必须在仓库能力之外继续：固定 Dataset 与 Trial 身份，调用 Target，保存 Trace/Artifact，由独立 Scorer 产生分数，再做统计与发布判断。若要训练，还需要显式 RewardAdapter 把评分变成 DPO、GRPO 或 RFT 可消费的信号，并独立选择 Checkpoint。训练集分数、Checkpoint 选择集和发布 Holdout 不能互相替代。

Session 分享同样是另一条数据出口。交互界面的 `/share` 命令先导出 Session，再显式上传到 Radius 或私有 Gist；它不是 Telemetry 默认上传，也不是 Eval Artifact 自动发布。分享前必须核对对话、文件片段、工具输出与凭据是否可外发。

## 真实输入与输出

### 输入

一次可复现 Trial 至少固定以下字段：

```json
{
  "dataset_case_id": "修复-解析器-001",
  "trial_id": "修复-解析器-001@候选版本@重复-01",
  "target": {"harness": "pi", "provider": "固定服务", "model": "固定模型"},
  "input": [{"type": "prompt", "content": "修复失败测试并解释原因"}],
  "scorer_contract": "产物测试与补丁约束-v1"
}
```

### 输出

Target 输出不是只有最终文本，还应保留运行身份、Transcript、Tool Call、Usage、Session Snapshot、错误与环境版本。Scorer 在这些不可变 Artifact 之上追加判断：

```json
{
  "trial_id": "修复-解析器-001@候选版本@重复-01",
  "target_outcome": "completed",
  "artifacts": ["session.jsonl", "source.patch", "test-result.json"],
  "score": {"value": 1, "rubric": "产物测试与补丁约束-v1"},
  "release_gate": "由独立留出集另行决定"
}
```

## 调用链

![pi 从遥测契约记录一次智能体运行，经固定评测试验保存轨迹与产物，再由外部评分、统计、训练适配和独立发布留出集分别作出不同决定的中文流程图](../../../assets/diagrams/pi/08-telemetry-evals-data-contracts.svg)

Claim: pi.telemetry.contract-is-not-scorer

Claim: pi.eval.artifact-is-not-release-gate

Claim: pi.session.sharing-is-external-and-opt-in

1. Dataset Case 与配置生成不可变 Trial ID；失败重跑要生成 Attempt，不得改写原 Trial 分母。
2. pi Eval Harness 创建临时工作区、选择 Target 模型并执行一个或多个 Prompt Step。
3. Agent 运行时把 Provider、模型、Stop Reason、Usage、工具与 Session 变更写入有类型的 Telemetry Span。
4. Eval Adapter 把 Message、Tool Call、Tool Result 与 Usage 归一成 Transcript 和结果对象。
5. Session JSONL、输入源、补丁、测试结果及环境信息按 Run ID 固化为 Artifact。
6. 外部 Scorer 按版本化 Rubric 读取 Artifact，产生分数或明确的 `unscored`。
7. Summary 只对可配对且已有分数的基线与候选计算统计，缺失或错误样本进入 Diagnostic。
8. 训练路径由 RewardAdapter 映射评分并选择 Checkpoint；发布路径使用未参与训练和选择的独立 Holdout。
9. `/share` 是用户显式触发的外发路径，不参与上述自动质量判定。

## 源码证据

通用遥测接口没有分数、奖励或发布字段；它只描述观测生命周期：

```source
packages/telemetry/src/index.ts:14-22
startSpan(options, callback)
addEvent(name, attributes)
setAttributes(attributes)
setStatus(status)
```

Agent Schema 把一次模型请求的 Provider、模型、Stop Reason、HTTP 状态、Token、成本、首块延迟与错误类型标准化。`startHarnessSpan()` 只是将这些有类型字段委托给注入的 Telemetry Context。

```source
packages/agent/src/harness/telemetry.ts:42-115
"pi.ai.response.stop_reason"
"pi.ai.usage.total_tokens"
"pi.ai.stream.time_to_first_chunk_ms"
```

Eval Harness 负责运行与留证：它拒绝未选择模型，创建临时目录和无 Extension Session，把消息转成 Transcript Event，并在结束时保存 Session JSONL。Artifact Writer 按 Run ID 将 Session 与 Source 写到权限收紧的目录。

```source
packages/evals/src/pi-harness.ts:109-218
setArtifact("runId", sessionManager.getSessionId())
setArtifact(PI_SESSION_SNAPSHOT_ARTIFACT, await readFile(sessionPath, "utf8"))
```

Summary 对 `scored` Observation 计算比较；`unscored` 被明确归类为 `missing-score`。这说明分数是它的输入契约，而不是由 Summary 从 Transcript 自动推导。

```source
packages/evals/src/vitest-evals/summary.ts:164-180
else if (observations[0].outcome === "unscored") {
  reason = "missing-score";
}
```

分享路径只有在交互命令调用 `handleShareCommand()` 后才导出并上传；Radius 不可用时才检查 `gh` 并创建非公开 Gist。这个显式命令路径与安装遥测开关、Eval Artifact 路径彼此独立。

## 失败与限制

第一，Span 状态为 `ok` 只表示被观测操作没有按契约报错，不代表用户目标正确。Telemetry 完整也不能替代结果测试。

第二，Harness 能正常返回 Assistant Text 只证明 Target 完成了协议流程。工具副作用、补丁质量和真实任务成功仍须由 Artifact 与 Scorer 核对。

第三，Summary 中 `score >= 1` 的通过率是已提供分数的统计规则。若 Rubric、数据集版本或缺失样本处理不同，跨运行数字不可直接比较。

第四，重试不能把产品失败从分母中删除。Trial 是统计单位，Attempt 只描述基础设施恢复；最终必须保留每次尝试和选取规则。

第五，训练 Reward 与发布分数的用途不同。RewardAdapter 可以为可验证任务提供训练信号，但不能让训练使用过的数据重新充当独立发布 Holdout。

第六，Session JSONL 和分享页面可能含用户消息、源代码、文件路径、工具输出和环境信息。私有 Gist 仍是外部数据出口，必须先脱敏并获得授权。

第七，锁定源码与确定性测试证明接口和夹具行为，不证明真实 Provider、外部评分器、训练流水线或生产发布系统已经部署。

## 验证方法

先用 Faux Provider 构造成功、工具错误、Abort、缺少分数和重复 Observation 五类 Trial。为每个 Trial 固定 Dataset 版本、Target 配置、随机种子、超时、最大 Turn 和 Scorer 版本，并验证 Artifact Hash 在重放前后稳定。

然后分别注入 Noop 与 Memory Telemetry Context。两种情况下 Agent 结果应一致；Memory 只增加 Span 快照。删除 Score 后，Summary 应报告 `missing-score`，而不是猜测通过。篡改 Session Attachment 名称或 Run ID 时，Artifact Writer 应拒绝或忽略不匹配数据。

训练实验必须保存 `Scorer -> RewardAdapter -> 优化算法 -> Checkpoint` 的版本链。发布实验另用独立 Holdout 与独立 Scorer，验证没有 Case 泄漏，并把失败样本原样纳入分母。

分享测试只在隔离假数据上显式执行 `/share`，检查上传目标、可见性、取消与临时文件清理。默认启动和普通 Eval 不得产生分享请求。

## 自检

### 问题 1

为什么完整的 Telemetry 不能直接证明任务成功？

**答案：** Telemetry 描述运行发生了什么；任务正确性需要 Dataset、Rubric、目标产物和独立 Scorer 的语义判断。

### 问题 2

pi 的 Summary 是否会替未评分的运行生成分数？

**答案：** 不会。它把 `unscored` 记为 `missing-score`，只汇总已经提供的分数。

### 问题 3

单次 Eval 通过后能否直接把该 Checkpoint 发布？

**答案：** 不能。还要核对固定 Trial、覆盖率、统计不确定性，并通过未参与训练和选择的独立发布 Holdout。

### 问题 4

Session 分享是否属于默认遥测？

**答案：** 不是。它由用户显式触发 `/share` 后导出并上传，是需要授权和脱敏的数据出口。

