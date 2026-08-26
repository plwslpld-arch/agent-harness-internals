# Session Prompt、LLM 与 Processor 如何形成主循环

[返回 OpenCode 课程地图](README.md)

OpenCode 的 Agent Loop 分散在三层，其中 `session/prompt.ts` 负责循环和 Context，`session/llm.ts` 负责 Provider 请求，而 `session/processor.ts` 则消费流并写 Message Parts、Tool 状态、Cost 和 Snapshot Patch。

```text
Session Prompt Loop
  ↓ 构造 System / Messages / Tools
LLM Stream
  ↓
Processor：Text / Tool / Step Finish / Error
  ↓
continue ─→ 下一次模型请求
compact ──→ 压缩后继续
stop ─────→ Session Idle / Error
```

## 第 1 站：有 Tool Calls 时不能只看 Provider Finish

源码：[查看 Prompt 主循环](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/prompt.ts#L1081-L1130)

```typescript
while (true) {
  const hasToolCalls = lastAssistantMsg?.parts.some(...)
  if (lastAssistant?.finish && !hasToolCalls) break
  // 继续处理工具结果或下一次模型请求
}
```

- **调用者**：Server/CLI 的 `session.prompt` 服务。
- **输入**：Session ID、User Parts、Agent、Model 和 AbortSignal。
- **状态变化**：追加 User/Assistant Messages，驱动多次 LLM Step。
- **返回**：最终 Assistant Message/Parts 或 Error。
- **下一站**：Session Status 变 Idle，表面输出最终投影。

即使 Provider FinishReason 不是 `tool-calls`，只要 Assistant Parts 中真实存在 Tool Call，循环就仍然要处理它，因为 Parts 里已经落下的 Tool Call 比单个结束字段更可靠。不能只相信 FinishReason。

### 为什么主循环没有集中在一个函数里

Prompt 层拥有 Session 生命周期，LLM 层掌握供应商的请求语法，Processor 则负责把流事件归约为持久状态。这样拆分以后，同一个 Processor 既可以处理不同 Provider 发出的统一事件，Server 也只需依赖 Session 服务，不过读者必须沿着三层代码才能看见完整 Loop。因此，判断「谁控制下一轮」时，应该看 Prompt 如何消费 Processor 返回的信号，而不是只搜索名为 `loop` 的函数。

## 第 2 站：Processor 把流归约成三个控制信号

源码：[查看 Processor 结算](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/processor.ts#L630-L681)

```typescript
const stream = llm.stream(streamInput)

if (ctx.needsCompaction) return 'compact'
if (ctx.blocked || ctx.assistantMessage.error) return 'stop'
return 'continue'
```

- **调用者**：Prompt Loop 每个 Step。
- **输入**：LLM Stream、Assistant Message、Tools、Permission 与 Hooks。
- **状态变化**：逐事件更新 Message Parts、Tokens、Cost、Error、Blocked 与 Compaction 标志。
- **返回**：`continue`、`compact` 或 `stop`。
- **下一站**：Prompt Loop 决定再采样、压缩还是结算。

这三个值是 Loop 的控制信号，不是任务评分：`continue` 可能是因为工具返回了结果，`stop` 可能源于错误或 Hook Block，而 `compact` 只表示 Context 需要缩短。三者都不评判用户目标。

## 第 3 站：Tool 与 Step 事件写入不同事实

源码：[查看 Processor Event 分支](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/processor.ts#L331-L483)

```typescript
case 'tool-call':
  yield* ensureToolCall(value)
  break

case 'step-finish':
  ctx.assistantMessage.finish = value.reason
  // 写 Token、Cost、Snapshot Patch，并检查 Compaction
```

- **调用者**：Processor 异步消费 AI SDK Stream。
- **输入**：Text Delta、Reasoning、Tool Call/Result、Step Start/Finish 和 Error。
- **状态变化**：Tool Call 建 Running Part 并防重复；Result 结算 Part；Step Finish 结算本次模型步骤。
- **返回**：持久化后的 Message/Part Events。
- **下一站**：UI 订阅、Session Store 与下一轮 Context。

Tool Part Success、Step Finish 和 Session Idle 表示的是三种不同终态——如果界面给它们都显示绿色勾，调试者就很容易误以为它们处在同一层。终态也有层级。

## LLM 层负责 Provider 语法，不拥有 Session 控制

LLM 层会把 Agent Prompt、Provider Model、System、Messages 与 Tools 转交给模型 SDK，并且可以在请求中注入 OpenTelemetry。但它不决定用户目标是否完成，因为解释流事件并推动 Session 的是 Processor 和 Prompt Loop。

## 回到运费任务

Prompt Loop 先把用户目标写入 Session，然后由 LLM 层把有效历史和工具表交给 Provider。Processor 收到 `read` Tool Call 以后会创建 Running Part，等工具结果到达再结算这个 Part，随后返回 `continue`。只有当 `edit` 和测试工具都已完成，而且最后一条 Assistant 不再包含 Tool Call 时，Prompt Loop 才能真正退出。

## 练习：区分三个「结束」

工具 Part 已 Success、模型 Step 已 Finish、Session 仍 Busy。为什么这不是矛盾？

<details>
<summary>查看核对要点</summary>

工具 Success 只结算一个 Tool Call，Step Finish 也只结算一次模型流，如果 Prompt Loop 还需要把工具结果送回模型，Session 就会继续 Busy。只有当 Loop 不再需要新的 Step 时，Session 才会转为 Idle，而 Idle 仍然不等于用户目标通过了独立验证。

</details>

下一篇：[Tools、Permission、Question 与 Patch](03-tools-permission-patch.md)。
