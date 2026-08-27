# 交互 CLI、非交互输出、IDE 与 A2A 如何投影同一运行

[返回 Gemini CLI 课程地图](README.md)

上一节讲到，启用、停用或重载 Extension 时，系统会一起刷新 MCP Client Manager、Tool Registry（工具注册表）、Hook System、Agent Registry 和 Skill Manager。运行时能力刷新以后并不会原样摆到使用者面前，交互终端、非交互命令、IDE 集成和 A2A Server 都会挑选、转换或忽略 Core Events，并按各自的方式表示身份和停止。它们虽然复用了部分 Core，对外遵循的却不是同一套事件契约。

```text
Core Agent Events
  ├→ 交互 UI：消息、思考、工具卡片、确认
  ├→ 非交互：text / json / stream-json
  ├→ IDE：编辑器上下文、Diff 请求与响应
  └→ A2A：Task、Message、Artifact、Status Update
```

## stream-json 是一个有意收窄的公共协议

### 第 1 站：公开事件集合小于 Core Agent Events

源码：[查看输出事件类型](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/output/types.ts#L29-L37)

```typescript
enum JsonStreamEventType {
  INIT,
  MESSAGE,
  TOOL_USE,
  TOOL_RESULT,
  ERROR,
  RESULT,
}
```

- **调用者**：非交互 Session 的 Stream Formatter。
- **输入**：Core Agent Events 与 Session 元数据。
- **状态变化**：映射为稳定、可逐行消费的公共事件。
- **返回**：JSON Lines。
- **下一站**：Shell、CI 或 SDK 客户端按类型解析。

公共协议有意藏起一部分内部生命周期，所以维护兼容性更容易，但你也无法只靠这些公开事件还原 Scheduler 的完整状态。

## 第 2 站：非交互消费者显式忽略部分事件

源码：[查看非交互忽略列表](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/nonInteractiveCliAgentSession.ts#L675-L684)

```typescript
case 'initialize':
case 'session_update':
case 'agent_start':
case 'tool_update':
case 'elicitation_request':
case 'elicitation_response':
case 'usage':
case 'custom':
  // Explicitly ignore these non-interactive events.
```

- **调用者**：非交互 Session 的事件循环。
- **输入**：完整 Agent Event Stream。
- **状态变化**：对不支持的交互事件不产生输出。
- **返回**：只包含该表面契约允许的信息。
- **下一站**：Formatter 生成 Text、JSON 或 Stream JSON。

交互 UI 会显示工具进度，非交互 JSON 却可能只给出开始和最终结果，所以自动化程序不能一直等协议明确不会发送的 `tool_update`。

## 同一消息在三种格式中走不同路径

源码：[查看消息输出分支](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/nonInteractiveCliAgentSession.ts#L449-L470)

```typescript
if (streamFormatter) {
  // 立即发 MESSAGE delta
} else if (outputFormat === JSON) {
  responseText += output
} else {
  textOutput.write(output)
}
```

- **调用者**：非交互 Session 处理模型消息事件。
- **输入**：文本 Delta 与输出格式。
- **状态变化**：Stream 模式立即输出；JSON 聚合到最终对象；Text 写标准输出。
- **返回**：不同序列化时机的同一模型内容。
- **下一站**：进程结束时输出 RESULT/最终 JSON 与 Exit Code。

如果选择 JSON，你拿到的是聚合后的结果，不该期待实时 Token。如果选择 Stream JSON，就得处理逐行到来的事件，还要接住中途出现的 Error。

## IDE Diff 是一次独立请求/响应协议

### 第 3 站：按文件路径等待编辑器接受或拒绝

源码：[查看 IDE Diff 交互](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/ide/ide-client.ts#L204-L278)

```typescript
name: `openDiff`
this.diffResponses.set(filePath, resolve)
promise.finally(release)
```

- **调用者**：需要用户在 IDE 审阅文件变更的工具。
- **输入**：File Path、旧/新内容或 Diff 信息。
- **状态变化**：注册该文件的待响应 Promise，发送 IDE Tool Call。
- **返回**：接受、拒绝或连接/取消错误。
- **下一站**：Tool Executor 根据决定提交或撤销修改。

用户在 IDE 里接受 Diff，只表示同意这次变更，不能拿它给代码正确性打分，这两件事不能混。

## A2A 拥有自己的任务状态机

A2A Server 对外用 Task ID、Context ID、Message、Artifact（产物）和 Status Update 描述任务，远程客户端则可能看到 `input-required`、`completed` 或 `failed`。A2A 会用这些值标出 Task 最后停在哪种状态，但它们对不上内部 Tool Call 的状态，两层含义不能混。

调用远程 Agent 时，你要同时保存协议 Task ID 和本地父 Session/Call ID，这样才能从父工具请求一路追到远程 Artifact。即便网络请求成功，也只能说明双方完成了协议交换，业务有没有做成还得查 Task State 和 Artifact。

## 自动化应选择哪种表面

- 只要最终文本：Text 最简单，但证据最少。
- 需要结构化最终统计：JSON。
- 需要实时工具与错误事件：Stream JSON。
- 需要编辑器上下文和人工 Diff：IDE。
- 需要跨进程 Agent 互操作：A2A。

到这里，你已经看过 stream-json 公开哪些事件、非交互消费者丢掉哪些事件，也看过同一条消息怎样分别写进 Stream JSON、JSON 和 Text。IDE Diff 会停下来等用户接受或拒绝，A2A 则要继续检查 Task State 与 Artifact，光看网络请求成功远远不够，这几条路径不能直接互换。不同表面可以跑同一个任务，但做评测时必须锁定表面和版本，也不能把 UI 文本与 A2A Artifact 当成完全相同的输入。等这些边界固定下来，下一篇再看 Telemetry 能从模型请求、Tool Call 和运行指标里解释哪些失败，又有哪些任务答案、评分准则与发布阈值必须由独立 Eval 判断。

下一篇：[Telemetry、错误分类与 Eval 接缝](08-telemetry-errors-eval-design.md)。
