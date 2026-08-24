# Prompt、运行时 Context 与请求 Cache

[返回 DeepSeek Harness 课程地图](README.md)

模型一轮真正看见的内容不等于某一个 Prompt 文件。DeepSeek Harness 在每个 Step 重新组装有序 System Section、动态 Context、Tool Schema、变量和 Session 历史，再让模型 Adapter 补齐路由默认值并序列化成 Provider 请求。

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

把这五类全部叫「上下文」会让缓存和恢复分析失去精度。

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

保留结构而非立刻拼成字符串，使扩展可以替换某个命名 Section、排序 Tools 或审查 Context 来源。只有到模型请求边界才渲染最终文本。

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

complete Section 表示「用这一整段替代普通 Section 集合」。它适合特殊模式，但同时启用多个会使来源不明确，所以选择失败而不是猜优先级。

## 动态 Context 为什么进入消息而非 System 字符串

`preStep()` 会渲染 Context Sections，并通过 `RuntimeContextProjection` 生成上下文消息，再与 Inbox claim 的消息一起进入本 Step。这样 Session 可以区分真实用户输入和运行时投影，也能在 Context 变化时保持 System 前缀相对稳定。

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

运行时 Context 不应无条件重复追加。如果投影内容没变，Projection 可以避免制造等价消息；变更时再产生新的 Snapshot，帮助解释模型这一步看到了什么。

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

Tool 顺序也参与 Header 相等判断，因为 Provider 请求前缀和工具选择语义可能依赖顺序。仅比较 Tool 名称集合会漏掉 Schema 或排序变化。

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

`deepFreeze` 防止下游在发送期间悄悄修改同一个请求对象。Session 中的 Header 只在变化时追加，避免每 Step 重复保存大段相同 System 和 Tool Schema。

## Provider Cache 命中来自稳定前缀

DeepSeek Harness 没有在 Agent Loop 里创建一个名为「KV Cache」的本地模型缓存。它通过稳定、追加式的请求前缀让 Provider 能复用 Prompt Cache，并把 Provider 报告的命中 Token 转为统一 Usage。

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

该测试没有 Key 时会跳过，所以普通离线测试只能证明请求按追加历史构造，不能证明真实 Provider 一定命中。Cache 是可观察性能结果，不是「源码结构看起来稳定」就自动成立。

## 哪些变化最容易破坏前缀

- 每 Step 重排 Tool Schema；
- 在 System Prompt 前部加入随机时间或请求 ID；
- 用新字符串替换历史，而不是追加新消息；
- 模型或 Provider 路由变化；
- Compaction 重写前缀；
- Adapter 序列化在相同输入下不稳定。

缓存命中率下降时，先比较最终 Wire Request 的稳定前缀，再检查 Provider 报告，不能只看 Session Event 数量。

下一篇沿请求进入主循环：[Agent Loop：Turn、Step、模型流与工具结果](03-loop-model-tool.md)。
