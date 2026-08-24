---
title: 六类 Harness 的循环、工具与执行
article_type: comparison
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/tool-calls.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/session/turn.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/scheduler/types.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/client.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"pi","path":"packages/agent/src/agent-loop.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"opencode","path":"packages/opencode/src/session/processor.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# 六类 Harness 的循环、工具与执行

## 比较问题

一次 Agent Turn 看上去像「模型回答一次」，实际可能经历多轮模型请求。模型先产生文本或工具意图，Harness 校验名称与参数，决定能否执行，把副作用和结果写入状态，再把工具结果作为下一轮输入。只有当未结算工具、压缩、重试和阻断分支都处理完，循环才可能自然停止；自然停止仍然没有回答补丁是否正确。

六类 Harness 在控制对象上不同：DSH 围绕 Agent Loop 和工具结算组织，Codex 把 Thread、Task、Turn 与 Response Item 分层，Gemini CLI 让 Scheduler 管理工具批次，Claude Python SDK 通过 Transport、控制协议和消息流暴露任务生命周期，pi 用小型 Agent Core 解释事件，OpenCode 则由 Session Prompt 与 Processor 协作。共同问题是「下一次请求由什么状态触发」，不要求它们拥有同名类或相同事件。

![六类 Agent Harness 把模型流归约为文本、工具调用、权限决策、真实执行和工具结果，再选择继续、压缩、停止或失败的中文状态图](../../assets/diagrams/comparisons/02-loop-tools-execution.svg)

## 控制变量

比较实验固定一个本地、无网络、可回滚的单工具任务。模型端使用确定性测试流：先输出一个写文件工具调用，再读取结果并给出结束文本。每方记录模型可见工具 Schema、工具调用标识、参数、批准状态、开始与结束事件、真实文件 Hash、工具结果关联标识和循环控制结果。

停止语义要单独控制。测试流至少覆盖纯文本停止、工具调用后停止、参数非法、工具执行失败、上下文溢出、取消和内容过滤。若某方把多工具调用组成批次，批次内顺序和并发条件也要冻结；否则延迟或文件冲突差异无法归因到状态机。

产品表面同样影响观测。终端可能只输出格式化文本，开发包返回类型化 Message，服务端事件流提供增量 Part。Artifact 应保留最接近核心的原始事件与最终文件，不用界面动画、退出码或某个 Promise 完成状态代替任务事实。

## 对照证据

机器矩阵位于 `evidence/matrices/02-loop-tools-execution.yml`。六个主 Claim 都核对「工具结果怎样进入下一轮」或「流事件怎样被结算」，不比较模型生成质量。

| 主线 | 循环控制重点 | 需要额外核对的完成边界 | 主 Claim |
| --- | --- | --- | --- |
| DSH | 工具调用结算后再构建下一次请求 | 外部工具实现与最终任务断言 | `deepseek-harness.loop.tool-results-before-next-request` |
| Codex | Turn 内事件和工具结果回到线程状态 | Thread、Task、Turn 与任务 Verdict 分开 | `codex.turn.tool-result-loop` |
| Gemini CLI | Scheduler 维护工具批次状态 | 批次完成不等于 Turn 或任务正确 | `gemini-cli.scheduler.tool-batch-has-own-state` |
| Claude | SDK Client、Transport、控制协议与消息流 | SDK 协议终结不揭示闭源产品内部状态 | `claude.task.transport-control-loop` |
| pi | Agent Core 解释多种停止信号 | Coding Agent 资源和产品表面在外层 | `pi.agent.loop-interprets-multiple-stop-signals` |
| OpenCode | Processor 归约流事件并返回三类控制结果 | 停止与会话空闲不产生任务评分 | `opencode.session.processor-interprets-stream-events` |

DSH 的工具调用和结果保持关联，再由循环决定是否发起下一轮。设计重点是结算完整性：结果尚未持久化或回送时，不能提前生成新的模型请求。详细证据见 [DSH 模型与工具循环](../harnesses/deepseek-harness/03-loop-model-tool.md)。

Codex 的层次更细。Turn 容纳一次用户推进，模型流产生 Response Item，工具执行器将结果项回送；Thread 与 Task 还负责跨 Turn 状态和内部工作。调试时只看最后一条助手文本会丢掉工具结算与取消位置，见 [Codex 模型与工具循环](../harnesses/codex/03-model-tool-loop.md)。

Gemini CLI 将工具调度显式建模成批次。工具可以经历验证、确认、排队、运行和结算，Scheduler 决定何时形成响应。批次拥有自己的失败和终止状态，不能用「所有 Promise 已返回」推断任务通过，见 [Gemini CLI 工具生命周期](../harnesses/gemini-cli/03-tools-lifecycle.md)。

Claude 的可见证据来自 SDK 表面。Python Client 通过 Transport 启动或连接 CLI，控制请求与消息流共同表达任务；Result Message 属于协议终结。SDK 能核对取消、关闭、控制响应与消息解析，但 Claude Code 本体的内部调度仍不可见，见 [Claude 消息流生命周期](../harnesses/claude/03-messages-stream-lifecycle.md)。

pi 的 Agent Core 很小，循环直接解释模型事件、工具调用与多个停止信号。Coding Agent 再提供 Prompt、Session、工具和扩展，因此核心简洁不代表完整产品只有一个文件。长度截断等信号还会阻止未完成工具被误执行，见 [pi Agent Loop](../harnesses/pi/03-agent-loop-state-tools.md)。

OpenCode 的 Session Prompt 负责外层循环与上下文装配，Processor 把流事件写成 Message/Part、Tool State、Usage、Patch 和 Error，并返回继续、压缩或停止。这个三态结果是控制信号，任务质量仍交给产物验证，见 [OpenCode 会话循环](../harnesses/opencode/02-session-prompt-llm-processor.md)。

## 差异解释

第一项差异是状态显式程度。Gemini CLI 的工具批次和 OpenCode 的 Processor 控制结果便于观察中间阶段；DSH 与 pi 的核心链更直接；Codex 把状态分散在多个生命周期对象；Claude SDK 只暴露协议可见部分。显式状态利于恢复和 UI，但会增加事件兼容与归约复杂度。

第二项差异是工具表面形成时机。工具可能在启动时注册、每轮按模型与策略筛选、被扩展 Hook 改写，或从远端 MCP 动态发现。即使六方都叫「工具调用」，模型当时看到的 Schema 和可用集合也可能不同。公平实验必须存档最终 Schema，而非只记工具名。

第三项差异是结束信号的来源。模型 Finish Reason、工具批次结算、Processor Stop、Result Message、Session Idle 与进程退出分别属于服务、调度、协议或表面。一个系统可以在这些层面全部成功，同时留下错误文件。设计可靠性来自分层失败语义和可追溯状态，不来自某个统一的「成功」布尔值。

没有一种循环组织在所有任务上占优。高并发工具需要批次和冲突控制；长时远端任务需要可恢复协议；嵌入式 SDK 重视取消与资源释放；最小本地 Agent 倾向减少状态层。选型应匹配副作用强度、交互方式和审计要求。

## 失败与限制

本篇没有固定同一个真实模型运行六方，因此不比较模型选择工具的准确率。确定性测试流只能隔离 Harness 状态机，不能证明面对非确定性 Provider 时仍覆盖所有畸形事件。上游测试也可能使用模拟工具和临时文件，生产网络、Shell、插件与远端服务需另验。

工具执行成功的定义依赖工具自身。进程退出码为零可能仍写错文件，语言服务器零诊断也可能漏掉行为错误。另一方面，工具报错可能是预期负例，不应自动归为产品失败；Scorer 必须按任务 Rubric 判断最终产物与禁止副作用。

并行工具会引入顺序、重复、取消和部分提交问题。本比较只提出统一记录项，没有证明六方对所有竞态具有相同保证。恢复时还要区分未开始、运行中、已提交但结果未回送等状态，防止重复执行外部副作用。

## 验证方法

实现一个本地测试模型端，按脚本发出文本开始、工具调用、工具结果需求和最终停止事件。为每方适配同一个写入临时文件工具，保存全量事件与文件 Hash。断言下一次模型请求只在工具结果已经带关联标识进入上下文后出现。

随后在工具执行前、执行中、提交后但结果回送前分别注入取消与进程中断。重新连接或恢复会话，检查工具是否重复、状态是否可判定、文件与消息是否一致。对多工具批次再加入同文件冲突，观察序列化、并发和失败传播。

最后准备两个自然停止案例：一个补丁正确且测试通过，另一个文本完整但文件错误。Harness 层都可以正常结束，独立 Scorer 必须给出不同 Verdict。该实验专门防止把循环停止写成任务成功。

## 自检

### 问题 1

模型返回停止原因后，为什么 Harness 仍可能继续？

**答案：** 同一轮可能还有未结算工具调用；结果需要执行、持久化并回送，外层循环才能判断是否真正结束。

### 问题 2

工具批次全部完成是否等于任务通过？

**答案：** 不等于。批次只说明调度阶段结算，文件、测试、禁止副作用和用户目标仍需独立判断。

### 问题 3

公平比较工具循环为什么要保存最终 Schema？

**答案：** 注册表会受模型、策略、扩展和远端发现影响；同名工具在六方可能具有不同参数与可见条件。

### 问题 4

确定性测试模型能证明哪一层？

**答案：** 它能隔离并复核 Harness 的事件归约、工具结算与控制分支，不能代表真实模型质量或生产工具可靠性。
