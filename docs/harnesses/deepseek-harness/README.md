---
title: DeepSeek Harness 源码主线
article_type: harness
harness: deepseek-harness
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/bundle/base/cordis.patch.yml","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"apps/cli/config/agent-presets/standard/agent.cordis.yml","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/tests/loop.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"examples/acp-agent/tests/snapshots/tool-call-turn/session.jsonl","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"}]
---

# DeepSeek Harness 源码主线

## 读者会得到什么

这是一条以 Agent Harness 为主、Eval 接入为横切面的源码课程。它不按包名逐个抄说明，而是从一项真实任务出发，追踪 DSH 怎样装配运行时、构造模型请求、接住工具调用、约束副作用、保存会话、继续采样并形成可供反馈或外部评测读取的轨迹。读完入口后，你应该能画出主要边界，并知道后续八篇各自回答哪一个实现问题。

本课程锁定 DeepSeek Harness 提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`，上游根包版本为 `0.1.1-rc.2`。源码采用 MIT License；这允许本仓库在遵守许可证的前提下分析和引用源码，却不表示 DeepSeek 为本课程背书，也不表示锁定提交等于当前最新版、稳定版或生产部署证明。

这里的「真实」有严格边界：正文中的事件名和示例值来自上游已提交的 ACP 快照夹具，循环结论来自源码与测试；它是可重复的录制/回放证据，不是本仓库现场调用线上模型的性能实验。图中的分层是为了阅读而做的架构投影，不是上游导出的统一协议图。事实、测试覆盖和本仓库推断会分别标注。

先固定证据边界。

先看全景，再沿任务链深入。不要从目录名猜行为，也不要把插件已安装直接等同于能力已启用。

## 核心概念

DSH 可以用「组合、请求、循环、行动、记忆、编排、表面、验证」八个相连视角理解。它们不是八套孤立功能，而是一条任务在不同生命周期阶段经过的边界。入口页先给出共同词汇，后续章节再把每个边界落到源码、事件与实验。

| 层次 | 核心对象 | 负责决定 | 权威证据 |
|---|---|---|---|
| 启动组合 | bundle、profile、patch、preset | 哪些服务和能力实际存在 | 有效 Cordis 树、启动记录 |
| 请求装配 | prompt section、context、tool schema | 模型本次真正看到什么 | 最终请求、缓存观测 |
| Agent 循环 | Turn、Step、chunk、停止原因 | 何时采样、调用工具和收敛 | Session 事件、Provider 响应 |
| 工具安全 | Registry、Guard、Approval、Sandbox | 请求能否执行、在哪里执行 | 决策链、退出状态、副作用 |
| 会话记忆 | 追加日志、派生 Context、摘要、Spill | 什么可恢复、什么可丢弃 | 原始事件、checkpoint、产物 |
| 编排扩展 | Goal、Subagent、Workflow、Extension | 多次或多 Agent 工作怎样协调 | 父子 run、预算、结构化结果 |
| 产品表面 | Web、Headless、ACP、SDK | 外部怎样驱动并观察核心 | 协议响应、退出码、通知 |
| 验证与 Eval | invariant、Trial、Scorer | 哪条约束成立、任务是否通过 | 测试产物、独立评分 |

组合是整条链的起点。源码中存在一个工具包，只说明候选实现可被引用；bundle 与 profile 提供宿主服务，preset 决定 Agent 可见能力，平台和环境再影响实际装配。复核任何行为前，都要记录最终有效配置，不能从目录或依赖清单直接推断能力已启用。

Agent 循环以 Turn 表示一次用户驱动，以 Step 表示一次模型采样及其后续工具处理。Prompt 与 Context 在每个 Step 前形成请求，模型返回流式 chunk，组装后的 assistant message 若包含 tool-call，就经安全链执行并把 tool-result 投影回下一次请求。终止原因只描述循环为何停止，不评价任务正确性。

Session 是跨层证据脊柱。模型消息、工具调用、工具结果、步骤边界和停止原因追加为原始事件；Context、界面卡片、摘要和协议响应都是派生视图。派生视图可以压缩或筛选信息，却不应反向改写历史。外部文件和进程副作用仍要单独保存，因为 Session 无法独占整个世界状态。

Eval 横切整条主线。固定 Dataset item 创建 Trial，Target 指定 DSH 表面与运行配置，Trace 关联 Session 和外部产物，Scorer 独立判断约束。用户反馈与遥测可进入数据管道，但需要明确 RewardAdapter 才能获得训练语义；Checkpoint 选择和发布 holdout 继续隔离。

## 为什么这样设计

第一，组合式运行时让同一核心支持不同产品表面与 Agent 配置。宿主提供模型路由、持久化和执行能力，preset 提供 persona 与可见工具，产品表面只处理交互或协议。职责分开后，替换入口不必复制 Agent Loop，改变 persona 也不必重建宿主服务。

第二，追加型 Session 与派生 Context 分离，兼顾可恢复证据和有限模型窗口。原始日志保留发生过什么，派生器选择本次需要的消息，compaction 用摘要替换早期上下文但不删除历史。故障调查可以回到原始事件，模型请求又不必无限增长。

第三，工具意图与真实副作用之间设置 Registry、Guard、Approval、Sandbox 和执行后端，是为了将模型能力转换成可治理行动。每层回答不同问题：工具是否存在、策略是否允许、是否需要人确认、操作系统能否隔离、命令实际如何结束。将它们合并成一个 allow 布尔值会隐藏平台强度和执行失败。

第四，编排复用同一 Agent 与安全核心，使子 Agent、Workflow 和 Ralph 的差异集中在上下文、预算、并发与交接。子运行拥有独立身份，父端摘要不能覆盖子端原始结果；这样既能扩展任务规模，也能保留失败归属。

第五，内部完成与独立 Eval 分开，防止 Harness 自己宣布任务通过。`completed`、Goal 勾选、Workflow 返回和进程退出 0 都属于运行信号；只有固定任务上的外部 Scorer 能形成可比较结论。这个分层也让训练 Reward、恢复 Attempt 和发布判定不互相污染。

## 实现思路

学习和复核 DSH 时，可建立一个最小「任务证据包」，让八个章节都围绕同一 run 展开。不要一开始遍历所有包；先选一个带工具副作用的任务，再沿身份和事件追到每个边界。

1. **冻结运行配置。** 记录源码提交、bundle、profile、preset、模型、平台、权限模式和工作区水位，导出最终有效插件树。
2. **捕获模型请求。** 保存稳定 prompt section、运行时 Context、工具 Schema 和缓存指标，区分应用前缀变化与 Provider 报告。
3. **追踪循环身份。** 为 Turn、Step、message 和 tool call 保留关联 ID，记录 chunk 组装、重试、取消与最终停止原因。
4. **核对行动链。** 从模型参数经过 Registry、Guard、Approval、Sandbox 到执行后端，保存每层决定、命令退出和外部产物哈希。
5. **验证恢复语义。** 在工具副作用、结果提交与 checkpoint 之间注入崩溃，检查恢复器不会把 unknown 调用无条件重放。
6. **扩展到编排。** 创建一个有界子 Agent 或 Workflow，记录 parent、depth、预算和 canonical result，检查共享工作区冲突。
7. **比较产品表面。** 用同一 Session 观察 Web、Headless、ACP 或 SDK 投影，建立内部原因与协议结果映射。
8. **运行独立评分。** 把完整 Session、外部产物和配置绑定 Trial，由隔离 Scorer 判定；反馈、遥测与 RewardAdapter 另行登记。

```text
effective_runtime = compose(bundle, profile, preset, platform)
session = start(effective_runtime, frozen_task)
while session.turn_active:
    request = derive_context(session.log, prompt_sections, tool_schema)
    response = model(request)
    result = loop_settle(response, guarded_tool_executor)
artifacts = collect(session.log, workspace_diff, surface_outputs)
score = independent_scorer(frozen_trial, artifacts)
```

实现最小原型时，优先保留边界接口，而非复制全部功能：`compose()` 返回能力清单，`derive_context()` 从追加日志产生请求，`execute_tool()` 返回结构化决定与副作用，`project_surface()` 只读事件，`score()` 不接受 Harness 自报完成作为答案。每个接口都能被替身驱动，也能在后续换成锁定源码的真实适配器。

证据包还要保存「未观察到什么」。没有真实 Provider 就标记录制夹具，没有 Linux 沙箱就把平台证据写为 unavailable，没有 RewardAdapter 就把反馈标成 raw signal。显式缺口比笼统的「支持」更有学习价值，也能防止入口页承诺超过各章节正文。

## 贯穿案例

贯穿任务沿用上游夹具的意图：「调用 bash 执行 `echo SNAPSHOT_OK`，随后只回复 DONE」。教学变体再加一条独立约束：Scorer 必须观察到 stdout 精确包含目标文本、工具结果正确关联，且最终回复只含一个单词。

1. **启动。** base bundle、CLI profile 与 standard preset 组合出 LLM、Session、Agent、bash、Permission 和执行后端；记录有效工具表与 `danger-full-access` 测试模式。
2. **首个 Step。** Prompt 与 Session Context 形成请求，模型返回 `bash` tool-call；chunk 被组装并写入 assistant message。
3. **执行工具。** Registry 找到 bash，安全链记录当前策略与无需审批的模式，执行后端运行命令并返回 stdout；外部副作用在本例仅是进程输出。
4. **第二个 Step。** tool-result 通过派生 Context 进入下一次模型请求，模型回复 `DONE`，循环写入 `turn/end: completed`。
5. **表面投影。** ACP 只发送已提交文本并返回 `end_turn`；Headless 会打印最终文本，并依据内部原因选择退出码。
6. **独立评分。** Scorer 同时检查 tool call 参数、callId 关联、stdout、最终文本和停止原因；任何一项不符都判 Trial fail。

```json
{"trialId":"dsh-echo-001","task":"执行固定命令并回复单词","surface":"acp","permissionMode":"danger-full-access"}
```

```json
{"tool":{"name":"bash","stdout":"SNAPSHOT_OK\n","isError":false},"assistant":"DONE","internalStop":"completed","score":"pass"}
```

现在注入第一个反例：模型直接回复 `DONE`，没有 tool-call。Agent Loop仍可能正常 completed，ACP 也正常 `end_turn`，但 Scorer 因缺少命令证据判 fail。它证明运行收敛和任务通过属于不同层。

第二个反例让 Guard 拒绝 bash。Session 应保存拒绝决定和非成功工具结果，模型可以解释无法执行；若产品表面只显示最终文字，评测仍要读取原始 Session。此时失败归属于当前权限配置下的产品结果，不能通过重试时悄悄切换为完全访问来改成通过。

第三个变体在工具进程成功后、结果写入前崩溃。恢复器看到 started 或 unknown，不应再次执行非幂等命令；本例命令无持久副作用，但测试要替换成追加文件操作验证只写一次。完整证据包因此横跨组合、循环、安全、会话、表面和 Eval，后续八篇都能从同一案例深化，而非形成彼此无关的术语摘要。

## 系统全景

![DeepSeek Harness 从产品表面、Cordis 组合到模型工具会话和评测接入的中文系统架构图](../../../assets/diagrams/deepseek-harness/system-architecture.svg)

Claim: deepseek-harness.architecture.composed-runtime

上图把锁定实现投影成四层。产品表面接收用户目标并选择会话；启动与组合层把 bundle、profile 补丁和 agent preset 装进 Cordis；Harness 核心层运行 Agent Loop、Prompt、工具与 Session 服务；外部能力层提供模型服务、文件与进程执行环境，以及可选的遥测或独立评测消费者。各层通过服务或事件连接，不代表它们在源码中都位于同一个包。

先核对分层。

`packages/bundle/base/cordis.patch.yml:24-30,58-67,98-101,163-205` 直接列出 LLM、Session、Agent、持久化、Sandbox、Approval 和 Permission 等基础行。`apps/cli/config/agent-presets/standard/agent.cordis.yml:1-18` 又明确区分 host composition 与 agent-plane preset：注册表、沙箱、审批、持久化和模型路由属于宿主组合，persona、模型可见工具、压缩和委派选择由 preset 贡献。由此可以核对「能力来自组合」这件事，但具体启用集合仍会随 profile、patch、平台、环境变量和 preset 改变。

这也是为什么课程不把 DSH 简化成一个 `while` 循环。循环是执行心脏，却依赖外部组合提供模型适配器、工具注册表、安全边界、会话持久化和产品表面。反过来，Web、ACP 或 SDK 也不应各自复制一套核心状态机；它们应把输入映射到共享的会话和 Agent 能力，再把事件投影成各自协议输出。

组合不是能力证明。

Eval 位于右侧横切接入，而不是循环中的第二个「裁判模型」。DSH 的事件、反馈和遥测可以成为评测输入，但本课程不会把一条点赞、一次 telemetry 上传或一个内置 benchmark 自动称为训练奖励，更不会称为独立发布门禁。要形成可复核 Eval，仍需外部固定 Trial、保存 Artifact、应用 Scorer，并把训练奖励、Checkpoint 选择与发布评测分开。

## 课程状态与顺序

| 顺序 | 模块 | 状态 | 先回答的问题 |
| ---: | --- | --- | --- |
<!-- course-navigation:start -->
| 00 | [主线入口](README.md) | 已复核 | 整个运行时怎样连起来，一项任务怎样穿过边界？ |
| 01 | [启动与 preset](01-boot-preset.md) | 已复核 | bundle、profile、Cordis 与 preset 怎样得到有效插件树？ |
| 02 | [Prompt、Context 与缓存](02-prompt-context-cache.md) | 已复核 | 模型输入如何装配，哪些变化会破坏稳定前缀？ |
| 03 | [循环、模型与工具](03-loop-model-tool.md) | 已复核 | 流式响应、工具闭环、重试、取消和终止如何协作？ |
| 04 | [工具安全](04-tools-security.md) | 已复核 | Guard、审批、策略与平台 Sandbox 怎样分层？ |
| 05 | [会话与压缩](05-session-compaction.md) | 已复核 | 原始事件、派生 Context、摘要、Spill 与恢复谁是权威？ |
| 06 | [编排与扩展](06-orchestration-extensions.md) | 已复核 | Plan、Goal、Subagent、Workflow、Skill 与运行时代码怎样接入？ |
| 07 | [产品表面与评测](07-surfaces-feedback-eval.md) | 已复核 | Web、ACP、SDK、反馈、遥测和 Eval 接口怎样共享核心？ |
| 08 | [自验证与限制](08-verification-design-limits.md) | 已复核 | 测试、设计记录和门禁能证明什么，不能证明什么？ |
<!-- course-navigation:end -->

状态表是发布契约，不是进度装饰。九篇课程的正文、Claim、图示、来源和自检已经整批通过门禁；任意一篇退出发布状态，DSH 主线都会被导航检查判为不完整。

状态先于导航。

推荐按 00→01→02→03→04→05 阅读完整主链，再读 06→07→08。若只排查一次工具调用，应从 03 开始，再回看 04 的安全决策和 05 的持久状态；若只研究产品表面，不应跳过 03，因为协议输出只是核心事件的投影。

再追踪调用链。

## 真实输入与输出

### 输入

上游 `examples/acp-agent/tests/snapshots/tool-call-turn/session.jsonl` 记录的用户要求如下。它要求模型先调用 shell 工具，再只回复一个单词：

```json
{"content":[{"type":"text","text":"Use the bash tool to run exactly: echo SNAPSHOT_OK. Then reply with the single word DONE and stop."}],"source":{"kind":"user"},"role":"user"}
```

这条输入先以 `agent/inbox/spliced` 进入收件箱，随后出现 `turn/start`、`step/start` 和 `user/message`。同一会话还追加一条由插件生成的运行时策略快照，说明当时文件策略为 `danger-full-access`、审批提示禁用。这个快照只能证明该测试会话的模式，不能外推成所有 DSH 会话的默认安全设置。

### 输出

第一次模型响应不是最终文字，而是 `bash` 工具调用；真实会话夹具随后记录调用与结果：

```jsonl
{"type":"tool/call","data":{"turn":1,"step":1,"callId":"call_00_Rn2Mz1y8uZN62ukEXiNO2077","name":"bash","arguments":"{\"command\": \"echo SNAPSHOT_OK\", \"description\": \"Run echo SNAPSHOT_OK\"}"}}
{"type":"tool/result","data":{"turn":1,"step":1,"message":{"content":[{"type":"tool-result","toolCallId":"call_00_Rn2Mz1y8uZN62ukEXiNO2077","content":[{"type":"text","text":"SNAPSHOT_OK\n"}],"isError":false}]}}}
```

第二个 step 才产生文本 `DONE`，最终会话记录为 `turn/end` 且原因是 `completed`。ACP 对外快照则把同一结果投影成 `session/update` 的文本块，并以 `stopReason: end_turn` 完成 JSON-RPC 请求：

结果分两层。

```jsonl
{"jsonrpc":"2.0","method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"DONE"}}}}
{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}
```

这里有三个不同的「完成」：shell 命令成功、Agent Turn 收敛、ACP 请求返回。它们都不是 Eval 通过。只有外部 Scorer 按固定任务契约检查命令副作用、最终回复和轨迹，才能产生评测结论。

三个完成，三种语义。

## 调用链

![DeepSeek Harness 端到端任务从用户目标到事件产物和评测接入的中文流程图](../../../assets/diagrams/deepseek-harness/end-to-end-task.svg)

Claim: deepseek-harness.turn.tool-result-loop

1. 产品表面接收用户目标，选择或创建 Session，并把输入放入 Agent inbox；持久事件 `turn/start` 与 `step/start` 建立本轮边界。
2. Agent Loop 运行 `preStep`，把可见用户消息写入 Session；Prompt 组件、工具注册表和 `session.deriveMessages()` 一起构造本次模型请求。
3. LLM Adapter 将统一请求映射到具体 Provider。流式 chunk 先被记录，再由 `BlockAssembler` 合成 `assistant/message`；一串 chunk 仍只属于一次模型响应。
4. 若响应包含工具调用，Harness 保留调用标识，经过工具注册、参数处理、策略、审批和执行后端，记录 `tool/call` 与 `tool/result`。图中「真实副作用」单独着色，因为模型提出调用不等于副作用已发生。
5. 工具结果通过 Session 的消息投影进入下一次模型请求。锁定测试 `loop.spec.ts:198-232` 断言发生两次模型调用，第二次请求包含 `tool-result`，并且 Session 同时包含 `tool/call` 与 `tool/result`。
6. 当模型不再给出工具调用时，`agent.ts:412-418` 返回 `completed`；外层在每个 step 后写 `step/end`，最终在 `agent.ts:316-320` 写 `turn/end`。取消、错误、最大 token 和工具结论会走不同原因，不能都压成成功。
7. 产品表面把会话事件翻译成 Web、ACP 或 SDK 输出；Trace、Session 日志和任务产物随后可被反馈系统或独立 Eval 读取，但读取者必须保留来源、版本和 Trial 边界。

## 源码证据

锁定循环的关键分支如下。它先构造请求并记录流式事件，合成 assistant message；没有工具调用才直接完成，否则执行工具并根据结果决定是否继续：

```source
packages/core/agent-loop/src/agent.ts:340-418
const { request, preparedCall } = await this.buildRequest(...)
for await (const chunk of stream) {
  chunkSeqs.push(this.session.append('assistant/chunk', { turn, step, chunk }).seq)
  assembler.push(chunk)
}
this.session.append('assistant/message', ...)
const toolCalls = message.content.filter(block => block.type === 'tool-call')
if (toolCalls.length === 0) return { kind: 'completed' }
const { concluded } = await executeToolCalls(...)
return concluded ? { kind: 'completed' } : null
```

上游确定性测试进一步锁定了「结果回送而非只显示在界面」这一行为：

```source
packages/core/agent-loop/tests/loop.spec.ts:198-232
expect(adapter.requests).toHaveLength(2)
const secondMessages = adapter.requests[1]!.messages
const toolResultMessage = secondMessages.find(m =>
  m.content.some(b => b.type === 'tool-result'))
expect(toolResultMessage).toBeDefined()
expect(types).toContain('tool/call')
expect(types).toContain('tool/result')
```

系统架构 Claim 使用 D 级，因为它把多个组合文件和循环服务投影到一张共同图；工具结果闭环 Claim 限定在锁定 DSH 实现，源码与上游测试直接支持，所以使用 B 级。B 级仍只说明这个版本、这个行为面有源码和测试，不表示所有 Provider、平台和真实工具都已端到端验证。

## 失败与限制

第一，组合失败可能早于 Agent Loop。bundle、profile patch、环境变量、平台条件或 preset realm 错误都可能使插件缺失、同名服务冲突或模型看不到预期工具。此时不能只在循环文件里找问题，要检查最终 Cordis 树和服务可用性。

先核对组合。

第二，模型流结束不代表任务完成。Provider 错误、取消、最大 token、半截工具参数和工具要求终止都可能改变后续路径。界面上出现 `DONE` 也不能证明命令真的执行；必须关联 `callId`、工具结果和可观察副作用。

第三，安全能力受模式与平台约束。夹具明确运行在 `danger-full-access` 且 `approval: never`，因此它适合验证工具闭环，不适合证明沙箱隔离。Linux、macOS、Windows 和远程执行后端要分别核对，策略允许、用户批准和 OS 级隔离不能互相替代。

第四，会话日志是重要证据但不是完整世界状态。外部文件可能在日志写入前后被其他进程改变；遥测也可能默认关闭、传输失败或只包含投影。发布 Eval 若依赖副作用，应保存内容哈希、命令退出状态和环境快照，而不是只看 assistant 文本。

第五，本课程锁定一个提交。后续上游若改变 profile、事件 Schema、默认模型或协议投影，本页不会自动保持最新。`last_verified` 表示最近一次对锁定源码核对日期，不是实时兼容承诺。

正常结束不等于任务成功。

## 验证方法

先做静态核对：确认 checkout 的 HEAD 与 frontmatter commit 完全相同；检查 Claim 中每个路径、行号和摘录真实存在；检查 base bundle 与 standard preset 的职责没有被图合并成同一层。若只凭旧文章或设计记录写结论，应降级或删除。

再做确定性行为验证：运行 Agent Loop 的上游工具 round-trip 测试，断言第二次模型请求包含与原调用标识关联的工具结果，并断言 `tool/call`、`tool/result`、`step/end`、`turn/end` 的事件边界。ACP 快照应能重放成 `DONE` 与 `end_turn`，但不得把录制快照标成实时服务实验。

接着注入失败：未知工具、参数错误、策略拒绝、审批不可用、执行超时、取消、最大 token 和第二次模型响应失败都要分别观察。检查副作用是否发生、结果是否写入 Session、是否再次采样、最终原因是否准确；不能用统一「失败」吞掉责任层。

最后验证评测接入：把完整 Session、工具输出和产物绑定到固定 Trial，基础设施恢复另记 Attempt；Scorer 独立检查目标是否完成。若 feedback 或 telemetry 缺少 RewardAdapter 语义，就标成反馈信号或可观测数据，不声称已接入 DPO、GRPO、RFT 或独立发布门禁。

最后查产物。

## 自检

### 问题 1

为什么 standard preset 中出现 `tool-bash`，仍不能直接断言任何会话都能执行 shell？

**答案：** preset 只贡献模型可见工具选择；宿主还要提供工具注册表、shell 执行器、Sandbox、Approval 和 Permission 服务，平台条件与 profile patch 也可能禁用或替换行。必须核对最终组合和当前模式。

### 问题 2

真实夹具里 `tool/call` 后出现 `tool/result`，为什么还需要第二次模型请求？

**答案：** 工具结果是环境对行动的返回，模型只有在下一次请求中看到它，才能基于真实结果形成最终回复。上游测试直接断言第二次请求包含 `tool-result`。

### 问题 3

`turn/end: completed` 是否表示任务通过 Eval？

**答案：** 不是。它只表示锁定 Agent Loop 按自己的终止状态收敛。Eval 还要按固定 Trial 检查任务产物、轨迹和 Scorer；正常终止也可能答错或遗漏副作用。

### 问题 4

为什么系统架构 Claim 是 D 级，而工具结果闭环 Claim 可以是 B 级？

**答案：** 系统图把多个配置与运行时组件映射成课程分层，属于有证据的跨模块推断；工具结果闭环则由锁定源码和上游测试直接断言，且结论严格限定在该版本的 Agent Loop 行为。
