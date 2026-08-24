# Coding Agent 怎样把 Prompt、Tools、Session 与 Extensions 装起来

[返回 pi 课程地图](README.md)

Agent Core 不知道「编码任务」是什么。`packages/coding-agent` 通过 SDK 组合 Model Runtime、Settings、Session Manager、Resource Loader、内建工具和 Extension，再把它们交给 Agent Core。

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

先 Reload 资源再开始模型请求，避免工具表已经更新但 Prompt 仍描述旧工具。运行中动态刷新也要同步更新两者。

### 装配顺序为什么会影响模型行为

模型输入中的自然语言指南、Tool Schema 和实际 Tool Registry 必须来自同一资源快照。若先构造 Prompt，随后 Extension 又替换工具，模型可能依据旧说明调用已经不存在的名称；若只更新 Schema，不更新 Context File 或 Skill，模型又可能继续遵循过期工作流。装配不是启动样板代码，而是在定义本次 Session 的能力边界。

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

自定义工具若没有 Prompt Snippet，可能可调用却没有出现在文字指南里；Schema 仍是模型调用的正式接口。反过来，Prompt 中的谨慎措辞不是权限强制。

## Resource Loader 生成的是一次一致快照

Reload 同时处理 Package、项目 Trust、Extension、Skill、Prompt Template、Theme、Context File 和 Prompt Override。`noExtensions`、`noSkills`、`noPromptTemplates` 分别控制不同来源，不能把一个开关理解成「所有扩展资源都关闭」。

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

Extension Loader 收集 Handler、Tool、Command 和 Provider；Runner 按加载顺序调用它们。Tool Call Handler 可以 Block，Tool Result Handler 可以改写 Content、Details、Error 和 Usage，Context Handler 的输出继续传给下一个 Extension。

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

Extension 是高信任进程内代码。它可以注册新 Provider 或工具，权限等同于宿主进程；来源审计和外部隔离不能由 Prompt 代替。

## 三种扩展作用不要混在一起

Extension 可以增加能力、改变控制流，也可以改变模型观察：注册 Tool 属于增加能力，`beforeToolCall` 阻断属于控制流，Context Handler 改写 Messages 属于观察变换。审计时必须分别记录「模型原本提出什么」「扩展允许执行什么」「模型最终看见什么」，否则一个 Extension 就能让 Trace 同时失去原始意图和真实结果。

## 回到运费任务

项目 Context 可以告诉模型测试命令，Skill 可以说明仓库的修复流程，Tool Registry 暴露 `read`、`edit` 和 `bash`。一个安全 Extension 可以在编辑测试文件前阻断调用，但它不能只修改返回文本说「已阻断」而实际仍执行写入。调用前 Hook 决定副作用是否发生，调用后 Hook 只影响结果投影，两者的责任不同。

## 练习：找出不一致快照

资源刷新后，System Prompt 仍写着「使用 `patch` 工具」，Tool Schema 却只有 `edit`。这不是模型能力问题。应检查 Prompt Builder 与工具注册是否消费了同一轮 Resource Loader 结果，并为刷新路径增加回归测试。

<details>
<summary>查看核对要点</summary>

可核对测试应同时断言活动工具名、Prompt 中相关指南和实际 Registry。只断言 `edit` 能执行，仍无法发现模型被旧 Prompt 引导去调用 `patch`。

</details>

下一篇：[Session Tree、Compaction 与 JSONL](04-session-compaction-storage.md)。
