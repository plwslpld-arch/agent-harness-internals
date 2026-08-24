# Agent Loop、Steering、Follow-up 与工具批次

[返回 pi 课程地图](README.md)

pi Agent Core 把最小循环写得很直接：准备消息，调用模型，流式发事件；若有 Tool Calls，则执行工具、追加 Tool Results 并继续采样。它还维护 Steering 与 Follow-up 两个输入队列，分别处理运行中转向和本轮结束后的追加工作。

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

分开后，Steering 可以及时改变正在进行的任务，而 Follow-up 不会在工具批次中间破坏当前因果顺序。

### Steering 和 Follow-up 解决的是时序，不只是两种名称

假设 Agent 正并行读取实现和测试。用户此时补充「不要修改测试文件」，这条 Steering 应尽快进入下一次模型决策；而「完成后再生成变更说明」属于 Follow-up，应等当前工具闭环收敛后开始。若把两者塞进一个队列，Harness 不是过晚响应约束，就是在工具结果尚未齐全时提前开始新目标。

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

外层循环处理 Follow-up，内层循环处理本次模型与工具闭环。模型 `stop` 只结束一次采样；只有内外两层都没有继续条件，Agent Run 才收敛。

## 长度截断的 Tool Call 不能执行

若 Assistant Message 的 StopReason 是 `length`，Tool Call Arguments 可能被截断成看似 JSON 的半成品。pi 选择生成错误 Tool Result 并再次让模型处理，而不是执行潜在错误参数。

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

并行与串行工具最终都返回 `{ messages, terminate }`。只有批次非空且每个最终结果都显式要求 terminate，`shouldTerminateToolBatch()` 才终止 Loop。一个快速工具要求结束，不能取消仍在运行且未要求结束的兄弟调用。

源码：[查看批次终止规则](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent-loop.ts#L390-L560)

```typescript
// 批次全部结果 terminate=true 时才整体终止。
```

- **调用者**：Tool Batch 执行结束后的 Loop。
- **输入**：每个工具的最终消息与 Terminate 标志。
- **状态变化**：决定继续下一次模型采样还是停止。
- **返回**：批次消息和整体 Terminate。
- **下一站**：追加 Tool Results，或结束当前 Agent Run。

`beforeToolCall` 可以阻断调用，`afterToolCall` 可以调整结果和 Usage。它们是扩展点，不自动提供用户审批或 OS 隔离；具体 Coding Agent 如何注册 Extension 要在下一篇看。

## 失败路径怎样进入下一轮

pi 的关键设计不是「工具必须成功」，而是工具必须产生与 Call ID 对应的结果。未知工具、参数截断、Extension 阻断和实现抛错都应转换为模型可读的失败观察，同时保留结构化错误供宿主判断。只有在协议已经无法继续、用户取消或整个批次明确终止时，Loop 才不再采样。

## 回到运费任务

第一轮读取 `shipping.ts`；读取结果回填后，第二轮提出编辑；编辑完成后，Follow-up 里若已有「同时更新说明」，它仍要等测试闭环结束。用户临时发送「不要改测试」，则作为 Steering 在下一次模型调用前插入。这样任务约束可以及时生效，又不会把已经启动的工具批次伪装成尚未发生。

## 练习：什么情况下批次可以提前结束

并行批次有三个调用：读取源码返回 `terminate=false`，读取测试返回 `terminate=false`，一个自定义工具返回 `terminate=true`。此时整个批次是否终止？

<details>
<summary>查看核对要点</summary>

不会。当前规则要求非空批次中所有最终结果都显式要求终止。否则单个工具可能意外截断兄弟调用和后续模型观察。若产品确实需要「任一工具触发全局取消」，应设计单独的取消语义，而不是复用普通 Terminate 标志。

</details>

下一篇：[Coding Agent、Prompt 与 Extensions](03-coding-agent-extensions.md)。
