---
title: Gemini CLI 工具注册与执行生命周期
article_type: harness
harness: gemini-cli
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"gemini-cli","path":"packages/core/src/tools/tool-registry.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/scheduler/scheduler.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/scheduler/tool-executor.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/tools/tool-registry.test.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"}]
---

# Gemini CLI 工具注册与执行生命周期

## 读者会得到什么

本篇从 ToolRegistry 的已知目录出发，追踪一个模型工具请求如何经过活动过滤、查找、参数构建、Policy、Confirmation、执行器、Hook、输出处理和函数响应，最终回到下一次模型请求。读完后，你不会再用「仓库里有这个工具」「模型看见这个工具」或「工具返回 Success」替代真实执行证据。

工具系统至少有三张表：已知定义、当前活动工具、当前调用状态。它们的键都可能是工具名，但权威范围不同。

先找真实执行器。

## 真实输入与输出

### 输入

上游 Scheduler 测试分别构造不存在工具与无效参数。两个请求都携带稳定的调用标识：

```json
[{"callId":"call-1","name":"missing_tool","args":{}},{"callId":"call-2","name":"mock-tool","args":{"invalid":true}}]
```

ToolRegistry 测试又同时注册允许工具和被排除工具。被排除项仍留在内部已知 Map，以便会话中重新启用；但 `getAllTools()`、函数声明和 `getTool()` 的活动视图都不能返回它。

### 输出

不存在工具被结算成 `TOOL_NOT_REGISTERED`，参数构建失败成为 `INVALID_TOOL_PARAMS`，两者都带与请求关联的 responseParts，而不会进入 ToolExecutor：

```json
{"callId":"call-1","status":"error","errorType":"tool_not_registered","functionResponse":{"error":"Tool not found"}}
```

成功、工具返回错误或取消也都会成为 CompletedToolCall。模型接收的是 responseParts；界面可使用 resultDisplay，完整长输出还可能保存到旁路文件。三个输出面不能假定逐字相同。

## 调用链

![Gemini CLI 工具从已知目录、活动过滤、模型请求、策略确认和执行到函数响应回送的中文生命周期图](../../../assets/diagrams/gemini-cli/03-tools-lifecycle.svg)

Claim: gemini-cli.tools.registration-is-not-execution

Claim: gemini-cli.tools.responses-are-scheduler-settlements

1. Config 注册内建工具，并可通过发现命令、MCP 或扩展补充定义。ToolRegistry 的 `allKnownTools` 包含当前不活动的定义。
2. 活动视图应用 excludeTools、别名、MCP 服务状态和其他配置过滤，再为当前模型生成 Function Declaration。目录存在和注册成功只到这一步。
3. Turn 从模型响应提取工具名、参数、callId、prompt_id 与 traceId，Agent Session 把请求批量交给 Scheduler。
4. Scheduler 用活动 `getTool()` 查找定义。找不到时立即生成 TOOL_NOT_REGISTERED；找到后调用 `tool.build(args)`，构建失败生成 INVALID_TOOL_PARAMS。
5. 有效调用进入 Validating。Policy、Confirmation 与 Hook 可允许、拒绝、修改或等待；所有活动调用处于可执行或终态后，Scheduler 才启动准备好的工具。
6. ToolExecutor 调用 `executeToolWithHooks`，接收实时输出、进程标识和最终 ToolResult。取消、工具错误和异常分别转换为 Cancelled 或 Error。
7. 成功和取消路径也会处理长输出：启用上下文管理时可以蒸馏；否则 Shell 或 MCP 文本超过阈值时保存旁路文件，并用截断说明替代模型内容。
8. Executor 将 llmContent 转成 Function Response，保留 callId、display、errorType、outputFile 与内容长度；Scheduler 终结调用后把 CompletedToolCall 返回 Agent Session。
9. Agent Session 对外发出 tool_response，并把 responseParts 作为下一次模型输入。独立 Eval 仍需核对真实文件、进程、网络和最终答案。

## 源码证据

Registry 明确区分已知与活动工具：

```source
packages/core/src/tools/tool-registry.ts:231-282
// includes tools which are currently not active
private allKnownTools: Map<string, AnyDeclarativeTool> = new Map();
// excluded tools are still registered to allow for enabling them later
```

所有对模型和调度器公开的查询都经过活动过滤：

```source
packages/core/src/tools/tool-registry.ts:546-803
private getActiveTools(): AnyDeclarativeTool[]
getFunctionDeclarations(modelId?: string)
getAllTools()
getTool(name)
```

Scheduler 在真实执行前先处理不存在与参数无效：

```source
packages/core/src/scheduler/scheduler.ts:330-420
const tool = toolRegistry.getTool(request.name);
if (!tool) ... ToolErrorType.TOOL_NOT_REGISTERED
const invocation = tool.build(request.args);
... ToolErrorType.INVALID_TOOL_PARAMS
```

Executor 把工具结果归约为三类 CompletedToolCall：

```source
packages/core/src/scheduler/tool-executor.ts:120-190
signal.aborted -> createCancelledResult
toolResult.error === undefined -> createSuccessResult
toolResult.error -> createErrorResult
```

模型内容、显示内容和旁路文件分别保存：

```source
packages/core/src/scheduler/tool-executor.ts:299-475
responseParts: response,
resultDisplay: toolResult.returnDisplay,
outputFile,
errorType
```

两个 Claim 使用 B 级。源码直接定义目录、过滤和执行归约，上游测试验证排除、未注册和无效参数；真实外部工具、MCP 服务和平台副作用仍未由本课程入口夹具运行。

## 失败与限制

第一，已知工具不等于活动工具。排除项仍可保留定义，MCP 工具又会随服务连接动态加入或移除。若只 dump 内部 Map，会把禁用能力误报成可用能力。

第二，活动工具不等于模型一定看见。声明还可按模型、模式和过滤列表生成；Prompt 的文本清单与实际 Function Declaration 也应分别捕获。

第三，模型请求不等于执行。工具可能不存在、参数无效、策略拒绝、等待确认、Hook 修改、Sandbox 失败或执行器取消。错误必须归属到具体层，不能统一写成「工具调用失败」。

第四，Success 不是任务成功。它只表示工具契约没有返回 error；写错文件、执行错误命令或泄露信息仍可能是 Success。Scorer 必须检查目标产物与安全不变量。

第五，Cancelled 不是事务回滚。工具可能在 AbortSignal 生效前已经产生部分输出或副作用；源码甚至尽量保留取消前的内容。测试必须检查文件、进程和网络，而非只看状态。

第六，模型内容不一定完整。长输出可能被截断、蒸馏或写入旁路文件；responseParts、resultDisplay 和原始输出服务不同消费者。恢复和评测需保存完整工件定位信息。

第七，并行执行会改变可见顺序。只有连续可并行工具才可能成组启动，编辑和主题更新等路径受顺序约束。不能按模型请求数组顺序推断副作用顺序。

工具状态是证据，不是裁判。

## 验证方法

建立能力清单，为每项记录来源、已知定义、活动状态、模型声明、排除原因、MCP 连接、审批模式、Policy 结果、执行器和平台后端。对内建、发现命令与 MCP 工具分别验证。

再建立调用状态表：以 callId 为主键，保存原始名称与参数、别名、build 结果、Hook 修改、Policy、Confirmation、Scheduler 状态、进程标识、实时输出、Complete 结果和 responseParts。

注入不存在、别名冲突、重复注册、无效 JSON Schema、参数构建异常、策略拒绝、用户拒绝、执行异常、长输出、蒸馏失败和取消。断言未进入的层没有副作用，错误 response 仍可关联原请求。

最后对同一固定 Trial 检查三份输出：原始工具结果、模型 Function Response 和界面 display。独立 Scorer 使用目标文件与副作用判定，不接受 Registry 数量、Success 比例或退出零作为替代。

## 自检

### 问题 1

为什么被排除工具还会留在 Registry？

**答案：** 锁定实现保留已知定义，以支持会话中重新启用；活动查询和模型声明会过滤它，因此内部存在不等于当前可用。

### 问题 2

模型已经请求某工具，为什么 Scheduler 还要再次查找和 build？

**答案：** 模型输出不可信且可能过期；Scheduler 必须确认工具仍活动，并用真实定义校验和构建参数后才进入策略与执行。

### 问题 3

Cancelled 为什么不能证明没有副作用？

**答案：** 取消可能在执行开始后生效，工具已产生部分输出、文件或进程；状态只说明最终控制流，目标环境仍需核对。

### 问题 4

为什么 resultDisplay 不能直接回送模型？

**答案：** display 面向用户界面，responseParts 面向模型协议，原始输出又可能保存为旁路工件；三者内容和大小约束不同。
