# Rollout、模型历史、Compaction 与 Memory 不是同一份数据

[返回 Codex 课程地图](README.md)

上一讲沿 Exec Policy、Approval Policy 与 Sandbox 追到实际进程，而执行结束以后，安全决策与执行结果还要分别进入 Rollout、模型历史、Compaction 与 Memory。

Codex 同时需要满足四类消费者，其中恢复器想要完整记录，模型只需要有界 Context，界面需要可以投影的事件，而跨线程 Memory 管线还要从中提炼长期有用的信息。如果把这些数据都称为「会话历史」，压缩时就很容易误删证据，恢复时也可能把摘要当成原文。

```text
追加式 Rollout ──→ Thread Store / 恢复
       │
       ├─→ Context Manager ─→ 模型可见历史
       │                         │
       │                         └─ Compaction 替代视图
       │
       └─→ Memory 管线 ─→ 跨线程文件工件
```

## 第 1 站：Rollout Item 不只是聊天消息

源码：[查看持久记录类型](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/history/src/lib.rs#L93-L105)

```rust
pub enum RolloutItem {
    SessionMeta(...),
    ResponseItem(...),
    Compacted(...),
    TurnContext(...),
    WorldState(...),
    EventMsg(...),
}
```

- **调用者**：Rollout Writer 记录 Session、Turn 与模型/工具事件。
- **输入**：协议消息、上下文快照、压缩项和运行事件。
- **状态变化**：向当前 Thread 的持久记录追加 Item。
- **返回**：可供恢复器、Trace 和界面读取的有序序列。
- **下一站**：Thread Store 用 ThreadId 定位后端，恢复器重建 Initial History。

`ResponseItem` 虽然最接近模型历史，但其他 Item 仍然保存着恢复和解释运行所需的事实，因此只导出聊天文本会丢失 Turn Context、Compaction 边界和部分控制事件。

这条边界不能省。

## ThreadId 是句柄，不是文件路径

### 第 2 站：存储后端隐藏在 Thread Store 之后

源码：[查看 Thread Store 契约](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/thread-store/src/lib.rs#L1-L5)

```rust
//! Application code should treat `ThreadId` as the only durable thread handle.
//! Implementations resolve that id to rollout files, RPC requests,
//! or another backing store.
```

- **调用者**：ThreadManager、列表、恢复和 Fork 功能。
- **输入**：ThreadId 与查询/读取请求。
- **状态变化**：由具体后端解析本地文件、RPC 或其他存储位置。
- **返回**：线程元数据和 Rollout 内容。
- **下一站**：恢复器构造 Resumed 或 Forked History。

如果应用层把某个本地 JSONL 路径保存成唯一身份，那么存储一旦换成远程后端，这个身份就会失效，而 ThreadId 可以让 API 在不同存储实现之间保持稳定。

## Resume 与 Fork 必须保留不同语义

源码：[查看初始历史类型](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/history/src/lib.rs#L209-L221)

```rust
pub struct ResumedHistory {
    conversation_id: ConversationId,
    history: Vec<RolloutItem>,
    rollout_path: Option<PathBuf>,
}

pub enum InitialHistory {
    New,
    Cleared,
    Resumed(...),
    Forked(...),
}
```

- **调用者**：Thread 创建与恢复流程。
- **输入**：过去 Rollout 与操作意图。
- **状态变化**：Resume 延续原 Thread 语境；Fork 用过去历史建立新的分支身份。
- **返回**：Session 初始化所需的 InitialHistory。
- **下一站**：Context Manager 重放可见历史，Writer 继续写入正确目标。

即使 Resume 与 Fork 最初看到的是同一批消息，它们也不能共享后续写入身份，否则 Fork 上的实验就会污染原 Thread。

## Compaction 改的是模型视图，不是假装旧记录没发生

当 Context 接近窗口上限时，Codex 会生成摘要并构造一段替代模型历史，同时在 Rollout 中记录 `Compacted` Item，让恢复器知道后续 Context 是在什么时间、通过哪份摘要发生了改变。

### 第 3 站：压缩生成替代 History 和元数据

源码：[查看压缩提交](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/compact.rs#L347-L384)

```rust
let summary_text = format!("{SUMMARY_PREFIX}\n{summary_suffix}");
let mut new_history = build_compacted_history(...);
sess.replace_compacted_history(
    new_history,
    ...,
    CompactedHistoryMetadata { ... },
).await;
```

- **调用者**：Compact Task 或自动 Context 压力处理。
- **输入**：当前 History、摘要响应和 Turn Context。
- **状态变化**：替换 Session 中下一次模型使用的 History，并记录 Compaction Metadata。
- **返回**：压缩后的可用 Context。
- **下一站**：后续 Turn 用摘要与保留尾部继续采样；Rollout 保存 Compacted 事实。

摘要会丢失一部分信息——所以验证时不能只看 Token 数是否下降，还要检查未完成任务、文件名、用户约束和关键 Tool Result 能否从新 Context 中恢复出来。

源码：[查看压缩后的请求与 Rollout 测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/compact.rs#L635-L697)

```rust
assert_eq!(assistant_count, 0, "assistant history should be cleared");
// Rollout 中仍能找到带期望摘要的 Compacted Item。
```

测试会同时查看模型请求和持久记录，正好对应这里的「双视图」设计。两边都要核对。

## Memory 是跨线程提炼工件

Memory 写入 crate 拥有独立目录、Raw Memories 和 Rollout Summaries。它会从过去任务中提炼可复用的信息，而不是把所有 Thread 原样拼成一个超长 Prompt。

### 第 4 站：Memory 有自己的文件布局和管线

源码：[查看 Memory 写入模块](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/memories/write/src/lib.rs#L1-L39)

```rust
//! Startup memory pipeline and file-backed memory artifact helpers.

pub const ROLLOUT_SUMMARIES_SUBDIR: &str = ...;
pub const RAW_MEMORIES_FILENAME: &str = ...;
```

- **调用者**：启动或后台 Memory 管线。
- **输入**：选中的历史任务与 Memory 配置。
- **状态变化**：生成摘要、原始记忆或索引文件。
- **返回**：后续任务可以检索的独立工件。
- **下一站**：新 Session 根据需要选择性注入相关 Memory。

Memory 可能已经过时，也可能在提炼时出错——所以注入时必须保留来源和时间语境。它可以帮助模型恢复背景，却不能覆盖当前仓库文件和用户的新指令。

厘清 Memory 的边界以后，下一步还要区分另一组经常被混称的对象，也就是 Skill、Hook、Plugin、MCP 与 Code Mode 各自扩展哪一层，以及目录存在、被发现、模型可见和执行成功为什么不能算作同一状态。

下一篇：[Skills、Hooks、Plugins、MCP 与 Code Mode](06-extensions-code-mode.md)。
