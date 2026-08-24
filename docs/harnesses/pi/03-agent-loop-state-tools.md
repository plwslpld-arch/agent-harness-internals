---
title: pi Agent Loop、状态与工具执行
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/agent/src/agent.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/src/agent-loop.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/test/agent-loop.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi Agent Loop、状态与工具执行

## 读者会得到什么

本篇拆开 pi Agent Core 的状态包装器、双层循环、消息队列、模型流、工具批次和终止分支。读完后，你应能解释一次工具调用为什么可能触发第二次模型采样，steering 与 follow-up 在何时注入，以及 `stop`、`length`、`terminate`、Abort 和 `shouldStopAfterTurn` 为什么不是同一种结束。

`Agent` 是有状态包装器。它持有当前 Transcript、监听器、Abort Controller、steering 队列和 follow-up 队列，并把模型、转换器与工具执行策略交给底层 Loop。队列的 `one-at-a-time` 与 `all` 决定一次 Drain 取一条还是全部；消息排队时尚未写入公开 Transcript。

底层 Loop 有两层。内层处理模型采样、工具批次和 steering；外层只在 Agent 原本准备停下时检查 follow-up。这个结构让「打断下一轮」与「本轮完成后继续」保持不同语义。

工具批次可并行或串行。工具自身标记为 sequential 时，即使全局策略是 parallel，也会走串行路径。并行完成事件可以按真实完成时间发出，但 Tool Result 会恢复到源调用顺序再写入上下文，避免下一次模型采样看到不稳定的历史排列。

终止判断分散在多个层次。模型 `error` 或 `aborted` 会立即结束；`length` 且带 Tool Call 时拒绝执行可能被截断的参数；工具结果只有全部 `terminate=true` 才终止整个批次；`shouldStopAfterTurn` 则在 Turn 已完成后强制结束，并且不再轮询 follow-up。

所以，Agent Loop 不是「请求模型直到 stop」的简单 while；它是一个解释模型终态、工具副作用、消息队列与宿主策略的控制状态机。

## 真实输入与输出

### 输入

上游测试让第一次模型响应返回一个 `echo` Tool Call，第二次响应返回最终文本：

```json
{"turn":1,"stopReason":"toolUse","toolCall":{"id":"tool-1","name":"echo","arguments":{"value":"hello"}}}
```

### 输出

工具实际执行一次，结果作为 `toolResult` 追加，随后模型看到更新后的上下文并结束：

```json
{"executed":["hello"],"roles":["user","assistant","toolResult","assistant"],"finalStopReason":"stop"}
```

另一个测试把同样的 Tool Call 标成 `length`。即使残缺参数仍能通过 Schema，工具也不会执行；Loop 生成错误 Tool Result，再给模型一次重新发起完整调用的机会。

## 调用链

![pi Agent Loop 从状态与消息队列进入双层循环、模型响应、工具批次，再由多种终止信号决定继续或结束的中文状态图](../../../assets/diagrams/pi/03-agent-loop-state-tools.svg)

Claim: pi.agent.loop-interprets-multiple-stop-signals

Claim: pi.agent.length-truncated-tool-is-not-executed

1. `Agent.prompt()` 建立 Active Run 和 Abort Signal，将新用户消息与当前状态交给底层 Loop。
2. Loop 先取 steering 队列；内层每次开始时把待处理消息发出 start/end 事件并写入当前上下文。
3. `transformContext` 可以裁剪 Agent Message，`convertToLlm` 再转换成模型兼容消息；两步不会直接改写持久 Transcript。
4. 模型流被折叠成 Assistant Message。`error` 与 `aborted` 发出 Turn End、Agent End 后立即返回。
5. 存在 Tool Call 时，`length` 分支生成错误 Tool Result；其他情况按并行或串行策略准备、执行并 Finalize 工具。
6. 每个工具经过 start、可选 Hook、execute、可选 Hook、end 和 Tool Result Message；结果随后追加到 Context。
7. Turn End 之后，宿主可用 `prepareNextTurn` 改写下一轮 Context、Model 或推理等级，再用 `shouldStopAfterTurn` 强制收敛。
8. 若未强制结束，Loop 轮询 steering；工具链与 steering 都清空后，外层才取 follow-up。
9. 没有新 follow-up 时发出 Agent End。此时只证明控制循环收敛，不能证明目标产物正确。

## 源码证据

Agent 明确拥有两个队列，并为每个队列设置独立 Drain 模式：

```source
packages/agent/src/agent.ts:125-177
class PendingMessageQueue { enqueue(...); drain(...); clear(...); }
private readonly steeringQueue: PendingMessageQueue;
private readonly followUpQueue: PendingMessageQueue;
```

双层循环先消费 steering，再执行模型与工具；Agent 原本准备结束时才查询 follow-up：

```source
packages/agent/src/agent-loop.ts:169-274
while (true) {
  while (hasMoreToolCalls || pendingMessages.length > 0) { ... }
  const followUpMessages = (await config.getFollowUpMessages?.()) || [];
  if (followUpMessages.length > 0) { pendingMessages = followUpMessages; continue; }
  break;
}
```

Tool Call 并非只要存在就执行。锁定实现对 `length` 使用专门失败路径，并在错误结果中说明输出 Token 上限可能截断参数。上游测试确认 `executed` 为空，同时 Loop 进行了第二次模型调用。

普通工具测试则确认 `echo` 执行一次，start/end 事件存在，经过 `afterToolCall` 修改的 Usage 被写入 Tool Result。它证明 Core 的工具闭环和 Hook 位置，不证明真实命令、文件或网络工具的安全性。

并行与串行路径最终都返回 `{messages, terminate}`。`shouldTerminateToolBatch()` 要求批次非空且每个最终结果都显式 `terminate=true`；一个工具要求终止而另一个没有，Loop 仍可继续。这条规则避免并行批次被首个快速结果提前截断。

## 失败与限制

第一，Assistant Message 的 `stop` 只表示本次模型输出结束。队列里可能还有 follow-up，宿主也可能从产品层开启新的 Prompt。

第二，工具 start 事件不等于副作用成功。真正结果要看 end 事件、`isError`、Tool Result 内容和目标系统状态；Abort 发生时还要核对副作用是否已部分落地。

第三，`length` 防护只覆盖被明确标记为长度截断的 Assistant Message。Provider 若错误映射 StopReason，Core 无法仅凭参数外观知道内容是否完整。

第四，`beforeToolCall` 与 `afterToolCall` 可以 Block、改写结果或要求终止。Hook 是策略接入点，不自动等于审批、隔离或审计；具体产品必须证明它注册了什么策略。

第五，Context Transform 影响送入模型的投影，不应被描述成原始会话已经删除。持久化与压缩将在会话课程中单独分析。

第六，上游测试使用 Mock Stream 和进程内 echo 工具。它锁定事件与状态语义，没有连接真实 Provider，也没有验证 Shell、文件或网络副作用。

## 验证方法

先运行 Agent Core 的无密钥测试，保存事件顺序、模型调用次数、Tool Result 顺序和最终角色序列。分别覆盖普通 Tool Call、两个并行 Tool Call、强制 sequential、steering 注入、follow-up、`shouldStopAfterTurn`、全部 terminate、部分 terminate、error、aborted 与 length。

然后构造一个可观测但无破坏性的文件工具，在临时目录执行。为每次调用记录 Tool Call ID、开始时间、结束时间、返回顺序和最终写入 Transcript 的顺序，确认并行事件与稳定历史投影之间没有混淆。

恢复测试必须在 Abort 后检查真实目标，而非只看 `aborted`。如果工具可能产生外部副作用，使用幂等键、提交记录或补偿动作区分「未开始」「已完成」「状态未知」。

Eval 应把一次 Trial 的目标产物作为统计单位，Attempt 只记录恢复过程。重试不能把第一次已经发生的产品错误从 Trial 分母中删除；模型终止、Loop 终止和发布通过需要三个独立字段。

## 自检

### 问题 1

steering 与 follow-up 的核心差异是什么？

**答案：** steering 在内层循环的下一次模型采样前注入；follow-up 只在当前工具链和 steering 都清空、Agent 原本准备停下时由外层循环取得。

### 问题 2

为什么 `length` 响应中的 Tool Call 即使通过 Schema 也不执行？

**答案：** 输出可能在参数中间被截断，部分内容仍可能碰巧符合 Schema；执行会把不完整意图变成真实副作用，因此 Core 先返回错误 Tool Result，让模型重新发起完整调用。

### 问题 3

并行工具中一个结果设置 `terminate=true`，为什么未必结束？

**答案：** 批次终止要求所有最终结果都明确要求终止；这样不会因单个快速完成的工具而跳过同批其他结果或后续归档。

### 问题 4

收到 `agent_end` 后可以宣布任务成功吗？

**答案：** 不可以。它只证明当前 Agent Loop 收敛；还要核对工具副作用、目标文件、产品断言和独立 Eval Gate。

