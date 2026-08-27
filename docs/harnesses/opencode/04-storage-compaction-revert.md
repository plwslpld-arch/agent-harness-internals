# Storage、有效历史、Compaction 与 Revert

[返回 OpenCode 课程地图](README.md)

OpenCode 会把 Session、Message 和 Part 的完整记录存进数据库，但 Prompt Loop（提示词循环）不会原样读取它们，而是先让 Compaction（上下文压缩）筛选并重排历史，再取其中仍然有效的部分。

Provider（模型提供商）拿到的内容还要再转换一次，已经成了适配具体 API 的 Model Messages。Revert（还原）走的是另一条路，它既要改工作树，也要清理 Session 里位于还原点之后的消息。

工作树能倒回去，是因为文件工具事先留下了 Snapshot（快照）和 Patch（补丁）。Session 这边则要删掉消息后缀，让下一轮从新的尾部继续。你读这一篇时要一直分清这两条线。

```text
数据库 Session / Message / Part
          ↓ filterCompacted
摘要 + 保留尾部（可能重排）
          ↓ toModelMessages
Provider Context

Revert：Snapshot/Patches + Session Cleanup
```

## 第 1 站：有效历史可能不是时间顺序

源码：[查看压缩历史投影](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/message-v2.ts#L521-L598)

```typescript
return [
  ...result.slice(compactionIndex, summaryIndex + 1),
  ...result.slice(tailIndex, compactionIndex),
]
```

- **调用者**：Session Prompt 读取模型有效历史。
- **输入**：按持久顺序读取的 Messages/Parts。
- **状态变化**：选择最新 Compaction Summary 与之后保留的 Tail，并按语义重排。
- **返回**：供 Context 转换的有效历史。
- **下一站**：Message Converter 生成 Provider Model Messages。

Compaction 按语义重排数组以后，最后一项就未必对应 Session 的最新状态。你要找「最新消息」，应当使用源码规定的时间或 ID 规则，不能顺手拿走投影数组的尾元素。尾部不等于最新。

### 三种历史视图分别服务什么

数据库留下完整记录，供你审计和恢复。Compaction 从这些记录里挑出模型还能看到的历史，用来控制窗口，Provider Messages 再把有效历史改成具体 API 接受的格式。三层数据各自做一件事，顺序、字段和粒度自然可能不同。调试模型为什么这样回答时，要保存真正送给 Provider 的第三层输入。如果要解释 Session 怎样一步步变成现在这样，就得回到数据库里的第一层记录，因为只看 UI 截图，通常哪一个问题都答不完整。三种视图不能混。

## 第 2 站：保留尾部按 Token 预算倒推

源码：[查看近期预算选择](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/compaction.ts#L223-L263)

```typescript
const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model })
if (total + size <= budget) {
  keep = { start: turn.start, id: turn.id }
}
```

- **调用者**：Compaction Service。
- **输入**：Model Context 限制、Config、Turn 边界与 Token 估算。
- **状态变化**：从最近 Turn 向前累计，确定摘要前缀与逐条保留尾部。
- **返回**：Compaction 切分点。
- **下一站**：模型摘要旧前缀，写 Summary Message/Part。

OpenCode 按 Turn 切分历史，能让同一轮里的 Tool Call 和 Result 留在一起，避免模型只看见调用却找不到结果。不过 Token 只是本地估算，未必和 Provider 最终采用的口径一致，所以预算里必须留出余量。

## 第 3 站：Revert 同时恢复文件和 Session 控制状态

源码：[查看 Session Revert](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/revert.ts#L38-L126)

```typescript
rev.snapshot = session.revert?.snapshot ?? (yield* snap.track())
yield* snap.revert(patches)
yield* sessions.setRevert({
  sessionID: input.sessionID,
  revert: rev,
  summary: ...,
})
```

- **调用者**：用户从 UI/CLI 请求 Revert 到某个 Message/Part。
- **输入**：Session ID、Revert Point、Snapshot 与后续 Patches。
- **状态变化**：反向应用文件修改，记录 Revert 元数据与 Diff，随后清理消息后缀。
- **返回**：恢复后的 Session 状态。
- **下一站**：UI 重新同步；后续 Prompt 从新尾部继续。

执行 Revert 前，要先等 Session 结束 Busy 状态，否则你一边恢复文件，仍在运行的模型流可能一边继续写入。它也算不上通用事务，因为 Git Ignore 文件、项目外路径和网络副作用都可能原封不动地留在那里。恢复有明确边界。

## 如何核对压缩没有把任务带偏

核对压缩有没有带偏任务时，你要保存压缩前的完整 Messages/Parts，也要留下摘要输入、Summary、保留的 Tail 和压缩后的 Model Messages，然后用答案确定的问题逐项追问：目标是什么，哪些步骤还没做，文件在哪，最近一次 Tool Error 又是什么。请求不再溢出，只能说明窗口暂时够用，不能证明任务语义还完整。

## 回到运费任务

压缩这段长会话时，Summary 要记住「金额 100 的目标测试仍未运行」，近期 Tail 则要留下刚才编辑文件的结果。如果摘要错写成「测试已通过」，下一轮就可能没做真实验证便提前结束。等你 Revert 到编辑前的消息时，既要用文件 Patch 倒回工作树，也要删掉 Session 后缀，否则模型读到的历史还说「尚未编辑」，文件却早已变了。

## 练习：发现历史与工作树分裂

Revert 后 Session 已删掉编辑结果，但 `git diff` 仍显示修改。应把哪个事实当作当前环境真值？

<details>
<summary>查看核对要点</summary>

当前工作树究竟是什么样，要以文件系统和 `git diff` 为准，Session 只是 Harness 留下的记录。如果两边对不上，就要把这次 Revert 记为部分失败，停下后续采样，并把工作树与 Session 修到一致。不能让模型拿着已经回退的历史，继续修改还没退回去的环境。

</details>

下一篇：[Agents、Skills、Plugins、MCP 与 LSP](05-extensions-subagents.md)。
