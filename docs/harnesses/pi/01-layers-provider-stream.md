# 从 AI 包到 Agent Core，再到 Coding Agent

[返回 pi 课程地图](README.md)

pi 最适合用「分层组合」来读：`packages/ai` 统一模型、消息和流；`packages/agent` 提供与编码无关的最小 Agent Loop；`packages/coding-agent` 再加入文件、Shell、Prompt、Session、Extension 和交互表面。

```text
Coding Agent：编码工具、Prompt、Session、TUI/RPC
                     ↓
Agent Core：状态、队列、Loop、Tool Events
                     ↓
AI：Provider、Model、Message、Event Stream
```

这三层解决的问题不同。AI Stream 收敛只说明一次模型响应完成；Agent Loop 结束才说明当前队列与工具批次收敛；Coding Agent 还要负责会话、工作区和产品输出。

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

统一类型降低上层复杂度，但会压缩差异。调试成本或错误时仍应保留原始 HTTP 状态、Provider Stop Reason 和安全处理后的响应详情。

### 为什么不是让 Agent Core 直接调用每家 SDK

Agent Loop 真正关心的是「有哪些消息块、有没有工具调用、为什么停止、花了多少资源」，而不是每家 SDK 的 Chunk 类名。若 Core 直接分支判断 Provider，新增模型会同时修改认证、流解析和循环代码，错误处理也很难保持一致。统一层把变化隔离在 Adapter，但不能把差异抹掉：Provider 特有的缓存、推理块或安全终止仍要通过扩展字段或诊断信息保留。

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

模型出现在目录里只证明元数据可发现。Provider 未注册、认证缺失、区域不可用或 API 不兼容都能在真正 Stream 前失败。

## 事件流的终态只属于一次模型响应

事件流工具只把 `done` 和 `error` 识别为终结事件。一个 `done` 之前可能产生 Tool Call；Agent Core 随后执行工具并再次调用模型，所以 `done` 不是整个任务的完成信号。

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

锁定版本还包含一个面向未来接口的 `AgentHarness` Scaffold，其中多项操作明确抛 `HarnessNotImplemented`。现行可工作的调用链仍是 `Agent` + `agent-loop.ts`。

源码：[查看未实现错误](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/agent-harness.ts#L74-L81)

```typescript
export class HarnessNotImplemented extends Error {
  constructor(operation: string) {
    super(`AgentHarness.${operation} is not implemented yet`)
  }
}
```

阅读设计文档可以理解目标方向，但分析运行行为应沿现行 Agent Loop，并让测试确认对应版本确实执行该路径。

## 回到运费任务

用户任务进入 Coding Agent 后，`packages/coding-agent` 选择模型和工具；Agent Core 只收到已经归一化的 Context、Model 与 Tool Definitions。模型流产生 `read` Tool Call 时，AI 层负责把供应商事件还原成共同 Tool Call，Agent 层才决定执行。即使 Provider 流以 `done` 结束，只要消息中仍有 Tool Call，整个任务就没有结束。

## 练习：判断是哪一层的问题

模型目录里能看到目标模型，但运行时报「没有认证」；另一台机器能够完成模型响应，却找不到 `edit` 工具。前一个问题应先查 AI 层的 Provider/Auth 路由，后一个问题应查 Coding Agent 的工具装配，而不是同时归因于 Agent Loop。

<details>
<summary>查看核对要点</summary>

模型可发现不代表 Provider 已注册且凭据可解析；AI 层应在发流前给出类型化错误。`edit` 属于 Coding Agent 的工具集合，Agent Core 只消费已经传入的工具表。分层的价值正是让两种失败拥有不同入口和修复方式。

</details>

下一篇：[Agent Loop、双队列与工具批次](02-agent-loop-tools.md)。
