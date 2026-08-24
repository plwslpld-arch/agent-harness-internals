---
title: Gemini CLI 轮次、路由与工具调度
article_type: harness
harness: gemini-cli
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"gemini-cli","path":"packages/core/src/core/turn.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/agent/legacy-agent-session.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/scheduler/scheduler.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/routing/modelRouterService.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"}]
---

# Gemini CLI 轮次、路由与工具调度

## 读者会得到什么

本篇解决三个常被同一个「轮次」掩盖的问题：模型路由为哪一次请求选择模型，Turn 如何把模型流转换成事件，Scheduler 如何为工具调用维护独立状态。读完后，你不会把一次模型响应、一次工具批次、一次 Agent Session、一次 CLI 交互和一次 Eval Trial 当成相同计数单位。

关键结论是：Finished 属于模型响应。它可以和工具请求同时出现，此时智能体会话仍须继续；工具 Success 也只属于一个调用，不能替整个任务签字。

先确定状态所有者。

## 核心概念

这一主链包含三套状态机：ModelRouter 为一次采样选择模型，Turn 把 Gemini 响应块翻译成事件，Scheduler 管理一批工具调用。Legacy Agent Session 把三者串起来，并决定何时产生唯一 AgentEnd。模型 Finished、工具 Success 和会话 completed 分属不同所有者。

| 对象 | 统计单位 | 典型状态 / 事件 | 不能直接证明 |
|---|---|---|---|
| 路由决定 | 一次模型请求 | override、approval、classifier、fallback | 选择的模型质量最佳 |
| Turn | 一次模型响应流 | content、tool request、Finished | Agent Session 已结束 |
| FinishReason | 模型候选终止 | STOP、MAX_TOKENS、SAFETY 等 | 工具已结算 |
| Scheduler batch | 一次 schedule 请求 | queued、active、terminal | 批次内所有工具串行 |
| ToolCall | 一个 callId | Validating 到 Success / Error / Cancelled | 用户任务成功 |
| Agent Session | 多次采样与工具批次 | active、agent_end | Eval Trial 通过 |
| 产品表面 | 一次 CLI 或协议运行 | 文本、JSON、退出码 | 原始原因无损保留 |
| Eval Trial | 固定任务和 Target | pass / fail / inconclusive | 可按内部重试改变分母 |

ModelRouter 使用有顺序的策略链。显式 override、审批模式、可选分类器和默认策略可能分别选择模型或继续；fallback 元数据解释异常路径。路由结果要保存选中模型、策略名称和理由，后续质量差异才能归因，不把 fallback 隐藏成普通默认。

Turn 的 Finished 表示当前模型响应有 finishReason，并携带该响应的用量。一个响应可以同时包含 tool_call_request 和 STOP；STOP 只终止模型输出，Agent Session 仍需等待 Scheduler、把函数响应送入下一次采样。用量事件也不能作为会话计数器。

Scheduler 为每个 callId 维护细粒度状态，并为一次 `schedule()` 创建批次边界。当前批次忙时，新批次进入 requestQueue；这防止两次模型采样或调用方提交互相混入。批次内部是否并行由工具和调度策略决定，不能从批次队列串行推断调用串行。

AgentEnd 是对原始 FinishReason 和会话状态的归约。STOP 可以映射 completed，MAX_TOKENS 映射预算耗尽，Safety 映射 refusal，畸形调用映射 failed；映射方便产品表面，却会丢掉细节。评测证据同时保存原始与归约原因。

取消横跨四层：模型流可产生 UserCancelled，排队 batch 的 Promise 被拒绝，活动 ToolCall 进入 Cancelled，CLI 还可能给出退出状态。取消请求确认控制动作已发出，不自动证明所有进程停止或副作用回滚。

## 为什么这样设计

第一，路由作为独立服务，使模型选择可以基于模式、分类和回退演进，而 Turn 与 Scheduler 不必了解策略细节。路由元数据还能进入遥测和 Eval 条件，避免模型变化不可解释。

第二，Turn 只翻译模型流，不负责工具执行或会话完成。响应协议和 Agent 生命周期因此解耦：即使模型发 STOP，只要有函数调用，请求仍能安全进入工具闭环。

第三，Scheduler 使用 callId 状态机，允许确认、Policy、执行和取消分别观察。不存在工具和参数无效可以在执行前结算，用户确认可以等待，运行工具可以流式输出；所有路径最终形成 CompletedToolCall。

第四，重叠 schedule 请求排队，保护批次归属。若第二次请求插入第一批活动状态，取消、确认和 CompletedToolCall 容易被返回给错误采样；批次边界让 Agent Session 按轮次回送完整结果。

第五，AgentEnd 将多种底层原因映射为少数稳定类别，方便 CLI 与协议消费者；保存原始 FinishReason 又防止分析丢失 Safety、预算或畸形调用细节。

第六，Trial 与 Session 分开，使内部恢复和产品质量拥有不同统计语义。一个 Trial 可以有多次模型响应和工具批次，基础设施故障可有 Attempt；模型答案错误或工具误用不能通过重新运行改成成功。

## 实现思路

教学实现建立 `RunStateLedger`，用关联 ID 串起路由、响应、批次、调用和 Trial。它是课程蓝图，不表示 Gemini CLI 源码使用同名总账。

1. **创建采样身份。** 为 Agent Session 的第 n 次模型请求生成 sample ID，固定输入 Context 和路由条件。
2. **执行路由链。** 依序运行策略，保存每个 continue / selected / fallback 决定，得到模型和路由元数据。
3. **翻译模型流。** Turn 按到达顺序生成内容、思考、工具请求和 Finished，完整保存原始 FinishReason 与 usage。
4. **收集工具批次。** Agent Session 聚合同一响应的 ToolCallRequest；若非空，即使 STOP 也不结束。
5. **调度并结算。** Scheduler 为每个 callId 推进状态；已有活动批次时把新 schedule 放入 requestQueue，完成后原子拉取下一批。
6. **继续采样。** CompletedToolCall 转为函数响应，使用新 sample ID 发起后续模型请求；保持同一 Session 和 Trial。
7. **生成 AgentEnd。** 只有当前响应无待处理工具时才映射 FinishReason；发出一次结束事件并冻结终态。
8. **交给 Scorer。** 产品表面投影 AgentEnd，独立 Scorer 检查 Artifact，内部 completed 不直接给分。

```text
route = model_router.select(sample_context)
events = turn.stream(route.model, request)
tool_requests, finished = collect(events)
如果 tool_requests 非空:
    batch = scheduler.schedule(tool_requests)
    function_responses = await batch.completed_calls
    return next_sample(history + function_responses)
否则:
    agent_end = map_finish_reason(finished.reason)
    emit_once(agent_end)
```

Ledger 字段包括 sessionId、sampleId、routeDecision、rawFinishReason、batchId、callId、toolState、agentEnd 和 TrialId。状态只向前迁移，重复事件按 event ID 去重；FinishReason 与 AgentEnd 都保存，不能互相覆盖。

Scheduler 测试使用受控门闩。第一 batch 激活后提交第二 batch，确认第二批工具没有进入 Executing；释放第一批后才拉取第二批。批次内测试另行使用互不依赖工具，证明并行条件，不用墙钟阈值冒充确定性。

取消测试分别落在 queued、AwaitingApproval、Executing 和 terminal 后。每个观察点断言 Promise、ToolCall 状态、进程副作用、AgentEnd 和产品输出；已 terminal 的结果不被事后覆盖，queued 批次没有执行事件。

## 贯穿案例

用户要求读取配置并运行测试。ModelRouter 首次选择快速模型；第一次流同时返回两个工具请求、STOP 和用量。Scheduler 正在处理时，另一个产品操作又提交独立 batch，验证队列边界。

1. **路由首个采样。** 策略链记录 approval-mode 命中并选择模型，sample `s1` 保存路由原因。
2. **处理模型流。** Turn 产生两个 ToolCallRequest 与 Finished(STOP)，用量计入 `s1`；Agent Session 因工具集合非空保持 active。
3. **调度第一批。** Scheduler 创建 `b1`，两个 callId 经验证、确认和执行；第二个 `schedule()` 请求 `b2` 进入 requestQueue。
4. **结算并继续。** `b1` 返回一成功一错误，两个函数响应都进入 sample `s2`；模型基于错误提出修复调用。
5. **拉取第二批。** 只有 `b1` 终态并清理后，`b2` 才激活；其结果归属原调用方，不混入 `s2`。
6. **最终结束。** 最后一次模型流无工具请求并 STOP，Agent Session 只发一个 completed；Scorer 仍运行固定测试判定任务。

```json
{"sample":"s1","route":"approval-mode","finished":"STOP","toolCalls":["c1","c2"],"agentEnded":false}
```

```json
{"batches":[{"id":"b1","states":["success","error"]},{"id":"b2","startedAfter":"b1-terminal"}],"agentEndCount":1}
```

预算反例让后续响应 MAX_TOKENS 且无工具。AgentEnd 映射为 max_budget，产品表面可以正常关闭，但 Trial 因无最终产物判 fail。Safety 反例保存具体原始原因，再归约为 refusal，避免统计时把不同保护机制混在一起。

取消反例发生在 c1 已完成、c2 执行中。Scheduler 保留 c1 Success，将 c2 置 Cancelled，并拒绝仍排队的 b2；外部文件检查决定是否有部分副作用。取消成功不等于事务回滚，也不能创建新 Trial 重试到通过。

路由对照再以同一 Dataset item 运行默认策略与显式 override，分别冻结模型、理由和工具表。Scorer 分层报告两个 Target，不在看到结果后挑选较好模型；路由元数据用于解释条件，不充当质量分数。

若第一批部分错误后模型选择继续，错误 callId 和 responseParts 必须进入下一次请求；若选择结束，AgentEnd 可以 completed，但 Scorer仍检查未完成子目标。内部恢复能力不会自动改变 Trial 结论。

## 真实输入与输出

### 输入

上游测试让第一次模型流同时产生工具请求和 STOP，并附带用量：

```json
{"events":[{"type":"tool_call_request","callId":"call-1","name":"read_file"},{"type":"finished","reason":"STOP","usage":{"input":100,"output":30}}]}
```

Scheduler 的重叠批次测试又同步提交 `call-1` 与 `call-2`。第一个执行器被门闩阻塞时，第二个批次必须等待，不能进入同一个活动批次冒充并行完成。

### 输出

Agent Session 保存第一次 Finished 的用量，但没有发出 `agent_end`；Scheduler 结算 `call-1` 后发生第二次模型采样，最终才产生唯一会话结束事件。

```json
{"agentEndCount":1,"intermediateUsage":{"inputTokens":100,"outputTokens":30},"finalReason":"completed"}
```

重叠调度的执行顺序为：

```text
start-batch-1 → end-batch-1 → start-batch-2 → end-batch-2
```

这个顺序证明请求队列的批次边界，不证明批次内所有工具永远串行；批次内策略还取决于具体工具和调度条件。

## 调用链

![Gemini CLI 模型路由、轮次事件、智能体会话结束判断和工具调度状态的中文生命周期图](../../../assets/diagrams/gemini-cli/02-turn-scheduler-routing.svg)

Claim: gemini-cli.turn.finished-is-not-agent-success

Claim: gemini-cli.scheduler.tool-batch-has-own-state

1. `ModelRouterService` 按固定顺序组合回退、显式覆盖、审批模式、可选分类、数值分类与默认策略，为当前请求返回模型和路由元数据。
2. 客户端使用该决定发起模型流；`Turn.run()` 将响应块转换成正文、思考、工具请求、引用、重试、取消和 Finished 等事件。
3. Turn 只在响应携带 finishReason 时产生 Finished，并保存用量。它不负责判断工具是否已经执行，也不直接完成 Agent Session。
4. Agent Session 收集当前模型流的所有 ToolCallRequest。若集合非空，即使已经看到 STOP，也先调用 Scheduler；只有集合为空时才映射结束原因。
5. Scheduler 为每个调用建立 Validating、Scheduled、AwaitingApproval、Executing 等中间状态，并以 Success、Error 或 Cancelled 作为工具终态。
6. Scheduler 正忙时，新的 `schedule()` 批次进入独立 requestQueue；取消会拒绝待处理 Promise，同时把活动调用终结为 Cancelled 并清理内部队列。
7. CompletedToolCall 返回 Agent Session，函数响应进入下一次模型请求。后续无工具请求时，STOP 才映射为 completed；MAX_TOKENS 映射预算耗尽，多种 Safety 原因映射拒绝，畸形调用等映射失败。
8. 产品表面再把 AgentEnd 投影成文本、JSON、退出码或远程任务状态。Eval 需要额外以目标产物和副作用评分，不能复用任一内部终态当答案。

## 源码证据

路由服务明确规定策略顺序，并将异常决定记录为 fallback 元数据：

```source
packages/core/src/routing/modelRouterService.ts:35-74
strategies.push(new FallbackStrategy());
strategies.push(new OverrideStrategy());
strategies.push(new ApprovalModeStrategy());
...
return new CompositeStrategy([...strategies, terminalStrategy], 'agent-router');
```

Turn 只有看到真实 finishReason 才发 Finished：

```source
packages/core/src/core/turn.ts:380-410
const finishReason = resp.candidates?.[0]?.finishReason;
if (finishReason) yield {
  type: GeminiEventType.Finished,
  value: { reason: finishReason, usageMetadata: resp.usageMetadata }
};
```

Agent Session 把待处理工具置于结束判断之前：

```source
packages/core/src/agent/legacy-agent-session.ts:241-252
if (toolCallRequests.length === 0) {
  this._finishStream(mapFinishReason(finishedReason));
  return;
}
const completedToolCalls = await this._scheduler.schedule(...);
```

FinishReason 到 AgentEnd 的映射并非统一成功：

```source
packages/core/src/agent/event-translator.ts:332-362
STOP -> completed
MAX_TOKENS -> max_budget
SAFETY / RECITATION / ... -> refusal
MALFORMED_FUNCTION_CALL / OTHER / ... -> failed
```

Scheduler 状态与请求队列属于工具域：

```source
packages/core/src/scheduler/types.ts:18-180
Validating, Scheduled, AwaitingApproval, Executing,
Success, Error, Cancelled
```

两个 Claim 使用 B 级：源码直接定义状态机，上游测试验证中间 Finished、重叠批次和取消。测试仍使用 Mock 模型与执行器，不能证明真实工具副作用或线上路由质量。

## 失败与限制

第一，模型路由决定不是质量保证。路由元数据能说明选择来源和理由，却不能证明被选模型最适合任务；路由异常时记录的 fallback 决定也可能只是诊断用结果。Eval 应按路由条件分层报告。

第二，Finished 不是会话完成。中间 Finished 仍会产生用量事件，因此仅以是否有用量或 STOP 判断完成会重复计数。必须同时看待处理工具集合与最终 agent_end。

第三，AgentEnd reason 仍是协议映射。completed 可以来自正常 STOP，也可以来自没有明确 reason 的路径或 STOP_EXECUTION 处理；refusal 聚合多个 Safety 原因。统计时应保留原始 FinishReason，不能只存归约后的四类结果。

第四，工具终态不是会话终态。Success、Error、Cancelled 只属于 callId。一个批次可以部分成功、部分错误，会话也可能把普通错误回给模型后继续恢复。把工具成功率直接当任务成功率会高估表现。

第五，取消有多个观察点。排队批次被拒绝 Promise，活动调用写入 Cancelled，模型流可能产生 UserCancelled，产品表面又可能有退出码。它们需要共享关联键，不能从一个表面的「取消成功」反推所有层都已停止且无副作用。

第六，批次与并行不是同义词。测试证明重叠的 `schedule()` 调用按请求队列处理；批次内部是否并行取决于 Scheduler 规则、工具类型、确认顺序和副作用约束。

先保留原始状态，再做归约。

## 验证方法

为一次固定输入分配 Session、模型请求、Turn 事件、tool call、scheduler batch 与 Trial 六种标识。捕获路由决定、原始 FinishReason、pendingToolCalls、每个 callId 的状态序列、最终 AgentEnd 和产品退出状态。

复现中间 Finished 夹具：第一次流产生工具请求、STOP 和用量，Scheduler 返回结果，第二次流给最终文本。断言只有一个 agent_end，但两次模型响应的用量都保留。

再构造重叠批次与取消：阻塞第一批次，同步提交第二批次，确认第二批次没有提前执行；分别在排队、待审批、执行中和执行完成后取消，核对 Promise、状态、响应和副作用。

最后建立结束矩阵：STOP、MAX_TOKENS、SAFETY、RECITATION、MALFORMED_FUNCTION_CALL、无 reason、流错误和用户取消。保留原始事件及映射结果，再让独立 Scorer 对任务产物评分，确认内部 completed 不会自动变成 Eval pass。

## 自检

### 问题 1

为什么第一次 STOP 不能结束智能体会话？

**答案：** 同一模型响应仍有待处理工具请求；STOP 只结束本次模型生成，Scheduler 结算和结果回送尚未完成。

### 问题 2

Scheduler 的 Success 能证明任务成功吗？

**答案：** 不能。它只说明一个 callId 到达工具成功终态，整个会话、最终产物和安全约束仍需独立判断。

### 问题 3

为什么要同时保存原始 FinishReason 和 AgentEnd reason？

**答案：** 多个原始原因会归约为同一 AgentEnd 分类；只保存归约值会丢失 Safety、预算和协议错误细节。

### 问题 4

重叠 schedule 测试证明了什么？

**答案：** 它证明 Scheduler 忙时新批次进入独立请求队列并按顺序拉取，不证明任意批次内部都必须串行，也不证明真实工具无副作用。
