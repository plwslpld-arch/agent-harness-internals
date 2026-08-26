# Session Tree、Context 投影、Compaction 与 JSONL

[返回 pi 课程地图](README.md)

pi Coding Agent 的 Session 并不是一条从头排到尾的消息数组，而是由 Session Entries 组成的可分支树，当前 Leaf 会从树中选出正在使用的路径。只有 Message、Custom Message、Branch Summary 和 Compaction 等 Entry 才会沿这条路径投影成模型 Context，而 JSONL Repo 保存的则是完整 Entry 序列。两者不是同一份数据。

```text
Session Entry Tree
   ├─ 当前活动路径 → UI / 导航
   └─ Context Entries → 模型 Messages
                         │
                         └─ Compaction Summary 替代旧前缀

完整 Entries → JSONL Session Repo
```

## 第 1 站：活动路径与模型 Context 分开构造

源码：[查看 Session Context 构造](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/session-manager.ts#L334-L469)

```typescript
const path = buildSessionPath(entries, leafId, byId)
const messages = buildContextEntries(entries, leafId, byId)
  .flatMap(sessionEntryToContextMessages)

return { messages, thinkingLevel, model }
```

- **调用者**：打开、Resume、Fork、Navigate 或 Compact 后的 Session Manager。
- **输入**：全部 Entries、当前 Leaf ID 与索引。
- **状态变化**：不改原树；计算活动路径和模型可见 Entry 子集。
- **返回**：Messages、Thinking Level 与 Model。
- **下一站**：Agent Core 用这些消息继续 Prompt。

Label、普通 Custom Entry 和部分 UI 状态即使写进了 Session 文件，也不一定会进入模型，因此调试「为何模型忘了」时，应该检查 `buildContextEntries()` 的结果，而不能只凭文件里有没有那一行作判断。

## Compaction 选择最新 Summary 与后续尾部

每次压缩都会写入一个 Summary Entry，而同一条路径经过多次压缩以后，Context 会从最新的有效 Summary 开始，再接上它后面的消息。旧 Entry 并未消失，审计和创建分支时仍然可以回到 Session Tree 中找到它们。

源码：[查看 Entry 到 Context Message 的转换](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/session-manager.ts#L400-L469)

```typescript
// message / custom_message / branch_summary / compaction -> Context
// 其他 Entry -> []
```

- **调用者**：`buildContextEntries()`。
- **输入**：沿当前 Leaf 的 Session Entries。
- **状态变化**：用最新 Compaction/Branch Summary 建立有界模型视图。
- **返回**：按角色排序的 Agent Messages。
- **下一站**：模型请求；完整 JSONL 不被摘要覆盖。

Summary 是模型生成的有损结果，所以内容里应该保留精确路径、未完成事项以及关键 Tool Result 的引用，并在压缩完成后用确定性问题核对关键信息是否还在。不要只看 Token 是否下降。

### 为什么保留树，而不是把旧消息直接删除

Compaction 要解决的是当前模型窗口装不下历史的问题，而不是替审计存储腾出空间。完整的 Entry Tree 还要承担多种职责——回看记录、Fork、比较分支和解释摘要来源。一旦直接把旧前缀从存储中删除，不但无法再追溯「模型为什么得出这个摘要」，也会失去从较早节点创建新分支的能力。

## 第 2 站：JSONL Repo 处理尾部损坏和追加队列

源码：[查看 JSONL Repo 的创建、打开与 Fork](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/session/jsonl/repo.ts#L109-L177)、[查看尾部修复](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/session/jsonl/storage.ts#L48-L105)，以及[查看追加队列](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/session/jsonl/storage.ts#L258-L271)。

```typescript
// Create / Open / List / Delete / Fork
// 修复缺失换行或损坏尾行，拒绝非法中间行。
// 追加失败后，队列仍可继续处理后续请求。
```

- **调用者**：Session Manager 创建、打开、追加和 Fork。
- **输入**：CWD、Session ID、Entries 与目标路径。
- **状态变化**：同一进程内预留 `{cwd,id}`，串行追加 JSONL；打开时验证/修复尾部。
- **返回**：Open Session、Writer 或类型化损坏错误。
- **下一站**：Session Tree 重建并选择 Leaf。

尾行能够修复，并不意味着文件里的任何损坏都可以忽略，因为中间行一旦损坏，Entry 之间的父子关系也可能随之断裂。此时应拒绝打开，并保留原文件副本。

## Resume 不能恢复外部世界

Session 可以恢复消息、模型选择、Thinking Level 和分支信息，却无法让已经退出的进程重新运行，也不能还原远端请求、外部数据库或工作区后来发生的修改。因此 Resume 完成以后，还要重新检查 CWD、Git Diff、工具可用性和凭据。

同一进程里的 Destination Reservation 也不能充当跨进程 Lease，如果多个进程会共享同一份 Session 存储，就还需要文件锁、Fencing 或其他后端事务来协调写入。

## 回到运费任务

如果任务在编辑文件以后中断，Session Tree 里可能同时留有原始 Tool Call、工具开始事件、完成结果以及后来生成的摘要。恢复时不能因为摘要写着「已经修改」就认定工作完成，而要把活动分支上的工具完成记录与当前文件差异对照起来。若新分支是从编辑前的节点 Fork 出来的，它就不该继承编辑后的 Tool Result，即使那条结果仍保存在同一个 JSONL 文件中。

## 练习：解释「文件里有，模型却不知道」

你在 Session JSONL 中找到一条 Label 和一条旧分支的 Message，但下一轮模型都没有看到。应该先检查什么？

<details>
<summary>查看核对要点</summary>

先检查当前 Leaf，并查看 `buildSessionPath()` 和 `buildContextEntries()` 各自投影出了什么。完整存储、UI 活动路径和模型 Context 本来就是三种不同视图，因此 Label 可能不会投影，旧分支上的消息也不会出现在当前活动路径中。

</details>

下一篇：[Protocol、Server 与 Client Lease](05-protocol-server-client.md)。
