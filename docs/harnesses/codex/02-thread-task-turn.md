# Thread、Session、Task 与 Turn 到底分别是什么

[返回 Codex 课程地图](README.md)

上一篇《配置、项目指令与模型输入》停在「模型返回 Tool Call，进入后续工具循环」，可真要沿着这条线追下去，还得先分清 Thread、Session、Task 和 Turn。为什么要先做这一步？Codex 源码里同时出现 Thread、Session、Task、Turn、Op 和 Event，如果先把它们都当成同一个「任务」的不同叫法，后面看到 Tool Call 究竟处在哪个运行边界里，就会在起点处判断错位，因为这些名称对应的是不同生命周期对象——Thread 是可持久引用的会话身份，Session 是活动运行容器，Task 驱动一种后台工作流，Turn 是一次逻辑用户交互，Op/Event 则是产品表面与核心之间的命令和通知。

```text
ThreadId（持久身份）
  └─ 活动 Session（服务、队列、当前 Turn）
       └─ ActiveTurn
            ├─ TurnState
            └─ RunningTask（Regular / Review / Compact）
```

## 一个 Turn 可以包含多次模型请求

用户只提交一次「修复失败测试」，开启的便是一个 Turn，而模型随后先读取文件，再运行测试、修改文件并重新测试，期间每次 Tool Result 都可能带来新的模型请求，却不会让这次交互离开当前 Turn。这里最容易误读的是计数方式：如果眼里只有网络请求，一次任务就会被错拆成四个 Turn。先记住这个差别。

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

`Mutex<Option<ActiveTurn>>` 直接表达「同一个 Session 最多一个活动 Turn」，但先别把这句话快进成「整个程序只有一个任务」——不同 Thread 可以并发，活动 Turn 内的 Tool Call 也可以并发。别混在一起。

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

读到这里，不妨问一句：界面上还显示着一个 Turn，是否就说明 Task 仍在运行？答案不能这样推，因为状态和控制分开以后，即使 Task Future 正在清理，TurnState 仍能保留已经发生的事件，而界面显示一个 Turn 也不意味着 Task 仍在运行。先把两层分开。

## Task 是工作流接口，不等于普通 Agent Loop

先把一个常见的误解摆开。名字里都有 Task，并不意味它们的内部实现就是同一条普通 Agent Loop。

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

所以，看见 `TaskKind::Compact` 时先别向下猜：不能由此推断它走了与 Regular 相同的 Tool Loop，也不能拿某个 Task 的成功条件去解释所有 Task。

## Op 是命令，Event 是观察结果

产品表面会提交 `Op::Interrupt`、用户输入或配置变更，核心随后才发出 `TurnStarted`、Item 事件、错误和 `TurnComplete`。因为 Op 被接收并不等于操作已经完成，所以判断后续事实时要看的是 Event。

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

读这一站时，不妨始终带着一个问题：眼前这条记录是产品表面发出的命令，还是核心通知出来的结果？先分清方向。

## Follow-up、Steer 与下一 Turn

- Session 处于 Idle 时，如果此时提交一个新的用户任务，对应的处理是建立一个新 Turn，判断时应当从 Session 的 Idle 状态起步。
- Turn 仍然活动时，转向输入会加入当前控制流，并且继续复用这个 Turn 的身份，别把这类输入误判成新 Turn。
- 普通 Follow-up 可以先进入队列，等当前工作收敛以后，它才会进入后续处理。
- Interrupt 触发的是 Cancellation Token，但中断的边界要读准：Thread 和过去的 Rollout 都不会被删除。

拿这些边界分析 Bug 时，与其急着追问模型为何没有响应，不如先确定「消息属于当前 Turn、下一个 Turn，还是只进入了队列」，然后再沿着它实际所在的边界往下查。

边界分清以后，下一个问题就自然浮出来了：模型流里的 Function Call 被解析后，如何交给 Tool Router，而工具结果又如何按原调用身份写回 Context？带着这个问题，继续读下一篇：[模型响应与工具循环](03-model-tool-loop.md)。
