# Session Tree、Context 投影、Compaction 与 JSONL

[返回 pi 课程地图](README.md)

pi Coding Agent 的 Session 不是单一消息数组。Session Entries 形成可分支树，当前 Leaf 决定活动路径；其中只有 Message、Custom Message、Branch Summary 和 Compaction 等 Entry 会投影为模型 Context。JSONL Repo 则负责持久保存整个 Entry 序列。

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

Label、普通 Custom Entry 和部分 UI 状态不会进入模型。调试「为何模型忘了」时，应看 `buildContextEntries()` 结果，而不是只看 Session 文件中有无该行。

## Compaction 选择最新 Summary 与后续尾部

一次压缩会写 Summary Entry；多次压缩时，Context 从最新有效 Summary 开始，再接之后的消息。旧 Entry 仍在 Session Tree 中供审计和分支使用。

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

Summary 是有损模型产物。应保留精确路径、未完成事项和关键 Tool Result 引用，并在压缩后用确定性问题核对，而不是只看 Token 下降。

### 为什么保留树，而不是把旧消息直接删除

Compaction 解决的是当前模型窗口大小，不是审计存储大小。完整 Entry Tree 仍需要支持回看、Fork、比较分支和解释摘要来源。把旧前缀物理删除会让「模型为什么得出这个摘要」无法追溯，也会破坏从较早节点创建新分支的能力。

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

尾行可修复不等于任意损坏可忽略。中间行损坏会破坏父子关系，应拒绝并保留原文件副本。

## Resume 不能恢复外部世界

Session 能恢复消息、模型选择、Thinking Level 和分支信息；它无法还原已经退出的进程、远端请求、外部数据库或工作区后来发生的修改。Resume 后应重新检查 CWD、Git Diff、工具可用性和凭据。

同进程 Destination Reservation 也不是跨进程 Lease。若多个进程共享 Session 存储，还需要文件锁、Fencing 或其他后端事务。

## 回到运费任务

如果任务在编辑后中断，Session Tree 可能同时保留原始 Tool Call、工具开始事件、完成结果和之后的摘要。恢复不能只看摘要中的「已经修改」，而应核对活动分支上的工具完成记录与当前文件差异。若从编辑前 Fork，新分支不应继承编辑后的 Tool Result，即使它仍存在于同一个 JSONL 文件。

## 练习：解释「文件里有，模型却不知道」

你在 Session JSONL 中找到一条 Label 和一条旧分支的 Message，但下一轮模型都没有看到。应该先检查什么？

<details>
<summary>查看核对要点</summary>

先检查当前 Leaf、`buildSessionPath()` 和 `buildContextEntries()` 的投影结果。完整存储、UI 活动路径和模型 Context 是三种不同视图；Label 本来就可能不投影，旧分支消息也不在当前活动路径上。

</details>

下一篇：[Protocol、Server 与 Client Lease](05-protocol-server-client.md)。
