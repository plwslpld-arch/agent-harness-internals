# 同一 Agent 核心如何变成 Headless、ACP 与反馈数据

[返回 DeepSeek Harness 课程地图](README.md)

Agent Loop 回答的是「内部怎样运行」，而产品表面还得回答另一组问题：外部如何创建 Session、提交任务、接收输出，又如何审批和取消。DeepSeek Harness 虽然能把同一套 Agent、Session、Tools 和 Provider 核心接到 Headless、ACP、Web 或 SDK，但共用核心不等于共用结果契约。

```text
命令行一次性任务 ── Headless ─┐
编辑器 / 自动化客户端 ─ ACP ──┼→ Agent → Session → ToolRuntime
Web / SDK ────────────────┘                │
                                           └→ 事件、反馈、评测产物
```

## 表面适配器具体要翻译什么

从外部请求进入 Agent 到内部结果回到客户端，表面适配器至少要完成五类翻译：

- 外部 Session 身份如何映射到内部 `SessionId`；
- 外部 Prompt 何时真正进入 Agent Inbox；
- 内部事件中哪些内容可以投影给客户端；
- 内部 `TurnEndReason` 如何变成协议 Stop Reason 或进程退出码；
- 外部取消与权限响应如何回到正在运行的 Agent。

共享 Agent Core 可以减少重复实现，可一旦数据穿过不同协议边界，适配器就仍然可能丢失信息或收窄能力。

## Headless：一次任务、一次 Session、一个退出码

### 第 1 站：Headless 等待完整装配后才创建 Agent

源码：[查看一次性运行入口](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/bundle/headless/src/index.ts#L90-L134)

```typescript
await ctx.get('loader')?.await()
const { agent } = await agents.create({
  sessionId: SessionId(`session-${randomUUID()}`),
  meta: { cwd: process.cwd() },
  agentOptions: { provider: selection.provider, model: selection.model },
})

agent.followup(createUserMessage({ content: [{ type: 'text', text: task }] }))
await agent.whenIdle()
await sessions.flush(agent.session)
```

- **调用者**：Headless Bundle 的 `apply()`。
- **输入**：单次任务文本、默认模型选择和进程 I/O。
- **状态变化**：创建新 Agent，投递任务，等待 Idle，并把 Session 刷到持久化后端。
- **返回**：Assistant 文本写到 stdout；停止原因映射为退出码。
- **下一站**：Shell、CI 或其他宿主读取 stdout、stderr 和 Exit Code。

源码会把 `completed` 映射为 0，并把其他停止原因映射为 1，可这里的 completed 只表示 Agent Loop 按自己的停止语义走完了，并不表示「仓库中的测试已经真正修好」。因此，如果 Headless 承担自动修复任务，宿主就必须等进程结束后再运行独立验证命令。

## ACP：一个协议请求跨过多个异步边界

ACP 表面一边维护协议 Session 到内部 Agent 的映射，一边限制同一 Session 同时只能有一个 Prompt in flight。它不能把「收到请求」当成「Prompt 已经开始」，因为附件转换、取消竞争、Agent Inbox 接纳和 Turn Claim 任何一步都可能失败。

### 第 2 站：先预留 Prompt 槽位，再做异步接纳

源码：[查看 ACP `prompt()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/src/index.ts#L335-L422)

```typescript
if (record.inflight !== undefined) {
  throw invalidParams('a prompt is already in flight for this session')
}
record.inflight = inflight

const content = await admitAcpPrompt(...)
admissionController.signal.throwIfAborted()
record.agent.followup(message)
```

- **调用者**：ACP 客户端的 `session/prompt` 请求处理器。
- **输入**：协议 Session ID、文本或附件 Prompt。
- **状态变化**：同步占用 in-flight 槽；转换内容；在最终取消检查后投递 Inbox。
- **返回**：等待内部运行和输出投影都收敛后的 ACP Stop Reason。
- **下一站**：客户端决定继续 Prompt、取消或关闭 Session。

预留槽位必须发生在第一次 `await` 之前，否则两个并发请求都可能看到「当前没有 Prompt」，然后一起进入同一个 Agent。取消时也要判断消息走到了哪一步：如果它还在附件接纳阶段，就只取消 Admission，而只有消息已经进入 Inbox 之后，才能同时取消 Agent Work。

### 第 3 站：协议只发送已提交的 Assistant 消息

源码：[查看 Session Event 到 ACP Update 的投影](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/src/index.ts#L218-L252)

```typescript
if (event.type === 'assistant/message') {
  for (const block of event.data.message.content) {
    const content = await assistantBlockToAcp(ctx, block)
    await notify({ update: { sessionUpdate: 'agent_message_chunk', content } })
  }
}
```

- **调用者**：ACP Bridge 对 `session/event` 的监听器。
- **输入**：内部 Session Event。
- **状态变化**：每个 Session 用 Promise Chain 保证异步附件转换仍按原顺序投递。
- **返回**：ACP `session/update` 通知。
- **下一站**：Prompt 结算还要等待这条输出链归于静止。

Raw Chunk、Reasoning、Tool、Plan 和 Retry Marker 都不会走上自动化协议线，所以客户端看到的只是一个有意收窄的投影，不是完整 Trace。如果调试工具拿 ACP 输出去重建执行过程，它就会丢掉关键的因果信息。

### 第 4 站：权限响应只产生一次性决定

源码：[查看 ACP Permission 映射](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/src/index.ts#L268-L284)

```typescript
options: [
  { optionId: 'allow-once', kind: 'allow_once' },
  { optionId: 'reject-once', kind: 'reject_once' },
]
```

- **调用者**：内部 Approval Chain 遇到需要客户端决策的 Tool Call。
- **输入**：内部 Request、Session ID 和 Call ID。
- **状态变化**：桥接一次协议请求，不写入永久授权。
- **返回**：`allowed-once`、`rejected` 或 `cancelled`。
- **下一站**：ToolRuntime 继续执行、拒绝或终止该调用。

即使未知客户端返回了相似字符串，桥接层也不会因此推断用户给出了耐久授权。这不只是字段映射。协议适配器还必须保守地收窄能力，才能守住这个边界。

## Feedback：它是带身份的用户信号，不是正确答案

DeepSeek Harness 同时提供消息级和 Session 级反馈，其中消息级接口先用 `SessionId + MessageId` 定位一条 Assistant 消息，再为每次写入返回不透明 Revision。当界面要替换或删除反馈时，它必须带上自己观察到的 Revision 才能形成 Compare-and-Set，从而避免两个界面静默覆盖彼此。

### 第 5 站：消息反馈用 Revision 处理并发修改

源码：[查看消息反馈公共类型](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/feedback/message-feedback/src/types.ts#L12-L76)

```typescript
interface PutMessageFeedbackRequest {
  sessionId: SessionId
  messageId: MessageId
  value: MessageFeedbackValue
  expectedRevision?: MessageFeedbackRevision
}
```

- **调用者**：Web 或 Remote Client 的反馈操作。
- **输入**：Session、Message、反馈值与可选预期 Revision。
- **状态变化**：创建或条件替换一个反馈项。
- **返回**：新值和新的不透明 Revision，或冲突错误。
- **下一站**：UI 刷新最新值；数据管线按版本消费反馈。

Session 级 `/feedback` 没有这层并发更新协议，它只会校验文本非空，然后把 `feedback/record` 追加到 Event Log。

源码：[查看 Session Feedback 写入](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/feedback/command-feedback/src/index.ts#L67-L105)

```typescript
const normalized = text.trim()
if (normalized.length === 0) throw new TypeError(...)
session.append('feedback/record', { text: normalized })
```

反馈只能说明「某个用户对某条消息或某个 Session 表达了什么」，而这种表达可能受界面位置、用户目标、情绪、选择偏差甚至误操作影响。反馈不是答案。如果要把它用于训练或评测，还得先定义采样方式、标签语义、冲突处理、权重和独立留出集。

## Eval 应接在哪一层

最稳妥的接入点不是某个界面显示的「已完成」，而是一次运行留下的 Artifact，其中应包含固定输入、Harness 配置、Session/Trace、工作区变化、停止原因和成本。Evaluator 应在运行外部读取这些产物，然后再执行确定性检查或模型评分。

```text
任务输入 + 锁定配置
        ↓
DeepSeek Harness 运行
        ↓
Session / Trace / 文件差异 / Stop Reason
        ↓
独立 Evaluator
        ↓
Score + 失败原因
```

只有把评分权放到运行外部，Headless Exit Code、ACP `end_turn`、Assistant 自述和用户 Feedback 才能同时作为特征或证据，而不会让任何一项单独决定最终评分。

下一篇：[自验证机制与证据边界](08-verification-design-limits.md)。
