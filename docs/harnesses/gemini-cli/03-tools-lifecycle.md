# 工具从「已知定义」到「模型结果」的完整生命周期

[返回 Gemini CLI 课程地图](README.md)

上一章把一次交互拆进 Model Router、Turn 与 Scheduler，其中 Model Router 选择模型，Turn 消费 Gemini 流并发出事件，而工具请求会交给 Scheduler，让会话保持活动。沿 Scheduler 的验证、审批、执行与结算继续向下看，会发现 Gemini CLI 的工具系统至少维护着三张表：Registry 保存所有已知定义，活动视图决定本轮模型能看见哪些工具，Scheduler 再记录每个实际调用的状态。

仓库里的 Tool Class 只证明候选实现存在。

```text
已知工具定义
    ↓ 过滤 / 模式 / 配置
活动工具与 Function Declarations
    ↓ 模型生成请求
Scheduler 调用状态
    ↓ Policy / Confirmation / Executor
模型内容 + UI 内容 + 可选输出文件
```

## 第 1 站：Registry 保留被排除的已知工具

源码：[查看工具目录字段](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/tool-registry.ts#L231-L282)

```typescript
// Includes tools which are currently not active.
private allKnownTools: Map<string, AnyDeclarativeTool> = new Map()

// Excluded tools remain registered so they can be enabled later.
```

- **调用者**：Core Config 初始化内置工具，Extension/MCP 刷新外部工具。
- **输入**：Declarative Tool Definition 与来源信息。
- **状态变化**：按工具名登记候选定义，即使当前被排除。
- **返回**：可重算活动视图的 Registry。
- **下一站**：Prompt Provider 查询 Function Declarations，Scheduler 按名查活动工具。

因为 Registry 保留了已知但不活动的工具，所以模式切换后可以重新启用它们，不必为此重启整个进程。不过，诊断代码必须说清自己展示的是「已知」还是「当前可用」，不能把候选定义直接当成本轮模型能够调用的工具。

## 第 2 站：所有公开查询经过活动过滤

源码：[查看活动工具查询](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/tool-registry.ts#L546-L803)

```typescript
private getActiveTools(): AnyDeclarativeTool[]
getFunctionDeclarations(modelId?: string)
getAllTools()
getTool(name)
```

- **调用者**：Prompt 构造、Scheduler 和工具列表界面。
- **输入**：当前模式、排除配置与可选 Model ID。
- **状态变化**：无持久修改；从已知表投影活动集合。
- **返回**：模型 Schema、活动工具数组或按名定义。
- **下一站**：模型生成 Function Call，Scheduler 再按同一活动视图查找。

模型看到 Schema 以后，配置仍然可能刷新，所以 Scheduler 到了执行阶段必须再次查询 Registry，并按照执行当时的活动视图寻找工具，不能一直握着一个永久的 Handler 引用。

## 第 3 站：不存在与参数无效在副作用之前失败

源码：[查看 Scheduler 验证](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/scheduler.ts#L330-L420)

```typescript
const tool = toolRegistry.getTool(request.name)
if (!tool) {
  // TOOL_NOT_REGISTERED
}

const invocation = tool.build(request.args)
// 参数错误 -> INVALID_TOOL_PARAMS
```

- **调用者**：Scheduler 接纳模型 Tool Request。
- **输入**：工具名、JSON 参数和 Call ID。
- **状态变化**：从 Validating 转到 Scheduled，或直接生成 Error Call。
- **返回**：类型化 Invocation 或无副作用失败。
- **下一站**：Policy/Confirmation 检查 Invocation 的具体动作。

参数构造本身就是安全边界的一部分，因此 Policy 应该评估规范化后的路径、命令和资源，而不能只盯着模型给出的原始 JSON 文本。

## 第 4 站：Executor 把实现结果归约为统一终态

源码：[查看 Tool Executor 结算](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/tool-executor.ts#L120-L190)

```typescript
if (signal.aborted) return createCancelledResult(...)
if (toolResult.error === undefined) return createSuccessResult(...)
return createErrorResult(...)
```

- **调用者**：获得批准的 Scheduled Call。
- **输入**：Tool Invocation、AbortSignal、Hooks 与输出处理器。
- **状态变化**：进入 Executing，运行具体 Tool，随后归约为 Success/Error/Cancelled。
- **返回**：Completed Tool Call。
- **下一站**：Scheduler 通知 UI，Agent Session 构造 Function Response。

`Success` 只能说明工具实现没有返回 Tool Error，并不能证明用户目标已经满足。例如 Shell 顺利执行了 `npm test`，但进程退出码仍是 1，此时工具协议可能正常返回一份带有失败输出的结果，而任务还得继续修复。

## 一份结果为何要拆成三种内容

源码：[查看模型内容与显示内容](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/tool-executor.ts#L299-L475)

```typescript
{
  responseParts: response,
  resultDisplay: toolResult.returnDisplay,
  outputFile,
  errorType,
}
```

- `responseParts` 回到模型，应控制大小并保留行动所需信息；
- `resultDisplay` 面向终端 UI，可以有颜色、摘要或进度；
- `outputFile` 保存过大的完整输出，避免把全部日志塞进 Context。

三者不能互相冒充，因为回到模型的内容、终端展示的内容以及保存到文件的完整输出各有用途。当 Evaluator 需要完整测试日志时，它应该读取明确的 Artifact，而不能拿 UI 里的截断摘要代替。

## 一个 Tool Call 的核对清单

核对 Trace 时，要依次找到活动 Schema、模型原始请求、规范化 Invocation、Policy Decision、Confirmation、Execution Start、Tool Result 与 Function Response。中间少了任何一项，都不能只凭最终卡片重建完整控制链。

工具调用走到 Policy Decision 与 Confirmation 时，问题便从定义、过滤和执行的生命周期转向授权。下一篇会继续区分 PolicyEngine 给出的允许、拒绝或询问，Confirmation Bus 关联的用户决定，模型 `SAFETY` 的生成结束原因，以及 SandboxManager 生成的平台执行规格——这些信号看似都在谈安全，所属层次却并不相同。

下一篇：[Confirmation、Policy 与 Sandbox](04-confirmation-policy-safety-sandbox.md)。
