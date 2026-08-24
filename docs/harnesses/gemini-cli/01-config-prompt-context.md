# Settings 怎样变成一次模型请求的 Prompt 与 Context

[返回 Gemini CLI 课程地图](README.md)

Gemini CLI 的配置来自 Schema 默认值、系统默认值、用户设置、工作区设置和系统设置。工作区是否受信还会改变它能否参与合并。合并后的 Settings 再进入 Core Config，后者才负责系统指令、项目上下文、工具声明和历史。

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

这里的顺序说明系统设置可以压过工作区，工作区又可以压过用户。但 Deep Merge 对数组、对象和特殊字段可能有 Schema 规则，不能把一个字段的行为外推到全部字段。

## 信任切换为什么需要重新计算

`LoadedSettings` 不能把未受信工作区内容直接丢掉，否则用户后来确认信任时只能重新读磁盘。它保留原始工作区文件，同时给外部暴露安全视图。

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

信任是一条能力边界：工作区文件不仅能影响主题，还可能影响工具、扩展和外部进程。先过滤再合并，避免恶意仓库在用户确认前改变执行面。

## 项目上下文不全放在 System Instruction

Core Config 把全局 Memory 与用户级项目 Memory 放进系统指令，把 Extension 与当前项目 Memory 放进首条用户消息。这样不同来源的优先级和缓存行为更清楚，也避免把会变化的工作区文本都塞进稳定系统前缀。

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

这也解释了为什么「GEMINI.md 文件存在」不够：目录必须受信，文件名必须被配置发现，内容必须成功读取，最终还要检查它被放在请求的哪个角色和位置。

## Tool Registry 也参与模型输入

模型只能请求当前 Function Declarations 中出现的工具。Plan Mode、Extension 或 Policy 变化可能改变活动工具表，因此 Prompt 不是纯文本字符串。

源码：[查看 Prompt Provider 的工具渲染测试](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/prompts/promptProvider.test.ts#L154-L206)

```typescript
// 覆盖多个 Context 文件名。
// 核对 Plan Mode Prompt 列出 ToolRegistry 中的活动工具。
```

排查模型「编造工具」时，应保存本次请求的 Function Declarations，而不是查看源码目录里有哪些 Tool Class。

## 一个失败测试任务的输入组成

用户在受信仓库里请求修复测试时：

1. 用户 Settings 选择模型和输出方式；系统策略仍能覆盖危险字段。
2. 工作区 Settings 与 GEMINI.md 只有在信任后生效。
3. 全局 Memory 进入系统指令，项目上下文进入首条用户消息。
4. Tool Registry 投影当前活动工具。
5. Session History 与本次用户输入组成 Turn 的模型请求。

下一篇：[Turn、Model Router 与 Scheduler](02-turn-scheduler-routing.md)。
