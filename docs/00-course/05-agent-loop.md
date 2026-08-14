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

理解形状：

```ts
session.append(turnStart)

while (hasPendingWork) {
  session.append(stepStart)
  request = buildRequest(systemPrompt, derivedMessages, tools)
  response = await model.stream(request)
  session.append(assistantMessage)

  if (response.toolCalls.length) {
    results = await scheduleToolCalls(response.toolCalls)
    session.append(toolResultsInModelOrder)
    continue
  }

  session.append(turnEnd)
  break
}
```

这段伪代码要抓住两个点：

- 工具 body 可以并发，但结果写入和模型可见顺序必须稳定。
- request/header、request/context、tool/result、turn/end 都是证据事件，不是普通日志。

## 失败路径

- 模型请求失败：由 request-error 策略决定是否 retry。
- 工具被拒绝：仍要产生 model-visible result。
- 用户取消：已开始工具需要收束，未开始工具要有明确状态。
- 恢复 session：不能把不完整事件静默当成成功完成。

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

## 检查题

- 为什么“最后一个文本 chunk 出现”不等于 turn 完成？
- 为什么工具结果顺序比工具实际完成顺序更重要？
- 如果要改 Agent Loop，你至少要跑哪些测试？

## 延伸阅读

- [../05-agent-runtime/turn-step-tool-loop.md](../05-agent-runtime/turn-step-tool-loop.md)
- [../13-source-studies/core-runtime-study.md](../13-source-studies/core-runtime-study.md)
- [../14-file-reference/key-function-walkthroughs.md](../14-file-reference/key-function-walkthroughs.md)
