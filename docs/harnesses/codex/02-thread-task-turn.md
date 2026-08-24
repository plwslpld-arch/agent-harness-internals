# Thread、Session、Task 与 Turn 到底分别是什么

[返回 Codex 课程地图](README.md)

Codex 源码里同时出现 Thread、Session、Task、Turn、Op 和 Event。它们不是同一个「任务」的不同叫法，而是不同生命周期的对象：Thread 是可持久引用的会话身份，Session 是活动运行容器，Task 驱动一种后台工作流，Turn 是一次逻辑用户交互，Op/Event 则是产品表面与核心之间的命令和通知。

```text
ThreadId（持久身份）
  └─ 活动 Session（服务、队列、当前 Turn）
       └─ ActiveTurn
            ├─ TurnState
            └─ RunningTask（Regular / Review / Compact）
```

## 一个 Turn 可以包含多次模型请求

用户提交一次「修复失败测试」会开启一个 Turn。模型先读取文件，再运行测试，再修改文件，再重新测试；每次 Tool Result 后都可能产生新的模型请求，但它们仍属于同一个 Turn。只有按网络请求计数，才会错误地把一次任务拆成四个 Turn。

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

`Mutex<Option<ActiveTurn>>` 直接表达「同一个 Session 最多一个活动 Turn」。这不代表整个程序只有一个任务；不同 Thread 可以并发，活动 Turn 内的 Tool Call 也可以并发。

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

状态和控制分开后，即使 Task Future 正在清理，TurnState 仍能保留已发生的事件；反过来，界面显示一个 Turn 也不意味着 Task 仍在运行。

## Task 是工作流接口，不等于普通 Agent Loop

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

因此不能从 `TaskKind::Compact` 推断它走了与 Regular 相同的 Tool Loop，也不能用某个 Task 的成功条件解释所有 Task。

## Op 是命令，Event 是观察结果

产品表面提交 `Op::Interrupt`、用户输入或配置变更；核心随后发出 `TurnStarted`、Item 事件、错误和 `TurnComplete`。Op 被接收不等于操作已经完成，Event 才描述后续发生的事实。

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

## Follow-up、Steer 与下一 Turn

- Session Idle 时提交新用户任务，建立新 Turn。
- Turn 活动时的转向输入加入当前控制流，复用 Turn 身份。
- 普通 Follow-up 可以排队，等当前工作收敛后进入后续处理。
- Interrupt 触发 Cancellation Token，不删除 Thread 和过去 Rollout。

用这些边界分析 Bug 时，应先确定「消息属于当前 Turn、下一个 Turn，还是只进入了队列」，再看模型为何没有响应。

下一篇：[模型响应与工具循环](03-model-tool-loop.md)。
