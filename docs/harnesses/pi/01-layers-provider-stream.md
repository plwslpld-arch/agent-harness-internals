# 从 AI 包到 Agent Core，再到 Coding Agent

[返回 pi 课程地图](README.md)

pi 最适合按「分层组合」的思路来读，因为 `packages/ai` 先统一模型、消息和流，`packages/agent` 再提供与编码无关的最小 Agent Loop，最后由 `packages/coding-agent` 加入文件、Shell、Prompt、Session、Extension 和交互表面。

```text
Coding Agent：编码工具、Prompt、Session、TUI/RPC
                     ↓
Agent Core：状态、队列、Loop、Tool Events
                     ↓
AI：Provider、Model、Message、Event Stream
```

这三层解决的问题并不相同：AI Stream 收敛时，只能说明一次模型响应已经完成，等到当前队列与工具批次都收敛之后，Agent Loop 才算结束，而 Coding Agent 还要继续照管会话、工作区和产品输出。

## 第 1 站：共同类型保留统一字段和 Provider 身份

源码：[查看 AI 消息与停止类型](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/ai/src/types.ts#L372-L467)

```typescript
export interface ToolCall {
  type: 'toolCall'
  id: string
  name: string
  arguments: Record<string, any>
}

export type StopReason =
  | 'pending' | 'stop' | 'length' | 'toolUse'
  | 'error' | 'aborted' | 'deferred'

export interface AssistantMessage {
  provider: ProviderId
  model: string
  usage: Usage
  stopReason: StopReason
}
```

- **调用者**：具体 Provider Adapter 生成流事件，Agent Core 消费 Assistant Message。
- **输入**：各模型 SDK 的 Chunk、Tool Call、Usage 和原始结束原因。
- **状态变化**：把 Provider 差异归一到共同 Message/Event 形状，同时保留 Provider 与 Model。
- **返回**：Agent Core 不依赖某一家 SDK 的 Stream。
- **下一站**：Agent Loop 根据 StopReason 与 Tool Calls 决定执行工具还是结束本次采样。

统一类型虽然降低了上层的复杂度，却也会压缩 Provider 之间的差异——因此在调试性能或排查错误时，仍应保留原始 HTTP 状态、Provider Stop Reason 和经过安全处理的响应详情。差异还得留下。

### 为什么不是让 Agent Core 直接调用每家 SDK

Agent Loop 真正关心的是「有哪些消息块、有没有工具调用、为什么停止、花了多少资源」，而不是每家 SDK 如何命名 Chunk 类。如果 Core 直接按 Provider 写分支，那么每新增一种模型，认证、流解析和循环代码都要跟着修改，就连错误处理也很难保持一致。统一层会把变化隔离在 Adapter 内，但 Provider 特有的缓存、推理块或安全终止不能因此被抹掉，它们仍要通过扩展字段或诊断信息保留下来。

## 第 2 站：模型目录、Provider 实现和认证缺一不可

源码：[查看 Models 路由](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/ai/src/models.ts#L628-L679)

```typescript
const provider = this.providers.get(model.provider)
if (!provider) throw new ModelsError('provider', ...)

const resolution = await this.getAuth(model, ...)
if (!resolution) throw new ModelsError('auth', ...)

return provider.stream(requestModel, context, requestOptions)
```

- **调用者**：Agent Loop 需要一次模型流时调用 Models Runtime。
- **输入**：Model Entry、消息 Context、认证选项与 AbortSignal。
- **状态变化**：查 Provider 实现并解析认证；尚未产生 Agent 消息副作用。
- **返回**：统一的 Assistant Event Stream，或 Provider/Auth 错误。
- **下一站**：Agent Loop 订阅 start、text、thinking、toolcall、done/error。

模型出现在目录里，只能证明它的元数据可以被发现，因为 Provider 尚未注册、认证缺失、区域不可用或 API 不兼容等问题，都可能让请求在真正建立 Stream 之前就失败。

## 事件流的终态只属于一次模型响应

事件流工具只会把 `done` 和 `error` 识别为终结事件，但在 `done` 之前仍可能产生 Tool Call，而 Agent Core 一旦收到这种调用，就要执行工具并再次调用模型。因此，`done` 不是整个任务的完成信号。

源码：[查看 Event Stream 实现](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/ai/src/utils/event-stream.ts#L1-L88)

```typescript
// start / thinking / text / toolcall 是中间事件。
// done 与 error 关闭本次流。
```

- **调用者**：Provider Adapter 推送事件，Agent Loop 异步迭代。
- **输入**：统一 Assistant Stream Events。
- **状态变化**：累积一条 Assistant Message 并向观察者广播增量。
- **返回**：流终态中的 Assistant Message 或 Error。
- **下一站**：Agent Loop 检查 Tool Calls、StopReason 与队列。

## 不要把新的 Harness Scaffold 当成现行主循环

锁定版本里还有一个面向未来接口的 `AgentHarness` Scaffold，只是其中多项操作都会明确抛出 `HarnessNotImplemented`，所以当前真正可工作的调用链仍然是 `Agent` + `agent-loop.ts`。

源码：[查看未实现错误](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/agent-harness.ts#L74-L81)

```typescript
export class HarnessNotImplemented extends Error {
  constructor(operation: string) {
    super(`AgentHarness.${operation} is not implemented yet`)
  }
}
```

设计文档能帮我们理解目标方向，但在分析实际运行行为时，还是应当沿着现行 Agent Loop 追踪，然后用测试确认对应版本确实执行了这条路径。

## 回到运费任务

用户任务进入 Coding Agent 后，由 `packages/coding-agent` 选择模型和工具，而 Agent Core 只会收到已经归一化的 Context、Model 与 Tool Definitions。当模型流产生 `read` Tool Call 时，AI 层会先把供应商事件还原成共同 Tool Call，然后才由 Agent 层决定是否执行。即使 Provider 流以 `done` 结束，只要消息中还有 Tool Call，整个任务就没有结束。

## 练习：判断是哪一层的问题

如果模型目录里能看到目标模型，但运行时报「没有认证」，而另一台机器能完成模型响应，却找不到 `edit` 工具，就不能把两种失败都归因于 Agent Loop。前者应先查 AI 层的 Provider/Auth 路由，后者则应查 Coding Agent 的工具装配。

<details>
<summary>查看核对要点</summary>

模型可以被发现，不代表 Provider 已经注册且凭据能够解析，所以 AI 层应在发流之前给出类型化错误。`edit` 则属于 Coding Agent 的工具集合，Agent Core 只消费已经传入的工具表。分层的价值就在这里。

</details>

下一篇：[Agent Loop、双队列与工具批次](02-agent-loop-tools.md)。
