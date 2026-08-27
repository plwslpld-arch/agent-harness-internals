# Session 记录、模型历史、Compression 与 Memory 的边界

[返回 Gemini CLI 课程地图](README.md)

上一章已经分清模型 `SAFETY`、用户拒绝和 Sandbox 初始化失败各自发生在哪里，可这些结果以后能不能拿来回放或恢复，还得看系统把它们写进了哪一种记录。Gemini CLI 至少保留五种「过去信息」：`AgentChatHistory` 掌管进程内的回合，模型只接收投影出来的 `Content[]`，`ChatRecordingService` 逐行追加 JSONL（逐行 JSON），Compression（压缩）拿摘要替换旧 Context，而 GEMINI.md 和 Memory Service 保存能跨会话复用的知识。

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

系统靠内部身份去重并关联前后事件，Provider Content 却只关心角色和 Parts，因此两边留下的信息并不一样。如果你只保存 Provider Content，恢复时就可能找不回原来的内部 Turn 引用。内部身份不能丢。

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

Tool、Info、Error 等 Recording Message 可以留给界面回放，却未必适合原样塞进 Provider 历史，因此恢复时要从完整记录里挑出聊天消息，再投影成模型认识的格式，不能把 JSONL 一行不漏地发给模型。

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

所以，即使 Agent 最后给出了完整结果，也不能说明 Session 记录同样完整，磁盘上能读到故障前的那一段，更不能证明后面的事件已经写入。如果评测要靠 Trace（执行轨迹）判定结果，就得单独记录 Recording 是否可用，别把基础设施故障和 Agent 的业务结果混在一起。这两种结果要分开。

## Compression 先摘要，再让模型检查摘要是否遗漏

ChatCompressionService 先找一个不会截断工具交互的切分点，把较旧的 History（历史记录）交给模型归纳，同时留下最近一段内容，随后再发一次 Verification Prompt，让模型检查摘要有没有漏掉重要细节。

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

第二次请求会让模型专门检查重要细节有没有丢失，确实能减少遗漏，可同一个模型也可能再次忽略同一个地方，所以这套核对不能证明压缩过程没有损失。摘要仍然有损。

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

GEMINI.md 和 Memory Service 适合记住稳定的项目命令、目录约定和长期偏好，却不该拿来充当环境快照。像「测试现在失败在第 42 行」这样的消息，应当留在当前 Session 或 Artifact（产物）里，因为文件很快会变，下次恢复时你仍要重新核对工作区。

跨会话知识进入新会话以后，Extension 还会刷新多个 Registry，从而改变这次运行真正能用的能力。下一篇会跟着 MCP Client Manager、Tool Registry、Hook System、Agent Registry 和 Skill Manager 依次往下看，弄清 Agents、Hooks、Skills 与 MCP 各自怎样进入当前 Session 的 Prompt 和工具面。

下一篇：[Agents、Hooks、Skills、MCP 与 Extensions](06-agents-hooks-skills-mcp.md)。
