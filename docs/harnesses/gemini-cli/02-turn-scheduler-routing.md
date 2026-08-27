# Turn、Model Router 与 Scheduler 怎样分工

[返回 Gemini CLI 课程地图](README.md)

上一篇拼好的模型请求进入执行主链后，会依次交给三个模块：Model Router（模型路由器）替这次请求选模型，Turn 消费 Gemini 流并发出事件，Scheduler（调度器）则逐个管理 Tool Call，带它们走完验证、审批、执行和结算。模型响应结束不代表任务结束。

工具成功不等于 Turn 结束。

```text
用户输入
  ↓
Model Router → 选择模型与回退原因
  ↓
Turn → Gemini 流 → 文本 / ToolCall / Finished
                     ↓
                 Scheduler
                     ↓
            Tool Results 回到下一次请求
```

## 第 1 站：路由是一组有顺序的 Strategy

源码：[查看 Model Router 组装](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/routing/modelRouterService.ts#L35-L74)

```typescript
strategies.push(new FallbackStrategy())
strategies.push(new OverrideStrategy())
strategies.push(new ApprovalModeStrategy())

return new CompositeStrategy(
  [...strategies, terminalStrategy],
  'agent-router',
)
```

- **调用者**：Turn 发起模型请求前的路由服务。
- **输入**：有效 Config、Approval Mode、显式覆盖和可用模型。
- **状态变化**：按顺序尝试 Strategy，并记录覆盖或回退元数据。
- **返回**：本次请求使用的模型决定。
- **下一站**：Gemini Client 建立流式响应。

同一 Session 里的不同请求可能因为回退或模式切换选中不同模型，所以评测时既要保存启动配置里的首选模型，也要记下每次请求实际走到了哪个模型。两者不能混用。

## 第 2 站：Turn 只有看到真实 FinishReason 才发 Finished

源码：[查看 Turn 的结束事件](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/core/turn.ts#L380-L410)

```typescript
const finishReason = resp.candidates?.[0]?.finishReason
if (finishReason) {
  yield {
    type: GeminiEventType.Finished,
    value: { reason: finishReason, usageMetadata: resp.usageMetadata },
  }
}
```

- **调用者**：Turn 对 Gemini Response Chunk 的迭代器。
- **输入**：Provider 返回的流式 Candidate Chunk。
- **状态变化**：累积文本与 Tool Request；仅在响应提供 FinishReason 时发 Finished。
- **返回**：供 Agent Session 或 UI 消费的 Gemini Events。
- **下一站**：Agent Session 先检查是否还有待处理 Tool Calls，再决定是否真正结束。

Finished 只说明「这次模型响应已经给出结束原因」，如果同一份响应里还有 Tool Calls，Harness 就得先执行工具，把结果送回模型，后面的分支也得继续处理这一批调用。它只结算当前响应，整个任务还可能继续。

## 第 3 站：工具请求优先于 Agent Session 结束

源码：[查看 Legacy Agent Session 的分支](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/agent/legacy-agent-session.ts#L241-L252)

```typescript
if (toolCallRequests.length === 0) {
  this._finishStream(mapFinishReason(finishedReason))
  return
}

const completedToolCalls = await this._scheduler.schedule(...)
```

- **调用者**：Legacy Agent Session 消费完一批 Turn Events 后。
- **输入**：本次响应收集的 Tool Requests 与 FinishReason。
- **状态变化**：没有工具时结算 Agent Stream；有工具时交给 Scheduler 并保持会话活动。
- **返回**：Agent End，或一批 Completed Tool Calls。
- **下一站**：Completed Calls 变成 Function Responses，进入下一次模型请求。

这里把 Legacy AgentSession 和新的 Turn/Scheduler 分开讲，因为源码同时留着两代路径时，你不能看到一条路径怎么做，就认定另一条也完全一样。读代码时先找清调用者走的是哪条路，再跟着这条路上的状态变化和返回值往下看。

## Scheduler 的状态属于单个调用

一个 Tool Call 会依次经过 `Validating → Scheduled → AwaitingApproval → Executing → Success/Error/Cancelled`，但每个状态都只记在这一条 Call 上。同一批里的其他调用完全可能停在别的阶段，所以你分析整批请求时仍得逐条核对，不能拿一个笼统的批次状态盖住它们。

### 第 4 站：Scheduler 维护显式调用状态机

源码：[查看 Tool Call 状态类型](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/types.ts#L18-L180)

```typescript
type ToolCall =
  | ValidatingToolCall
  | ScheduledToolCall
  | WaitingToolCall
  | ExecutingToolCall
  | SuccessfulToolCall
  | ErroredToolCall
  | CancelledToolCall
```

- **调用者**：Scheduler 接纳、确认、执行与取消流程。
- **输入**：带 Call ID、工具名和参数的请求。
- **状态变化**：每次转换生成更具体的联合类型成员。
- **返回**：最终 `CompletedToolCall`。
- **下一站**：Agent Session 将结果翻译为模型可读 Function Response。

联合类型直接告诉 TypeScript：「处于 AwaitingApproval 的调用一定带着 Confirmation Details，到了 Success 就一定有 Result。」这样写能减少可选字段随意组合，避免程序拼出根本不该存在的状态。阅读时先找到当前对象属于哪个联合类型成员，再看这个成员已经带上了哪些字段。

## FinishReason 也不能简单折成成功/失败

`STOP` 会映射成 completed，`MAX_TOKENS` 说明预算已经耗尽，`SAFETY`、`RECITATION` 等原因会归进 refusal，Malformed Function Call 等情况则算 failed。如果界面只写「流结束」，恢复流程就拿不到自己需要的分类，所以记录里必须保留这些映射结果。

源码：[查看 FinishReason 映射](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/agent/event-translator.ts#L332-L362)

```typescript
// STOP -> completed
// MAX_TOKENS -> max_budget
// SAFETY / RECITATION -> refusal
// MALFORMED_FUNCTION_CALL / OTHER -> failed
```

到这里，我们已经分清 Router 选了哪个模型、Turn 发出了什么事件，以及 Scheduler 怎样记录每条调用的状态。下一篇继续跟着 Scheduler 收到的 Tool Call 往下走，看 Registry、Invocation、Executor 与 Function Response 怎样连起来，工具也正是在这条链路上真正开始做事。

下一篇：[工具注册与完整生命周期](03-tools-lifecycle.md)。
