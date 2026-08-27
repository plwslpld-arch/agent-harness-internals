# Prompt、运行时 Context 与请求 Cache

[返回 DeepSeek Harness 课程地图](README.md)

模型在一轮中真正看到的内容，并不来自某一个 Prompt 文件。

DeepSeek Harness 会在每个 Step 重新收集并排列 System Prompt 的 Section（区段）、动态 Context、Tool Schema、变量和 Session 历史。

随后，模型 Adapter（适配器）会补齐路由的默认值，再把这些内容序列化为 Provider（模型提供商）请求。

## 模型输入由五部分组成

```text
System Sections
+ 动态 Context Snapshot
+ Session 派生 Messages
+ Tool Schemas
+ Provider / Model / 采样与推理参数
= 一次冻结的 GenerateOptions
```

- Section 通常是稳定规则，如 Persona、工具使用说明和项目指令。
- Context 是每 Step 变化的运行信息，如工作区、计划状态或外部投影。
- Messages 从追加式 Session Event 派生。
- Tools 来自 Agent Scope 中已注册的工具集合。
- Adapter Defaults 取决于精确 Provider 与 Model。

不要把这五类内容都统称为「上下文」。它们进入请求的位置和变化频率不同，如果混在一起谈，后面就无法准确分析缓存与恢复行为。

### 第 1 站：SystemPrompt Registry 保留结构化 Assembly

源码：[查看 PromptAssembly 类型](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/system-prompt/src/index.ts#L87-L120)

```typescript
export interface PromptAssembly {
  sections: AssembledSection[]
  contexts: AssembledContext[]
  tools: ToolSchema[]
  variables: Record<string, string | undefined>
}
```

- **调用者**：Agent Loop 的 `preStep()` 调用 `systemPrompt.assemble()`。
- **输入**：当前 Agent Scope、AbortSignal 和各插件注册的 Section、Context、Tool Provider、变量。
- **状态变化**：Registry 收集并排序贡献项，但不直接写 Session。
- **返回**：仍保持 Section/Context 边界的 `PromptAssembly`。
- **下一站**：Loop 分别渲染 System Prompt 与 Context Snapshot，再把 Context 作为用户侧消息投影。

Assembly 会保留 Section、Context 和 Tools 的结构，这一步仍未生成最终文本。因此，扩展仍然能替换某个具名 Section、调整 Tools 顺序，或者检查 Context 由谁提供，只到模型请求的边界才把它们渲染成最终文本。

### 第 2 站：同名 Scoped Section 可以覆盖全局项

源码：[查看 `assemble()` 合并规则](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/system-prompt/src/index.ts#L459-L539)

```typescript
const sectionByName = this.layers.merge(scope, layer => layer.sections)
const sectionDefinitions = [...sectionByName.values()]
  .sort((a, b) => a.order - b.order)

const completeSections = sectionDefinitions.filter(
  section => section.complete === true,
)
if (completeSections.length > 1) throw new Error(...)
```

- **调用者**：每个模型 Step 的 `preStep()`。
- **输入**：全局与 Agent Scope 的多层 Registry。
- **状态变化**：同名 Scoped 项遮蔽 Global；Section 按 order 稳定排序；Waterfall 可以转换 Assembly。
- **返回**：唯一有效的 Assembly；多个 complete Section 同时生效会失败。
- **下一站**：`renderPrompt()` 严格插值变量并去掉空 Section。

complete Section 的含义是「用这一整段取代普通 Section 集合」，适合需要全面接管 Prompt 的特殊模式。如果同时启用多个 complete Section，系统就无法确定该选哪一段，因此会直接报错，不会自行猜测优先级。

## 动态 Context 为什么进入消息而非 System 字符串

`preStep()` 先渲染 Context Sections，再交给 `RuntimeContextProjection` 生成上下文消息，然后连同 Inbox claim 到的消息一起送入当前 Step。这样处理后，Session 可以分别记录真实的用户输入和运行时投影，Context 变化时也不必改动相对稳定的 System 前缀。

源码：[查看 Step 前组装](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L225-L243)

```typescript
const claimed = this.inbox.claim(target, position.turn)
const assembly = await this.loopCtx.systemPrompt.assemble(...)
const sections = renderContextSections(assembly)
const context = this.runtimeContext.project(
  joinContextSections(sections),
  sections,
)
```

Projection 只有在内容真正改变时才生成新的 Snapshot（快照），不会为每个 Step 重复追加含义相同的运行时 Context，因此你仍能追溯模型在该 Step 看到的信息。

### 第 3 站：请求 Header 把会影响前缀的配置做成快照

源码：[查看 Request Header 规范化](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/request-header.ts#L15-L68)

```typescript
export function canonicalHeader(header: EpochHeader): EpochHeader {
  return {
    config: header.config,
    ...header.system?.length ? { system: header.system } : {},
    ...header.tools?.length ? { tools: header.tools } : {},
  }
}

export function foldRequestHeader(events, from?) {
  let state = from
  for (const event of events) {
    if (event.type === 'request/header') state = canonicalHeader(event.data.header)
  }
  return state
}
```

- **调用者**：Agent Loop 构建请求时创建 Header；Session 恢复与诊断折叠 Header Event。
- **输入**：模型路由配置、System Prompt、Tool Schema 和 Adapter Defaults。
- **状态变化**：空 System/Tools 被规范为缺省字段；最新 Header 可从 Event Log 重建。
- **返回**：稳定的 `EpochHeader` 或日志中最近快照。
- **下一站**：Loop 比较旧 Header，只在初始、恢复或变化时追加新事件。

Header 判断两次请求是否相等时，还要比较 Tool 的顺序，因为 Provider 请求前缀和工具选择的含义都可能受这个顺序影响。如果只对比 Tool 名称的集合，Schema 或排序发生的变化就会被漏掉。

### 第 4 站：Loop 冻结最终 GenerateOptions

源码：[查看 `buildRequest()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L426-L513)

```typescript
preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig, signal)

const header = canonicalHeader({
  config,
  ...system ? { system } : {},
  ...tools.length > 0 ? { tools } : {},
})

const request = markAgentLoopRequest(deepFreeze({
  ...header.config,
  messages: boundaryMessages,
  ...header.system !== undefined ? { system: header.system } : {},
  ...header.tools !== undefined ? { tools: header.tools } : {},
  sessionId: this.session.id,
  signal,
}))
```

- **调用者**：每个 Step 的模型流开始前。
- **输入**：路由种子、Waterfall 修改、Prompt、Tools、Session Messages 和 AbortSignal。
- **状态变化**：精确 Adapter 解析默认值；Header 与 Request Context 的变化追加进 Session。
- **返回**：冻结的 GenerateOptions，以及可选 PreparedCall。
- **下一站**：Prepared Adapter 或 LLM Registry 将它序列化并发起流请求。

`deepFreeze` 冻结最终请求对象，防止下游在发送期间继续修改同一份数据。Session 也只在 Header 发生变化时追加新事件，因此无需在每个 Step 重复保存大段相同的 System 和 Tool Schema。

## Provider Cache 命中来自稳定前缀

DeepSeek Harness 的 Agent Loop 没有在本地创建名为「KV Cache」的模型缓存。它会尽量保持请求前缀稳定，并在历史末尾追加新内容，从而给 Provider 复用 Prompt Cache 的机会，然后再把 Provider 报告的命中 Token 统一记入 Usage。

### 第 5 站：真实 API 测试检查第二次以后命中

源码：[查看请求 Cache 端到端测试](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/tests/request-cache.e2e.ts#L71-L100)

```typescript
const usages = [...agent.session.events]
  .filter(e => e.type === 'assistant/message')
  .map(e => e.data.usage)

for (const usage of usages.slice(1)) {
  expect(usage!.cacheReadTokens ?? 0).toBeGreaterThan(0)
}
```

- **调用者**：带真实 API Key 的可选端到端测试。
- **输入**：长 System Prompt、含 ToolCall 的两 Step Turn 和后续 Turn。
- **状态变化**：真实 Provider 请求发生，Usage 被记录到 Assistant Message Event。
- **返回**：测试断言首个请求之后都报告 Cache Read Token。
- **下一站**：性能分析使用 Usage 评估前缀稳定性和成本。

没有 Key 时，这项真实 API 测试会直接跳过，所以普通离线测试只能证明 Harness 按追加式历史构造请求，无法证明真实 Provider 一定会命中缓存。缓存命中必须实测。Cache 是一项需要在真实请求中观测的性能结果，不能仅凭「源码结构看起来稳定」就认定已经命中。

## 哪些变化最容易破坏前缀

- 每 Step 重排 Tool Schema
- 在 System Prompt 前部加入随机时间或请求 ID
- 用新字符串替换历史，而不是追加新消息
- 模型或 Provider 路由变化
- Compaction 重写前缀
- Adapter 序列化在相同输入下不稳定

缓存命中率下降时，先比较两次最终 Wire Request 的前缀在哪里开始分叉，再回看 Provider 报告的命中数据。Session Event 有多少条，本身并不能说明缓存是否命中。

下一篇沿请求进入主循环：[Agent Loop：Turn、Step、模型流与工具结果](03-loop-model-tool.md)。
