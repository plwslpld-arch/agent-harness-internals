---
title: pi Agent Harness 主线
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"README.md","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"package.json","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/core/sdk.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/src/agent.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/src/agent-loop.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/test/agent-loop.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi Agent Harness 主线

## 读者会得到什么

这条主线回答的是：pi 怎样从统一的多 Provider 模型接口，逐层组合成有状态的 Agent Core、可自扩展的 Coding Agent，以及可被 CLI、TUI、Client/Server 和 Eval Harness 使用的完整系统。它不是一篇命令清单，也不会把 `packages` 目录名称直接当成运行结论。

pi 沿着 ai、agent 与 coding-agent 三层组合任务，并由 Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 提供横切表面。`pi-ai` 处理模型、消息、流事件和 Provider 差异；`pi-agent-core` 拥有 Transcript、消息队列、工具循环和生命周期事件；`pi-coding-agent` 再装入模型运行时、资源发现、Session、编码工具与 Extension。其他包并非装饰：Protocol、Server 和 Client 提供远程 Session 表面，TUI 投影事件，Telemetry 定义观测契约，Evals 记录任务制品和汇总。

现行运行时源码、未来设计文档、扩展示例与外部项目必须分开核对；设计目标和示例存在不等于默认运行能力。锁定树里的 `packages/agent/docs/harness.md` 同时描述未来切片和可替换部分，课程会把它当设计证据，而不是把所有段落写成已经发布的 Runtime。`examples/extensions` 证明扩展接口能表达某种行为，却不能证明该扩展默认加载。

pi 默认继承启动它的宿主进程权限，不内建文件系统、进程、网络或凭据隔离；需要使用外部容器或沙箱建立边界。上游 README 明确给出 Gondolin、Docker 与 OpenShell 三种方案，它们都是额外部署选择。交互确认 Extension 可以降低误操作概率，但不是操作系统强制隔离。

pi 的 `packages/evals` 很重要，但不改变本仓库定位。它让 Agent Harness 可以被固定任务、Artifact 和汇总逻辑评估；它不是与 Agent Harness 并列的第二套百科，也不能让一次测试通过自动升级为训练 Reward、Checkpoint 选择或发布授权。

先把组合关系画清楚，再进入每一层。

## 系统全景

![pi 从多 Provider AI、Agent Core 和 Coding Agent 组合到会话协议、终端表面、遥测评测与外部隔离的中文系统架构图](../../../assets/diagrams/pi/system-architecture.svg)

Claim: pi.architecture.layers-are-composed

根 `package.json` 的构建顺序先处理 TUI、Telemetry、AI 和 Agent，再构建 Session Backend、Protocol、Client、Server 与 Coding Agent。这个顺序是源码结构证据，不等于每次 CLI 启动会连接 Server 或运行 Evals。`createAgentSession()` 直接导入 `Agent`、AI 兼容层、资源加载器、SessionManager 和工具工厂，才是 Coding Agent 组合核心能力的入口证据。

系统图把默认本地路径放在中央：用户从 CLI、程序化 SDK 或 TUI 提交目标；Coding Agent 装配有效模型、系统 Prompt、资源、工具与 Session；Agent Core 驱动模型流和工具循环；AI 层把 Provider 差异投影为统一消息。工具执行落到宿主文件系统与进程，因此默认安全边界就是启动进程的权限。

Session 和 Context 不在同一个框里。Session 可以持久保存条目和分支，Context 是投给某一次模型请求的派生消息；Compaction 又会生成有损摘要。Protocol/Server/Client 能把 Session 操作投影为远程请求、响应和事件，但连接成功仍不等于 Agent 任务正确。

Telemetry 与 Evals 位于观察和验证出口。Telemetry 可以记录类型化事件，也可以使用 Noop Adapter；Evals 可以保存 Artifact 与 Summary。两者都不会自动检查用户目标，独立 Scorer 仍需读取最终文件、测试结果和不可接受副作用。

架构分层用于追踪责任，不用于堆叠能力标签。

## 课程状态与顺序

<!-- course-navigation:start -->
| 顺序 | 模块 | 状态 | 先回答的问题 |
| ---: | --- | --- | --- |
| 00 | [主线入口](README.md) | 已复核 | 包分层、真实任务、默认权限与 Eval 出口怎样连接？ |
| 01 | [运行时、设计文档与外部边界](01-evidence-runtime-design-boundaries.md) | 已复核 | 哪些材料能证明现行行为，哪些只能说明设计或示例？ |
| 02 | [多 Provider 与流归一化](02-ai-provider-stream-normalization.md) | 已复核 | Provider 差异怎样变成统一消息、Usage 和 StopReason？ |
| 03 | [Agent Loop、状态与工具](03-agent-loop-state-tools.md) | 已复核 | 队列、工具批次与多种终止信号怎样决定继续？ |
| 04 | [Coding Agent、Prompt 与 Extension](04-coding-agent-prompt-extensions.md) | 已复核 | Prompt、资源、Skill、工具与扩展怎样装配？ |
| 05 | [Session、Context、Compaction 与存储](05-session-context-compaction-storage.md) | 已复核 | 持久历史、模型 Context 和摘要谁是权威？ |
| 06 | [Protocol、Server 与 Client](06-protocol-server-client.md) | 已复核 | 编码、连接、Session Handle 和任务终态怎样分层？ |
| 07 | [CLI、TUI、权限与容器化](07-cli-tui-permissions-containerization.md) | 已复核 | 终端投影与真实强制隔离分别由谁提供？ |
| 08 | [Telemetry、Evals 与数据契约](08-telemetry-evals-data-contracts.md) | 已复核 | 观察信号、Artifact、Scorer、Reward 和发布门禁怎样分开？ |
<!-- course-navigation:end -->

九篇课程已经完成正文、Claim、中文图示与首轮复核，并作为一个不可拆分批次进入正式导航。任何一篇因来源漂移降级为 `stale` 时，整条 pi 主线都必须退出正式导航，复核完成后再整体恢复。

状态先于导航。

## 真实输入与输出

### 输入

上游 `agent-loop.test.ts` 创建一个进程内 `echo` 工具，并把下面的用户消息交给 Agent Loop。首次 Mock 模型响应要求调用 `echo`，调用标识是 `tool-1`，参数为 `hello`：

```json
{"role":"user","content":"echo something","nextModelResponse":{"type":"toolCall","id":"tool-1","name":"echo","arguments":{"value":"hello"}}}
```

### 输出

Harness 执行工具，把文本结果追加为 `toolResult`，然后进行第二次模型采样。第二次 Mock 响应返回 `done` 和 `stop`。测试断言工具只执行一次、工具开始与结束事件存在、结束不是错误，并且工具 Usage 可以被 `afterToolCall` 改写：

```json
{"executed":["hello"],"toolResult":"echoed: hello","modelCalls":2,"finalText":"done","finalStopReason":"stop"}
```

这是真实的 Agent Core 控制逻辑和进程内工具执行，但模型流是 Mock，工具也不是 Bash 或文件系统操作。它证明结果回送和二次采样，不证明 Provider 可用、Coding Agent 的资源加载、权限隔离或用户目标已经通过评测。

## 调用链

![pi 端到端任务从用户目标、Coding Agent 装配、模型工具调用、执行结果回送到最终事件和独立评测的中文流程图](../../../assets/diagrams/pi/end-to-end-task.svg)

Claim: pi.task.coding-agent-composes-core

1. CLI、SDK 或其他表面提交目标，并确定工作目录、模型运行时、Settings 与 SessionManager；这些有效值决定资源和持久化边界。
2. `createAgentSession()` 加载项目与用户资源，选择模型，建立系统 Prompt，组合内建与 Extension 工具，再创建拥有 Session 的 Coding Agent 表面。
3. Coding Agent 把当前 Session 投影为模型可见消息，交给 Agent Core；Agent 保存活动状态并发出 `agent_start`、`turn_start` 与消息生命周期事件。
4. Agent Core 调用 AI 层的 StreamFn；Provider 适配器把原始流归一为 AssistantMessage、Usage、StopReason 和 ToolCall。
5. 首次响应包含 `tool-1` 时，Loop 校验并执行 `echo`。如果 StopReason 是 `length`，锁定实现会拒绝执行可能被截断的参数，并生成错误 ToolResult。
6. ToolResult 被追加到当前 Context 和新消息列表，再进入下一次模型采样；它既是事件输出，也是模型继续推理的输入。
7. 没有更多工具时，Loop 依次检查 `shouldStopAfterTurn`、steering 与 follow-up；Error、Abort、工具 terminate 或回调也可让控制流提前收敛。
8. Coding Agent 把事件投影到 TUI、JSON、Protocol Client 或其他表面，并提交 Session 条目；最终 `agent_end` 只说明循环结束。
9. Eval Adapter 另行固定 Trial，保存输入、有效配置、事件、工具副作用和最终产物，由独立 Scorer 判断目标与安全约束。

## 源码证据

锁定 Loop 明确区分外层 follow-up 循环和内层工具/steering 循环。工具结果进入 Context 后，才发出 Turn 结束并决定是否继续：

```source
packages/agent/src/agent-loop.ts:169-224
while (true) {
  let hasMoreToolCalls = true;
  while (hasMoreToolCalls || pendingMessages.length > 0) {
    const message = await streamAssistantResponse(...);
    const toolCalls = message.content.filter((c) => c.type === "toolCall");
    const executedToolBatch = message.stopReason === "length"
      ? await failToolCallsFromTruncatedMessage(toolCalls, emit)
      : await executeToolCalls(...);
    for (const result of toolResults) currentContext.messages.push(result);
    await emit({ type: "turn_end", message, toolResults });
  }
}
```

行为测试安排首次 toolUse、一次 echo 执行和第二次 stop，并断言最终消息中的 Usage 已经过 Hook 修改：

```source
packages/agent/test/agent-loop.test.ts:274-369
expect(executed).toEqual(["hello"]);
expect(toolStart).toBeDefined();
expect(toolEnd.isError).toBe(false);
const messages = await stream.result();
```

另一组测试把工具参数截断为 `hel` 并标记 `length`，随后断言工具完全没有执行，但 Loop 继续第二次采样。这一失败分支比成功示例更能说明 Harness 的职责：它解释模型停止原因，而不是盲目执行结构看似合法的调用。

系统架构 Claim 使用 D 级，因为它综合多个包形成课程责任投影。工具闭环 Claim 使用 B 级，因为源码和上游测试直接支持循环行为；Mock Provider 和进程内 echo 限定了证据范围。

## 失败与限制

第一，模型目录存在不等于 Provider 在当前机器可用。凭据、区域、网络、模型下线、请求限制和协议变化都可能在运行时失败。课程后续会把模型元数据、Provider 注册和真实请求分开。

第二，Agent 的 `stop` 或 `agent_end` 不是任务成功。用户可能要求修复代码，而 Agent 只输出说明；工具也可能执行成功但改错文件。Eval 必须检查产物、测试和副作用。

第三，默认工具没有内建强制权限系统。读、写、编辑和 Bash 继承宿主进程能力；Extension 的确认对话仍运行在同一信任域。只有外部容器、微型虚拟机或策略沙箱才能提供更强隔离，而且必须记录是否实际启用。

第四，Session 持久化不等于模型看见完整历史。分支选择、Context 投影和 Compaction 都会改变下一次请求；摘要是派生信息，不能作为原始事件的无损替代。

第五，Protocol 往返、Telemetry 写入或 Eval Harness 退出零都不能替代独立评分。需要分别记录协议错误、观测丢失、Artifact 完整性、Scorer 版本和 Trial 分母。

第六，锁定树包含未来设计文档和大量扩展示例。课程会引用它们说明可扩展方向，但任何默认、已启用或安全承诺都必须回到现行调用者、配置与测试。

小核心减少了固定策略，也把更多责任交给宿主和部署者。

## 验证方法

先确认 pi Checkout 的 HEAD 等于课程锁定 Commit，再解析根 Workspace 和各包 `package.json`，核对包依赖与导出。随后逐行检查 Coding Agent SDK、Agent、Agent Loop、AI 类型和入口调用者，避免只凭目录命名画架构。

再运行不依赖真实 Provider 的上游目标测试：固定 `echo` 工具、两次 Mock 模型响应、工具结果和最终事件。保留调用标识、StopReason、Usage、事件顺序和断言，并单独运行 `length` 截断分支。

然后进行受控 Coding Agent 实验时，使用临时仓库和外部隔离，记录平台、Node 版本、实际包版本、Provider、模型、凭据来源但不记录密钥、有效工具、Extension、Session Backend、完整事件和文件差异。未实际启用的容器或 Telemetry 不得写成成功。

最后建立独立 Eval：一次用户目标对应固定 Trial，Attempt 只处理基础设施恢复；Artifact 包含初始状态、输入、有效配置、模型事件、工具调用、终端输出、最终文件与测试。Scorer 独立判断正确性和安全约束，训练 Reward、Checkpoint 选择与发布 holdout 分别保存。

先复现控制流，再评价任务结果。

## 自检

### 问题 1

为什么 `pi-ai`、`pi-agent-core` 和 `pi-coding-agent` 不能合并写成一个模块？

**答案：** 三者分别拥有 Provider 归一化、状态工具循环和编码场景装配；分开后才能定位模型协议、循环控制或资源工具装配中的真实责任。

### 问题 2

上游 echo 测试能证明 Bash 和文件工具安全吗？

**答案：** 不能。测试只执行进程内 echo，并使用 Mock 模型流；默认宿主权限、路径处理、命令副作用和外部隔离需要独立证据。

### 问题 3

为什么 `packages/evals` 存在仍不能把 Eval 变成与 Agent Harness 并列主线？

**答案：** 该包负责运行评测适配、Artifact 和汇总，是验证 Agent Harness 的横切能力；任务定义、Scorer 和发布授权仍与 Agent Runtime 分开。

### 问题 4

设计文档和 Extension 示例分别能证明什么？

**答案：** 设计文档证明上游计划与约束，示例证明接口可表达某种扩展；两者都不能单独证明现行默认运行路径已启用对应能力。
