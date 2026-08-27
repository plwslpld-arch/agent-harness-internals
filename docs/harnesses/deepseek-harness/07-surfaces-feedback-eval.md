# 同一 Agent 核心如何变成 Headless、ACP 与反馈数据

[返回 DeepSeek Harness 课程地图](README.md)

Agent Loop 解释内部怎样推进任务，产品表面则要继续回答外部怎样创建 Session、提交任务和接收输出，以及审批或取消怎样传回运行中的流程。DeepSeek Harness 可以把同一套 Agent、Session、Tools 和 Provider 核心接到 Headless（无头模式）、ACP（Agent 客户端协议）、Web 或 SDK，但每个入口仍会按自己的协议交付结果。

```text
命令行一次性任务 ── Headless ─┐
编辑器 / 自动化客户端 ─ ACP ──┼→ Agent → Session → ToolRuntime
Web / SDK ────────────────┘                │
                                           └→ 事件、反馈、评测产物
```

## 表面适配器具体要翻译什么

外部请求进入 Agent 后，表面适配器要把协议对象转换成内部对象，等 Agent 产出结果，再把内部状态转换成客户端认识的形式。这个往返过程至少包含五类翻译：

- 外部 Session 身份如何映射到内部 `SessionId`；
- 外部 Prompt 何时真正进入 Agent Inbox；
- 内部事件中哪些内容可以投影给客户端；
- 内部 `TurnEndReason` 如何变成协议 Stop Reason 或进程退出码；
- 外部取消与权限响应如何回到正在运行的 Agent。

共享 Agent Core 能减少重复代码，不过数据一旦跨过协议边界，适配器仍可能舍弃部分信息。能力边界也可能改变。

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

源码把 `completed` 映射为 0，把其他停止原因映射为 1，但 completed 只说明 Agent Loop 按内部规则停止，无法证明仓库中的测试已经修好。因此，Headless 承担自动修复任务时，宿主必须等进程退出，再另行执行验证命令。

## ACP：一个协议请求跨过多个异步边界

ACP 表面会为协议 Session 找到对应的内部 Agent，同时保证同一 Session 最多只有一个 Prompt in flight。收到请求不代表 Prompt 已经开始运行，因为系统还要转换附件、处理取消竞争，并经过 Agent Inbox 接纳和 Turn Claim。请求仍可能失败。

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

代码必须在第一次 `await` 之前预留槽位，否则两个并发请求都可能读到「当前没有 Prompt」，随后一起进入同一个 Agent。处理取消时，桥接层也要先判断消息已经走到哪一步：消息仍在接纳附件时只取消 Admission，等它进入 Inbox 后，桥接层才能连同 Agent Work 一并取消。

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

Raw Chunk、Reasoning、Tool、Plan 和 Retry Marker 都不会进入自动化协议，因此客户端只能看到经过主动收窄的内容，无法据此获得完整 Trace。调试工具如果只用 ACP 输出重建执行过程，就会漏掉解释事件因果关系的关键信息。

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

即使未知客户端返回了相似字符串，桥接层也不会据此推断用户给出了耐久授权。这里除了要映射字段，协议适配器还必须按保守规则限制能力，避免一次决定意外扩大后续权限。

## Feedback：它是带身份的用户信号，不是正确答案

DeepSeek Harness 同时接收消息级和 Session 级 Feedback（反馈）。消息级接口先用 `SessionId + MessageId` 找到一条 Assistant 消息，每次写入后再返回一个不透明 Revision（修订版）。界面以后替换或删除反馈时，必须带回自己读到的 Revision，存储层才能执行 Compare-and-Set，避免两个界面悄悄覆盖彼此的修改。

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

Session 级 `/feedback` 不处理这种并发更新，它只检查文本是否为空，随后把 `feedback/record` 追加到 Event Log。

源码：[查看 Session Feedback 写入](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/feedback/command-feedback/src/index.ts#L67-L105)

```typescript
const normalized = text.trim()
if (normalized.length === 0) throw new TypeError(...)
session.append('feedback/record', { text: normalized })
```

反馈只记录某个用户对某条消息或某个 Session 表达了什么，而界面位置、用户目标、情绪、选择偏差和误操作都可能影响这次表达。它不能直接充当正确答案。若要把反馈用于训练或评测，数据管线还得明确怎样采样、标签代表什么、冲突如何处理，并预先规定权重和独立留出集。

## Eval 应接在哪一层

Eval（评测）不应只读取某个界面显示的「已完成」，更可靠的输入是一次运行留下的 Artifact，其中要保存固定输入、Harness 配置、Session/Trace、工作区变化、停止原因和成本。

Evaluator（评估器）位于运行流程之外，它读完这些材料后，再执行确定性检查或模型评分。

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

评分工作放在运行流程之外以后，Headless Exit Code、ACP `end_turn`、Assistant 自述和用户 Feedback 都可以成为特征或证据，但其中任何一项都不能单独决定最终分数。

下一篇：[自验证机制与证据边界](08-verification-design-limits.md)。
