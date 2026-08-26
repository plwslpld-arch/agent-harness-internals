# Settings 怎样变成一次模型请求的 Prompt 与 Context

[返回 Gemini CLI 课程地图](README.md)

课程地图把 Config/Prompt 放在 Turn 之前，是因为一次模型请求要先从有效配置、项目上下文、工具声明和历史中组装出来。Gemini CLI 的配置来自 Schema 默认值、系统默认值、用户设置、工作区设置和系统设置这五层，而工作区是否受信还会决定它能不能参与合并。等这些 Settings 合并完，Core Config 才会接手系统指令、项目上下文、工具声明和历史。

```text
Schema 默认 → 系统默认 → 用户 → 受信工作区 → 系统策略
                                   ↓
                              有效 Settings
                                   ↓
                    系统指令 / 首条用户上下文 / Tools
                                   ↓
                               模型请求
```

## 第 1 站：未受信工作区先被过滤，再参与合并

源码：[查看 Settings 合并](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/config/settings.ts#L253-L279)

```typescript
const safeWorkspace = isTrusted ? workspace : ({} as Settings)
return customDeepMerge(
  schemaDefaults,
  systemDefaults,
  user,
  safeWorkspace,
  system,
)
```

- **调用者**：CLI 设置加载器计算本次运行的合并视图。
- **输入**：各层 Settings 与工作区信任状态。
- **状态变化**：未受信工作区变成空贡献；其余层按顺序深合并。
- **返回**：`merged` Settings。
- **下一站**：CLI Config 把字段传给 Core Config、Policy、Sandbox 和 UI。

从这个顺序可以读出，系统设置能够压过工作区，工作区又能够压过用户，但 Deep Merge 处理数组、对象和特殊字段时还可能遵循各自的 Schema 规则。看懂一个字段，并不等于看懂所有字段。

## 信任切换为什么需要重新计算

`LoadedSettings` 不能直接丢掉未受信工作区的内容，否则用户后来确认信任时，程序就只能重新读取磁盘。它会保留原始工作区文件，同时只向外部暴露经过过滤的安全视图。

### 第 2 站：原始文件与有效工作区分开保存

源码：[查看 `LoadedSettings`](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/config/settings.ts#L313-L389)

```typescript
this._workspaceFile = workspace
this.workspace = isTrusted
  ? workspace
  : this.createEmptyWorkspace(workspace)

setTrusted(isTrusted) {
  // 更新安全视图并重新计算 merged
}
```

- **调用者**：目录信任 UI 或启动流程。
- **输入**：新的信任决定。
- **状态变化**：切换 Workspace 安全视图，重新生成合并 Settings。
- **返回**：后续消费者读取到新的有效配置。
- **下一站**：Extension、MCP、Hooks 和 Prompt 根据新配置刷新。

信任在这里划出了一条能力边界，因为工作区文件除了能改变主题，还可能影响工具、扩展和外部进程，所以程序必须先过滤再合并，避免恶意仓库在用户确认前改变执行面。

## 项目上下文不全放在 System Instruction

Core Config 会把全局 Memory 与用户级项目 Memory 放进系统指令，而 Extension 与当前项目 Memory 则进入首条用户消息。这样既能分清不同来源的优先级和缓存行为，也不会把经常变化的工作区文本全塞进稳定的系统前缀。

### 第 3 站：按来源选择注入层

源码：[查看项目指令分层](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/config/config.ts#L2573-L2613)

```typescript
// Global memory and user project memory go in the system instruction.
// Extension and project memory are placed in the first user message.
```

- **调用者**：Core Config 初始化 Prompt Provider 与 Gemini Client。
- **输入**：全局、用户、Extension 和工作区项目上下文。
- **状态变化**：按来源分组，并生成不同角色的 Prompt 片段。
- **返回**：System Instruction 与首条 User Context。
- **下一站**：Turn 把历史和当前输入接在这些片段之后。

所以，只确认「GEMINI.md 文件存在」远远不够。目录必须受信，配置必须发现这个文件名，内容也必须读取成功，最终还要核对一个容易漏掉的位置——它究竟进入了请求里的哪个角色。

## Tool Registry 也参与模型输入

模型只能请求当前 Function Declarations 里出现的工具，而 Plan Mode、Extension 或 Policy 一旦发生变化，活动工具表也可能跟着改变，因此 Prompt 从来不只是一个纯文本字符串。

源码：[查看 Prompt Provider 的工具渲染测试](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/prompts/promptProvider.test.ts#L154-L206)

```typescript
// 覆盖多个 Context 文件名。
// 核对 Plan Mode Prompt 列出 ToolRegistry 中的活动工具。
```

排查模型为什么会「编造工具」时，应该保存本次请求实际携带的 Function Declarations，而不能只看源码目录里存在哪些 Tool Class。

## 一个失败测试任务的输入组成

用户在受信仓库里请求修复测试时：

1. 用户 Settings 选择模型和输出方式；系统策略仍能覆盖危险字段。
2. 工作区 Settings 与 GEMINI.md 只有在信任后生效。
3. 全局 Memory 进入系统指令，项目上下文进入首条用户消息。
4. Tool Registry 投影当前活动工具。
5. Session History 与本次用户输入组成 Turn 的模型请求。

走到这里，有效 Settings、分层 Context、活动工具与 Session History 已经共同组成模型请求。下一篇会沿着这次请求进入 Model Router、Turn 与 Scheduler，继续辨认模型响应、工具调用和会话结束之间的边界。

下一篇：[Turn、Model Router 与 Scheduler](02-turn-scheduler-routing.md)。
