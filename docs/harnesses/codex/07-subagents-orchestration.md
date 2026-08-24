---
title: Codex 子智能体、线程图与协作编排
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/core/src/agent/control.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/agent/control/spawn.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/agent_communication.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/collaboration-mode-templates/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/multi_agent_mode.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/subagent_notifications.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 子智能体、线程图与协作编排

## 读者会得到什么

子智能体不是父轮次里的一个普通函数 Future。每个子智能体拥有自己的 ThreadId、Session、Turn、模型上下文、状态和 Rollout；根线程树共享 AgentControl、注册表与执行容量。消息可以只追加，也可以触发新 Turn；等待、打断、恢复和完成通知又是不同控制动作。

线程不是任务。通知不是结果。并发也不是质量。

本篇把应用任务、根 Thread、子 Thread、活动 Agent 与跨线程通信分开。这样才能解释：spawn 为什么要保留父线程与父轮次，follow-up 为什么可能触发新轮次，wait 为什么不等于轮询文本，interrupt 为什么不是删除线程，以及子智能体数量为什么不是任务成功率。

身份必须稳定。关系必须可追。来源不能丢失。终态也要留痕。

## 核心概念

子智能体编排的基本单元是线程图，而非一组匿名并发 Future。每个节点拥有 ThreadId、独立 Session 与 Rollout，边保存父线程、父 Turn、角色和历史继承。根线程树共享控制面与容量，但子节点的上下文、工具结果和终态仍各自归属。

| 概念 | 负责的问题 | 是否创建新 Turn / Thread | 主要证据 |
|---|---|---|---|
| spawn | 怎样创建有身份的子智能体 | 新 Thread，首个 Turn | 父子边、预留容量、子 Rollout |
| inheritance | 子模型初始看见哪些父历史 | 不创建身份 | 实际 Context 摘要、截断规则 |
| send message | 怎样向现有子线程通信 | 可只追加消息 | sender、receiver、kind |
| follow-up | 怎样让现有子线程继续工作 | 同 Thread 新 Turn | parent Turn、提交结果 |
| wait | 怎样等待目标状态变化 | 否 | 订阅目标、观察到的状态 |
| list | 怎样枚举根树活动节点 | 否 | AgentPath、status |
| interrupt | 怎样停止目标当前执行 | 不删除 Thread | Op、aborted 事件、资源状态 |
| notification | 子终态如何传给祖先 | 不创建子结果 | 终态、来源 Thread、注入次数 |

spawn 的成功点是子线程创建并接受初始任务，不是子任务完成。创建前要预留线程槽和执行容量，计算唯一 AgentPath，并固定角色、协作模式与历史继承。任何一步失败都应释放预留，避免幽灵节点占满根树。

历史继承控制子 Agent 的初始知识。无历史适合独立、低泄漏任务，完整历史提供最多上下文，最近若干 Turn 在成本和约束保留之间折中。无论选哪种，父子 lineage 都应持久保存；上下文截断不能把图关系一起删掉。

通信分「投递信息」和「触发工作」。普通消息可以追加到现有子线程，follow-up 则在目标空闲时启动新 Turn，并关联当前父 Turn。若目标仍忙，系统需要明确排队、steer 或拒绝语义，不能凭一段文本猜测是否已执行。

wait 是控制面订阅，不是持续把状态文本塞给模型。完成、失败、中断和关闭都是可观察终态；超时只表示等待者暂时没看到变化。通知则在子终态后进入父线程的后续模型上下文，即使父没有调用 wait，也不应重复生成多个任务结果。

多智能体 Eval 还要区分 Trial、子任务和恢复 Attempt。一个 Trial 可以创建多个子 Thread，它们共同服务同一产品结果；子节点数量不是分母。子基础设施故障可在预先规则内恢复，子答案错误不能通过不断 spawn 新节点挑出成功答案。

线程图还要满足结构不变量：每个非根节点只有一个创建父边，AgentPath 在根树内唯一，父 Turn 必须真实存在，终态节点不会重新占用活动容量。跨线程消息可以形成多对多通信，却不改变创建 lineage；否则一条 follow-up 会让子节点的父身份随发送者漂移。

递归委派需要深度与总量两种预算。只限制单层并发无法阻止每个子节点继续创建后代；只限制深度又可能在同层生成过多节点。拒绝超限 spawn 应形成结构化结果并释放预留，不让模型通过异常路径绕过控制面。

父端消费结果也是独立事件。子通知到达只说明结果可用，父 Agent 可能忽略、误读或在摘要中丢失证据；最终报告应引用 consumed child result ID。Scorer 既检查子产物，也检查父端是否正确整合，而不是看到通知就认为协作成功。

## 为什么这样设计

第一，独立 Thread 让子智能体拥有自己的上下文预算、工具轨迹和恢复点。若子任务只是父 Turn 内的匿名 Future，大量中间消息会挤占父 Context，失败也难以单独重试或审计。

第二，根树共享 AgentControl 和容量限制，防止递归委派无限扩张。每个根 Session 的资源和节点可统一枚举、等待与中断，同时不同根树不会意外共享活动 Agent 池。

第三，通信保存两端身份与 kind，支持异步协作和因果追踪。父线程可以继续其他工作，子完成后再通过通知汇入；审计者能区分 spawn 初始任务、普通消息与新 Turn follow-up。

第四，wait、list 和 interrupt 分开，避免观察动作改变目标状态。wait 不制造完成，list 不启动子线程，interrupt 不删除历史；明确命令语义使 UI 和自动化客户端不必用副作用模拟查询。

第五，终态通知由控制面注入祖先，使父线程不必一直阻塞等待。通知携带来源和终态，下一次采样可以整合；重复等待者不会把一次完成复制成多个结果。

第六，历史继承显式配置，将成本、隐私和任务质量变成可记录条件。完整继承不自动更好，截断也不自动更安全；Eval 可以按继承模式分层，而不是把上下文差异归因给模型。

## 实现思路

教学编排器使用不可变线程图与事件驱动状态机。它用于解释机制，不声称 Codex 内部采用同名 GraphStore。

1. **编译 spawn 规范。** 固定父 Thread / Turn、角色、任务、模型、工具、历史继承、最大深度与预算，生成请求幂等键。
2. **预留资源。** 在创建前原子取得线程槽和执行容量；失败立即返回，不生成半节点。
3. **创建子节点。** 分配 ThreadId 和 AgentPath，复制或投影允许的父历史，保存 lineage 后启动首个 Turn。
4. **路由通信。** 每条消息携带 sender、receiver、kind、parentTurn 和 submission ID；follow-up 仅在状态允许时触发新 Turn。
5. **订阅状态。** wait 针对一组 ThreadId 订阅版本化状态，超时返回快照；list 从根树读取，不扫描所有全局线程。
6. **处理控制。** interrupt 发送给目标当前 Task，保留 Thread 与 Rollout；关闭和删除使用独立操作。
7. **传播终态。** 子节点结算后只生成一次带 event ID 的通知，祖先按去重键写入 Context，释放执行容量。
8. **恢复开放节点。** 从持久图读取未终态后代，验证容量和历史水位后重新驻留；已完成节点不重新执行。

```text
spec = compile_spawn(parent_thread, parent_turn, task, inheritance, budgets)
reservation = root_control.reserve(spec)
child = create_thread(spec.thread_id, lineage, inherited_context)
run(child.first_turn)
on child.status_changed:
    publish_once(notification(child.id, child.status, child.result_ref))
    如果 child.terminal: release(reservation)
```

线程图至少保存 node id、parent id、parent turn、AgentPath、role、inheritance hash、status version 和 result reference。消息日志保存 submission ID 以便去重；通知 event ID 防止恢复时重复注入。父摘要只能引用子结果，不能覆盖子 Rollout 的原始终态。

共享工作区要单独治理。独立 Thread 不等于独立文件系统，两个子 Agent 可能修改同一文件；编排器应分配只读任务、隔离检出或明确合并所有者。文件冲突属于产物协调，不由线程身份自动解决。

质量控制采用结构化交接 Schema，例如风险项、证据引用、状态与缺口。父 Agent 检查 Schema 和来源，再决定是否消费；子自报「完成」只是字段。独立 Scorer 最终检查合并产物，并将超预算、重复副作用与缺失结果纳入 Trial。

## 贯穿案例

根任务要求审查三个模块并生成风险报告。根线程创建两个只读 reviewer，第二个完成后接收 follow-up 审查第三模块；根线程并行整理报告框架，不阻塞等待。

1. **编译节点。** reviewer-a 继承最近两轮，reviewer-b 不继承历史，只接收结构化任务；两者各有 ThreadId、parent Turn 和最大四轮预算。
2. **预留并启动。** 根控制面取得两个槽，保存 AgentPath；a、b 分别启动独立 Session，工具权限只读。
3. **异步完成。** b 先返回结构化结果，状态变为 completed；父未调用 wait，仍在下一次采样收到一次完成通知。
4. **发送 follow-up。** 父向同一 b 线程提交第三模块任务，触发新 Turn 并关联新的父 Turn；ThreadId 保持不变。
5. **处理中断。** a 超出范围读取秘密，安全链拒绝；父随后 interrupt 当前 Task，a Thread 与拒绝轨迹仍保留。
6. **汇总评分。** 父报告引用 a 的 partial 与 b 的两个结果，独立 Scorer 检查风险证据和模块覆盖，不按 spawn 数计分。

```json
{"root":"th-root","children":[{"id":"th-a","path":"1","status":"interrupted"},{"id":"th-b","path":"2","status":"completed","turns":2}]}
```

```json
{"notification":{"source":"th-b","eventId":"done-b-1","status":"completed"},"parentWaited":false,"deduplicated":true}
```

并发冲突变体允许两个 reviewer 写同一报告。线程图全部正确，文件仍发生覆盖；解决方案是只读子任务加父端单写，或隔离工作区后显式合并。这个失败证明编排身份无法替代资源隔离。

恢复变体在 b 首轮完成通知写入前重启。恢复器读取子终态和通知 event ID，若父 Rollout 未消费则补写一次，若已消费则不重复；它不会重新执行 b。等待者的超时或进程重启都不能把一次子任务完成变成多个成功样本。

质量反例让 a、b 都自报完成，但 b 的第三模块结果缺少源码证据。父报告可以正常生成，Trial 仍判 fail。多智能体提高了覆盖能力，却没有把内部状态提升为发布结论。

再让 a 尝试创建超过深度限制的孙节点。控制面在分配 ThreadId 前拒绝，并把原因回送 a；父端只看到结构化汇总时，验证器仍应读取最深层调用证据。根回复「深度限制已触发」本身不够，因为子 Agent 可能吞掉真实错误。

成本报告分别统计模型 token、工具时间、峰值活动节点和总 Thread 数。它们用于比较编排代价，不直接进入正确性分数；若发布门禁包含预算，阈值与失败语义必须在 Trial 前冻结。

## 真实输入与输出

### 输入

上游测试让根线程调用 `spawn_agent`，子线程收到初始任务并返回完成消息；另一个场景不调用等待工具，父线程仍要接收完成通知：

```json
{"任务":"创建子线程并继续","子任务":"独立完成一项有界工作"}
```

后续测试复用同一子线程发送 follow-up，并检查新父 Turn 的关联信息；等待场景则让父线程在子线程仍运行时调用 `wait_agent`。

### 输出

子线程拥有不同 ThreadId 和独立 transcript；完成后，根线程的后续模型输入包含结构化子智能体通知，即使父线程没有主动等待。复用子线程时，后续子 Turn 关联新的父 Turn，而根线程本身不把父线程标识指向自己。

```text
根线程 → 创建子线程 → 子线程独立运行
子线程完成 → 状态终结 → 完成通知进入根线程
后续消息 → 同一子线程的新 Turn
```

这些结果锁定关联与通知，不证明并行执行会提升任务质量。

## 调用链

线程树负责身份，控制面负责生命周期。

![Codex 根线程、子线程、活动智能体、跨线程消息、等待、打断、恢复与完成通知的中文编排图](../../../assets/diagrams/codex/07-subagents-orchestration.svg)

Claim: codex.orchestration.subagents-are-thread-scoped

1. 根 Session 创建一次 AgentControl。它持有弱引用到全局 ThreadManagerState，但内部 AgentRegistry、执行限制器和会话态只在该根线程树共享，不是全局智能体池。
2. spawn 先预留线程与执行容量，生成新 ThreadId，计算父线程、父轮次、AgentPath、角色、昵称、历史继承方式和协作模式，再启动子 CodexThread 并提交初始输入。
3. Fork 历史不是无条件复制全部父记录。配置可选择无历史、完整历史或最近若干 Turn；截断会影响子线程模型上下文，持久父子边仍应保留。
4. send_message 只向既有子线程传递通信；follow-up 在需要时触发新 Turn。通信上下文记录发送者 ThreadId、接收者 ThreadId、种类与父轮次，使 Trace 能区分创建消息和后续消息。
5. wait 订阅 AgentStatus，并在目标仍运行时等待状态变化；list 读取根线程树的活动节点；interrupt 向目标线程发送中断操作。它们分别观察、枚举和控制，不应互相模拟。
6. 子线程到达完成、错误、关闭或中断等终态后，控制面更新状态并向可接收通知的祖先注入子智能体通知。父线程无需保持阻塞等待，也能在下一次采样看到结果。
7. V2 路径可从持久线程图恢复开放后代的元数据与模型上下文，并在容量允许时重新驻留。恢复的是线程身份和记录，不是把已完成子任务重新计为一次新成功。

## 源码证据

AgentControl 的作用域在源码注释中写得很明确：

```source
codex-rs/core/src/agent/control.rs:101-120
An `AgentControl` instance is intended to be created at most once per root thread/session tree.
That same `AgentControl` is then shared with every sub-agent spawned from that root.
```

活动节点把 ThreadId、AgentMetadata 与 AgentStatus 分开持有：

```source
codex-rs/core/src/agent/control.rs:88-99
pub(crate) struct LiveAgent { thread_id, metadata, status }
pub(crate) struct ListedAgent { agent_path, agent_status }
```

发送通信与打断走不同控制路径；只有标记 trigger_turn 的通信携带父轮次触发新 Turn：

```source
codex-rs/core/src/agent/control.rs:211-282,296-311
let parent_turn_id = parent_turn_id.filter(|_| communication.trigger_turn);
Op::InterAgentCommunication { communication }
Op::Interrupt
```

spawn 在创建前执行容量预留，并把历史继承与父身份显式传入：

```source
codex-rs/core/src/agent/control/spawn.rs:403-448
let agent_max_threads = config.effective_agent_max_threads(...);
let mut reservation = self.state.reserve_spawn_slot(...)?;
let inheritance = SpawnAgentThreadInheritance { ... };
```

跨线程通信事件保留种类与两端 ThreadId：

```source
codex-rs/core/src/agent_communication.rs:7-19,26-58
Self::Spawn => "spawn"; Self::Followup => "followup";
sender_thread_id; receiver_thread_id;
```

上游通知测试直接检查父 Rollout 最终含子智能体通知，并检查父子 transcript 路径不同：

```source
codex-rs/core/tests/suite/subagent_notifications.rs:492-516,784-793
rollout.contains("<subagent_notification>")
assert_ne!(parent_transcript_path, agent_transcript_path);
```

该 Claim 使用 B 级：控制面源码锁定根线程树作用域、独立 ThreadId、通信与中断路径，上游测试锁定独立 transcript 和完成通知。它不证明所有多智能体模式都默认启用，也不保证子线程并发带来质量提升。

## 失败与限制

spawn 成功不等于子任务成功。它只证明子 Thread 被创建并收到初始输入；模型错误、工具失败、审批阻断、超时或通知丢失仍需分别观察。执行容量也只是资源边界，不是质量门禁。

消息送达不等于新 Turn 已完成。普通消息、触发 Turn 的 follow-up 和完成通知具有不同语义；若只保存文本而丢失 communication kind、trigger_turn 和父轮次，恢复后就无法判断是否应重新采样。

wait 不创造完成。它只订阅状态，目标可能完成、失败、中断或消失；多个等待者也不能把一次终态计成多次任务完成。轮询超时应保留为观察结果，不能自动改写子任务状态。

等待只观察。中断只控制。

interrupt 不是删除。中断当前任务后，线程记录和身份仍可能存在，也可能后续恢复或接收 follow-up。若真正要求关闭或释放资源，应使用对应生命周期操作并核对最终状态。

历史继承会改变行为。无历史、完整历史和最近若干 Turn 的子线程看到不同 Prompt；完整历史还可能携带不必要隐私或旧指令，截断历史则可能丢掉约束。每次 spawn 都应记录继承模式和实际上下文摘要。

多智能体模式本身受策略约束。模型指令可禁止主动 spawn，用户或技能的明确授权才能打开某些委派路径。看到工具存在不能推断本轮允许调用。

## 验证方法

先建立线程图夹具：根线程创建两个子线程，其中一个再创建孙线程。记录每个 ThreadId、AgentPath、角色、父 ThreadId、父 TurnId、历史继承模式和容量预留；检查 list 只返回正确根树的活动节点。

再测试消息语义。分别发送不触发 Turn 的消息和触发 Turn 的 follow-up，捕获子线程请求体及跨线程事件；确认发送者、接收者、通信种类和父轮次一致，重复消息不会无意生成两个 Turn。

随后测试状态机：运行中等待、完成后等待、中断运行中任务、终态后中断、冷恢复开放子线程。每一步都核对状态、通知次数、Rollout 和执行容量释放，不只观察最终聊天文本。

最后测试质量边界。固定 Trial 与任务数据，比较单智能体和多智能体路径；子任务恢复只能计为同一 Trial 内 Attempt。评分器检查最终产物、重复副作用和成本，不能把 spawn 数量、并发峰值或通知数量当作成功代理。

## 自检

### 问题 1

为什么子智能体不是父 Turn 中的普通并行工具？

**答案：** 它拥有独立 ThreadId、Session、Turn、历史、状态与 Rollout，并通过根线程树控制面通信；生命周期长于单个工具 Future。

### 问题 2

父线程没有调用 wait，是否一定收不到子线程完成结果？

**答案：** 不一定。上游测试锁定了无主动等待时仍向父 Rollout 注入完成通知的路径。

### 问题 3

interrupt 后能否认为子线程已删除？

**答案：** 不能。interrupt 针对当前任务，线程身份和持久记录仍可能保留；删除、关闭和释放资源是其他生命周期语义。

### 问题 4

并发创建更多子智能体是否能直接提高 Eval 成功率？

**答案：** 不能。并发数是资源与编排指标；任务成功仍由固定 Trial、最终产物和独立评分器决定。
