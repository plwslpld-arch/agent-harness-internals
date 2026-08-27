# 工具从「已知定义」到「模型结果」的完整生命周期

[返回 Gemini CLI 课程地图](README.md)

上一章跟着一次交互走过 Model Router、Turn 和 Scheduler（调度器）：Model Router 选择模型，Turn 消费 Gemini 流并发出事件，工具请求则交给 Scheduler 处理，所以会话不会在工具做完之前结束。继续沿着验证、审批、执行和结算往下看，你至少要分清三层工具信息：Registry（注册表）收着所有已知定义，活动视图决定这一轮让模型看见哪些工具，Scheduler 再逐条记录实际调用走到了哪一步。

Tool Class 只是候选。

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

Registry 会保留那些已经注册、眼下却没启用的工具，因此模式切换后可以直接重新启用，不必重启整个进程。不过，诊断信息必须说清展示的是「已知工具」还是「当前可用工具」。两者不能混。

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

即使模型已经看过 Schema，配置仍可能在工具执行前刷新，所以 Scheduler 真正准备执行时还得再查一次 Registry，按当时的活动视图找工具，不能从请求生成那一刻起就一直握着同一个 Handler 引用。

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

工具根据参数建出 Invocation（调用实例）时，也在划安全边界，因为这一步会把路径、命令和资源整理成规范形式。Policy 应该检查整理后的具体动作，不能只盯着模型吐出的原始 JSON 文本。

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

`Success` 只说明工具实现没有返回 Tool Error。任务未必完成。比如 Shell 确实跑起了 `npm test`，可进程退出码仍是 1，这时工具协议可能正常交回一份带失败输出的结果，Agent 还得继续修复。

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

这三份内容各有用处：一份回到模型，一份显示在终端，还有一份把完整输出存进文件，所以不能拿其中一份冒充另外两份。Evaluator 如果要看完整测试日志，就该读取明确保存下来的 Artifact，不能拿 UI 里截断过的摘要顶替。

## 一个 Tool Call 的核对清单

核对 Trace 时，你要顺着调用发生的次序，找到活动 Schema、模型原始请求、规范化 Invocation、Policy Decision、Confirmation、Execution Start、Tool Result 和 Function Response。中间缺了任何一项，最后那张结果卡片都还原不了整条控制链。

工具调用走到 Policy Decision 和 Confirmation 时，关注点就从工具怎么定义、筛选和执行，转到了这次动作能不能获得授权。下一篇会把几类信号逐一分开：PolicyEngine 给出允许、拒绝或询问，Confirmation Bus 关联用户作出的决定，模型用 `SAFETY` 说明这次生成为什么结束，SandboxManager 则生成平台实际采用的执行规格。这些信号看起来都在谈安全，其实管的不是同一件事。

下一篇：[Confirmation、Policy 与 Sandbox](04-confirmation-policy-safety-sandbox.md)。
