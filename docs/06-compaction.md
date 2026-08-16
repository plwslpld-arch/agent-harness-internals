---
title: 压缩：什么时候触发、砍哪一段、怎么少付一次全价
sources: [{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/region.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/summarizer.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/config.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/compaction/compaction-tool-result-pruner/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# 压缩：什么时候触发、砍哪一段、怎么少付一次全价

上下文会满。所有 coding harness 都要回答同一组问题：什么时候动手、砍掉哪一段、砍掉的东西用什么替代、这次操作本身要花多少钱。dsh 的答案有一个别人少见的特点：**摘要请求本身是主对话请求的字节前缀**，所以那次辅助调用几乎白嫖上一次的热缓存。这篇把整条链路讲清楚，也把它的代价讲清楚。

## 先看见：落地的 checkpoint 长什么样

下面四行取自上游 e2e 快照（`examples/headless-agent/tests/snapshots/compaction-recovery/session.jsonl:21-24`），是一次完整压缩事务在日志里留下的全部痕迹：

```jsonl
{"type":"compaction/start","seq":19,"time":…,"data":{"compactionId":"338e88fa-…","turn":1}}
{"type":"compaction/summary","seq":20,"time":…,"data":{"compactionId":"338e88fa-…","summary":[{"type":"text","text":"The request established a durable compaction premise."}],"rawOutput":[{"type":"text","text":"The request established a durable compaction premise."}],"llmStreamCall":true,"shadowedRange":{"start":4,"end":4},"shadowedSeqs":[4],"shadowedTokenCount":266,"provider":"deepseek-official","model":"deepseek-v4-flash","maxTokens":32,"usage":{"inputTokens":20,"outputTokens":4}}}
{"type":"user/message","seq":21,"time":…,"data":{"content":[{"type":"text","text":"This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.\n\n<compacted-summary>"},{"type":"text","text":"The request established a durable compaction premise."},{"type":"text","text":"</compacted-summary>"}],"source":{"kind":"plugin","plugin":"compact","compactionId":"338e88fa-…"},"role":"user","id":"3668b957-…"},"sourceEventSeqs":[19,20,4],"surfaceOp":{"op":"replace","start":4,"end":4}}
{"type":"compaction/end","seq":22,"time":…,"data":{"compactionId":"338e88fa-…","turn":1}}
```

读法：

- `seq 19` 是**锁**。`seq 22` 放锁。中间的一切失败都要保证至少尝试写一次 `compaction/end`。
- `seq 20` 是账本：摘要正文、模型原始输出、被遮蔽（源码里叫 shadowed，指「被这次替换顶掉、模型从此看不见」的那些节点）的范围与 seq 列表、被遮蔽内容的估价（266 token）、实际路由到哪个 provider/model、辅助请求的 usage。这条事件**不上 surface**，模型看不到。
- `seq 21` 才是模型看得见的东西：一条 `user/message`，`surfaceOp` 是 `{op:'replace', start:4, end:4}`，它把 surface 上的 `seq 4` 节点整个遮蔽掉，自己占据那个位置。`sourceEventSeqs: [19,20,4]` 把锁、账本、被遮蔽节点全部引上。
- checkpoint 消息的正文结构是固定的三段：前言 + `<compacted-summary>` 开标签、摘要文本块、`</compacted-summary>` 闭标签。

surface 的变化因此是：

```
压缩前：[user(seq4)] [user(seq5)] [assistant(seq…)] [tool/result(seq…)] …
压缩后：[user(seq21)=checkpoint] [user(seq5)] [assistant(seq…)] [tool/result(seq…)] …
```

也就是：**头部被一条 checkpoint 消息顶替，尾巴原样保留**。下一次主对话请求的消息序列因此从第一条起就和上一次不同。这是压缩最直接的代价，后面会算这笔账。

## 触发：两个入口

压缩后端 `compaction-basic` 只挂两个扩展点。

### 压力（`agent/pre-step`）

每一步派发之前跑一次（`packages/compaction/compaction-basic/src/index.ts:147-164`）。失败只 warn 不中断：`ctx.logger.warn('step compaction failed: …; continuing the turn')`（`:160-161`），也就是说压缩失败不会打断这一轮。

判定链在 `compactIfNeeded`（`packages/compaction/compaction-basic/src/index.ts:258-332`）：

1. 从日志的最新 `request/header` 拿 provider/model（`routedTarget`）；**没有 header 就什么都不做**：没发过请求就没有压力可谈。
2. `ctx.llm.resolveModelInfo(...)` 拿 `contextWindow`。拿不到就抛 `TargetPressureConfigError`（`:296-301`），每个目标只警告一次。
3. `tokenMeter.measure(session).totalTokens < thresholdTokens` → 返回 null，什么都不做。
4. 超阈值了，**先跑模型无关的剪枝**（如果装了 `toolResultPruner`），重新测量；还是低于阈值就到此为止（`:306-312`）。这一步能完全避免掉那次花钱的摘要调用。
5. 仍然超阈值：最多 `compactionRetries + 1` 轮「选区间 → 压缩 → 重测」；跑完还超就抛错（`:313-330`）。

默认参数（`packages/compaction/compaction-basic/src/config.ts:19-23, 86-96`）：

| 参数 | 默认值 | 含义 |
| --- | --- | --- |
| `thresholdRatio` | `0.8` | 触发阈值占上下文窗口的比例 |
| `retainRatio` | `0.16` | 尾部逐字保留的预算比例（也可用绝对值 `retainTokens`） |
| `summarizationProvider` / `summarizationModel` | `''`（空） | 空 = 沿用对话自己的路由 |
| `maxTokens` | `8192` | 摘要调用的输出上限 |
| `compactionRetries` | `1` | 一次压力事件里最多再压一轮 |
| `maxOverflowRetries` | `1` | 溢出恢复最多重试一次 |
| `auto` | `true` | 是否启用自动压缩。**只能在顶层配**，下面说的 per-model 覆盖不包括它 |

换算发生在 `resolveCompactSpec`（`packages/compaction/compaction-basic/src/config.ts:144-147`）：

```ts
  const thresholdTokens = Math.floor(contextWindow * policy.thresholdRatio)
  const retainTokens = policy.retainTokens === undefined
    ? Math.floor(contextWindow * policy.retainRatio)
    : policy.retainTokens
```

并且校验 `retainTokens < thresholdTokens`（`:148-154`），否则压缩后立刻又超阈值。DeepSeek 默认窗口 1,000,000，所以出厂配置下阈值 800,000、保留 160,000。`modelPolicies[]` 可以按 provider/model 覆盖上表里除 `auto` 之外的每一项，可覆盖的键名单写死在 `POLICY_CONFIG_KEYS`（`packages/compaction/compaction-basic/src/config.ts:26-35`），`auto` 不在里面。

### 溢出恢复（`agent/request-error`）

挂在同一个 waterfall 上，但只处理一种失败码（`packages/compaction/compaction-basic/src/index.ts:179-223`）：

```ts
      if (failure.code !== CONTEXT_WINDOW_EXCEEDED_CODE || signal.aborted) return next()
```

流程与压力路径不同的地方：

- **不看阈值**：请求已经被 provider 拒了，再问本地估算没有意义。
- 先记下当前的 `replaceGeneration`（`:191`），这是「有没有实际进展」的判据。
- 剪枝 → `selectCompactableRange(..., retainTokens = 0)`（`packages/compaction/compaction-basic/src/index.ts:281-290`）：**不留尾巴**，尽可能多压。
- 只有 `replaceGeneration` 真的增大了才返回 `{kind:'retry'}`，否则保留原来的失败（`:217-222`）。这条规则防止空转：压缩没压掉任何东西时重试只会再撞一次墙。
- 有一个刻意的例外（`:195-208`）：如果模型无关的剪枝已经落地、但后面的摘要环节抛了错，只要 surface 确实变了，仍然算作可重试的进展——注释说得很直白，「那次持久化的缩减本身就是充分的重试证据，不要因为可选的第二阶段失败就把它丢掉」。
- 计数器在 `agent/status` 变 idle 或者出现成功的 `assistant/message` 时清零（`:167-177`）。

`CONTEXT_WINDOW_EXCEEDED` **不在** `llm-retry` 的默认 `retryableCodes` 里（见 [04 LLM 层](04-llm-adapter.md)），所以 `normal` 模式的重试插件会直接放行给下游；`always` 模式则会特意先问下游要不要处理，压缩因此优先于盲目重试。

### 手动 `/compact`

`command-compact` 只做一件事：`ctx.compaction.compactNow(agent, signal, commandId)`（`packages/compaction/command-compact/src/index.ts:62-77`），拒绝任何参数。`compactNow`（`packages/compaction/compaction-basic/src/index.ts:368-420`）跑在 `agent.runMaintenance` 里（agent 必须 idle），同样用 `retainTokens = 0`，但事务选项不同：`owner: null`（独立的括号对，不属于任何 turn）、`stability: 'selected-span'`、并且成功后额外 flush 一次。

失败会被分成六类，每类对应一句人话（`packages/compaction/command-compact/src/index.ts:22-54`）：`busy`（有活跃压缩或 agent 不空闲）、`cancelled`、`changed`（选中的历史在摘要期间变了，对话未改动）、`summary`（没能产出有用摘要）、`commit`（没干净地提交，建议先检查会话状态）、`persistence`（压完了但没存下来）。

## 区间选择：永远从头开始

`selectCompactableRange`（`packages/compaction/compaction-basic/src/region.ts:98-133`）：

1. 校验 token-meter 看到的 surface 与 session 当前 surface 完全一致，不一致直接抛（`:107-110`）。两者错位时任何选择都是错的。
2. 从尾部向前累计每个节点的估价，直到累计 `>= retainTokens`，得到 `keepFromIdx`（`:112-120`）。
3. `keepFromIdx === 0` 表示尾巴就吃掉了全部预算，无可压，返回 null。
4. 从 `keepFromIdx` 继续向前退，直到那个 cut 处 tool 配对是平衡的（`toolPairingBalancedBefore`，`:123-127`）。再退到 0 也是无可压。
5. 返回 `{start: surfaceNodes[0], end: surfaceNodes[keepFromIdx - 1]}`。

第 5 步是关键：**区间永远从 `surfaceNodes[0]` 开始**。自动压缩因此总是在压对话的真前缀，这直接决定了摘要请求能不能复用热缓存（下一节）。区间不需要对齐 turn 边界，只需要 tool 配对平衡。

「tool 配对平衡」的判定在 `packages/compaction/compaction/src/tool-pairing.ts`：按 surface 顺序累计「assistant 消息里的 tool-call 块数 − tool/result 数」，为 N 个节点算 N+1 个 cut 是否为零（`packages/compaction/compaction/src/tool-pairing.ts:14-19, 29-38, 50-75`），并对每个 session 缓存，`replaceGeneration` 变了才重算。`toolPairingBalancedBefore/After`（`packages/compaction/compaction/src/tool-pairing.ts:117, 129`）是对外的两个查询。切在不平衡的位置上会留下悬空的 assistant tool call，provider 会直接拒绝这条消息序列。

## 事务：三个事件加一次 replace

`compactSurfaceRegion`（`packages/compaction/compaction-basic/src/region.ts:152-254`）的骨架：

```
validateSurfaceRegion（区间存在、有序、两端平衡）
inspectCompactionEntryState（找开放 turn、未配对的 compaction/start、最新 end-seed）
assertCompactionInactive
  ↓
append compaction/start          ← 锁；与上面的校验同步紧邻，中间不 await
  ↓
prepareCompaction                ← 测量、给被遮蔽节点估价、buildSummarizationInput
summarizeCompaction              ← 真正发那次 LLM 请求
assertStable                     ← whole-surface 或 selected-span
commitCompactionBody             ← append compaction/summary，再 append user/message(replace)
append compaction/end            ← 放锁
```

几个细节单独说。

**锁的语义**。`compaction/start` 的 `turn` 字段是 `number | null`（`packages/compaction/compaction/src/types.ts:23`）：数字表示这次压缩被那个开放 turn 严格包住（自动路径），`null` 表示这是两个 turn 之间的独立事务（手动路径）。`assertCompactionInactive`（`packages/compaction/compaction-basic/src/region.ts:286-298`）判断「有没有未配对的 start」时，会拿 `session/end-seed` 的位置做比较：如果最新的种子边界比那条未配对的 start 还靠后，说明那是上个生命周期留下的，不算活跃锁。这就是 [05 Session](05-session.md) 里 `session/end-seed` 存在的实际用途之一。

**失败一定尝试收尾**（`packages/compaction/compaction-basic/src/region.ts:218-229`）：catch 里会再 append 一条带 `error` 的 `compaction/end`；连这一步都写不出去，就故意留下一个未配对的 `start`：可检测，好过假装干净。

**两种稳定性检查**。自动路径用 `assertWholeSurfaceUnchanged`（`packages/compaction/compaction-basic/src/region.ts:387-396`）：重新 measure，整个 surface 的节点列表必须与准备时深度相等，否则抛 `SurfaceChangedError`。手动路径用 `assertSelectedSpanStable`（`packages/compaction/compaction-basic/src/region.ts:403-424`）：只要求所选的那一段仍然是同一个存在、连续、等价定价、配对平衡的替换目标——摘要期间新追加的上下文不算破坏。区别的理由很实际：手动压缩跑在 idle 期，但用户随时可能再输入。

**摘要必须比被替换的内容小**（`packages/compaction/compaction-basic/src/region.ts:373-378`）：

```ts
  const framedSummaryTokenCount = dependencies.meter.estimateMessage(checkpointMessage)
  if (framedSummaryTokenCount >= prepared.shadowedTokenCount) {
    throw new Error(
      `summary is not smaller than the shadowed content (${framedSummaryTokenCount} estimated framed tokens >= ${prepared.shadowedTokenCount})`,
    )
  }
```

注意比较的是**加了框架之后**的 checkpoint 消息估价，不是裸摘要。压缩不缩小就不算压缩。

**提交是两条 append 紧挨着**（`packages/compaction/compaction-basic/src/region.ts:427-465`）：先写 `compaction/summary`，再写那条 `user/message`，`surfaceOp: {op:'replace', start, end}`，`sourceEventSeqs: [startSeq, summarySeq, ...shadowedSeqs]`。这个「计量事件紧邻其替换节点」的相邻性是**契约**。`packages/compaction/compaction/src/types.ts:25-32` 明确写道：消费者可以直接把一个 replace 节点和它前面那条计量事件配对，从而算出这次替换省下了多少。

## 摘要请求怎么复用热前缀

这是 dsh 在这个主题上最特别的一处设计。

`buildSummarizationInput`（`packages/compaction/compaction-basic/src/region.ts:498-514`）：

```ts
function buildSummarizationInput(
  session: Session,
  shadowedSeqs: readonly number[],
): SummarizationInput {
  const header = session.requestHeader()
  const events = session.events
  const regionMessages = shadowedSeqs
    // shadowedSeqs are current surface seqs, so each is a valid log index.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    .map(seq => session.deriveEventMessage(events[seq]!))
    .filter((message): message is Message => message !== null)
  return {
    ...header?.system === undefined ? {} : { system: header.system },
    ...header?.tools === undefined ? {} : { tools: header.tools },
    messages: regionMessages,
  }
}
```

`system` 和 `tools` 直接取自最新的 `request/header`；消息是被遮蔽的 seq 逐个过 `deriveEventMessage`，也就是 `deriveMessages()` 折进主请求的**同一批对象**。

然后 `summarizeWithLlm`（`packages/compaction/compaction-basic/src/summarizer.ts:121-163`）把指令追加在**最后**：

```ts
  const messages: Message[] = [
    ...input.messages,
    createUserMessage({
      content: [{ type: 'text', text: COMPACTION_INSTRUCTION }],
      source: { kind: 'plugin', plugin: 'dsh-compaction-basic' },
    }),
  ]
  const options: GenerateOptions = {
    provider: target.provider,
    model: target.model,
    messages,
    ...input.system === undefined ? {} : { system: input.system },
    ...input.tools === undefined ? {} : { tools: [...input.tools] },
    maxTokens: config.maxTokens,
    sessionId: agent.session.id,
    purpose: 'compaction',
    ...signal === undefined ? {} : { signal },
  }
```

结果就是：这次辅助请求的 token 序列 = `[主请求的 system][主请求的 tools][主请求的前 N 条消息][一条新的指令 user 消息]`。前面全部命中，只有尾部指令和输出付全价。`purpose: 'compaction'` 让 DeepSeek 适配器加一个 `x-deepseek-harness-compact: 1` 头（见 [04 LLM 层](04-llm-adapter.md)），那是传输元数据，不进 body。

指令原文的开头（`packages/compaction/compaction-basic/src/summarizer.ts:31-34`）：

> You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.
>
> Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.

八节结构固定（`packages/compaction/compaction-basic/src/summarizer.ts:36-58`）：Primary Request and Intent / Key Technical Concepts / Files and Code / Errors and Fixes / Pending Jobs / Current Work / Next Step / Critical Context。五条规则（`packages/compaction/compaction-basic/src/summarizer.ts:60-65`）：写简洁的英文工程散文，保留精确的路径、命令、错误串、标识符、数值、函数签名；忠实记录用户反馈尤其是纠正；**不要提到这次摘要请求或上下文被压缩过**；只输出 checkpoint 文本，不调用任何工具；已有的 `<compacted-summary>` 块是上一个 checkpoint，不要原样抄下来，而要合并成一份统一的摘要。

第一条规则的一个直接后果：**checkpoint 一律是英文**，无论对话本身用什么语言。

落地时套上框架（`packages/compaction/compaction-basic/src/summarizer.ts:189-195`）：

```ts
export function frameSummary(summary: readonly ContentBlock[]): ContentBlock[] {
  return [
    { type: 'text', text: `${CHECKPOINT_PREAMBLE}\n\n${SUMMARY_OPEN_TAG}` },
    ...summary,
    { type: 'text', text: SUMMARY_CLOSE_TAG },
  ]
}
```

`CHECKPOINT_PREAMBLE`（`packages/compaction/compaction-basic/src/summarizer.ts:69-70`）就是本文开头那条 `seq 21` 里看到的那段话。只保留 text 块，出现图像抛 `UNSUPPORTED_CONTENT`（`packages/compaction/compaction-basic/src/summarizer.ts:216-224`），`max-tokens` 结束当作失败：「summarization truncated at the token cap (incomplete checkpoint)」（`packages/compaction/compaction-basic/src/summarizer.ts:206-209`）。

### 为什么指令在尾部

设计记录在 `.agents/notes/implemented/bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md`。原来的实现用一个独立的 summarizer system prompt 加一段拍平的 transcript 字符串，Note 的问题陈述（`:9`）：

> A provider caches on the request's leading token sequence, so a first token that differs — a different system prompt — invalidates the entire cached prefix. Every compaction therefore paid full prompt-processing cost for the whole replayed history twice: once for the conversation request that tripped pressure, and again for the summarization call, defeating the cache exactly when the conversation is largest.

决定是把指令从**请求前部**挪到**对话末尾**（`:13`）。Note 里被否决的四个方案（`:29-32`）：

- 「保留 summarizer system prompt，其余照抄」。被否：system 槽正是 provider 缓存的第一个 token 区域，换掉它后面写什么都没用。
- 「只发被遮蔽区间，不带 system/tools 头」。被否：头不一样照样从第一个 token 就分叉，缓存一点没省，还丢了摘要需要的框架。
- 「省掉 `tools`（反正摘要器不会调工具）」。被否，原话是 "tool schemas are part of the cached token sequence; omitting them misaligns every following token and defeats reuse"。**即使不调用也必须带上**。
- 「专门开一个发 `assistant/chunk` 的子会话做快照回放」。被否：`compaction/summary` 事件已经记录了这次本地调用的位置和完整输出，它的显式调用标记（`llmStreamCall: true`）防止回放把模板或远程产出的摘要当成本地流。这条正好解释了那个字段为什么存在。

Note 也划清了保证范围（`:23-25`）：自动压缩锚在 surface 头，所以复用是**必中**的情况；手动的中段 `compactRegion` 仍然正确、但放弃复用（它的区间不是请求头）；配置了不同 `summarizationProvider`/`summarizationModel` 同样放弃复用。那是部署方的显式取舍，不是缺陷。

还有一个常被弄反的地方：压缩**确实会发一次独立的 LLM 请求**（`packages/compaction/compaction-basic/src/summarizer.ts:164` 那行 `for await (const chunk of ctx.llm.stream(options))`）。「复用热前缀」的意思不是「不发请求」，而是「这次请求的前缀与刚才那次对话请求字节对齐，所以 prefill 几乎不要钱」。

## 模型无关的剪枝

`compaction-tool-result-pruner` 是压缩之前的一道廉价关卡，完全确定性、不调模型。默认值（`packages/compaction/compaction-tool-result-pruner/src/config.ts:10-14`）：

```ts
export const DEFAULTS: ResolvedConfig = deepFreeze({
  thresholdChars: 8192,
  headChars: 4096,
  tailChars: 1024,
})
```

标记文本（`packages/compaction/compaction-tool-result-pruner/src/config.ts:6-7`）：

```ts
export const PRUNE_MARKER = '\n\n[... tool result middle pruned ...]\n\n'
```

按 Unicode code point 计数（`packages/compaction/compaction-tool-result-pruner/src/config.ts:22-28`），不按 UTF-16 code unit，所以保留边界不会劈开代理对（但仍可能劈开字素簇，注释坦承了这点，`packages/compaction/compaction-tool-result-pruner/src/index.ts:76-79`）。超过阈值的 `tool/result` 保留头 4096 + 标记 + 尾 1024，非文本块原样保留（`pruneContent`，`packages/compaction/compaction-tool-result-pruner/src/index.ts:83-122`）。

每次替换前先写一条计量事件（`packages/compaction/compaction-tool-result-pruner/src/index.ts:162-173`）：

```ts
      session.append('compaction/prune', {
        shadowedRange: { start: seq, end: seq },
        shadowedSeqs: [seq],
        shadowedTokenCount: this.ctx.tokenMeter.estimateMessage(event.data.message),
      })
      const replacement = session.append('tool/result', {
        ...event.data,
        message,
      }, {
        surfaceOp: { op: 'replace', start: seq, end: seq },
        sourceEventSeqs: [seq],
      })
```

和摘要走的是同一套「计量事件紧邻替换节点」协议。而 `tool/result` 的 replace 在 session 层有额外约束：只能替换恰好一个同类节点、只能改 `content`（见 [05 Session](05-session.md)），所以剪枝在类型和运行时上都无法越界。

剪枝在两条触发路径上都跑在摘要之前（`packages/compaction/compaction-basic/src/index.ts:284-287, 308-311`）。README 也点出了它最大的价值（`packages/compaction/compaction-basic/README.md:99`）：「Model-free pruning can avoid the auxiliary call entirely」。很多时候剪一剪就够了，那次摘要请求根本不用发。

## 代价与失效点

1. **主对话在压缩后必然从第一条消息起 miss**。README 自己写明（`packages/compaction/compaction-basic/README.md:103`）：「Each checkpoint invalidates reuse from the first replaced history token; the unchanged request prefix before that range remains reusable」。保住的只有 system 和 tools。
2. **每轮压缩都重写头部 checkpoint**。上游提案的问题陈述（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:9`）自评得很直接：「the head checkpoint is rewritten every pass, so the request prefix takes a full prompt-cache miss each time, and earlier summaries are re-summarized generation after generation」。压得越频繁，重复摘要的损耗越大。
3. **被压掉的原文对模型彻底消失**。同一份提案指出（`:9`）：`shadowedRange` 只存在于 log-only 的 `compaction/summary` 事件上，模型看到的摘要里没有任何指向它所遮蔽内容的引用，也没有工具能把那一段读回来——即使只追加的日志里一个字节都没丢。提案给出的方案是拆成「冻结的索引 checkpoint + 一个可变的状态 checkpoint」并加 `history_read` / `history_search` 两个工具，请求前缀变成 `[system][stubs…][state][tail]`，让 miss 的起点从位置 0 后移（`:46-47, :53`）。**状态是 proposed，尚未实现。**
4. **阈值建立在 4 字符/token 的启发式上**（见 [04 LLM 层](04-llm-adapter.md)）。对中文和代码偏差都不小；而 DeepSeek 默认窗口 1,000,000 × 0.8 = 800,000，出厂配置下自动压缩极少触发。真正常见的入口反而是溢出恢复。
5. **只有单摘要节点，没有分级或分段**。区间永远从头开始、结果永远是一条 checkpoint 消息。摘要质量完全依赖那一份固定的英文模板。
6. **剪枝按字符不按 token**。8192 个字符对英文和对中文意味着差别很大的 token 量。
7. **压力路径失败只是 warn**（`packages/compaction/compaction-basic/src/index.ts:160-161`）。压不动的会话会继续膨胀，直到撞上 provider 的窗口，然后走溢出恢复；如果那次也压不动，`maxOverflowRetries` 用完就把原始失败抛出去。
8. **手动中段压缩放弃缓存复用**，这是设计上接受的（Note `:23-25`）；配置了跨路由摘要模型同理。
9. **`compaction/summary` 与其 `user/message` 的相邻性是契约而非机制**。类型注释写了 "The replacement MUST be appended synchronously right after this event"（`packages/compaction/compaction/src/types.ts:78-79`），但没有运行时断言强制它。

## 别人怎么做

开头那四个问题（何时动手、砍哪一段、用什么替代、这次操作花多少钱）正好是下表的前四列。Claude Code 一行来自官方公开文档，其余读自源码。读的时候盯住「摘要怎么发」这一列，那是唯一一处 dsh 和所有人都不一样的地方。

| harness | 触发 | 砍哪一段 | 摘要怎么发 | 特别之处 |
| --- | --- | --- | --- | --- |
| **dsh** | `agent/pre-step` 压力（默认 0.8×窗口）；`agent/request-error` 上的 `CONTEXT_WINDOW_EXCEEDED`；`/compact` | 永远从 surface 头开始，从尾累计保留 0.16×窗口，退到 tool 配对平衡的 cut | 独立请求，但复用主对话的 system/tools/消息前缀，指令作为最后一条 user 消息 | 全过程事件化可审计；先廉价剪枝再花钱摘要；摘要不缩小就拒绝 |
| **Claude Code** | 未设定时压到模型上下文上限；可用 `/autocompact 500k`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`（100K–1M）调整；`DISABLE_COMPACT` 关闭 | 两阶段：**先清旧工具输出，再摘要对话** | 官方未公开请求形状；`/compact <focus>` 与 `PreCompact` hook 可注入指令 | 有明确的「压缩后什么幸存」清单：项目根 CLAUDE.md 与无 paths 的 rules 从磁盘重新注入，已调用 skill 的正文重新注入（每个上限 5,000 token、总计 25,000），带 `paths:` 的 rules 丢失；`/rewind` 截断回一个**已缓存的前缀**，因此比 `/compact` 便宜；连续几次压缩后立刻又满会停止自动压缩并报错 |
| **Codex** | 阈值 `context_window × 9/10`；三个时机：pre-turn、mid-turn、手动 | 本地实现保留最近的真实用户消息（倒序累计 ≤ 20,000 token）+ 摘要，**assistant 与 tool 项全部丢弃** | 本地：把摘要提示作为一条 user 消息追加，用当前模型采样，工具列表为空；远程 v1 调专门的 `/responses/compact` 端点，远程 v2 走普通流并在 input 末尾 push 一个压缩触发项、失败可回退到 fallback 模型 | 还有第四种实现：`TokenBudget` 特性下**不摘要**，直接开新 context window 重新注入初始上下文，模型自己用 `new_context` 工具管理；mid-turn 时把初始上下文插到最后一条真实用户消息**之前**，注释理由是模型训练时看到的就是「摘要在历史末尾」这个分布 |
| **OpenCode** | `usable = limit.input − reserved`（`reserved` 默认取 20,000 与 maxOutputTokens 的较小值）；每个 step 结束检查，溢出错误也转压缩且**不重试** | 尾部保留 `clamp(usable × 0.25, 2k, 15k)`，按 turn 从后往前累计，超预算的 turn 允许在 turn 内切分 | 用一个**专用的 `compaction` agent**（`"*": "deny"`，没有任何工具）和独立 system prompt，历史被序列化成 `[User]: …` 之类的纯文本 | 可选的工具输出剪枝（默认关闭）：保护最近 40,000 token 的工具输出，且可剪总量 > 20,000 才动手；压缩后自动追加一条「Continue if you have next steps…」的合成 user 消息 |
| **pi** | `contextTokens > contextWindow − 16384`；三种 reason：`manual` / `threshold` / `overflow`（溢出只做**一次**恢复性压缩） | 从最新往回累加到 ≥ 20,000 token；合法切点只有 user / assistant / bashExecution / custom，**绝不切在 tool result 上**；单个 turn 超预算时对 turn 前缀单独摘要再合并 | 独立 system prompt 的摘要助手，maxTokens = `0.8 × reserveTokens` | 压缩记为 JSONL **树**上的一条 `CompactionEntry{summary, firstKeptEntryId, …}`，重建上下文时 = system + summary + `firstKeptEntryId` 之后的消息 |
| **mini-swe-agent** | **没有压缩** | — | — | 唯一的体积保护是 observation 模板：超过 10,000 字符时取头 5000 + 尾 5000；`ContextWindowExceededError` 列在放弃列表里，直接终止任务 |

几处可以对照的分野：

- **切点约束**：dsh 用「tool 配对平衡」的 cut，pi 用「合法切点白名单」，OpenCode 允许在 turn 内切分。三者都在解决同一个问题——不能留下悬空的工具调用。
- **摘要请求的头**：只有 dsh 刻意让它与主对话请求对齐。OpenCode 和 pi 都用独立的 summarizer system prompt，Codex 本地实现用 `base_instructions` 加空工具列表。上游提案的自评（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:13`）：「none of the surveyed implementations makes compaction prefix-cache-aware」。
- **压缩之外的便宜办法**：Claude Code 的 `/rewind`（回退到一个已缓存的前缀）和 Codex 的 token-budget 新窗口都绕开了「摘要」这件事本身。dsh 的对应物是模型无关的剪枝，它同样不花模型的钱，只是保守得多。
- **压缩后的重新注入**：Claude Code 会把 CLAUDE.md 和已用 skill 的正文重新注入，Codex 会重新注入初始上下文并对齐位置，OpenCode 会追加一条续跑消息。dsh 什么都不重注入，压缩之后 surface 上只多了那一条 checkpoint。唯一的例外是运行时上下文快照：**如果**被压区间恰好盖住了那条还留着的快照，`RuntimeContextProjection` 的 `retained` 会被置空，下一步于是重发一份完整快照（机制见 [01 System Prompt](01-system-prompt.md) 的 `retained` 三态；本条是从那段逻辑推出来的，**是推断**，本文开头那个 fixture 里被替换的是 `seq 4`，运行时快照 `seq 5` 并没被盖住，所以看不到这个效果）。

## 怎么自己核

看一次真实压缩的四条事件：

```bash
cd sources/checkouts/deepseek-harness
grep -n 'compactionId' examples/headless-agent/tests/snapshots/compaction-recovery/session.jsonl   | grep -o '^[0-9]*:{"type":"[^"]*","seq":[0-9]*'
```

确认默认参数与阈值公式：

```bash
sed -n '19,24p'   packages/compaction/compaction-basic/src/config.ts     # 0.8 / 0.16
sed -n '86,96p'   packages/compaction/compaction-basic/src/config.ts     # 8192 / 1 / 1 / auto
sed -n '144,154p' packages/compaction/compaction-basic/src/config.ts     # thresholdTokens / retainTokens
sed -n '9,13p'    packages/compaction/compaction-tool-result-pruner/src/config.ts  # 8192/4096/1024
```

确认摘要请求确实带上了 system 与 tools：

```bash
sed -n '498,514p' packages/compaction/compaction-basic/src/region.ts
sed -n '145,163p' packages/compaction/compaction-basic/src/summarizer.ts
```

读完整的指令模板：

```bash
sed -n '31,66p'   packages/compaction/compaction-basic/src/summarizer.ts
```

相关阅读：`replace` 与 surface 的规则见 [05 Session](05-session.md)；前缀缓存为什么只在这里被打断见 [02 KV-Cache](02-kv-cache.md)；`purpose:'compaction'` 与 `CONTEXT_WINDOW_EXCEEDED` 的来龙去脉见 [04 LLM 层](04-llm-adapter.md)；`agent/pre-step` 与 `agent/request-error` 这两个扩展点见 [03 Agent 循环](03-agent-loop.md)；跨 harness 的完整对照见 [14 横向对比](14-comparison.md)；术语见 [附录 A 词汇表](appendix-a-glossary.md)。
