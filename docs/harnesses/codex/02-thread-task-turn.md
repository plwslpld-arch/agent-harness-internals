---
title: Codex 线程、任务与轮次
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/core/src/codex_thread.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/session/session.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/state/turn.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/tasks/mod.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/protocol/src/protocol.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/turn_state.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/turn_input_submission.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 线程、任务与轮次

## 读者会得到什么

Codex 源码同时出现 Thread、Session、Task、Turn、Op、Event 和界面任务状态。如果把它们都译成「一次任务」，恢复会错误地创建新身份，取消会误删持久历史，界面完成也会被误写成模型请求完成。本篇按所有权和生命周期拆开这些概念：Thread 是可持久引用的会话身份，CodexThread 是活动线程句柄，Session 持有共享运行服务，SessionTask 是后台工作流，TurnContext 与 ActiveTurn 约束一次逻辑轮次，Op/Event 则是跨表面提交与观测的协议。

读完后，你应该能回答：同一 Turn 为什么可包含多次模型请求；转向输入为何可以进入活动 Turn；空闲时强行 steer 为什么必须返回类型化拒绝；中断、挂起、恢复和完成为何不是同一个状态迁移。

身份先于状态。

## 真实输入与输出

### 输入

上游 `turn_state.rs` 的确定性测试先提交：

```text
run a shell command
```

第一次模型响应提出回显命令，产生同一 Turn 内的第二次模型请求；工具闭环结束后，测试又提交 `second turn`。另一个输入提交测试先启动被门闩阻塞的活动 Turn，再提交 `steer active turn` 并携带新的审批和环境设置，最后在 Turn 完成后尝试对 `missing-turn` 执行 steer。

### 输出

模型请求元数据给出清晰边界：第一次 Turn 的首个请求没有服务端轮次状态，工具后的 follow-up 带 `ts-1`，第二个逻辑 Turn 又清空该状态；前两个请求的 turn_id 相同，第三个不同。

```text
轮次状态：空 → ts-1 → 空
轮次标识：第一轮 = 第一轮后续请求 ≠ 第二轮
```

活动 Turn 的 steer 返回 `Steered { turn_id }`，并更新线程配置快照；完成后再 steer 返回 `NotSubmitted { NoActiveTurn }`，且被拒绝输入携带的配置不污染已接受设置。类型化返回值让调用方不必从界面文字猜状态。

拒绝必须无副作用。

## 调用链

先核对身份。

![Codex 从持久线程身份、活动会话、后台任务到轮次状态和协议事件的中文生命周期图](../../../assets/diagrams/codex/02-thread-task-turn.svg)

Claim: codex.thread.turn-task-state-separation

1. 产品表面通过 `Op` 提交轮次输入、线程设置、中断、恢复或挂起；每个 `Event` 用提交标识关联返回的 `EventMsg`。
2. ThreadManager 以 ThreadId 定位活动 `CodexThread`。它保存 Session、双向通道、Session 来源、配置事件和可选 Rollout 路径；持久 Thread 身份不等于当前一定有运行任务。
3. Session 持有线程级共享服务、状态、Feature、输入队列和至多一个 ActiveTurn。源码注释明确规定一个 Session 同时最多一个运行任务。
4. 当新工作开始，Session 创建 TurnContext 和取消令牌，再把 Regular、Review 或 Compact 等 `SessionTask` 放到后台执行。Task 是实现工作流的可取消执行体，不是持久 Thread 本身。
5. ActiveTurn 保存当前 RunningTask 与 TurnState；TurnState 再持有待审批、待用户输入、待权限、动态工具、工具计数和当前轮输入。一个 Turn 可因工具或追加输入进行多次模型采样。
6. `start_or_steer_turn` 根据是否空闲选择启动或转向；`start_turn_if_idle` 不允许转向。没有活动 Turn、标识不匹配或输出 Schema 不兼容时，输入会被类型化拒绝，不能静默排队。
7. 正常完成发出 TurnComplete；中断发出 TurnAborted；挂起则刻意不记录这两个终止事件，以便另一工作者用原 turn_id 恢复。产品表面必须保留这些差异。

## 源码证据

Session 的所有权边界直接说明并发约束：

```source
codex-rs/core/src/session/session.rs:37-67
A session has at most 1 running task at a time, and can be interrupted by user input.
pub(crate) struct Session {
    pub(crate) thread_id: ThreadId,
    pub(crate) active_turn: Mutex<Option<ActiveTurn>>,
    pub(crate) input_queue: InputQueue,
    pub(crate) services: SessionServices,
}
```

ActiveTurn 与 RunningTask 分别保存可变轮次状态和执行控制：

```source
codex-rs/core/src/state/turn.rs:31-35,67-84
pub(crate) struct ActiveTurn {
    pub(crate) task: Option<RunningTask>,
    pub(crate) turn_state: Arc<Mutex<TurnState>>,
}
pub(crate) enum TaskKind { Regular, Review, Compact }
pub(crate) cancellation_token: CancellationToken,
pub(crate) turn_context: Arc<TurnContext>,
```

Task trait 描述后台工作流、取消和清理，不承诺所有 Task 都运行相同的模型循环：

```source
codex-rs/core/src/tasks/mod.rs:172-204
Async task that drives a Session turn.
Implementations encapsulate a specific Codex workflow.
fn kind(&self) -> TaskKind;
fn run(..., ctx: Arc<TurnContext>, input: Vec<TurnInput>,
       cancellation_token: CancellationToken)
```

协议层明确把操作和事件分开，且旧线格式仍使用 task 名称映射 Turn 生命周期：

```source
codex-rs/protocol/src/protocol.rs:541-548,1276-1283,1337-1349
pub enum Op { Interrupt, ... }
pub struct Event { pub id: String, pub msg: EventMsg }
TurnStarted(TurnStartedEvent),
TurnComplete(TurnCompleteEvent),
```

该 Claim 使用 B 级：源码直接定义所有权和状态，`turn_state.rs` 又验证同一轮 follow-up 复用 turn_id、下一轮重置；`turn_input_submission.rs` 验证活动转向与空闲拒绝。结论仍限定在锁定核心，不把某个产品表面的 UI 标签外推成内部状态。

## 失败与限制

第一，同一 Thread 可以空闲、运行、被中断或等待恢复。列表里看见线程不代表有活动 Task；反过来，后台进程可能在 Turn 结束后仍存在，因此中断当前 Task 与清理后台终端是不同 Op。

第二，同一 Turn 可有多次 Responses 请求。工具 follow-up、Hook、转向输入或压缩都可能继续该逻辑轮次；按网络请求数统计 Turn 会重复计数。Eval 的 Trial 也不应直接等同于内部 Turn，除非任务契约明确这样映射。

第三，steer 不是无条件追加。活动 Turn 不存在、目标标识错误、当前工作流不可转向或输出 Schema 不匹配都应拒绝。被拒绝输入不得写入历史，也不应把附带线程设置应用到 Session。

第四，中断、挂起和恢复的持久语义不同。中断记录 TurnAborted；挂起为移交所有权而停止执行、刷新历史并关闭 writer，刻意不写终止事件；恢复要保留原 turn_id。把挂起记录成完成会使另一工作者无法区分已结算与待接管。

第五，协议为了兼容可能在线上字段仍出现 task_started/task_complete，但核心类型称 TurnStarted/TurnComplete。不能从 wire 名称推断内部 Task 与 Turn 等价；应看 serde 映射和状态所有者。

名字不是所有权。

边界决定行为。

先看状态。

## 验证方法

证据必须关联。

先记录身份：为 ThreadId、TurnId、提交 id、TaskKind 和每次模型请求编号分别建列。运行一个含工具 follow-up 的 Turn，再运行第二个 Turn，验证同轮请求共享 TurnId、跨轮改变，ThreadId 始终不变。

再验证输入路由：活动轮次时调用 start-or-steer，空闲时分别调用 start-if-idle 与 steer；加入目标 TurnId 和输出 Schema 不匹配。检查返回的枚举、历史、配置快照和输入队列，确保拒绝路径没有副作用。

接着验证终止：分别触发正常完成、用户中断、模型流错误、Task 替换、挂起与恢复。捕获 TurnStarted、TurnComplete、TurnAborted 及 writer 状态，确认挂起不伪造终止、恢复复用原身份。

最后映射产品表面：检查 TUI、无界面执行和 App Server 如何把核心 EventMsg 映射到各自状态。若界面只有「运行中/完成」两态，应把语义损失记录为表面限制，不能回写成核心事实。

## 自检

### 问题 1

Thread 与 Session 为什么不能视为同一个对象？

**答案：** Thread 是可持久引用的会话身份；Session 是当前活动运行时，持有服务、队列和至多一个活动轮次。Thread 可以持久存在而当前没有运行 Session Task。

### 问题 2

一次工具调用导致两次模型请求，算几个 Turn？

**答案：** 在该测试中仍是一个 Turn。第二次请求是工具结果驱动的 follow-up，复用相同 turn_id；新用户轮次才取得新标识。

### 问题 3

为什么空闲 steer 的配置不能被保留？

**答案：** steer 的语义是把输入送入指定活动轮次。没有活动轮次时整次提交被拒绝，附带设置也不得部分生效，否则返回值与实际状态不一致。

### 问题 4

挂起为何不发 TurnAborted？

**答案：** 挂起用于把未完成根轮次移交给另一工作者；它刷新并关闭当前执行，但保留原 turn_id 和未结算语义。记录 aborted 或 complete 会把可恢复工作误标成终态。
