# Coding Agent 怎样把 Prompt、Tools、Session 与 Extensions 装起来

[返回 pi 课程地图](README.md)

Agent Core 本身并不知道「编码任务」意味着什么，所以 `packages/coding-agent` 要先通过 SDK 组合 Model Runtime、Settings、Session Manager、Resource Loader、内建工具和 Extension，然后再把它们交给 Agent Core。

```text
Settings + Model Runtime + Session Manager
                 ↓
            Resource Loader
      ┌──────────┼──────────┐
  Context      Skills    Extensions
      └──────────┼──────────┘
         System Prompt + Tools
                 ↓
             Agent Core
```

## 第 1 站：装配先建立服务，再加载资源快照

源码：[查看 `createAgentSession()` 装配](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/sdk.ts#L171-L186)

```typescript
const modelRuntime = options.modelRuntime ?? await ModelRuntime.create(...)
const settingsManager = options.settingsManager ?? SettingsManager.create(...)
const sessionManager = options.sessionManager ?? SessionManager.create(...)

resourceLoader = new DefaultResourceLoader(...)
await resourceLoader.reload()
```

- **调用者**：CLI、RPC Server 或嵌入 SDK 创建 Coding Agent Session。
- **输入**：工作目录、模型/设置覆盖、Session 选择和临时 Extensions。
- **状态变化**：创建或复用运行时服务，加载当前资源快照。
- **返回**：可 Prompt、Steer、Compact、Fork 的 Agent Session。
- **下一站**：Prompt Builder 按活动工具和资源生成模型指令。

在模型请求开始之前先 Reload 资源，才能避免工具表已经更新、Prompt 却还在描述旧工具的错位，而运行中一旦发生动态刷新，两者也必须同步更新。

### 装配顺序为什么会影响模型行为

模型输入里的自然语言指南、Tool Schema 和实际 Tool Registry 必须来自同一份资源快照。如果先构造 Prompt，随后 Extension 又替换了工具，模型就可能按照旧说明，去调用一个已经不存在的名称。反过来，如果只更新 Schema，却不更新 Context File 或 Skill，模型又可能继续遵循过期的工作流。因此装配不是一段可有可无的启动样板代码——它实际上定义了本次 Session 的能力边界。

## 第 2 站：System Prompt 根据活动工具生成

源码：[查看 Prompt Builder](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/system-prompt.ts#L79-L119)

```typescript
const tools = selectedTools || ['read', 'bash', 'edit', 'write']
const visibleTools = tools.filter((name) => !!toolSnippets?.[name])

for (const guideline of promptGuidelines ?? []) {
  // Trim、去重并追加指南
}
```

- **调用者**：Session 创建与资源/工具变化后的 Prompt 构造。
- **输入**：活动工具名、工具摘要、指南、项目 Context、Skills 和 CWD。
- **状态变化**：生成只描述实际可见工具的 System Prompt。
- **返回**：Agent Core 使用的系统指令字符串。
- **下一站**：模型请求与 Tool Schema 一起发送。

如果自定义工具没有 Prompt Snippet，它可能已经能被调用，却没有出现在文字指南里，因为 Schema 才是模型调用工具的正式接口。反过来，Prompt 里写得再谨慎，也不等于权限得到了强制。

## Resource Loader 生成的是一次一致快照

Reload 会在同一轮处理 Package、项目 Trust、Extension、Skill、Prompt Template、Theme、Context File 和 Prompt Override，但 `noExtensions`、`noSkills`、`noPromptTemplates` 各自控制的来源并不相同，所以不能把其中一个开关理解成「所有扩展资源都关闭」。

源码：[查看 Resource Loader](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/resource-loader.ts#L1-L240)

```typescript
// reload() 解析各资源来源，形成当前 Session 使用的快照与诊断。
```

- **调用者**：SDK 装配、配置变化和显式 Reload。
- **输入**：Trust、Packages、CLI 临时 Extension 与资源开关。
- **状态变化**：替换当前资源集合并保存加载诊断。
- **返回**：Extensions、Skills、Prompts、Context 与 Theme。
- **下一站**：Extension Runner、Prompt Builder 与 Command Registry。

## Extension 可以改写调用前后与 Context

Extension Loader 会收集 Handler、Tool、Command 和 Provider，然后由 Runner 按加载顺序逐个调用。在这条链上，Tool Call Handler 可以 Block，Tool Result Handler 可以改写 Content、Details、Error 和 Usage，而 Context Handler 的输出会继续传给下一个 Extension。

源码：[查看 Extension Runner](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/extensions/runner.ts#L1-L260)

```typescript
// Tool Call handlers 顺序执行，block 时停止。
// Tool Result 与 Context handlers 以前一项输出作为后一项输入。
```

- **调用者**：Agent Core 的 Before/After Tool Hook 与 Context Transform。
- **输入**：Tool Call、Tool Result 或消息副本。
- **状态变化**：可能阻断副作用、改写模型可见结果或 Context 投影。
- **返回**：最终 Block 决定、Result 或 Messages。
- **下一站**：Tool Executor、Session History 或模型请求。

Extension 属于高信任的进程内代码，因为它既可以注册新 Provider 或工具，又拥有与宿主进程等同的权限，所以必须单独审计来源并做好外部隔离。Prompt 代替不了这些措施。

## 三种扩展作用不要混在一起

Extension 既可以增加能力，也可以改变控制流和模型观察：注册 Tool 属于增加能力，用 `beforeToolCall` 阻断属于改变控制流，通过 Context Handler 改写 Messages 则属于观察变换。正因为这三种作用可以叠加，审计时才必须分别记录「模型原本提出什么」「扩展允许执行什么」和「模型最终看见什么」，否则一个 Extension 就能让 Trace 同时失去原始意图和真实结果。

## 回到运费任务

在运费任务里，项目 Context 可以告诉模型如何运行测试，Skill 可以说明仓库的修复流程，Tool Registry 则暴露 `read`、`edit` 和 `bash`。安全 Extension 可以在编辑测试文件之前阻断调用，但它不能只把返回文本改成「已阻断」，实际上却仍然执行写入。调用前 Hook 决定副作用是否发生，而调用后 Hook 只影响结果投影。两者责任不同。

## 练习：找出不一致快照

资源刷新之后，如果 System Prompt 还写着「使用 `patch` 工具」，Tool Schema 里却只有 `edit`，问题就不在模型能力，而在资源快照已经失去一致性。此时应检查 Prompt Builder 与工具注册是否消费了同一轮 Resource Loader 结果，并为刷新路径增加回归测试。

<details>
<summary>查看核对要点</summary>

一条可核对的测试，应当同时断言活动工具名、Prompt 里的相关指南和实际 Registry，因为只断言 `edit` 能够执行，仍然发现不了模型被旧 Prompt 引导去调用 `patch` 的问题。

</details>

下一篇：[Session Tree、Compaction 与 JSONL](04-session-compaction-storage.md)。
