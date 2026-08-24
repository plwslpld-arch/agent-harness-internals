# 工具从「已知定义」到「模型结果」的完整生命周期

[返回 Gemini CLI 课程地图](README.md)

Gemini CLI 的工具系统至少有三张表：Registry 保存所有已知定义，活动视图决定本轮模型可见哪些工具，Scheduler 再保存每个实际调用的状态。仓库里存在一个 Tool Class，只能证明它是候选实现。

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

保留已知但不活动的工具，允许模式切换后重新启用，而不用重启整个进程；风险是诊断代码必须明确自己展示的是「已知」还是「当前可用」。

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

模型看到 Schema 后配置仍可能刷新，所以 Scheduler 执行时要再次查 Registry，而不能持有一个永久 Handler 引用。

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

参数构造是安全边界的一部分：Policy 应评估规范化后的路径、命令和资源，而不是只看模型原始 JSON 文本。

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

`Success` 表示工具实现没有返回 Tool Error，不表示用户目标已经满足。例如 Shell 成功执行 `npm test` 但进程退出码为 1 时，工具协议可能正常返回包含失败输出的结果，任务仍需继续修复。

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

三者不应互相冒充。Evaluator 需要完整测试日志时，应读取明确的 Artifact，而不是 UI 截断摘要。

## 一个 Tool Call 的核对清单

从 Trace 中依次找：活动 Schema、模型原始请求、规范化 Invocation、Policy Decision、Confirmation、Execution Start、Tool Result、Function Response。缺少中间任一项，都不能只凭最终卡片重建完整控制链。

下一篇：[Confirmation、Policy 与 Sandbox](04-confirmation-policy-safety-sandbox.md)。
