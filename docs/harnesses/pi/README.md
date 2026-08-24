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

## 核心概念

pi 的主干可以按三层理解：AI 层把不同 Provider 变成共同消息流，Agent Core 解释消息、工具与队列，Coding Agent 宿主装配项目资源、Session、编码工具和 Extension。三层之间通过明确对象连接，却保留各自终态。模型流结束不代表工具循环结束，工具循环结束也不代表编码任务通过。

Session、Protocol、TUI 和 Telemetry 是横切表面，不是另一套 Agent Core。Session 保存并投影历史，Protocol 把会话操作暴露给远程 Client，TUI 把事件渲染为终端，Telemetry 记录运行事实。它们可以改变可达方式、持久性和可观测性，却不自动改变任务评分标准。

Eval 是 Agent Harness 的验证出口。pi 提供 Eval Harness、Artifact 和 Summary 能力，外部 Scorer 仍要按固定 Dataset 与 Rubric 判断结果；训练 RewardAdapter、Checkpoint 选择和独立发布 Holdout继续各负其责。仓库的主线因此以 Agent Harness 为中心，同时把 Eval 作为不可缺少的横切闭环。

| 层或表面 | 核心责任 | 主要输入输出 | 不能代替 |
| --- | --- | --- | --- |
| pi-ai | Provider、认证、流事件与统一消息 | Context → AssistantMessage | Agent 工具决策 |
| Agent Core | 状态、双层 Loop、队列和工具批次 | AgentMessage ↔ ToolResult | 编码产品装配 |
| Coding Agent | Prompt、资源、Session、工具和 Extension | 项目目标 → 编码会话 | 操作系统隔离 |
| Session / Compaction | 持久树与模型 Context 投影 | Entry Tree → Context | 无损审计摘要 |
| Protocol / Client / Server | 远程命令、事件、Snapshot 和 Lease | Byte Stream ↔ Session 操作 | 产品成功判断 |
| CLI / TUI | 输入方式与表现投影 | 人或脚本 ↔ Session Event | Agent Core 语义 |
| Telemetry | Span、Event、Usage 和错误观测 | 运行 → Trace | Scorer |
| Eval / Scorer / Gate | Artifact、评分、统计和发布决策 | Trial → Verdict | 默认运行时能力 |

## 为什么这样设计

分层让错误可以定位。认证失败属于 AI 运行时，截断工具调用属于 Agent Loop，项目资源冲突属于 Coding Agent 装配，摘要丢事实属于 Session 投影，协议错帧属于 Transport，最终测试失败属于产品 Eval。若把全部现象都称为「Agent 失败」，恢复策略和证据都会失去针对性。

小 Core 配合可扩展宿主，允许 pi 在不硬编码产品策略的前提下支持动态工具、Provider、终端表面和部署方案。代价是更多责任落到 Extension 来源、Prompt 装配和宿主权限。课程会同时呈现组合能力与安全边界，不把灵活性包装成默认最小权限。

把 Session 与 Context、Telemetry 与 Scorer、Response 与任务终态分开，是为了阻止证据越权。每层只为自己的契约背书：可以证明流收敛、消息追加、命令接受或 Artifact 写入，但不能跨层宣布用户目标正确。独立 Gate 最后读取目标产物，才形成发布判断。

这种组织也便于跨 Harness 比较。读者可用共同抽象对照 DSH、Codex、Claude、Gemini CLI、OpenCode 和 pi，同时保留 pi 特有的包分层、Extension 机制和远程 Session 协议。比较的是责任与证据，不是名称数量。

## 实现思路

学习这条主线时，以一条任务 Trace 为轴，逐层建立责任账本。下面的结构是课程分析模型，不是 pi 上游内部数据类型；它要求每层记录输入、输出、终态和证据来源，从而暴露层间断点。

责任账本还要保留版本：模型目录、Extension、Prompt、Session 投影器、协议和 Scorer 任一变化，都可能让同一输入得到不同结果。将版本摘要绑定到 Layer Trace，可以区分控制逻辑回归、环境漂移和评分规则变化。

```ts
interface LayerTrace {
  layer: "ai" | "agent" | "coding" | "session" | "surface" | "telemetry" | "eval";
  inputDigest: string;
  outputDigest: string;
  terminal: string;
  evidence: string[];
  unknowns: string[];
}
```

1. 固定 pi Commit，先区分现行源码、测试、未来规格、示例和外部链接。任何设计目标都不直接进入运行时能力表。
2. 从 `createAgentSession()` 追装配：有效模型、资源、Prompt、Active Tools、Extension 和 Session Backend 同批保存为 Snapshot。
3. 从 Agent Core 追控制流：模型事件、StopReason、steering/follow-up、Tool Call、Tool Result 与终止原因按 ID 关联。
4. 从 Session 追持久事实与 Context Projection，记录活动 Leaf、Compaction、参与送模的 Entry 和原始 Artifact。
5. 从 CLI/TUI 或 Protocol 追输入输出投影，确认表面变化没有被误写成 Core 变化；远程 Response 与后续 Event 分开。
6. 记录默认宿主权限及实际隔离方案，使用能力探针证明文件、进程、网络、挂载和凭据边界。
7. Eval 固定 Trial、Attempt、Dataset 和 Scorer，保存补丁与测试；Telemetry 只提供诊断，不填评分。
8. 若进入训练，显式连接 `Scorer → RewardAdapter → 优化算法 → Checkpoint`；发布使用独立 Holdout 和独立 Gate。

每完成一层都做反向提问：「这一层成功后，下一层仍可能怎样失败？」答案写入 `unknowns` 或失败矩阵。这样读者不会在看到 `done`、`agent_end`、Response 或零退出码时提前结束分析。

## 贯穿案例

以「修复解析器失败测试且不得修改公共 API」为贯穿任务。用户从 CLI 提交目标，Coding Agent 装配只读、编辑和测试工具；模型先读文件，再编辑代码并运行测试。Session 在过程中压缩旧消息，Telemetry 保存事件，Eval 最后检查测试和 API Diff。

案例使用临时仓库与 Faux Provider 演示控制语义，真实模型能力和线上服务可用性保持未验证。若切换真实 Provider，必须新增凭据来源、区域、响应模型和原始停止原因记录，不能复用合成夹具的结论。

初始任务契约如下：

```json
{
  "caseId":"parser-fix-01",
  "goal":"修复解析器失败测试",
  "constraints":["不得修改公共 API"],
  "targetTests":["parser.test"],
  "releasePolicy":"测试通过且公共 API Diff 为空"
}
```

1. AI 层从目录解析模型、Provider 和认证，把远端流归一为 AssistantMessage。`done` 只证明本次流结束；首次 `toolUse` 交给 Agent Core。
2. Agent Core 执行 Read 与 Edit。若 Tool Call 被 `length` 截断，拒绝副作用并回送错误结果；正常 Tool Result 进入下一次模型采样。
3. Coding Agent 的 Prompt、Active Tools 与 Extension Revision 同批留证。Extension 若改写 Provider 或 Tool Result，Trace 保存前后摘要。
4. Session 追加原始 Entry。Compaction Summary 若漏掉「不得修改公共 API」，原 Entry 仍保留，Eval 不以 Summary 作为唯一事实源。
5. CLI 显示完成或 Protocol 返回 Prompt Response，都只代表表面与命令边界；隔离探针另行证明工具未越出工作区。
6. Telemetry Span 记录模型、Usage、工具和错误。Agent `agent_end` 后，Eval 读取补丁、测试结果和公共 API Diff。
7. 即使测试通过，只要 API Diff 非空，Scorer 仍给出失败。若 Artifact 缺失则 unscored，不从正常退出猜测通过。
8. 候选 Checkpoint 即使在选择集提升，也必须再过独立 Holdout，才能由 Release Gate 决定是否发布。

最终证据应把各层终态并列，而非压成一个 success：

```json
{
  "ai":{"terminal":"done","stopReason":"stop"},
  "agent":{"terminal":"idle","toolCalls":3},
  "session":{"persisted":true,"compacted":true},
  "surface":{"mode":"cli","rendered":true},
  "telemetry":{"status":"ok"},
  "eval":{"tests":"passed","publicApiDiff":"non-empty","score":0},
  "release":{"decision":"rejected"}
}
```

案例中前五层都可能正常，任务仍因约束违反而失败。这不是矛盾，而是分层契约在发挥作用。后续八篇会分别展开每层的源码、测试、失败模式和复现方法，读者最终能从任一异常返回准确责任边界。

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
