---
title: Codex 源码主线
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/cli/src/main.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/thread_manager.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/session/turn.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/tools/router.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/tool_harness.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/thread-store/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 源码主线

## 读者会得到什么

这是一条以 Agent Harness 为主、Eval 接入为横切面的源码课程。它不把 Codex 写成「命令行调用模型」的薄壳，也不按 Rust crate 名称逐项抄目录；课程从一项真实工具任务出发，追踪产品表面怎样创建或选择 Thread，Session 怎样持有活动运行时，Turn 怎样装配模型可见输入，Responses 流怎样产生工具调用，工具结果怎样回到下一次采样，以及 Rollout、Thread Store、Trace 与外部评测怎样读取这条轨迹。

本课程锁定 Codex 提交 `c9b19deb09c1841ce7acc33ddb96276030936a29`。源码采用 Apache-2.0 License；本仓库在许可证边界内分析和短摘源码，不代表 OpenAI 为课程背书，也不把锁定提交称为当前最新版、线上服务实现或生产部署证明。

这里的「真实」同样有边界：入口样例直接来自上游 `tool_harness.rs` 集成测试，使用上游测试框架、真实本地命令执行路径和模拟 Responses 服务；它证明锁定实现能把工具输出带入第二次请求，但该测试在 Windows 上被编译条件排除，也没有连接线上 OpenAI 服务。图中的系统分层是本仓库为阅读形成的跨 crate 投影，不是上游发布的统一架构规范。

先固定证据边界。

## 核心概念

Codex 主线可以从八个连续边界理解：配置形成模型可见输入，Thread / Session / Turn 建立身份，Responses 流产生行动，ToolRouter 与安全链执行行动，Rollout 保存记录，扩展改变能力表面，子智能体形成线程图，产品适配器和 Eval 消费证据。任何一层的完成都只对自己的契约负责。

| 边界 | 核心对象 | 主要问题 | 直接证据 |
|---|---|---|---|
| 配置与上下文 | 有效配置、AGENTS、Fragment | 本次模型看见什么 | 脱敏 Responses 请求 |
| 运行身份 | Thread、Session、Task、Turn | 谁拥有状态、何时结算 | ID、Op / Event、Rollout |
| 模型循环 | response、sample、follow-up | 何时继续采样 | 流事件、Turn 状态 |
| 工具执行 | Router、call_id、result | 行动怎样路由并回送 | 调用、结果、外部产物 |
| 安全强制 | Policy、Approval、Permission、Sandbox | 请求能否与如何执行 | 决策链、平台后端 |
| 持久与记忆 | Rollout、Store、Compact、Memory | 什么可恢复、什么有损 | 追加记录、替代历史 |
| 扩展与编排 | Skill、MCP、Code Mode、Subagent | 能力和多线程怎样组合 | 工具表哈希、线程图 |
| 表面与评测 | CLI、App Server、Trace、Trial | 外部怎样驱动与评分 | 协议输出、Artifact、Score |

Thread 是持久会话身份，Session 是当前活动运行时，Turn 是一次逻辑工作边界，Task 是驱动某种工作流的执行体。一个 Turn 可以有多次模型请求，一个 Thread 可以经历多个 Session，一个 Trial 也不必与 Turn 一一对应。学习时先把这些身份列出来，能避免大多数恢复与统计错误。

模型工具闭环以 call_id 维持因果：首个 Responses 流提出函数调用，Router 找到运行时，安全链决定是否执行，结果进入 Session 历史，下一次采样才能据此继续。模型说「已完成」、命令退出零和 TurnComplete 分别是文本、进程与 Harness 状态，独立 Scorer 才产生任务判定。

Rollout 是重要记录边界，却不包含全部外部世界；模型 Context 又只是 Rollout 与当前配置的有损投影。Compaction 通过摘要替换模型可见历史，Memory 从多个 Thread 提炼候选知识。恢复应读取已提交结果而非重放旧副作用，关键产物要保存内容哈希。

扩展和子智能体扩大了组合空间。Skill 与动态工具要经过发现、信任、鉴权和投影，Code Mode 只改变工具表面，子 Agent 拥有独立 Thread。能力存在、模型可见、获准执行和实际成功是四个不同事实。

## 为什么这样设计

第一，共享 Rust 核心支持 CLI、TUI、无界面执行和 App Server 等表面，避免每个入口复制状态机；适配器仍保留各自传输、错误和终止契约。共享核心带来复用，不意味着协议等价。

第二，Thread 身份、活动 Session 和 Turn 状态分层，使长生命周期历史可以跨进程恢复，同时保持一个 Session 内至多一个活动工作流。需要并行时创建有身份的子线程，而不是让两个匿名轮次竞争同一历史。

第三，模型可见工具与真实 Registry 分离，允许动态能力投影、安全过滤和 Code Mode 表面切换。模型能提出什么与宿主能执行什么各自可审计，未知或未授权工具形成结构化结果。

第四，策略、审批、权限描述与平台 Sandbox 分层，承认控制面决定和操作系统强制是两回事。平台无法兑现关键限制时失效关闭，用户批准也不自动升级为隔离证明。

第五，Rollout、Trace、OTel、Feedback 与 Eval 分开，兼顾恢复、调试、运营和质量判定。观察通道可以缺失或有偏差，发布 Scorer 使用固定任务与独立产物，不让内部完成状态自己给自己打分。

第六，以同一贯穿任务串联各 crate，是为了让读者先掌握数据流和责任边界，再深入包实现。目录结构会演进，稳定身份、提交点和证据方法更具迁移性；具体结论仍回到锁定源码与上游测试。

## 实现思路

学习这条主线时，以一个带工具副作用的固定任务建立证据包，比按 crate 目录遍历更有效。每篇文章都沿同一 run 深入一个边界，并回到共同身份。

1. **冻结 Target。** 记录锁定提交、surface、模型、配置、工作目录、权限和工具表，生成 TrialId。
2. **捕获请求。** 保存有效配置 provenance、AGENTS 与 Context 正规化报告，以及脱敏的实际 Responses 输入。
3. **记录身份。** ThreadId、TurnId、sample index、submission ID 和 call_id 分列，不能互相替代。
4. **追踪工具。** 从函数调用经 Router、Policy、Approval、Sandbox 到进程结果，保存每层决定和外部产物。
5. **验证持久化。** 检查 Rollout 水位、恢复、压缩替代历史和 unknown 副作用，不默认重放工具。
6. **冻结能力表面。** 保存 Skill、动态工具、Code Mode 与子线程图版本；回退或刷新创建新的运行条件。
7. **比较产品投影。** 建立核心事件到 CLI 或 App Server 的映射，记录丢失字段和终态压缩。
8. **独立评分。** 在干净环境检查补丁、测试和安全约束，训练 Reward 与发布 holdout 分离。

```text
target = freeze(source, surface, model, config, permissions, tools)
thread, turn = start(target)
request = build_model_visible_context(thread.rollout, target)
response = sample(request)
while response 包含工具调用:
    results = execute_via_router_and_security(response.calls)
    response = sample(history_with(results))
artifacts = collect(rollout, trace, workspace, surface_output)
score = independent_scorer(target.trial, artifacts)
```

这个最小实现保留清楚接口：配置解析不执行工具，Router 不批准自己，Sandbox 不判断任务正确，Trace 不产生 Score。接口之间用稳定 ID 与追加事件连接，任何派生摘要都可回到来源。具体 Rust 类型和 Feature 仍以锁定源码为准。

验证采用故障矩阵而非单一成功演示：模型流提前关闭、未知工具、审批拒绝、后端缺失、工具副作用后崩溃、压缩丢约束、子线程通知重复和表面终态映射缺失。每次只改变一个轴，记录产品结果与 Trial 结果。

## 贯穿案例

贯穿任务沿用上游工具夹具：「运行 `echo tool harness`，读取输出并给出最终回复」。教学变体再要求 call_id 正确关联、禁止额外文件写入，并由独立 Scorer 检查最终文本与副作用。

1. **创建运行。** 无界面 surface 根据配置创建 Thread 与 Turn，工具表含 `exec_command`；当前夹具使用不询问审批和禁用权限保护，仅用于工具往返。
2. **首个采样。** Responses 模拟流提出带固定 call_id 的命令，输出处理器组装完整调用，Router 找到真实本地执行器。
3. **执行与提交。** 安全配置按夹具条件处理，进程输出 `tool harness`；结果携带原 call_id 写入历史和 Rollout。
4. **后续采样。** 第二次请求包含 `function_call_output`，模型返回 `all done`，核心发 TurnComplete。
5. **表面投影。** 无界面入口输出最终文本与退出状态；Trace / Rollout 保存关联，OTel 是否采样不影响核心结算。
6. **独立评分。** Scorer 检查命令、stdout、call_id、最终文本和无额外写入，才给 Trial pass。

```json
{"thread":"th-example","turn":"tr-example","callId":"exec-command-tool-call","command":"echo tool harness"}
```

```json
{"processExit":0,"stdout":"tool harness\n","turnStop":"complete","artifactScore":"pass"}
```

安全反例保持同一任务，却把 PermissionProfile 改为只读并让命令尝试写文件。Policy 或 Sandbox 拒绝后，模型可以正常解释失败，Turn 也可能完成；Trial 因目标未完成判 fail。不能为了重试到通过悄悄切换权限。

恢复反例发生在进程输出后、tool result 提交前。外部命令本例没有持久副作用，但替换成追加文件就可能重复；恢复器依据调用提交点和产物探测标记 unknown，不重放。Attempt 只描述基础设施恢复，分母仍是同一 Trial。

表面反例把同一核心 Turn 交给 App Server。JSON-RPC 成功响应与无界面退出码不是同一语义，Eval Adapter 保留原始终态并分别评分。案例由此覆盖八篇文章的共同主线，也说明每条新增机制都必须回到身份、证据和独立判定。

## 系统全景

![Codex 从多种产品表面、线程与会话到模型工具循环、安全执行和持久化的中文系统架构图](../../../assets/diagrams/codex/system-architecture.svg)

Claim: codex.architecture.shared-core-multiple-surfaces

Codex 的入口不是单一界面。锁定 `codex-rs/cli/src/main.rs:1137-1197,1247-1300,2599-2617` 分别把交互终端、无界面执行、MCP Server、App Server 等入口路由到各自适配器；App Server 又能选择标准输入输出或监听传输。这些表面不等于完全相同的产品能力，但它们会落到共享协议和核心运行时边界，而不是每个表面各写一套模型工具状态机。

系统核心也不是一个巨型对象。`ThreadManager` 创建并在内存中维护 Thread；`CodexThread` 包装活动 `Session`、双向消息通道、来源、配置事件和可选 Rollout 路径；`run_turn` 持有本轮输入、上下文、模型客户端会话与取消令牌。`ToolRouter` 则把模型可见规格与实际工具注册表分开：模型「看见」某个工具不自动等于工具可执行，仍要经过注册、策略、审批、沙箱与具体运行时。

持久化位于核心旁边，而不是模型上下文的同义词。`codex-rs/thread-store/src/lib.rs:1-5` 把 `ThreadId` 定义为持久句柄，后端可以解析到本地 Rollout、RPC 或其他存储；Rollout、派生模型历史、活动 Session 和产品表面的界面状态因此必须分开核对。架构图把这些关系放在一张图中属于 D 级跨模块推断，具体入口、Feature、配置和平台仍决定一次运行真正拥有的能力。

Eval 位于轨迹出口。Trace、Telemetry、Feedback 或 Rollout 可成为评测输入，却都不自动等于训练奖励或发布门禁。独立 Eval 仍需固定 Trial、保留 Artifact、应用明确 Scorer，并将训练 Reward、Checkpoint 选择与最终发布评测分开。

## 课程状态与顺序

| 顺序 | 模块 | 状态 | 先回答的问题 |
| ---: | --- | --- | --- |
<!-- course-navigation:start -->
| 00 | [主线入口](README.md) | 已复核 | 多 crate 核心和多产品表面怎样完成一次真实 Turn？ |
| 01 | [配置、Prompt 与 Context](01-config-prompt-context.md) | 已复核 | 配置、基础指令、AGENTS 与上下文片段怎样形成请求？ |
| 02 | [Thread、Task 与 Turn](02-thread-task-turn.md) | 已复核 | 持久线程、活动执行和单轮输入分别由谁持有？ |
| 03 | [模型流与工具闭环](03-model-tool-loop.md) | 已复核 | Responses 流、路由、并行工具与结果提交怎样收敛？ |
| 04 | [执行策略与沙箱](04-exec-policy-sandbox.md) | 已复核 | 策略、审批、升级和多平台隔离怎样分层？ |
| 05 | [Rollout、历史与记忆](05-rollout-history-memory.md) | 已复核 | 原始记录、模型上下文、压缩、恢复与长期记忆谁是权威？ |
| 06 | [扩展与 Code Mode](06-extensions-code-mode.md) | 已复核 | Skill、Hook、Plugin、MCP、Connector 和运行时代码怎样接入？ |
| 07 | [子智能体与编排](07-subagents-orchestration.md) | 已复核 | 委派、消息、等待、取消和线程图怎样协作？ |
| 08 | [产品表面、Trace 与 Eval](08-surfaces-trace-eval-design.md) | 已复核 | CLI、TUI、App Server、Cloud、SDK 和评测接入怎样保持语义边界？ |
<!-- course-navigation:end -->

状态表是发布契约，不是进度装饰。九篇课程的正文、Claim、图示、来源和自检已经整批通过门禁；任意一篇退出发布状态，Codex 主线都会被导航检查判为不完整。

状态先于导航。

## 真实输入与输出

### 输入

上游非 Windows 集成测试 `exec_command_tool_executes_command_and_streams_output` 创建模型名为 `test-gpt-5-codex` 的测试 Session，并向 Codex 提交真实用户文字：

```text
please run the shell command
```

该 Turn 显式使用 `AskForApproval::Never`、`PermissionProfile::Disabled` 和测试工作目录派生的沙箱字段。这些设置只描述当前测试，不是 Codex 所有运行模式的默认值，也不能用来证明沙箱隔离。

### 第一次 Responses 流

模拟 Responses 服务先发送 `response.created`，再发出一个 `exec_command` 函数调用，最后完成第一条响应。上游测试构造的真实参数是：

```json
{"cmd":"echo tool harness","login":false}
```

调用标识是 `exec-command-tool-call`。Harness 必须保留这个标识，因为工具输出要以同一标识进入下一次模型请求；只在界面显示命令输出而不回送给模型，无法形成工具闭环。

### 输出

工具结果与第二次 Responses 流共同构成这个测试的输出证据。

本地命令实际执行后，测试检查第二个请求中的 `function_call_output`。它应包含退出码 `0` 和输出正文：

```text
tool harness
```

模拟服务随后返回 assistant 文本 `all done` 并完成第二条响应。测试等待对外 `EventMsg::TurnComplete` 才结束。于是至少有三种不同的完成语义：命令进程成功、Responses 响应结束、Codex Turn 完成；三者仍都不是 Eval 通过。

## 调用链

![Codex 端到端任务从用户输入、首次模型采样、工具执行到结果回送和轮次完成的中文流程图](../../../assets/diagrams/codex/end-to-end-task.svg)

Claim: codex.turn.tool-result-loop

1. 产品表面把用户输入映射成协议操作，ThreadManager 定位或创建 `CodexThread`；活动 `Session` 接收输入并建立 Turn 级配置、环境与取消边界。
2. `run_turn` 记录用户输入与上下文更新，克隆当前历史的模型可见投影，准备 Responses 元数据，然后调用 `run_sampling_request`。
3. `run_sampling_request` 获取基础指令，建立 `ToolCallRuntime`，构造 Prompt，并通过 `ModelClientSession::stream` 消费 Responses 流。
4. `ResponseEvent::OutputItemDone` 若包含函数或自定义工具调用，会交给输出处理器与 `ToolRouter`；实际执行还要经过工具运行时及当前策略、安全和平台后端。
5. 工具 Future 的结果进入 Session 历史，并把 `needs_follow_up` 置为真。外层再次从历史构造模型可见输入，因此第二次请求可携带与原 `call_id` 关联的函数调用输出。
6. 当后续响应只产生最终 assistant 消息且没有继续条件时，循环停止并发出 Turn 完成事件；若有待处理输入、压缩、Hook、取消、可重试流错误或工具错误，则会走不同路径。
7. 产品表面把核心事件投影成终端输出或应用协议；Rollout、Trace 和 Artifact 可供外部评测读取，但评测必须另行定义 Trial 与 Scorer。

## 源码证据

`run_turn` 的注释直接给出最小循环语义：函数调用会执行并在下一次采样中回送输出，只有 assistant 消息时才记录历史并完成 Turn。

```source
codex-rs/core/src/session/turn.rs:145-159
If the model requests a function call, we execute it and send the output
back to the model in the next sampling request.
If the model sends only an assistant message, we record it in the
conversation history and consider the turn complete.
```

外层循环从 Session 历史生成模型可见输入，并依据采样结果是否要求 follow-up 决定继续：

```source
codex-rs/core/src/session/turn.rs:369-400
let sampling_request_input: Vec<ResponseItem> = async {
    sess.clone_history().await
        .for_prompt(&step_context.model_info.input_modalities)
};
let SamplingRequestResult {
    needs_follow_up: model_needs_follow_up,
    ...
} = sampling_request_output;
```

工具路由本身同时持有真实注册表和模型可见规格，说明「暴露给模型」与「取得运行时实现」是两个动作：

```source
codex-rs/core/src/tools/router.rs:68-71,109-145
pub struct ToolRouter {
    registry: ToolRegistry,
    model_visible_specs: Arc<[ToolSpec]>,
}
pub(crate) fn tool_runtime(&self, call: &ToolCall)
    -> Option<Arc<dyn CoreToolRuntime>>
```

最强的入口行为证据来自上游集成测试。它构造两次 Responses 流、提交用户输入、等待 `TurnComplete`，并从第二次请求检查与调用标识关联的工具输出：

```source
codex-rs/core/tests/suite/tool_harness.rs:78-95,102-133
let call_id = "exec-command-tool-call";
ev_function_call(call_id, "exec_command", &command_args)
text: "please run the shell command".into(),
wait_for_event(&codex, |event| matches!(event, EventMsg::TurnComplete(_))).await;
let (output_text, _) = call_output(&req, call_id);
```

系统架构 Claim 使用 D 级，因为它综合 CLI 分派、Thread、Session、工具、安全与持久化 crate 形成课程投影。Turn 工具结果 Claim 使用 B 级：循环语义由源码直接说明，并由上游集成测试锁定一次真实本地命令的两请求往返。B 级不代表 Windows、线上模型、所有工具或所有策略组合都已覆盖。

## 失败与限制

第一，产品表面可达不等于核心能力相同。TUI、无界面执行、MCP Server、App Server 和 Cloud 有不同协议、配置入口与生命周期；某个表面能展示事件，不证明另一个表面实现了同样的恢复、审批或交互行为。

第二，模型发出工具名不等于工具会执行。工具可能未注册、未暴露、参数解析失败、策略拒绝、需要审批、沙箱后端不可用、进程超时或取消。每种失败的责任层不同，不能统一写成「模型调用失败」。

第三，测试使用 `PermissionProfile::Disabled` 与 `AskForApproval::Never`。它适合隔离并验证工具结果回送，不适合证明审批流程或 OS 沙箱。尤其该文件用 `cfg(not(target_os = "windows"))` 排除 Windows；Windows 结论必须另找平台测试和真实后端证据。

第四，Responses 服务是 Mock。命令执行路径是真实本地路径，但模型响应是确定性 SSE 夹具，不覆盖线上鉴权、网络故障、服务端缓存、限流或模型不确定性。它也不能代表当前 Codex 桌面应用与锁定开源提交完全一致。

第五，Turn 完成不是任务成功。`all done` 可能与用户真实目标不符，退出码为零也可能产生错误副作用。独立 Eval 应按固定 Trial 检查最终文字、执行结果、文件产物和安全约束；基础设施恢复另记 Attempt，不能重试到「看起来通过」。

正常结束不等于任务成功。

## 验证方法

先做静态核对：确认源码 Checkout HEAD 与 frontmatter Commit 一致；逐项验证 Claim 路径、行号和摘录；检查架构图没有把 CLI、App Server、Core、Thread Store 与 Rollout 画成同一 crate，也没有把模型可见工具直接连到未受控副作用。

再做确定性行为验证：在上游支持的平台运行 `tool_harness` 集成测试，保留两次模拟 Responses 请求，确认第二次请求存在同一 `call_id` 的 `function_call_output`，内容含退出码与 `tool harness`，并等待 `EventMsg::TurnComplete`。Windows 不应伪装运行这个被编译排除的测试。

接着做失败注入：分别让工具不存在、参数无效、策略拒绝、审批不可用、命令退出非零、执行超时、Responses 流提前关闭、第二次响应失败和 Turn 被取消。每次都记录副作用是否发生、工具输出是否持久化、模型是否再次采样以及产品表面收到什么终止事件。

最后验证 Eval 接入：给同一任务固定 Trial 标识，保存用户输入、有效配置、调用参数、退出状态、标准输出、最终消息与环境摘要；由独立 Scorer 判断任务和安全约束。Trace 或 Feedback 若没有明确 RewardAdapter 语义，只标为观测信号，不称为 DPO、GRPO、RFT 训练奖励或独立发布门禁。

最后查产物。

## 自检

### 问题 1

为什么 Codex 不能只画成「用户 → 模型 → shell」三格图？

**答案：** 产品表面、Thread 管理、活动 Session、Turn 上下文、Responses 客户端、工具路由、安全执行和持久化各自有独立责任。三格图会隐藏工具可见性与可执行性、安全决策与沙箱兑现、活动状态与持久状态之间的边界。

### 问题 2

第二次请求中的 `function_call_output` 为什么是关键证据？

**答案：** 它证明工具结果不只显示给用户，而是按原 `call_id` 回到模型可见历史，模型能据此产生后续回复。这才构成工具结果闭环。

### 问题 3

上游测试等待 `TurnComplete`，为什么仍不能称为 Eval 通过？

**答案：** `TurnComplete` 是 Harness 生命周期事件，只说明当前 Turn 收敛。Eval 还需固定任务契约和独立 Scorer 检查答案、副作用与安全约束；生命周期完成可以伴随错误答案。

### 问题 4

这个样例能证明 Windows 沙箱和线上 OpenAI Responses 都工作吗？

**答案：** 不能。测试文件明确排除 Windows，Responses 来自 Mock SSE 服务，且权限配置刻意禁用保护。它只支持锁定版本、该测试条件下的本地工具结果往返结论。
