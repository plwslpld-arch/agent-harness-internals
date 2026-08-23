---
title: DSH Agent Loop、模型流与工具闭环
article_type: harness
harness: deepseek-harness
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/tool-calls.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/tests/loop.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/tests/tool-calls.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/llm/llm/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"}]
---

# DSH Agent Loop、模型流与工具闭环

## 读者会得到什么

这一课深入 DSH 的执行心脏：一个 Harness Turn 怎样包含多个 step，每个 step 怎样从模型流得到完整 assistant message，多个工具怎样并发执行却按模型顺序提交结果，工具结果怎样进入下一次请求，以及取消、错误、截断和工具结论怎样形成不同终止原因。

你还会得到一套排错口径。Provider 请求重试发生在同一个 step 内，工具恢复发生在模型与环境的闭环中，Turn 结束是 Harness 状态机结论，Eval Attempt 则是评测基础设施的恢复单位。四者不能共用一个「重试次数」。

先找边界，再数调用。

## 核心机制

![DSH 从模型流式响应、工具并发与有序提交到下一次请求和终止原因的中文时序图](../../../assets/diagrams/deepseek-harness/03-loop-model-tool.svg)

Claim: deepseek-harness.loop.tool-results-before-next-request

外层 Turn 负责持久边界。它追加 `turn/start`，循环执行 step；每个 step 前从 inbox 认领消息并装配 Prompt，结束时无论成功或异常都追加 `step/end`。当没有下一步消息且得到稳定结束原因时，最终追加 `turn/end`。因此一个 Turn 可以有多个模型请求，不能用 Turn 数量代替 Provider 调用数。

step 内先构造冻结请求，再选择 prepared adapter 或默认 LLM service 的 stream。每个 chunk 都先成为 `assistant/chunk` 事件，`BlockAssembler` 负责拼出 reasoning、text、tool-call、usage 和 finish。只有流完成后才形成 `assistant/message`；界面可以实时显示 chunk，但后续工具调度使用的是完整调用块。

DeepSeek adapter 可以在传输层解析 SSE，但 Agent Loop 不直接依赖 SSE 文本行，而只消费统一 StreamChunk。HTTP 连接、SSE frame、Provider event、Harness chunk 和完整 assistant message 是五个边界；网络重连或 frame 拆分不能被误计成新的 Turn。

若 finish 是 error 或 aborted，`agent/request-error` waterfall 可以返回 retry。这个 retry 重新发起 Provider 请求，却没有把半成品 assistant message伪装成正常完成。没有 retry 动作时抛出结构化 LLM error，外层把 Turn 记为 error 或 aborted。它与工具返回错误结果后让模型修正参数不是同一恢复层。

若 finish 为 `max-tokens`，step 返回截断原因，不执行可能不完整的工具调用。若 finish 正常且 assistant message 没有 tool-call，step 返回 completed。只有存在完整工具调用时，循环才进入 `executeToolCalls()`，并依据结果的 `concludesTurn` 决定立即收敛还是把工具结果送入下一 step。

工具调度分成「是否可并行」和「提交顺序」两个问题。并发安全调用可以进入有界滚动池，exclusive 调用形成屏障；实际执行允许后一个先完成，但 `commitReady()` 只跨越连续的模型顺序 slot，把 `tool/result` 按原调用顺序写入 Session。这样 Provider 下一次看到的调用—结果配对不受操作系统调度时序污染。

完成可以乱序。

上游测试给了最强反例：模型依次发出 `c1`、`c2`，两个并发工具都启动，测试先释放 `c2`。此时 Session 仍没有任何 tool result；释放 `c1` 后，结果才按 `[c1, c2]` 提交。另一个断言从 `deriveMessages()` 读取历史，工具结果标识仍是 `[c1, c2]`。

取消也要保持日志可重放。已开始的调用会被 drain 并按序提交；尚未调度的模型调用得到合成的 aborted result，避免 assistant 留下没有配对结果的调用。内部 scheduler failure 则不伪造恢复结果：它停止新 dispatch，等待已开始任务 settle，再抛出第一个内部故障。这两条路径故意不同。

终止原因不能压成一个布尔值。锁定测试分别覆盖 completed、blocked、aborted、error 和 max-tokens；其中 max-tokens 在同一 Turn 中具有 sticky 语义，后续 completed step 不会把早先截断降级成成功。Eval 仍需独立判断任务产物是否正确。

## 真实输入与输出

### 输入

上游 `tool-calls.spec.ts:220-241` 构造两个按模型顺序出现、允许并发的调用：

```json
{
  "assistant_tool_calls": [
    {"id":"c1","name":"p","args":{"id":"1"}},
    {"id":"c2","name":"p","args":{"id":"2"}}
  ],
  "settlement_order": ["c2","c1"]
}
```

`settlement_order` 是对测试门闩释放顺序的中文化描述，不是上游 wire 字段。真实上游调用块与 `CallId` 值来自测试，模型和工具都是确定性夹具；这适合证明 scheduler 语义，不代表真实进程工具的延迟分布。

### 输出

虽然 `c2` 先结束，持久化与下一次模型历史仍保持模型顺序：

```json
{
  "session_tool_result_order": ["c1","c2"],
  "derived_history_tool_result_order": ["c1","c2"],
  "next_model_response": "done"
}
```

顺序稳定的目的不是让工具串行，而是让模型看到确定性因果链。如果业务真的需要「完成顺序」，应把完成时间作为结果元数据保存，不能重排调用—结果配对。

提交不能乱序。

## 调用链

1. inbox 的 waking message 启动 Turn，Session 追加 `turn/start`；`preStep()` 认领 next-turn 或 next-step 消息并装配 system、tools 与 runtime context。
2. Session 追加 `step/start` 和可见 user messages，`buildRequest()` 冻结 config、system、tools、history、session id 与 abort signal。
3. LLM adapter 发出流，Harness 逐块记录并聚合；error/aborted 可经 request-error policy 决定是否在当前 step 重试。
4. 完成的 assistant message 先写 Session。max-tokens 直接形成截断原因；无工具调用形成 completed；有调用才进入工具 scheduler。
5. scheduler 解析参数、读取每个调用的实时执行模式，exclusive 单独成组，parallel 进入有界池；pre/execute/post middleware 可以返回最终结果或附加 context。
6. 实际 dispatch 可以乱序结束，slot 只按模型顺序 commit。每个 `tool/result` 引用先前 `tool/call` 的序号，附加 context 在所属结果之后进入 next-step inbox。
7. 工具未要求 conclude 且没有取消时，外层开始新 step；`session.deriveMessages()` 把有序结果放进下一模型请求。否则结束当前 Turn。
8. `turn/end` 保存 completed、max-tokens、blocked、aborted 或 error。产品表面映射此状态，Eval 再读取完整 Trace 与 Artifact 打分。

并发执行。有序提交。分层终止。

## 源码证据

并发池与模型顺序提交的核心在：

```source
packages/core/agent-loop/src/tool-calls.ts:129-160
const slots: (Slot | undefined)[] = group.map(() => undefined)
let committed = 0
const commitReady = async (): Promise<void> => {
  while (committed < group.length) {
    const slot = slots[committed]
    if (slot === undefined) break
    appendToolResult(session, turn, step, call!.block, result, callSeqs[committed]!)
    committed++
  }
}
```

上游反序完成测试直接断言结果顺序：

```source
packages/core/agent-loop/tests/tool-calls.spec.ts:220-241
gated.release('2')
expect(events(agent).filter(e => e.type === 'tool/result')).toEqual([])
gated.release('1')
const results = events(agent).filter(e => e.type === 'tool/result')
expect(results.map(e => e.data.message.source.callId))
  .toEqual([CallId('c1'), CallId('c2')])
```

`packages/core/agent-loop/src/agent.ts:372-418` 区分 Provider error retry、max-tokens、无工具完成和工具执行；`packages/core/agent-loop/tests/loop.spec.ts:945-980` 分别断言用户取消得到 aborted、截断得到 max-tokens。本文 Claim 使用 B 级，因为「工具结果先按模型顺序提交，再进入下一请求」由源码和行为测试直接支持。

## 失败与限制

第一，chunk 不是消息。中途网络断开可能留下已记录的流片段，但只有 assembler 完成后才有正常 assistant message。监控若按 chunk 数统计模型调用，会严重放大用量。

第二，Provider retry 可能产生多次网络请求。若 Trace 只保存最终 assistant message 而不保存 request-error 和 attempt 关联，就无法解释成本、延迟或重复扣费。它仍不应改变 Eval Trial 分母。

第三，并发安全声明是工具契约。错误地把有共享副作用的工具标成 parallel，会制造竞态；错误地全部标 exclusive 则损失吞吐。Harness 的有序提交只能稳定模型历史，不能撤销已经发生的外部竞态。

第四，取消不是瞬时回滚。已经 dispatch 的工具可能无法撤销，scheduler 会等待其 settle；合成 aborted result 只为未开始调用闭合消息链，不能声称外部副作用从未发生。

第五，max-tokens 的半截工具参数不得执行。保留安全文本不等于参数完整；上游测试明确要求截断 step 不产生 `tool/call`。提高 token 上限是配置选择，不是对已发生截断的安全修复。

第六，工具结果 error 可以进入下一次模型请求，让模型换参数或换工具；这属于 Agent 恢复。产品任务是否失败由 Eval 判断，不能无限重试直到偶然通过再抹掉前面的失败。

## 验证方法

先用 Mock adapter 固定两次响应：第一次 tool-call，第二次 text。断言请求数为 2、第二次 history 含同一 call id 的 tool-result、Session 的边界顺序为 turn/start→step/start→step/end→下一 step→turn/end。

再用两个 gated parallel 工具反序释放。确认后一个先 settle 时没有越过前一个提交，最终 Session 与 derived history 都按模型顺序。加入 exclusive 中间调用，确认它形成屏障；修改 registry mode，确认未开始调用会重新分类。

随后注入 Provider error、retry、用户取消、scheduler internal failure、工具普通 error、concludesTurn 和 max-tokens。逐条断言网络请求数、实际副作用数、持久事件、下一次采样和 turn-end reason，不用一个「失败」断言覆盖所有分支。

最后把 Agent Trace 映射到 Eval：一次任务是固定 Trial，Provider 请求恢复与工具恢复写进 Trace，只有基础设施恢复才创建 Eval Attempt。Scorer 独立检查产物，不能根据 completed 或自然语言「done」直接判通过。

## 自检

### 问题 1

两个并发工具中 `c2` 先结束，为什么不能先把 `c2` result 送给模型？

**答案：** 模型按 `c1`、`c2` 发出调用。DSH 保持调用—结果的确定性顺序，避免运行时调度改变下一请求语义；完成时间可以另存元数据。

### 问题 2

Provider retry 和工具报错后再次采样有什么区别？

**答案：** Provider retry 在当前 step 重新取得模型流；工具错误是一个正式 tool-result，进入历史后由下一模型请求决定恢复。两者事件、成本和责任层不同。

### 问题 3

用户取消后出现合成 aborted tool result，是否证明工具没有副作用？

**答案：** 不证明。合成结果用于闭合尚未开始的调用；已 dispatch 的工具可能已经产生副作用并会被等待 settle，必须检查实际执行事件和环境产物。

### 问题 4

`turn/end: completed` 为什么仍不能当作 Eval pass？

**答案：** completed 只说明 Harness 状态机没有更多工具或消息要处理。任务可以正常结束却答案错误，Eval 仍需按固定契约检查 Trace、Artifact 与 Scorer。
