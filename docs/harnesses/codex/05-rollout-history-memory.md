---
title: Codex 记录、恢复、压缩与长期记忆
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/history/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/rollout/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/thread-store/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/compact.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/memories/write/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/resume.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/compact.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 记录、恢复、压缩与长期记忆

## 读者会得到什么

「会话保存了」不是一个足够精确的结论。Codex 同时存在追加式 Rollout、存储中立的 Thread Store、运行时模型历史、压缩后的替代历史、恢复时重建的事件视图，以及跨线程提炼的 Memory 工件。它们服务不同消费者，也有不同丢失风险。

记录不是上下文。记忆也不是记录。它们不能混用。

本篇建立数据权威地图：ThreadId 是持久线程句柄；RolloutItem 保存可恢复记录；模型 Context 是由记录与当前配置投影出的有界视图；CompactedItem 保存摘要及可选替代历史；长期 Memory 则由后台管线从多个线程提炼成独立文件。摘要不是原始记录，记忆也不是会话真相。

## 真实输入与输出

### 输入

恢复测试先提交一轮带文本元素的用户消息，模型返回一条助手消息，Turn 完成后再从原记录重启：

```json
{"user":"Record some messages","assistant":"Completed first turn"}
```

压缩测试依次执行普通轮次、手动压缩和新轮次。模拟模型第二次请求返回摘要，第三次请求用于检查压缩后的模型输入：

```text
普通轮次 → 压缩请求 → 新用户消息
```

### 输出

恢复后的初始事件仍按 TurnStarted、UserMessage、AgentMessage、TokenCount、TurnComplete 排列，且完成事件与开始事件共享轮次标识。压缩后的第三次模型请求保留原用户消息、摘要和新消息，但旧助手消息不再进入该模型视图：

```text
追加记录：仍包含 TurnContext 与 Compacted 条目
模型输入：初始上下文 + 保留的用户消息 + 压缩摘要 + 新消息
```

这证明恢复事件、持久记录和下一次模型输入可以相关，却不是同一个数组。

## 调用链

先确定权威，再谈恢复。

![Codex 从追加记录、线程存储到模型上下文、压缩替代、恢复投影与长期记忆的中文数据权威图](../../../assets/diagrams/codex/05-rollout-history-memory.svg)

Claim: codex.rollout.store-history-context-separation

Claim: codex.compaction.resume-has-bounded-semantics

1. Session 把会话元数据、模型响应项、TurnContext、事件、跨智能体通信和压缩检查点写成 RolloutItem；RolloutLine 再附加时间戳与可选序号，形成持久记录边界。
2. Thread Store 只把 ThreadId 视作持久句柄。具体实现负责把它解析到本地 Rollout、状态数据库或其他后端，并提供读取、追加、归档、恢复与 Fork 接口。
3. 恢复时，InitialHistory 区分 New、Cleared、Resumed 与 Forked。恢复读取已有 RolloutItem，再分别重建产品表面需要的初始事件、会话元数据和模型历史；Fork 则建立新的线程身份并保留来源关系。
4. 采样前，运行时 History 把 ResponseItemEnvelope 投影成适合当前模型输入模态和截断策略的 Context。不是每个持久事件都应直接发给模型，也不能仅凭模型 Context 还原全部原始记录。
5. 压缩是一个独立 Turn 生命周期。它克隆历史、请求摘要、处理受限重试与上下文超限，随后构造替代历史，并把 CompactedItem 连同摘要、窗口标识和可选 replacement_history 写回持久记录。
6. 后续模型请求读取替代历史，而不是继续携带全部旧助手消息。原 Rollout 中的压缩检查点仍用于恢复和审计；多次压缩会增加摘要损失，所以源码会发出准确性警告。
7. Memory 启动任务在独立根目录维护原始记忆汇总、Rollout 摘要与扩展输入，再通过分阶段管线提炼跨线程信息。它是派生知识库，不应覆盖 ThreadId、Rollout 或具体任务产物。

## 源码证据

RolloutItem 是持久域类型，不只包含聊天消息：

```source
codex-rs/history/src/lib.rs:93-105
pub enum RolloutItem {
    SessionMeta(...), ResponseItem(...), Compacted(...),
    TurnContext(...), WorldState(...), EventMsg(...),
}
```

Thread Store 明确把 ThreadId 定义为唯一持久线程句柄，后端负责解析：

```source
codex-rs/thread-store/src/lib.rs:1-5
Application code should treat [`codex_protocol::ThreadId`] as the only durable thread handle.
Implementations are responsible for resolving that id to local rollout files, RPC requests, or any other backing store.
```

恢复与 Fork 在初始历史类型上分开：

```source
codex-rs/history/src/lib.rs:209-221
pub struct ResumedHistory { conversation_id, history, rollout_path }
pub enum InitialHistory { New, Cleared, Resumed(...), Forked(...) }
```

压缩成功后不是覆盖原文件假装旧消息从未存在，而是构造替代模型历史并记录压缩元数据：

```source
codex-rs/core/src/compact.rs:347-384
let summary_text = format!("{SUMMARY_PREFIX}\n{summary_suffix}");
let mut new_history = build_compacted_history(...);
sess.replace_compacted_history(new_history, ..., CompactedHistoryMetadata { ... }).await;
```

上游测试同时检查下一次请求的替代视图和 Rollout 中的 Compacted 条目：

```source
codex-rs/core/tests/suite/compact.rs:635-697
assert_eq!(assistant_count, 0, "assistant history should be cleared");
RolloutItem::Compacted(ci) if ci.message == expected_summary_message => ...
```

Memory 写路径拥有独立文件布局和后台阶段，不是 History 的别名：

```source
codex-rs/memories/write/src/lib.rs:1-5,35-39,116-146
This crate owns the startup memory pipeline, file-backed memory artifact helpers...
ROLLOUT_SUMMARIES_SUBDIR; RAW_MEMORIES_FILENAME;
pub fn memory_root(...) ...
```

两条 Claim 均使用 B 级。第一条由持久类型、存储接口和恢复类型源码共同支持；第二条由压缩实现及恢复、压缩上游测试锁定。B 级仍不等于崩溃一致性、任意旧版本迁移或所有后端生产恢复已验证。

## 失败与限制

Rollout 是记录边界，不自动等于事务日志。追加途中崩溃、尾行损坏、文件压缩、状态数据库索引滞后或后端迁移都需要单独测试。ThreadId 稳定也只保证引用身份，不能保证底层文件永不移动。

恢复不是副作用重放。重建初始事件与模型历史，应读取已提交工具结果，而不是再次执行旧命令。当前引用测试证明消息和推理事件可以恢复，却没有覆盖所有工具副作用、崩溃点和外部系统幂等性，因此不能把恢复写成「恰好一次」保证。

Fork 不是恢复的别名。恢复延续原 `conversation_id`；Fork 从已有 RolloutItem 派生新线程，并保留来源身份。若统计任务成功率，两个线程不能在没有 Trial 规则时同时充当独立成功样本。

压缩是有损投影。测试证明旧助手消息退出下一次模型视图、摘要进入模型视图且 Compacted 条目进入 Rollout；它没有证明摘要包含全部事实。长线程和多次压缩可能降低准确性，关键约束必须留在结构化状态或可核对工件中。

SQLite 与 Rollout 承担不同角色。状态库可以索引线程、队列和元数据，但本篇没有把它宣布为所有会话内容的唯一真相；出现差异时，应按具体 API 与迁移模式检查哪一层拥有该字段。

Memory 更不能反写历史。它会受到扫描上限、截断、模型提炼、扩展输入、保留期和工作区差异影响。记忆内容只能作为下一次推理的候选上下文；涉及权限、发布状态和用户明确事实时，仍须回到原始记录或外部权威源核对。

## 验证方法

先为同一 ThreadId 捕获 Rollout 文件、Thread Store 返回、恢复初始事件和首个模型请求。给每个 RolloutLine 记录序号、类型与轮次标识，确认事件投影不会改变持久项身份，也不会把界面专用事件全部塞入模型 Context。

再做断点矩阵：用户消息前、工具调用前、工具结果提交后、TurnComplete 后、压缩摘要返回前后分别终止进程。恢复时检查哪些记录可见、是否出现重复工具副作用、尾行损坏如何报告。恢复成功不能只看界面重新打开。

随后验证压缩。构造可识别的旧用户消息、旧助手消息、工具结果和关键约束；压缩后分别检查 Rollout、`replacement_history` 和下一次请求。摘要缺少关键约束时，测试应失败，而不是因为令牌数下降就算成功。

最后单独测试 Memory。记录进入扫描集合、阶段一摘要、阶段二整合和最终文件的每次变换，注入过期扩展、删除源和相互冲突事实。确认删除信号能清理只由该来源支持的记忆，同时不会修改原线程记录。

## 自检

### 问题 1

为什么 Thread Store、Rollout 和模型 Context 不能合称「会话历史」？

**答案：** Thread Store 提供持久身份与后端接口，Rollout 保存多类可恢复项，模型 Context 是为当前采样构造的有界投影；消费者和权威范围都不同。

### 问题 2

压缩后旧助手消息不在下一次请求中，是否表示它已从 Rollout 删除？

**答案：** 不能这样推断。测试同时看到替代模型视图和新增 Compacted 条目；模型视图收缩不等于原始记录被抹除。

### 问题 3

恢复是否应该重新执行历史工具调用来重建状态？

**答案：** 不应该默认重放已提交副作用。应恢复记录的工具结果，并对缺失或不确定提交点使用显式恢复策略。

### 问题 4

长期 Memory 可以作为权限和发布结论的权威来源吗？

**答案：** 不可以。Memory 是受扫描、截断和模型提炼影响的派生工件；高风险事实必须回查原始记录或外部权威源。
