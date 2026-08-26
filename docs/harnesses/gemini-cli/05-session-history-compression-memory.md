# Session 记录、模型历史、Compression 与 Memory 的边界

[返回 Gemini CLI 课程地图](README.md)

上一章分清了模型 `SAFETY`、用户拒绝与 Sandbox 初始化失败，说明三者来自不同位置，但这些结果能否用于回放和恢复，还取决于它们进入哪种记录。Gemini CLI 里至少有五种「过去信息」——`AgentChatHistory` 是进程内回合的强所有者，模型接收 `Content[]` 投影，`ChatRecordingService` 追加 JSONL，Compression 用摘要替换旧 Context，而 GEMINI.md/Memory Service 保存跨会话知识。

```text
AgentChatHistory ─→ Content[] ─→ 下一次模型请求
      │
      ├→ ChatRecordingService ─→ JSONL 回放记录
      └→ Compression ─→ 摘要 + 保留尾部

Memory / GEMINI.md ─→ 新会话的项目上下文
```

## 第 1 站：运行时历史保留 Turn 身份，模型投影去掉它

源码：[查看 `AgentChatHistory`](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/core/agentChatHistory.ts#L19-L67)

```typescript
// The "Strong Owner" of chat history turns.
getContents(): Content[] {
  return this.history.map((turn) => turn.content)
}
```

- **调用者**：GeminiChat 和 Agent Session。
- **输入**：带稳定 Turn 标识的用户/模型 Content。
- **状态变化**：追加或替换当前进程内 Chat Turns。
- **返回**：模型 SDK 使用的不带内部 Turn ID 的 `Content[]`。
- **下一站**：Gemini Client 发请求，或 Recording Service 保存表面消息。

内部身份用于去重和关联，而 Provider Content 只关心角色与 Parts，所以两者承载的信息并不相同。如果只保存 Provider Content，恢复时就可能无法重建原来的内部 Turn 引用。

## Resume 只选可重新进入聊天的消息

### 第 2 站：显式 History 优先，恢复记录需要过滤

源码：[查看 GeminiChat 初始化](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/core/geminiChat.ts#L331-L358)

```typescript
if (history.length > 0) {
  initialHistoryTurns = history
} else if (resumedSessionData) {
  initialHistoryTurns = resumedSessionData.messages
    .filter((m) => m.type === 'user' || m.type === 'gemini')
}
```

- **调用者**：创建或恢复 GeminiChat。
- **输入**：显式历史、可选 Session Recording。
- **状态变化**：选择唯一初始化来源；从完整记录投影聊天消息。
- **返回**：AgentChatHistory 的初始 Turns。
- **下一站**：Prompt Context 与新用户输入继续追加。

Tool、Info、Error 等 Recording Message 可能服务回放界面，却不一定能原样进入 Provider 历史，因此恢复需要从完整记录里筛选聊天消息，是一次投影，不是把 JSONL 每行直接发给模型。

## Recording 失败不一定终止正在运行的 Agent

### 第 3 站：JSONL 逐行追加，写失败后关闭记录通道

源码：[查看 Chat Recording 写入](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/services/chatRecordingService.ts#L559-L573)

```typescript
const line = JSON.stringify(record) + '\n'
fs.appendFileSync(this.conversationFile, line)

// 失败时将 conversationFile 置空，后续不再写。
```

- **调用者**：用户、模型、工具和状态事件的记录点。
- **输入**：可序列化 Session Record。
- **状态变化**：追加一行；持久化故障时停用本 Session 的 Recording。
- **返回**：通常不改变 Agent 的业务结果。
- **下一站**：回放/恢复只能读取故障前成功落盘的前缀。

因此，Agent 最终输出完整并不代表 Session 记录完整，故障前成功落盘的前缀也不能证明此后的事件已经保存。如果评测依赖 Trace，就应把 Recording 可用性单独列为基础设施字段，不能与 Agent 的业务结果混在一起判断。

## Compression 先摘要，再让模型检查摘要是否遗漏

ChatCompressionService 找到安全切分点，把较旧 History 交给模型摘要并保留最近尾部，随后又发一次 Verification Prompt，要求检查重要细节是否丢失。

### 第 4 站：切分、摘要与核对是分开的步骤

源码：[查看压缩与核对](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/context/chatCompressionService.ts#L323-L411)

```typescript
const splitIndex = findCompressSplitPoint(...)
const historyToCompress = curatedHistory.slice(0, splitIndex)

const verificationResponse =
  await config.getGeminiClient().generateContent(...)
```

- **调用者**：Context 压力策略。
- **输入**：Curated History、Token 预算和 Gemini Client。
- **状态变化**：选旧前缀进行摘要；用第二次请求检查遗漏并形成最终摘要。
- **返回**：摘要文本、保留尾部与压缩元数据。
- **下一站**：替换活动 Chat History。

第二次模型核对要求检查重要细节是否丢失，因此能降低遗漏概率，但同一模型仍可能重复忽略同一细节。这不是无损证明。

### 第 5 站：新历史由摘要握手和尾部组成

源码：[查看压缩后 History](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/context/chatCompressionService.ts#L431-L480)

```typescript
const newHistory: Content[] = [
  { role: 'user', parts: [{ text: finalSummary }] },
  { role: 'model', parts: [{ text: 'Got it. Thanks for the additional context!' }] },
  ...historyToKeepTruncated,
]
```

- **调用者**：Compression 提交阶段。
- **输入**：最终摘要与保留尾部。
- **状态变化**：用新的对话前缀替换模型可见历史。
- **返回**：满足窗口预算的 `Content[]`。
- **下一站**：后续 Turn 继续；Recording 仍可保留压缩事件与旧消息。

## Memory 不应保存瞬态任务状态

GEMINI.md 和 Memory Service 适合保存稳定的项目命令、目录约定和长期偏好，但 Memory 不是环境快照。「测试现在失败在第 42 行」这类信息应留在当前 Session/Artifact，因为文件很快就会改变，恢复后也必须重新核对工作区。

跨会话知识进入新会话之后，运行时能力还会受到 Extension 刷新的多个 Registry 影响。下一篇将沿着 MCP Client Manager、Tool Registry、Hook System、Agent Registry 与 Skill Manager 的更新链，区分 Agents、Hooks、Skills 与 MCP 怎样进入当前 Session 的 Prompt 与工具面。

下一篇：[Agents、Hooks、Skills、MCP 与 Extensions](06-agents-hooks-skills-mcp.md)。
