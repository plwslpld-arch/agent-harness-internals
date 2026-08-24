# Storage、有效历史、Compaction 与 Revert

[返回 OpenCode 课程地图](README.md)

OpenCode 数据库保存 Session、Message 和 Part 的完整记录；Prompt Loop 使用的是经过 Compaction 过滤和重排的有效历史；Provider 又接收转换后的 Model Messages。Revert 则同时操作工作树 Snapshot/Patch 和 Session 消息后缀。

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

数组最后一项不再可靠表示最新 Session 状态。需要「最新消息」时应使用源码提供的时间/ID 规则，而不是对投影数组取尾元素。

### 三种历史视图分别服务什么

数据库记录用于审计和恢复，Compaction 投影用于控制模型窗口，Provider Messages 用于适配具体 API。三者可能在顺序、字段和粒度上不同。调试模型行为要保存第三种实际输入，解释 Session 演化要回到第一种完整记录；只截取 UI 展示通常两边都不够。

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

按 Turn 切分可避免拆断 Tool Call/Result；Token 估算仍可能与 Provider 实际口径不同，所以要留安全余量。

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

Revert 应在 Session 非 Busy 时执行，避免模型流仍写文件。它也不是通用事务：Git Ignore 文件、项目外路径和网络副作用可能保持不变。

## 如何核对压缩没有把任务带偏

保存压缩前完整 Messages/Parts、摘要输入、Summary、保留 Tail 和压缩后 Model Messages。用确定性问题检查目标、未完成步骤、文件路径和最近 Tool Error 是否仍可恢复；不能只看请求不再溢出。

## 回到运费任务

长会话压缩后，Summary 应保留「金额 100 的目标测试仍未运行」，近期 Tail 保留最近的编辑结果。若摘要误写成「测试已通过」，下一轮可能过早结束。Revert 到编辑前消息时，文件 Patch 与 Session 后缀需要一起回退，否则模型历史会说「尚未编辑」，工作树却已经变化。

## 练习：发现历史与工作树分裂

Revert 后 Session 已删掉编辑结果，但 `git diff` 仍显示修改。应把哪个事实当作当前环境真值？

<details>
<summary>查看核对要点</summary>

文件系统和 `git diff` 是当前工作树真值，Session 只是 Harness 记录。应记录 Revert 部分失败，停止继续采样并修复工作树与 Session 的一致性；不能让模型依据已回退的历史继续修改一个未回退环境。

</details>

下一篇：[Agents、Skills、Plugins、MCP 与 LSP](05-extensions-subagents.md)。
