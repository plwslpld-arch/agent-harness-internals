# Session、模型可见 Surface、Compaction 与冷恢复

[返回 DeepSeek Harness 课程地图](README.md)

DeepSeek Harness 的 Session 同时保留两种视图：完整追加式 Event Log 与可以送给模型的 Surface。Compaction 不删除旧 Event，而是在 Surface 上用一个摘要消息替换一段旧节点；恢复时重放 Event 和 Surface 操作，重新得到模型历史。

## Event Log 与 Surface 为什么分开

Event Log 包含比模型消息更多的信息：Turn/Step 边界、流式 Chunk、Approval、Request Header、Compaction 生命周期和错误。模型只需要其中一部分消息。

```text
追加式 Event Log
  ├─ turn/start、assistant/chunk、approval/* 等审计事实
  └─ user/message、assistant/message、tool/result 等 Surface 节点
       → append 或 replace 操作
       → deriveMessages()
       → 下一次模型请求历史
```

这样既能保存完整可审计事实，又能压缩模型输入，不必为了减少 Token 真正擦掉旧记录。

### 第 1 站：恢复 Seed 先验证，再进入 Session

源码：[查看 Session 构造与恢复](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/index.ts#L474-L547)

```typescript
static fromRestore(id, seed, header): Session {
  return new Session(id, seed, header, 'restore')
}

for (const [index, source] of seed.entries()) {
  assertSessionEventEnvelope(snapshot, index)
  if (snapshot.seq !== index) throw new Error(...)
  this.surfaceManager.validateNext(snapshot)
  this.log.push(...)
}
```

- **调用者**：持久化层加载 JSONL 或其他后端记录后恢复 Session。
- **输入**：Session ID、完整 Event Seed 和持久化 Header。
- **状态变化**：验证格式版本、序号连续性、JSON 可表示性和 Surface 转换；全部合格后才接管记录。
- **返回**：Detached Session，之后由 SessionStore 进入运行上下文。
- **下一站**：Agent Loop 从恢复后的 Surface 派生消息，Request Header 恢复模型请求边界。

Seed 逐条使用与 live append 相同的 Surface 校验，避免「内存里能恢复但后端永远无法再次保存」的分叉状态。序号必须从 0 连续，因为大量因果引用直接使用 Event Seq。

### 第 2 站：Append 是内存提交点，不等待磁盘 I/O

源码：[查看 `Session.append()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/index.ts#L569-L648)

```typescript
const event = deepFreeze({
  type,
  seq: this.log.length,
  time: Date.now(),
  data: dataSnapshot,
  ...surfaceMetadataSnapshot,
})
this.surfaceManager.validateNext(event)
this.log.push(event)
invokeContainedSessionObservers(...)
```

- **调用者**：Agent Loop、ToolRuntime、Approval、Compaction 和其他插件。
- **输入**：类型化 Event Data，以及消息类 Event 必需的 Surface 操作与来源序号。
- **状态变化**：数据被无损 JSON Snapshot、冻结、分配 Seq、验证 Surface 后追加到内存 Log。
- **返回**：实际进入 Log 的 Event；调用方后续修改原对象不会影响它。
- **下一站**：Observer 异步缓冲持久化；需要耐久点的调用方显式 `session.flush()`。

Observer 失败被隔离，不能回滚已经提交的内存 Event。由此产生两个不同事实：append 成功说明 live Session 接受了事件，flush 成功才说明已配置后端达到耐久检查点。

## Surface 操作如何表达压缩

消息类 Event 必须携带：

- `surfaceOp: 'append'`：把自己加到模型历史末尾；
- `surfaceOp: { op:'replace', start, end }`：用自己替换当前 Surface 中一段连续范围；
- `sourceEventSeqs`：列出它派生或替换所依据的旧 Event。

非消息 Event 不允许伪装成 Surface 节点。Replace 必须命中当前节点并完整覆盖范围，ToolResult 的特殊重写也有更严规则。

### 第 3 站：模型历史从 Surface 增量派生

源码：[查看 `deriveMessages()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/index.ts#L704-L746)

```typescript
const nodes = surface.nodes
const generation = surface.replaceGeneration
if (generation !== this.derivedGeneration) {
  this.derived = []
  this.derivedNodes = 0
}
for (const seq of nodes.slice(this.derivedNodes)) {
  const msg = this.deriveEventMessage(this.log[seq]!)
  if (msg) this.derived.push(msg)
}
return [...this.derived]
```

- **调用者**：Agent Loop 构建每次模型请求。
- **输入**：当前 Surface 节点序列与完整 Log。
- **状态变化**：普通 append 只投影新增节点；replace generation 变化时重建派生缓存。
- **返回**：新的数组快照，内部 Message 对象仍是共享且深冻结的。
- **下一站**：`buildRequest()` 把这些消息与 System、Tools 一起冻结为 GenerateOptions。

Surface 不是「另一份可随意修改的消息数组」，而是 Event Log 的确定性投影。恢复器、模型请求和外部分析应该复用同一 Fold 规则。

## Compaction 是一笔带锁的 Surface 事务

自动 Compaction 在开放 Turn 内运行；手动 Compaction 要求 Session Idle。流程先选择平衡的 Surface 范围，不能切断 ToolCall/ToolResult 配对，然后写 `compaction/start` 作为耐久锁，异步总结，检查 Surface 未漂移，提交摘要与 Replace，最后写 `compaction/end`。

### 第 4 站：Start/End 把异步摘要包进事务

源码：[查看 Compaction 主事务](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/compaction/compaction-basic/src/region.ts#L152-L249)

```typescript
const startEvent = session.append('compaction/start', lifecycle)
try {
  const prepared = prepareCompaction(...)
  const summarized = await summarizeCompaction(...)
  assertStable(...)
  const pending = commitCompactionBody(...)
  const endEvent = session.append('compaction/end', lifecycle)
  result = completeCompaction(pending, endEvent)
} catch (error) {
  session.append('compaction/end', { ...lifecycle, error: errorChain(error) })
}
```

- **调用者**：自动压力策略或手动 Compact 命令。
- **输入**：选中 Seq 范围、Agent、Summarizer、稳定性规则、可选 Flush 和 AbortSignal。
- **状态变化**：写 Start Lock，生成摘要，验证并提交 Surface Replace，再写 End；失败也尝试关闭事务。
- **返回**：成功的 `CompactionResult`；摘要、提交或持久化失败用不同错误表达。
- **下一站**：下一次 `deriveMessages()` 看到新的 replace generation 并重建模型历史。

如果写 End 本身失败，未匹配的 Start 会留在 Log 中，恢复时能检测「上次 Compaction 未干净收尾」，而不是继续并发第二次压缩。

### 第 5 站：摘要消息替换旧 Surface，但保留因果

源码：[查看 Compaction 提交](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/compaction/compaction-basic/src/region.ts#L429-L465)

```typescript
const summaryEvent = session.append('compaction/summary', {
  summary,
  shadowedRange: { start, end },
  shadowedSeqs: [...shadowedSeqs],
  provider,
  model,
  usage,
})

session.append('user/message', checkpointMessage, {
  surfaceOp: { op: 'replace', start, end },
  sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs],
})
```

- **调用者**：Compaction 事务通过稳定性检查后提交。
- **输入**：摘要、被遮蔽范围、来源节点、模型信息和 Checkpoint Message。
- **状态变化**：完整 Log 追加摘要事实；模型 Surface 用一条 Checkpoint 替换旧范围。
- **返回**：待完成的 Compaction 结果。
- **下一站**：后续模型请求只看 Checkpoint 与保留的尾部消息，审计器仍可访问旧 Event。

这正是「压缩不等于删除」。摘要可能丢信息，所以 Eval 应在 Compaction 前后检查关键约束、未完成任务、文件路径和 Tool 结果是否仍可恢复。

## 冷恢复还需要外部世界检查

Session 能恢复消息、请求 Header、Approval Policy 和 Compaction Surface，但不能自动恢复：

- 已退出子进程的内存；
- 已过期的网络连接和 MCP 会话；
- 工作区在 Session 关闭后发生的外部修改；
- 临时文件与凭据有效期；
- 当时的 Provider 模型版本。

恢复完成后应重新核对工作区基线、可用工具和模型路由，再决定是否继续未完成动作。Event 重放是 Harness 状态恢复，不是整个环境的时间旅行。

下一篇：[编排、子 Agent、Workflow 与 Code Mode](06-orchestration-extensions.md)。
