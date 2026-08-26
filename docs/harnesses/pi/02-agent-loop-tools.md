# Agent Loop、Steering、Follow-up 与工具批次

[返回 pi 课程地图](README.md)

pi Agent Core 把最小循环写得很直接：它先准备消息、调用模型并流式发出事件，一旦收到 Tool Calls，就执行工具、追加 Tool Results，然后继续采样。除了这条主循环，它还维护 Steering 与 Follow-up 两个输入队列，前者处理运行中的转向，后者承接本轮结束后的追加工作。

```text
Steering Queue ─┐
                ↓
消息 → 模型流 → Tool Calls → 工具批次 → Tool Results ─┐
  ↑                                                    │
  └────────────────────────────────────────────────────┘
                ↓ 准备结束时
          Follow-up Queue → 下一轮内部循环
```

## 第 1 站：两个队列拥有独立 Drain 语义

源码：[查看 Agent 队列](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent.ts#L125-L177)

```typescript
class PendingMessageQueue {
  enqueue(...)
  drain(...)
  clear(...)
}

private readonly steeringQueue: PendingMessageQueue
private readonly followUpQueue: PendingMessageQueue
```

- **调用者**：宿主在 Agent 运行时调用 Steer 或 Follow-up；Loop 拉取消息。
- **输入**：新的 Agent Message 与队列模式。
- **状态变化**：消息进入不同队列，可按各自策略一次取一条或全部取出。
- **返回**：Loop 下一次检查时得到的 Pending Messages。
- **下一站**：Steering 加入当前工具/模型循环；Follow-up 在原本准备结束时重新开启循环。

两个队列分开之后，Steering 可以及时改变正在进行的任务，而 Follow-up 只会在当前闭环收敛后进入循环——因此它不会在工具批次中间破坏已经建立的因果顺序。

### Steering 和 Follow-up 解决的是时序，不只是两种名称

假设 Agent 正在并行读取实现和测试，此时用户补充「不要修改测试文件」，这条 Steering 就应尽快进入下一次模型决策。另一句「完成后再生成变更说明」属于 Follow-up，它要等到当前工具闭环收敛后才开始。如果把两者塞进同一个队列，Harness 不是过晚响应约束，就会在工具结果尚未齐全时提前开始新目标。

## 第 2 站：双层循环定义了输入插入点

源码：[查看 Agent Loop](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent-loop.ts#L169-L274)

```typescript
while (true) {
  while (hasMoreToolCalls || pendingMessages.length > 0) {
    // 模型采样、工具执行、Steering
  }

  const followUpMessages =
    (await config.getFollowUpMessages?.()) || []
  if (followUpMessages.length > 0) {
    pendingMessages = followUpMessages
    continue
  }
  break
}
```

- **调用者**：`Agent.prompt()` 或产品 Session。
- **输入**：初始消息、模型、工具表、队列回调与 AbortSignal。
- **状态变化**：依次追加 Assistant、Tool Result 与 Steering/Follow-up Messages。
- **返回**：完整本次运行消息与 Agent Events。
- **下一站**：Coding Agent Session 持久化并投影到 UI/RPC。

外层循环负责处理 Follow-up，内层循环则负责本次模型与工具的闭环，所以模型给出 `stop` 时，只结束了当前这一次采样。只有当内外两层都不再满足继续条件时，Agent Run 才真正收敛。

## 长度截断的 Tool Call 不能执行

如果 Assistant Message 的 StopReason 是 `length`，Tool Call Arguments 就可能被截成一份看似 JSON 的半成品，因此 pi 不会冒险执行这组参数，而是生成错误 Tool Result，再让模型处理一次。

源码：[查看长度截断处理](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent-loop.ts#L280-L390)

```typescript
// length 结束时不执行本批 Tool Calls，
// 返回说明参数可能因输出 Token 上限被截断的错误结果。
```

- **调用者**：Tool Batch 准备阶段。
- **输入**：Assistant Message、Tool Calls 与 StopReason。
- **状态变化**：不产生工具副作用；构造 Call ID 对应的错误 Tool Results。
- **返回**：模型可读错误消息。
- **下一站**：再次采样，让模型缩短或重建调用。

## 并行批次怎样决定是否终止

无论工具并行还是串行，最终都会返回 `{ messages, terminate }`，但只有当批次非空、且每个最终结果都显式要求 terminate 时，`shouldTerminateToolBatch()` 才会终止 Loop。如果只有一个快速工具要求结束，它不能取消那些仍在运行、且没有要求结束的兄弟调用。

源码：[查看批次终止规则](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent-loop.ts#L390-L560)

```typescript
// 批次全部结果 terminate=true 时才整体终止。
```

- **调用者**：Tool Batch 执行结束后的 Loop。
- **输入**：每个工具的最终消息与 Terminate 标志。
- **状态变化**：决定继续下一次模型采样还是停止。
- **返回**：批次消息和整体 Terminate。
- **下一站**：追加 Tool Results，或结束当前 Agent Run。

`beforeToolCall` 可以在调用发生之前阻断它，`afterToolCall` 则可以调整结果和 Usage，但这两个扩展点都不会自动带来用户审批或 OS 隔离。具体 Coding Agent 如何注册 Extension，要到下一篇再看。

## 失败路径怎样进入下一轮

pi 的关键设计并不是「工具必须成功」，而是无论成功还是失败，工具都必须产生与 Call ID 对应的结果。因此，未知工具、参数截断、Extension 阻断和实现抛错，都应转换成模型可读的失败观察，同时保留结构化错误供宿主判断。除非协议已经无法继续、用户取消或整个批次明确终止，否则 Loop 仍会继续采样。

## 回到运费任务

第一轮先读取 `shipping.ts`，等读取结果回填后，第二轮才会提出编辑，而编辑完成时，Follow-up 里的「同时更新说明」仍要等测试闭环结束才能开始。如果用户临时发来「不要改测试」，这条消息会作为 Steering，在下一次模型调用之前插入。这样既能让新约束及时生效，又不会把已经启动的工具批次伪装成尚未发生。

## 练习：什么情况下批次可以提前结束

并行批次有三个调用：读取源码返回 `terminate=false`，读取测试返回 `terminate=false`，一个自定义工具返回 `terminate=true`。此时整个批次是否终止？

<details>
<summary>查看核对要点</summary>

不会。当前规则要求非空批次里的所有最终结果都显式要求终止，否则单个工具就可能意外截断兄弟调用和后续的模型观察。如果产品确实需要「任一工具触发全局取消」，就应该设计独立的取消语义，而不是复用普通 Terminate 标志。

</details>

下一篇：[Coding Agent、Prompt 与 Extensions](03-coding-agent-extensions.md)。
