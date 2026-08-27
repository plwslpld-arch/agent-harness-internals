# Session Prompt、LLM 与 Processor 如何形成主循环

[返回 OpenCode 课程地图](README.md)

OpenCode 没把整个 Agent Loop（智能体循环）塞进一个函数，而是让 `session/prompt.ts` 推进循环并整理 Context。

`session/llm.ts` 接着按当前配置向 Provider（模型提供商）发请求，再由 `session/processor.ts` 里的 Processor（处理器）消费响应流，把 Message Parts、Tool 状态、Cost 和 Snapshot Patch 写下来。

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

即使 Provider 给出的 FinishReason（结束原因）不是 `tool-calls`，只要 Assistant Parts 里已经写入 Tool Call，循环仍要把这次调用处理完，因为落盘的 Part 比一个结束字段更能说明模型实际吐出了什么。别只信 FinishReason。

### 为什么主循环没有集中在一个函数里

Prompt 层负责从启动到结算这一整段 Session，LLM 层把请求改写成各家供应商接受的格式，Processor 则逐个消费流事件，再把结果收进持久状态。三层拆开以后，同一个 Processor 可以处理不同 Provider 发出的统一事件，Server 也只需调用 Session 服务，但你得沿着三层代码连起来看，才能找到完整的 Loop。要判断谁在控制下一轮，就看 Prompt 收到 Processor 的信号后做了什么，别只搜索名为 `loop` 的函数。

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

Processor 返回的这三个值只负责控制 Loop：工具交回结果时可能返回 `continue`，遇到错误或 Hook Block 时可能返回 `stop`，Context 放不下时才返回 `compact`。它们只决定循环怎么走，不评价用户的目标有没有完成。

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

Tool Part 进入 Success，只说明这个工具已经交回结果，Step 出现 Finish 则说明本次模型流已经结束，直到 Session 转为 Idle，才能确定主循环眼下不再推进。如果界面给三者都画上绿色勾，调试者很容易把它们当成同一层的成功。结束也分层级。

## LLM 层负责 Provider 语法，不拥有 Session 控制

LLM 层负责把 Agent Prompt、Provider Model、System、Messages 和 Tools 交给模型 SDK，也可以在请求里注入 OpenTelemetry。它无权判断用户目标是否完成，因为 Processor 负责解释流事件，Prompt Loop 则根据解释结果继续推动 Session。

## 回到运费任务

Prompt Loop 先把用户目标写进 Session，LLM 层再把当前有效的历史和工具表交给 Provider。Processor 收到 `read` Tool Call 后会创建 Running Part，等工具交回结果便结算这个 Part，并向 Prompt Loop 返回 `continue`。只有 `edit` 和测试工具都运行完毕，而且最后一条 Assistant 不再带有 Tool Call，Prompt Loop 才会真正退出。

## 练习：区分三个「结束」

工具 Part 已 Success、模型 Step 已 Finish、Session 仍 Busy。为什么这不是矛盾？

<details>
<summary>查看核对要点</summary>

工具进入 Success，只结算了一个 Tool Call，Step 出现 Finish 也只结算了一次模型流。只要 Prompt Loop 还得把工具结果送回模型，Session 就会保持 Busy。等到 Loop 不再创建新的 Step，Session 才会转为 Idle，但这仍不能证明用户目标通过了独立验证。

</details>

下一篇：[Tools、Permission、Question 与 Patch](03-tools-permission-patch.md)。
