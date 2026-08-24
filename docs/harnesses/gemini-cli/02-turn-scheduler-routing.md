# Turn、Model Router 与 Scheduler 怎样分工

[返回 Gemini CLI 课程地图](README.md)

Gemini CLI 的一个交互任务会跨过三个状态域：Model Router 为本次请求选择模型，Turn 消费 Gemini 流并发出事件，Scheduler 管理每个 Tool Call 的验证、审批、执行与结算。模型响应结束不代表任务结束，单个工具成功也不代表 Turn 结束。

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

同一 Session 的不同请求可能因回退或模式切换选择不同模型，所以评测记录应保存每次实际路由结果，而不只保存启动配置里的首选模型。

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

Finished 的含义是「这次模型响应有结束原因」。如果同一响应还产生 Tool Calls，Harness 必须执行工具并把结果送回模型。

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

课程会把 Legacy Session 和新的 Turn/Scheduler 组件分开描述；源码存在两条代际路径时，不能从一条路径的行为推断另一条完全相同。

## Scheduler 的状态属于单个调用

一个 Tool Call 可以经历 `Validating → Scheduled → AwaitingApproval → Executing → Success/Error/Cancelled`。这些状态是 Call 级别的；同一批次其他调用可能处于不同状态。

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

联合类型让「AwaitingApproval 的调用一定有 Confirmation Details」「Success 一定有 Result」等约束进入 TypeScript 类型系统，减少用可选字段拼出不可能状态。

## FinishReason 也不能简单折成成功/失败

`STOP` 可映射为 completed；`MAX_TOKENS` 是预算耗尽；`SAFETY`、`RECITATION` 等是 refusal；Malformed Function Call 等属于 failed。表面若只显示「流结束」，会丢失恢复策略所需分类。

源码：[查看 FinishReason 映射](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/agent/event-translator.ts#L332-L362)

```typescript
// STOP -> completed
// MAX_TOKENS -> max_budget
// SAFETY / RECITATION -> refusal
// MALFORMED_FUNCTION_CALL / OTHER -> failed
```

下一篇：[工具注册与完整生命周期](03-tools-lifecycle.md)。
