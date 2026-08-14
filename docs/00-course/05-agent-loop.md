---
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, inference]
---

# 05｜Agent Loop

## 先讲人话

Agent Loop 是 Harness 的任务推进器。它负责把一次用户请求拆成若干 step：

1. 读取用户输入和当前 Session。
2. 拼模型请求。
3. 接收模型输出。
4. 如果模型要用工具，就执行工具。
5. 把工具结果再交给模型。
6. 直到任务结束或失败。

## Turn 和 Step

| 概念 | 含义 |
| --- | --- |
| Turn | 一次用户任务周期 |
| Step | 一次模型请求与它引出的处理 |
| Tool call | 模型要求执行的动作 |
| Tool result | 工具执行后的模型可见结果 |

一个 turn 里可以有多个 step。只要模型继续请求工具，就会进入下一 step。

## 关键代码片段

源码入口：

- `packages/core/agent-loop/src/index.ts`
- `packages/core/agent-loop/src/agent.ts`
- `packages/core/agent-loop/src/tool-calls.ts`

先看真实形状，不需要背行号：

```ts
private async turn(): Promise<boolean> {
  session.append('turn/start', { turn })

  while (true) {
    const decision = await this.preStep(target, { turn, step })
    session.append('step/start', { turn, step })
    // append user/message
    const stepEnd = await this.step(decision.assembly)
    session.append('step/end', { turn, step })
    if (turn should stop) break
    target = 'next-step'
  }

  session.append('turn/end', { turn, reason })
}
```

这段来自 `ReactLoopAgent` 的实际控制结构。非研发可以把它理解成“任务账本先开 turn，再一轮轮开 step，最后必须把 turn 关掉”。研发要抓住两个点：

- `finally` 里一定会尝试追加 `turn/end`，所以失败、取消、被阻塞都要变成结构化结束原因。
- step 结束和 turn 结束不是同一件事；一个 turn 可能因为工具结果进入下一 step。

模型请求是在 `step()` 内部建立的：

```ts
const system = renderPrompt(assembly)
const messages = this.session.deriveMessages()
const { request, preparedCall } = await this.buildRequest(...)
const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
```

这解释了为什么 Agent Loop 不直接拼 provider wire body。它只生成 Harness 内部 `GenerateOptions`，真正变成 DeepSeek/OpenAI 风格请求，是 adapter 的责任。

工具调度器的核心形状是：

```ts
const planned = toolCalls.map(block => ({ block, exec: parsedInput }))
while (next < planned.length) {
  const mode = ctx.tools.executionMode(first.exec).kind
  const group = mode === 'parallel' ? planned.slice(next) : [first]
  const outcome = await runGroup(...)
  next += outcome.consumed
}
```

这里不是简单 `Promise.all(toolCalls)`。它会先按模型给出的顺序规划，再根据工具声明判断能否并发；遇到 exclusive 工具会形成 barrier。这样做的结果是：实际执行可以重叠，但写入 Session、回给模型的工具结果顺序仍然稳定。

## 一次 step 到底发生什么

按代码的真实语义，一次 step 是这样的：

1. `preStep()` 从 inbox 领取本轮输入，并调用 `systemPrompt.assemble()`。
2. runtime context 被渲染成一个附加的 user-role snapshot，放进本 step 的消息里。
3. `buildRequest()` 解析 provider/model，调用 `llm.prepareCall()`，写入 `request/header` 和 `request/context`。
4. `llm.stream()` 或 `preparedCall.stream()` 返回流式 chunk。
5. `BlockAssembler` 把 chunk 聚合成 assistant message，同时保留 usage、finish reason、replay state。
6. 没有 tool-call 时，step 返回 completed。
7. 有 tool-call 时，`executeToolCalls()` 负责执行工具，并把工具结果塞进下一 step 的 inbox。

换成产品语言：Agent Loop 是“任务状态机 + 证据记账器”。它不只负责让模型多想几步，还负责让每一步可解释、可恢复、可审计。

## 失败路径

- 模型请求失败：由 request-error 策略决定是否 retry。
- 工具被拒绝：仍要产生 model-visible result。
- 用户取消：已开始工具需要收束，未开始工具要有明确状态。
- 恢复 session：不能把不完整事件静默当成成功完成。

错误处理也有清晰分层：

- provider 返回错误 finish：进入 `agent/request-error` waterfall，只有明确返回 retry 才会重试。
- 非 LLM 错误：被包装成 `UNKNOWN` 结构化错误并写进 turn end。
- abort：turn end reason 变成 `aborted`，并携带取消原因。
- tool scheduler 自身失败：不伪造成功工具结果，避免把不可信状态喂回模型。

这就是改核心 runtime 时最容易破坏的部分：你不能只让函数“返回了”，还要保证 Session 事件仍然能解释这次返回。

## 本讲源码证据卡

| Loop 问题 | 证据入口 | 看什么 |
| --- | --- | --- |
| Agent 如何创建 | `packages/core/agent-loop/src/index.ts` | `createAgent()`、setup/publish、registry |
| turn/step 如何推进 | `packages/core/agent-loop/src/agent.ts` | inbox claim、step start、request、turn end |
| tool call 如何调度 | `packages/core/agent-loop/src/tool-calls.ts` | 并发执行与有序结算 |
| 错误如何处理 | `packages/core/agent-loop/tests/request-error*` | retry 边界和 durable event |

## 最小实验

```text
任务：从一个 headless run 观察 turn/step。
前提：本机已设置 DEEPSEEK_API_KEY，并能启动 Harness。
步骤：
1. 用 headless profile 跑一个一句话任务。
2. 查 session 中是否有 turn/start、step/start、request/header、assistant/message、turn/end。
3. 再跑一个故意失败的配置，观察 request-error 或受控失败事件。
过关：能区分“模型输出结束”和“turn durable closure”。
```

如果你是研发，最小回归不要只跑一个成功样例，至少要覆盖：

- 正常纯文本完成。
- 模型先请求工具、工具成功、下一 step 完成。
- provider 错误进入 request-error。
- 工具拒绝或工具失败仍产生 tool/result。
- cancel 后未开始工具有 synthetic result，已开始工具完成 drain。

## 检查题

- 为什么“最后一个文本 chunk 出现”不等于 turn 完成？
- 为什么工具结果顺序比工具实际完成顺序更重要？
- 如果要改 Agent Loop，你至少要跑哪些测试？

## 延伸阅读

- [../05-agent-runtime/turn-step-tool-loop.md](../05-agent-runtime/turn-step-tool-loop.md)
- [../13-source-studies/core-runtime-study.md](../13-source-studies/core-runtime-study.md)
- [../14-file-reference/key-function-walkthroughs.md](../14-file-reference/key-function-walkthroughs.md)
