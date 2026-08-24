---
title: Gemini CLI 源码主线
article_type: harness
harness: gemini-cli
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"gemini-cli","path":"packages/core/src/agent/legacy-agent-session.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/agent/legacy-agent-session.test.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/core/turn.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/scheduler/scheduler.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"}]
---

# Gemini CLI 源码主线

## 读者会得到什么

这是一条以 Agent Harness 为主、Eval 接入为横切面的源码课程。它不把 Gemini CLI 写成「终端里调用 Gemini」的薄壳，也不照着 TypeScript 目录逐项翻译。课程从一个真实的上游工具闭环测试出发：用户要求读取文件，模型流提出 `read_file`，Scheduler 结算工具调用，结果进入第二次模型采样，最终才产生一次 Agent Session 结束事件。沿这条主链，可以逐层定位配置、Prompt、Turn、模型路由、工具状态、确认、策略、沙箱、记录、扩展、输出协议和评测接入。

本课程锁定 Gemini CLI 提交 `5411f113cafae26161b4969b0237b8e1e024e2c2`。源码采用 Apache-2.0 License；本仓库只在许可证边界内分析并短摘源码，不代表 Google 为课程背书，也不把锁定提交称为当前最新版、线上 Gemini 服务实现或生产部署证明。

入口夹具来自 `legacy-agent-session.test.ts`。它真实运行 Agent Session 控制逻辑和事件翻译，但模型流与 Scheduler 都由 Vitest Mock 提供，`read_file` 没有读取本地文件。这个测试能证明两次采样、工具请求与响应的控制关系，不能证明网络、鉴权、具体工具实现、审批或平台沙箱。

先固定证据边界。

## 系统全景

![Gemini CLI 从产品表面、配置与上下文，经智能体会话、轮次和工具调度器到安全执行、状态与评测出口的中文系统架构图](../../../assets/diagrams/gemini-cli/system-architecture.svg)

Claim: gemini-cli.architecture.session-turn-scheduler

Gemini CLI 的产品表面不只有交互终端。锁定仓库同时包含非交互 Agent Session、IDE 通信和 A2A Server 等入口；它们可以复用 Core 的配置、模型、工具与事件类型，但输出格式、取消方式、错误载荷和生命周期并不完全相同。共享代码不是协议等价证明。

Core 也不是一个单体循环。`Config` 聚合有效设置和运行服务；Agent Session 驱动多次模型采样；`Turn.run()` 把模型流转换成 Content、ToolCallRequest、Finished、Retry、Safety 或取消等事件；Scheduler 则独立持有工具请求状态，调用 Policy 与 Confirmation，再交给执行器。工具结果返回 Agent Session 后，才作为下一次模型输入。

安全与状态位于主循环两侧。Policy 决策、确认消息、模型 Safety、参数校验和平台 Sandbox 分别拥有不同失败语义；Chat Recording、AgentChatHistory、Compression、Checkpoint 与 Memory 也不是一份数据的多个名字。后续课程会分别建立权威图，避免把「确认过」写成「已隔离」，或把「保存过」写成「可无损恢复」。

Eval 位于轨迹出口。Telemetry、日志、FinishReason、工具接受率和 JSON 输出可以成为 Artifact 的组成部分，却都不是训练 Reward 或发布门禁。独立 Eval 仍需固定 Trial、明确目标表面、保存输入与副作用，并由独立 Scorer 判断。

架构是责任图，不是能力清单。

## 课程状态与顺序

| 顺序 | 模块 | 状态 | 先回答的问题 |
| ---: | --- | --- | --- |
| 00 | [主线入口](README.md) | 已复核 | Agent Session、Turn 与 Scheduler 怎样完成一次真实工具闭环？ |
| 01 | 配置、Prompt 与 Context | 提纲 | Settings、GEMINI.md 与上下文资源怎样形成有效请求？ |
| 02 | Turn、Scheduler 与 Routing | 提纲 | 模型响应、工具批次和 Agent Session 何时继续或终止？ |
| 03 | 工具生命周期 | 提纲 | 注册、校验、确认、执行和 Function Response 怎样闭环？ |
| 04 | Confirmation、Policy、Safety 与 Sandbox | 提纲 | 授权、模型安全与平台隔离怎样分层？ |
| 05 | Session、历史、压缩与 Memory | 提纲 | 记录、模型历史、摘要、快照和记忆谁是权威？ |
| 06 | Agent、Hook、Skill 与 MCP | 提纲 | 编排和扩展怎样改变一次运行的真实能力？ |
| 07 | [产品表面与输出协议](07-surfaces-output-protocol.md) | 已复核 | 交互、Headless、IDE、A2A 与 JSON 输出怎样映射事件？ |
| 08 | [遥测、错误与评测设计](08-telemetry-errors-eval-design.md) | 已复核 | 观测和错误怎样接入独立评测而不冒充评分？ |

当前只有入口达到发布状态。其余模块完成正文、Claim、图示与复核后，才会在阶段末整批进入正式导航；目录和计划存在不等于课程已经可用。

状态先于导航。

## 真实输入与输出

### 输入

上游测试创建 `LegacyAgentSession`，向它提交以下用户消息：

```text
read a file
```

第一次 Mock 模型流产生调用标识 `call-1`、工具名 `read_file` 的 ToolCallRequest，随后又产生 `FinishReason.STOP`。这里的 STOP 只结束本次模型响应；因为仍有工具请求，Agent Session 不能结束。

```json
{"callId":"call-1","name":"read_file","args":{}}
```

### 输出

Mock Scheduler 返回已完成工具调用，响应正文是：

```text
file contents
```

Agent Session 对外发出 `tool_request` 和 `tool_response`，并把 responseParts 放入下一次 `sendMessageStream`。第二次模型流返回 `Done!` 和另一个 STOP；此时没有待处理工具请求，才发出唯一的 `agent_end`。测试直接断言模型流调用两次，并检查工具响应不是错误。

```json
{"events":["tool_request","tool_response","agent_end"],"modelCalls":2,"finalText":"Done!"}
```

工具结果回到模型，比工具结果显示出来更重要。

## 调用链

![Gemini CLI 端到端任务从用户输入、首次模型流、工具请求、调度结算、结果回送到最终智能体会话结束的中文流程图](../../../assets/diagrams/gemini-cli/end-to-end-task.svg)

Claim: gemini-cli.task.tool-result-loop

1. 产品表面把用户内容转换成 Part，Agent Session 建立活动流和取消边界，并读取最大 Session Turn 限制。
2. Agent Session 调用客户端 `sendMessageStream`；Turn 将模型响应转成 Content、ToolCallRequest 和 Finished 等 GeminiEvent。
3. 第一条流出现 `read_file` 时，请求被收集；紧随其后的 STOP 只记录为本次模型流的 `finishedReason`，不会跳过待处理工具。
4. Scheduler 接收工具请求，经过工具查找、策略、确认、状态和执行流程，返回 CompletedToolCall。入口测试 Mock 了这层，因此只能证明接口闭环。
5. Agent Session 对外发出 tool_response，把无错误 responseParts 聚合成下一次模型输入，同时记录已完成调用和交互遥测。
6. 若出现 STOP_EXECUTION 或致命工具错误，分别收敛为 completed 或 failed；普通工具错误仍可作为文本响应回给模型。这些结局不能只从工具退出状态猜测。
7. 第二次模型流没有新的工具请求，Agent Session 才把 FinishReason 映射为 agent_end。产品表面再把事件投影成文本、JSON、stream-json、IDE 或 A2A 输出。
8. Eval Adapter 保存固定 Trial 的输入、有效配置、两次模型流、工具请求、确认/策略结果、工具响应、最终事件与副作用，由独立 Scorer 判断任务是否正确。

## 源码证据

Agent Session 的外层循环先收集当前模型流的工具请求；只有没有工具请求时，Finished 才能结束 Session：

```source
packages/core/src/agent/legacy-agent-session.ts:183-252
while (true) {
  const toolCallRequests: ToolCallRequestInfo[] = [];
  const responseStream = this._client.sendMessageStream(...);
  if (event.type === GeminiEventType.ToolCallRequest) toolCallRequests.push(event.value);
  if (toolCallRequests.length === 0) this._finishStream(mapFinishReason(finishedReason));
  const completedToolCalls = await this._scheduler.schedule(...);
}
```

结算后的 responseParts 成为下一轮输入，而不是只用于界面展示：

```source
packages/core/src/agent/legacy-agent-session.ts:254-323
if (response.responseParts) toolResponseParts.push(...response.responseParts);
currentParts = toolResponseParts;
```

Turn 只在响应真实携带 finishReason 时产生 Finished；它也独立产生工具请求事件：

```source
packages/core/src/core/turn.ts:380-410,508-521
const functionCalls = resp.functionCalls ?? [];
if (finishReason) yield { type: GeminiEventType.Finished, value: { reason: finishReason } };
return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
```

最强的行为证据来自上游测试。它安排两次模型流、一次 Scheduler 结果，并明确断言中间 Finished 不产生 agent_end：

```source
packages/core/src/agent/legacy-agent-session.test.ts:381-445,1214-1259
makeCompletedToolCall('call-1', 'read_file', 'file contents')
expect(sendMock).toHaveBeenCalledTimes(2);
it('does NOT emit agent_end when tool calls are pending', ...)
```

系统架构 Claim 使用 D 级，因为课程把多个模块综合成一张责任图。工具闭环 Claim 使用 B 级：源码直接定义循环，上游测试锁定两次采样和唯一 agent_end。B 级仍不代表真实文件、线上模型或沙箱已经执行。

## 失败与限制

第一，Finished 不是 Agent Session 完成。模型可以在包含工具请求的响应末尾给出 STOP，Session 仍需结算工具并再次采样。若按 Finished 数量统计任务，会把一次真实任务拆成多次完成。

第二，`agent_end: completed` 也不是 Eval 通过。源码对 STOP_EXECUTION 工具错误使用 completed 收敛，表达的是控制流停止，不是用户目标正确。测试还展示普通工具错误会作为文本回送模型，致命错误则结束为 failed；评测必须检查错误类型、最终产物和副作用。

第三，入口测试没有执行真实 `read_file`。Scheduler 和模型客户端都是 Mock，`file contents` 是夹具返回值。它证明调用标识、事件顺序和二次采样，不证明文件权限、路径校验、策略、确认或操作系统隔离。

第四，多产品表面不能互证。非交互 CLI 可能把取消工具调用映射为某种兼容输出，IDE 或 A2A 又有自己的消息和任务状态。共享 Core 只允许复用底层证据，不能把一个表面的 success、cancelled 或退出码直接当成另一个表面的语义。

第五，锁定源码可能包含新旧并存的 Agent Session 路径。文件名 `legacy-agent-session.ts` 是上游命名，不足以断言所有产品入口默认走该路径；课程只把它作为已锁定、被测试的完整工具闭环证据，后续表面课会核对入口选择。

控制流完成不等于任务正确。

## 验证方法

先做静态核对：确认 Checkout HEAD 与 Frontmatter Commit 一致，检查 Agent Session、Turn、Scheduler、Config 和产品表面入口的真实引用；任何新路径都要记录 Feature、设置和调用者，不能因导出存在就宣布默认启用。

再运行入口上游测试：保留第一次 ToolCallRequest、第一次 Finished、Scheduler CompletedToolCall、tool_response、第二次模型调用和最终 agent_end。关键断言是两次 `sendMessageStream`、同一 `call-1`、结果正文 `file contents`，以及中间 Finished 不产生 agent_end。

随后注入失败：让模型流没有 FinishReason、同时产生多个工具、Scheduler 拒绝、等待确认、普通工具错误、STOP_EXECUTION、磁盘耗尽、取消和最大轮次。分别记录是否再次采样、是否发出 tool_response、最终 reason、原始错误和真实副作用。

最后建立 Eval：以一次用户目标为固定 Trial，Attempt 只表示同一 Trial 内的基础设施或恢复过程。Artifact 至少包含输入、有效配置、模型响应、工具请求、Policy、Confirmation、Sandbox、工具响应、最终输出和文件差异。Scorer 独立判断目标与安全约束，不能用 Finished、agent_end、退出零或遥测上传替代。

最后查目标产物。

## 自检

### 问题 1

第一次模型流已经产生 `FinishReason.STOP`，为什么 Agent Session 仍不能结束？

**答案：** 同一响应还产生了待处理工具请求。STOP 只结束该次模型生成；Agent Session 必须让 Scheduler 结算工具，把结果送入下一次模型请求，待没有新工具时才能结束。

### 问题 2

入口测试能证明真实文件读取和沙箱工作吗？

**答案：** 不能。测试 Mock 了模型流和 Scheduler，`file contents` 是固定夹具；它只证明 Agent Session 的事件顺序、结果回送和二次采样。

### 问题 3

为什么 `agent_end: completed` 仍不能算 Eval 通过？

**答案：** completed 是控制流终态，甚至 STOP_EXECUTION 工具错误也可能这样收敛。Eval 还要检查用户目标、最终产物、副作用和安全约束。

### 问题 4

系统架构图为什么标为 D 级，而工具闭环是 B 级？

**答案：** 架构图综合多个模块形成课程投影，属于可核对的跨模块推断；工具闭环则由源码循环和上游行为测试直接支持，但仍受 Mock 与平台条件限制。
