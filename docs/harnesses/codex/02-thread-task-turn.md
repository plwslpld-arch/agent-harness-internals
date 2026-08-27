# Thread、Session、Task 与 Turn 到底分别是什么

[返回 Codex 课程地图](README.md)

上一篇停在模型返回 Tool Call（工具调用）、准备进入工具循环的地方。要继续往下追，你得先分清 Thread、Session、Task 和 Turn（回合），因为 Codex 源码还会同时出现 Op 和 Event，这些名字可不能都理解成「任务」。它们各自管着一段不同的生命周期：Thread 提供可以长期引用的会话身份，Session 装着当前还在活动的运行状态，Task 推进某一类后台工作流，Turn 对应一次用户交互。Op 是产品表面发给核心的命令，Event 则是核心往外发的通知。

```text
ThreadId（持久身份）
  └─ 活动 Session（服务、队列、当前 Turn）
       └─ ActiveTurn
            ├─ TurnState
            └─ RunningTask（Regular / Review / Compact）
```

## 一个 Turn 可以包含多次模型请求

用户只提交一次「修复失败测试」，Codex 就会开启一个 Turn。随后，模型可能读取文件、运行测试、修改代码，再跑一次测试，每个 Tool Result 都可能触发新的模型请求，可这些动作仍属于当前 Turn。若只按网络请求计数，你会把一次交互误拆成四个 Turn。先记住这个差别。

## 第 1 站：Session 拥有唯一活动 Turn 和输入队列

源码：[查看 Session 的核心字段](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/session/session.rs#L37-L67)

```rust
pub(crate) struct Session {
    pub(crate) thread_id: ThreadId,
    pub(crate) active_turn: Mutex<Option<ActiveTurn>>,
    pub(crate) input_queue: InputQueue,
    pub(crate) services: SessionServices,
}
```

- **调用者**：`CodexThread` 和 Session 方法处理提交、转向、取消与恢复。
- **输入**：Thread 身份、配置和共享服务。
- **状态变化**：Input Queue 接纳消息；`active_turn` 在 Idle 与某个活动 Turn 之间切换。
- **返回**：活动 Session 由 `CodexThread` 对外提供类型化操作。
- **下一站**：提交逻辑创建 `ActiveTurn` 并启动对应 Task。

`Mutex<Option<ActiveTurn>>` 写得很直白：同一个 Session 最多只能有一个活动 Turn。不过，这不代表整个程序同时只能跑一个 Task，不同 Thread 可以并发，同一个活动 Turn 里的 Tool Call 也可能并发。这三层不能混。

## 第 2 站：Turn 状态与运行控制分开保存

源码：[查看 `ActiveTurn` 与 `RunningTask`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/state/turn.rs#L31-L84)

```rust
pub(crate) struct ActiveTurn {
    pub(crate) task: Option<RunningTask>,
    pub(crate) turn_state: Arc<Mutex<TurnState>>,
}

pub(crate) enum TaskKind { Regular, Review, Compact }

pub(crate) struct RunningTask {
    pub(crate) cancellation_token: CancellationToken,
    pub(crate) turn_context: Arc<TurnContext>,
}
```

- **调用者**：Session 启动、转向和中断代码。
- **输入**：本轮 Context、Task 类型与 Cancellation Token。
- **状态变化**：TurnState 记录本轮可变状态；RunningTask 保存正在执行的 Future 控制面。
- **返回**：可供中断、等待和追加输入使用的 ActiveTurn。
- **下一站**：具体 Task 的 `run()` 驱动普通 Agent、Review 或 Compaction 工作流。

读到这里，你可以问一句：界面上还显示着某个 Turn，是否说明 Task 仍在运行？不能这么推。Codex 把状态和运行控制分开保存，即使 Task 的 Future（异步计算）已经进入清理阶段，TurnState 仍会留下先前发生的 Event，而界面能显示这个 Turn，只能证明相关状态还在。先把两层分开。

## Task 是工作流接口，不等于普通 Agent Loop

这里先排除一个常见误解：几个类型的名字里都有 Task，并不代表它们内部都跑同一条 Agent Loop（智能体循环）。

### 第 3 站：不同 Task 共享启动方式，不共享内部实现

源码：[查看 Task Trait](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/tasks/mod.rs#L172-L204)

```rust
#[async_trait]
pub(crate) trait SessionTask: Send + Sync + 'static {
    fn kind(&self) -> TaskKind;
    async fn run(
        self: Arc<Self>,
        sess: Arc<Session>,
        ctx: Arc<TurnContext>,
        input: Vec<TurnInput>,
        cancellation_token: CancellationToken,
    ) -> Option<String>;
}
```

- **调用者**：Session 根据 Op 选择并启动 Task。
- **输入**：Session、Turn Context、初始输入和取消信号。
- **状态变化**：具体实现可以运行普通模型循环、代码审查或压缩。
- **返回**：可选的最后文本；完整事实仍通过 Events 和 Rollout 保存。
- **下一站**：Task 结束时 Session 结算 Turn 并释放活动槽位。

所以，看到 `TaskKind::Compact` 时别急着往下猜。这个名字不能证明它会走与 Regular 相同的 Tool Loop，也不能拿某一种 Task 的成功条件套在其他 Task 上。

## Op 是命令，Event 是观察结果

产品表面会提交 `Op::Interrupt`、用户输入或者配置变更。核心处理以后，才会发出 `TurnStarted`、Item（条目）事件、错误和 `TurnComplete`，而收到 Op 只说明核心接下了命令，不能证明操作已经完成。你要判断后来究竟发生了什么，得看 Event。

### 第 4 站：协议明确分开输入与输出

源码：[查看 Op 与 Event 定义](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/protocol/src/protocol.rs#L541-L548)

```rust
pub enum Op {
    Interrupt,
    // 其他提交给核心的操作
}

pub struct Event {
    pub id: String,
    pub msg: EventMsg,
}
```

- **调用者**：CLI、App Server、IDE 等表面发送 Op；核心发出 Event。
- **输入**：带 Thread/Turn 语境的操作。
- **状态变化**：由 Session 验证是否有活动 Turn、是否能转向或中断。
- **返回**：提交确认与后续异步 Events。
- **下一站**：表面根据 Event 更新 UI，Rollout Writer 持久化相关记录。

读这一段源码时，始终问清一件事：眼前这条记录，是产品表面发出的命令，还是核心发回的结果？方向不能看反。

## Follow-up、Steer 与下一 Turn

- Session 处于 Idle 时，如果此时提交一个新的用户任务，对应的处理是建立一个新 Turn，判断时应当从 Session 的 Idle 状态起步。
- Turn 仍然活动时，转向输入会加入当前控制流，并且继续复用这个 Turn 的身份，别把这类输入误判成新 Turn。
- 普通 Follow-up 可以先进入队列，等当前工作收敛以后，它才会进入后续处理。
- Interrupt 触发的是 Cancellation Token，但中断的边界要读准：Thread 和过去的 Rollout 都不会被删除。

拿这些边界排查 Bug 时，先别急着问模型为什么没响应，你应该先确定消息去了哪里：它属于当前 Turn，准备进入下一个 Turn，还是只在队列里等着？位置找准后，再沿着那一层继续查。

这些边界分清后，我们就能继续看当前 Turn 里面的动作：模型流吐出 Function Call（函数调用）后，谁把它交给 Tool Router？工具执行完，又是谁按原来的调用身份把结果写回 Context？答案在下一篇：[模型响应与工具循环](03-model-tool-loop.md)。
