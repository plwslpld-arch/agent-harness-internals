# Rollout、模型历史、Compaction 与 Memory 不是同一份数据

[返回 Codex 课程地图](README.md)

上一讲顺着 Exec Policy（执行策略）、Approval Policy（审批策略）和 Sandbox 一路追到进程启动。进程结束以后，安全决定和执行结果还会分别写进 Rollout、模型能看到的 History、Compaction 和 Memory。

这几份数据各有用处。恢复程序要读完整记录，模型只接收容量有限的 Context，界面要把事件整理成可显示的内容，跨线程 Memory 管线则从旧任务中挑出以后还用得上的信息。你要是把它们全叫作「会话历史」，做压缩时很可能删掉证据，恢复时也可能误把摘要当成原文。

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

`ResponseItem` 和模型看到的历史最接近，可恢复程序还得依靠其他 Item（条目）解释当时发生了什么。只导出聊天文字，会把 Turn Context、Compaction 边界和一部分控制事件丢掉。

这层区别不能省。

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

如果应用层拿本地 JSONL（逐行 JSON）路径当作唯一身份，存储后端一换到远端，这个身份立刻就失效。应用只认 ThreadId（线程 ID），API 才能在不同存储实现之间继续使用同一个稳定句柄。

文件在哪并不重要。

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

Resume（恢复）和 Fork（从已有历史建立新分支身份）起步时可以读到同一批消息，但后续写入必须各用各的身份。否则你在 Fork 上做一次实验，内容就会混进原来的 Thread。

## Compaction 改的是模型视图，不是假装旧记录没发生

当 Context 快装不下时，Codex 会写出一份 Summary（摘要），再用它和保留下来的尾部重新组成模型历史。同时，Codex 还会在 Rollout 中追加 `Compacted` Item，恢复程序据此才能知道：后面的 Context 从什么时候开始改用哪份摘要。

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

摘要一定会损失信息。验证时别只看 Token 数量有没有下降，还要确认新 Context 能不能还原未完成的任务、文件名、用户约束和关键 Tool Result。

少一个都可能误事。

源码：[查看压缩后的请求与 Rollout 测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/compact.rs#L635-L697)

```rust
assert_eq!(assistant_count, 0, "assistant history should be cleared");
// Rollout 中仍能找到带期望摘要的 Compacted Item。
```

测试会同时查看模型请求和持久记录，因为压缩会改模型眼前的历史，也会在 Rollout 里留下记录。两边都得核对。

## Memory 是跨线程提炼工件

负责写 Memory 的 crate 有自己的目录，还会分别保存 Raw Memories 和 Rollout Summaries。它从过去的任务里挑出可复用的信息，再写成独立文件，不会把所有 Thread 原封不动地拼进一个超长 Prompt。

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

Memory 里的内容可能已经过时，提炼时也可能出了错。因此，把 Memory 注入新 Session 时，必须带上来源和时间背景。它能帮模型找回背景，但当前仓库里的文件和用户刚给的指令优先级更高。

旧记忆不能盖过新事实。

Memory 的边界清楚以后，下一篇再看 Skill、Hook、Plugin、MCP 和 Code Mode 分别改动哪一层。目录已经存在、系统发现了它、模型看得见它、最后执行成功，这几个状态也得拆开查。

下一篇：[Skills、Hooks、Plugins、MCP 与 Code Mode](06-extensions-code-mode.md)。
