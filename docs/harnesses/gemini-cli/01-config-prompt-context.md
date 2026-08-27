# Settings 怎样变成一次模型请求的 Prompt 与 Context

[返回 Gemini CLI 课程地图](README.md)

课程地图先讲 Config/Prompt，再讲 Turn，是为了顺着程序真正组装请求的次序往下读。程序得先把有效配置、项目上下文、工具声明和历史拼好，才能发出一次模型请求。Gemini CLI 依次合并 Schema 默认值、系统默认值、用户设置、工作区设置和系统设置，工作区是否受信则直接决定这一层能不能并进来。五层 Settings 合完后，Core Config 再接着整理系统指令、项目上下文、工具声明和历史。

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

顺着这个合并顺序看，系统设置能覆盖工作区设置，工作区设置又能覆盖用户设置，不过 Deep Merge 遇到数组、对象或特殊字段时，仍会按各自的 Schema 规则处理。一个字段说明不了全部。

## 信任切换为什么需要重新计算

`LoadedSettings` 不能把未受信工作区的内容直接丢掉，否则用户后来确认信任，程序还得重新读取磁盘。它会把原始工作区文件留在内部，但对外只给出过滤后的安全视图。这样切换信任状态时，程序就能立即重算配置。

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

这里用信任状态拦住工作区配置，是因为工作区文件不只会改变主题，还能影响工具、扩展和外部进程。程序先过滤再合并，就是为了避免工作区配置赶在用户确认之前改动可执行能力，这道门必须守住。

## 项目上下文不全放在 System Instruction

Core Config 会把全局 Memory 和用户级项目 Memory 放进系统指令，再把 Extension 与当前项目 Memory 放进首条用户消息。这样一来，不同来源各自落在哪个优先级就很清楚。你也能判断哪些部分可以复用缓存，而经常变化的工作区文本不会挤进稳定的系统前缀。

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

`GEMINI.md` 出现在仓库里，只能证明文件存在，还说明不了它是否进入模型请求。你还得确认目录已经受信、配置找到了这个文件名、程序成功读出了内容，最后再看它究竟被放进请求里的哪个角色。

## Tool Registry 也参与模型输入

模型只能请求当前 Function Declarations 里列出的工具。Plan Mode、Extension 或 Policy 一变，Tool Registry（工具注册表）投给模型的活动工具也可能跟着变，所以 Prompt 不能只当成一串文本来看。

源码：[查看 Prompt Provider 的工具渲染测试](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/prompts/promptProvider.test.ts#L154-L206)

```typescript
// 覆盖多个 Context 文件名。
// 核对 Plan Mode Prompt 列出 ToolRegistry 中的活动工具。
```

排查模型为什么会「编造工具」时，你要保存这次请求真正带上的 Function Declarations。只看源码目录里有哪些 Tool Class，无法证明模型当时真的看见了它们。候选不等于可用。

## 一个失败测试任务的输入组成

用户在受信仓库里请求修复测试时：

1. 用户 Settings 选择模型和输出方式；系统策略仍能覆盖危险字段。
2. 工作区 Settings 与 GEMINI.md 只有在信任后生效。
3. 全局 Memory 进入系统指令，项目上下文进入首条用户消息。
4. Tool Registry 投影当前活动工具。
5. Session History 与本次用户输入组成 Turn 的模型请求。

走到这里，程序已经把有效 Settings、分层 Context、活动工具和 Session History 拼成了一次模型请求。下一篇跟着这次请求进入 Model Router、Turn 与 Scheduler，看模型怎样响应、工具怎样接手，以及会话到底在什么条件下结束。

下一篇：[Turn、Model Router 与 Scheduler](02-turn-scheduler-routing.md)。
