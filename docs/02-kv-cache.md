---
title: KV-Cache：没有一行缓存管理代码，为什么还能一直命中
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/serialize.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/request-header.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/region.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/tests/request-cache.e2e.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# KV-Cache：没有一行缓存管理代码，为什么还能一直命中

*这一篇讲给要给 agent 省 token 钱、或者正在查「命中率怎么突然掉了」的人。读完你能回答：dsh 一个缓存参数都不发为什么还能持续命中、哪些操作会把前缀打断、命中率塌下去时该去日志里找哪条事件。*

你要给一个 harness 调缓存，第一反应大概是找那个「缓存管理模块」：在哪儿设断点、TTL 配多久、哪几段值得缓存。dsh 里没有这么一个地方。它一个缓存参数都不发，而上游的实测记录是每次请求一万多 token 命中、只有几十到三百 token 需要重算。

先把词说清楚：这里说的**前缀缓存（prefix cache，也叫 KV-Cache）**，指 provider 在服务端把「已经算过的请求前导 token 序列」连同它们的注意力中间结果存起来；下一次请求如果开头的 token 与它逐字节相同，这段就不用重新计算，按更便宜的价格计费。关键词是**前导**和**逐字节**：命中只从第一个 token 开始往后连续匹配，中间任何一个字节不同，从那里往后全部作废。

在整个 dsh 仓库里搜 `cache_control`，结果是零。搜 `prompt_cache_key`，只有一处，还是 Codex 子代理的一份测试 fixture 里抄下来的 OpenAI 响应字段（`packages/subagent/subagent-codex/tests/responses-fixture.ts:70`，值是 `null`）。也就是说：没有 cache breakpoint，没有 TTL 选项，没有任何一处调用「provider 的缓存 API」。

但 dsh 有一个带真实 API key 才会跑的端到端测试，断言**第一次之后的每一次请求，DeepSeek 都必须报告非零的缓存读取**（`packages/core/agent-loop/tests/request-cache.e2e.ts:92`）。同时上游一条真实测量记录写着：在四步连续变更权限策略的过程中，「cache reads were 14,848–15,872 tokens while uncached input was 59–306 tokens per request」（`.agents/notes/implemented/feature/2026-07-30-current-sandbox-policy-context.md:35`）（意思是：每次请求缓存读取 14,848 到 15,872 个 token，而没命中、需要重新计算的输入只有 59 到 306 个）。两个数字差了约五十倍，而且是在用户反复切换权限模式的过程中测的。

这篇讲的就是这两件事怎么同时成立：命中率不是管出来的，是**请求构造方式的副产品**。要讲清楚，得先看见 dsh 真正发到网线上的那个 JSON。

---

## 一、先看见：dsh 发给 DeepSeek 的请求长什么样

DeepSeek 适配器把内部的 `GenerateOptions` 变成 HTTP body 的地方只有一个函数，`serializeRequest`（`packages/llm/llm-deepseek/src/serialize.ts:151`）。它短到可以整个贴出来：

```ts
export function serializeRequest(
  options: GenerateOptions,
  defaults: RequestDefaults = {},
): WireRequest {
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
  // A short title budget must produce visible text; conversation and
  // compaction calls continue to inherit the adapter's thinking defaults.
  const resolvedThinking = resolveThinking(options, defaults)

  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...resolvedThinking.thinking !== undefined ? { thinking: { type: resolvedThinking.thinking } } : {},
    ...resolvedThinking.reasoningEffort !== undefined
      ? { reasoning_effort: resolvedThinking.reasoningEffort }
      : {},
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
```

中间那条英文注释讲的是 `resolveThinking` 为什么要单独一步：会话请求和压缩请求继续沿用适配器的 thinking 默认值，只有「给会话起标题」这种输出预算很小的调用要强制产出可见文本，否则预算全被思考过程吃掉，正文一个字都吐不出来。

几个决定缓存能不能命中的事实直接从这段代码读出来：

- **system prompt 永远是 `messages[0]`**（`serialize.ts:157`），不是什么单独的顶层字段。它一个 token 变，整条消息序列的第一个 token 就变了。
- **`tools` 是 JSON 顶层字段**，排在 `messages` 之后；空数组不发（`serialize.ts:183` 的展开条件是 `tools.length > 0`）。服务端把工具定义渲染到 chat template 的哪个位置由 provider 决定，仓库里没有说明；但 dsh 的所有设计记录都把 tools 和 system 一起当作「请求头部」处理。
- **对象字面量的字段顺序是写死的**。`adapter.ts` 拿到这个对象就直接 `JSON.stringify`（`packages/llm/llm-deepseek/src/adapter.ts:279`、`:282`），所以同样的输入必然产生同样的字节串：没有 Map 遍历顺序、没有时间戳、没有随机数。

再看消息本身怎么转。`serializeMessages`（`serialize.ts:112`）有四条容易踩坑、又直接决定前缀稳不稳的规则：

**1）assistant 消息的 `content` 永远是字符串，绝不是 `null`。** 源码注释把原因写得很直白（`serialize.ts:87` 起）：

```ts
    // Text-less turns send "" — NEVER null. Pure tool-call turns: the
    // official samples replay message.content verbatim (which is "") and
    // some gateways reject null outright. Reasoning-ONLY turns (the model
    // can answer entirely in the reasoning channel, e.g. a v4-flash
    // greeting): the live API rejects null-content/no-tool_calls assistant
    // messages with a 400 ("content or tool_calls must be set"), and since
    // the message sits durably in the session log, a null here bricks every
    // later turn of that session.
    content: text,
```

这段注释列了三种「本轮没有正文文本」的情况，说明为什么都得写空字符串而不是 `null`：一是纯工具调用轮，官方样例就是原样回放 `message.content`（那个值正是空串），而且有些网关直接拒收 `null`；二是纯推理轮，模型可以整段话都答在 reasoning 通道里（例如 v4-flash 打个招呼），此时线上 API 会用 400 拒掉「content 为 null 且没有 tool_calls」的 assistant 消息，报错原文是 `content or tool_calls must be set`。

最后半句才是重点：这条消息**永久留在会话日志里**，每一次后续请求都会重新序列化它。一个 null 不是「这次请求失败」，是「这个会话从此报废」。

**2）`reasoning_content` 只在带 tool_calls 的 assistant 轮回传**（`serialize.ts:99`）。纯文本轮直接丢掉，注释说明这是官方 thinking 模式的回传规则，纯文本轮回传也会被忽略，丢掉能省 token。这条规则本身是**确定性的**：同一条历史消息在此后每一次请求里都以同一种方式序列化，所以它不制造前缀漂移。

**3）工具结果被拆成 `role:'tool'` 消息。** harness 内部的词汇里没有 tool 角色，工具结果是 `role:'user'` 消息里的一个 `tool-result` block（`packages/llm/llm/src/message.ts:231`，`createToolResultMessage` 一个结果一条消息）。到 wire 上，一条 user 消息先吐出文本部分（如果有），再按 block 顺序把每个工具结果展开成独立的 `{role:'tool', tool_call_id, content}`（`serialize.ts:133`）。空输出替换成字面量 `'(no output)'`（`serialize.ts:136`），因为 wire 上总得有点内容，而这个替换同样是确定性的。

**4）图片直接拒绝**（`serialize.ts:64`，`assertTextOnly` 抛 `UNSUPPORTED_CONTENT`）。DeepSeek 直连路径是纯文本，不存在附件字节漂移这一类问题。

把这些拼起来，一次带工具调用的请求骨架是这样（省略号处是真实内容）：

```jsonc
{
  "model": "deepseek-v4-flash",
  "messages": [
    { "role": "system",    "content": "You are an AI agent powered by DeepSeek Harness.\n\n…persona…\n\n…各插件 section…" },
    { "role": "user",      "content": "帮我看一下 build 为什么挂了" },
    { "role": "assistant", "content": "",                      // 绝不是 null
      "reasoning_content": "…",                                // 仅因为本轮带 tool_calls
      "tool_calls": [ { "id": "call_1", "type": "function",
                        "function": { "name": "bash", "arguments": "{\"command\":\"pnpm build\"}" } } ] },
    { "role": "tool",      "tool_call_id": "call_1", "content": "…编译输出…" },
    { "role": "user",      "content": "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n…" },
    { "role": "assistant", "content": "看起来是 tsconfig 的 paths 配错了" }
  ],
  "stream": true,
  "stream_options": { "include_usage": true },
  "thinking": { "type": "enabled" },
  "reasoning_effort": "high",
  "tools": [ { "type": "function", "function": { "name": "bash", "description": "…", "parameters": { … } } } ],
  "max_tokens": 256000
}
```

倒数第二条消息里那句英文是运行时上下文快照的固定引导语，意思是「以下是当前的运行时上下文，这份快照取代之前所有的运行时上下文快照」。它为什么被放在消息数组的最尾巴，§六会讲。

### 第 N 步和第 N+1 步差在哪

这是全篇的核心图。同一个 turn 内，模型调了一次工具，于是有了第二步请求：

```
第 N 步（模型决定调工具）              第 N+1 步（把工具结果喂回去）
──────────────────────────────        ──────────────────────────────
messages[0]  system      ────────────► messages[0]  system        （逐字节相同）
messages[1]  user "帮我看…" ─────────► messages[1]  user "帮我看…"（逐字节相同）
                                       messages[2]  assistant + tool_calls  ← 新增
                                       messages[3]  tool  "…编译输出…"       ← 新增
tools[...]   ────────────────────────► tools[...]                （逐字节相同）
model/thinking/max_tokens ───────────► 同上                       （逐字节相同）
```

第 N+1 步的请求，是第 N 步请求的**字节级追加扩展**：前缀一个字节都没动，只在消息数组尾部多了两条。DeepSeek 的上下文缓存按前导 token 序列自动匹配，于是整个前缀命中。

下一个 turn 也一样：用户新消息追加在最后，前面全都不动。

这就是 dsh 全部的「缓存策略」。没有别的了。

---

## 二、DeepSeek 侧的语义：自动前缀匹配，只报读不报写

适配器只做一件和缓存有关的事：把 provider 报的数字翻译成 harness 的口径。`mapUsage`（`packages/llm/llm-deepseek/src/translate.ts:53`）：

```ts
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens
  const reasoning = usage.completion_tokens_details?.reasoning_tokens
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}
```

减法的理由写在上面的注释里（`translate.ts:46`）：DeepSeek 的 `prompt_tokens` **包含**缓存命中部分，`prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens`；而 harness 的 `TokenUsage` 约定是**互不相交**的计数：`inputTokens` 只算未命中的输入，计费输入 = `inputTokens + cacheReadTokens + cacheWriteTokens`（`packages/llm/llm/src/types.ts:130`）。两套口径不换算就会重复计费。

单元测试里保留了一份真实抓包的 usage 形状（`packages/llm/llm-deepseek/tests/translate.spec.ts:286`）：

```ts
    expect(mapUsage({
      prompt_tokens: 283,
      completion_tokens: 69,
      prompt_cache_hit_tokens: 256,
      prompt_cache_miss_tokens: 27,
      prompt_tokens_details: { cached_tokens: 256 },
      completion_tokens_details: { reasoning_tokens: 24 },
    })).toEqual({
      // 283 wire prompt_tokens minus the 256 cached → 27 uncached input
      // (TokenUsage counts are disjoint).
      inputTokens: 27,
      outputTokens: 69,
      cacheReadTokens: 256,
      reasoningTokens: 24,
    })
```

283 = 256 + 27。这就是「一次请求命中了 256 个 token 的前缀，只有 27 个 token 需要重新 prefill」的具体样子（**prefill（预填充）**指模型在开始吐字之前，先把输入的每个 token 过一遍、算出注意力中间结果的那段计算；缓存省下的正是这段）。

关于粒度，仓库里唯一的直接陈述在那个端到端测试的注释里（`packages/core/agent-loop/tests/request-cache.e2e.ts:23`）：

```ts
// Long enough that the shared request prefix comfortably spans the provider's
// cache-block granularity (64 tokens) from the very first request.
```

测试特意把 system prompt 写得很长，就是为了让共享前缀从第一次请求起就稳稳超过 64 token 这个块粒度。**不足一整块的尾部不进缓存**。这解释了为什么「system 很短的会话」看起来命中率很差，不是机制坏了，是压根没攒够一块。

还有一条不对称：**DeepSeek 不报缓存写入指标**，README 里写得很直接（`packages/llm/llm-deepseek/README.md:73`）：「Cache accounting: `cacheReadTokens` ← `prompt_cache_hit_tokens` / `prompt_tokens_details.cached_tokens`; DeepSeek reports no cache-write metric.」（意思是：缓存记账只有一条来路，`cacheReadTokens` 取自 `prompt_cache_hit_tokens` 或 `prompt_tokens_details.cached_tokens`；DeepSeek 不上报任何缓存写入指标。）所以在 DeepSeek 路径上，`cacheWriteTokens` 恒为缺省。

### 和 Anthropic 的显式断点比

dsh 有两个 LLM 适配器。DeepSeek 直连适配器（`llm-deepseek`）如上，没有任何缓存参数；而经由 pi-ai SDK 的多 provider 适配器（`llm-pi-ai`）暴露了一个 profile 字段 `cacheRetention`（`packages/llm/llm-pi-ai/src/config.ts:130`），在每次 stream 时原样转发给 SDK（`packages/llm/llm-pi-ai/src/adapter.ts:92`），并且它的 usage 映射里有 `cacheWriteTokens`（`packages/llm/llm-pi-ai/src/stream.ts:27`）。

这就是两种缓存模型的分界：Anthropic 那一侧要你**显式声明断点**（`cache_control`）、要你为写入付更贵的价、于是也就告诉你写了多少；DeepSeek 这一侧**服务端自动做前缀匹配**，客户端唯一能做的就是别去破坏前缀。dsh 的 DeepSeek 路径里没有任何 `cacheRetention` 的等价物，因为没有可设的东西。

---

## 三、核心论点：`request = f(事件日志)`

上游把这件事写在一条 Agent Note 里，题目就叫「Every LLM request is reconstructable from the session log」（意思是：每一次 LLM 请求都能从会话日志里重建出来）。它的原则句是（`.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md:17`）：

> **Model-visible ⟺ durably referenced.** Anything that reaches a model request must be reconstructable from the session log and the immutable content-addressed objects it references.

（**模型可见 ⟺ 已被持久引用。** 任何进入模型请求的内容，都必须能从会话日志、以及日志引用的那些不可变的内容寻址对象里重建出来。）

翻译成人话就是：模型看到过的每一个字节，日志里都得有据可查；反过来，日志里查不到的东西，就不该出现在请求里。这条约束比「保持缓存命中」严得多，也正因为严，缓存才成了白送的。

而缓存在这条 note 里的地位是这样一句话（`:19`）：

> Prefix-cache stability is corollary #1, not the headline: an append-only log projected by a per-node pure function yields requests that are append-extensions of their predecessors whenever the header is unchanged — **stability is emergent, not managed**.

（前缀缓存的稳定性是推论一，不是主标题：一条只追加的日志，经由一个逐节点的纯函数投影出去，只要请求头没变，产出的请求天然就是前一次请求的追加扩展。**稳定性是长出来的，不是管出来的。**）

「emergent, not managed」（长出来的，不是管出来的）是全篇的题眼。dsh 没有在维护缓存，它维护的是「请求必须能从日志重建」这个更强的性质；一旦这个性质成立，「本次请求是上次请求的追加扩展」就是它的推论，只要日志只追加、投影是纯函数、请求头没变。

这句话在反对的是另一种常见做法：专门写一个模块去盯着缓存，判断哪里该设断点、什么时候该重置。那种做法要靠人不停地维护判断，判断错了就悄悄失效。dsh 换成了「只要这三个前提没被破坏，结论自动成立」，于是排查方向也跟着变了：命中率掉了，不去查缓存逻辑，去查这三个前提哪个被破坏了。

代价也在同一条 note 里被点名（`:51`）：真正会在 provider 侧付全价的东西是**固有的、且被记录下来的**：压缩、真的改了 prompt/工具/配置（一条 `reason: 'change'` 的 `request/header` 事件）、或者带漂移的进程边界。缓存断裂不是玄学，是日志里能查到的事件。

---

## 四、稳定前缀 vs 每步可变

把一次请求的六个组成部分按「变了会烧掉多少缓存」排一遍，就得到下面这张表。最后一列是重点：同样是「变了」，变在头部和变在尾部的代价差好几个数量级。

| 请求组成 | 谁生成 | 什么时候变 | 变了从哪起失效 |
| --- | --- | --- | --- |
| `system` 全文 | `renderPrompt(assembly)`（`packages/core/system-prompt/src/index.ts:212`），section 按 `order` 排序（`:504`）；变量只有 `provider`/`model`/`cwd`（`packages/core/agent-loop/src/index.ts:351`），会话内是常量 | 插件注册/卸载 section、进出 plan 模式、persona 变化 | **第一个 token**，最贵 |
| `tools` schema 数组 | 各 tool provider 收集 → `structuredClone(parameters)` → `orderTools`（`packages/core/system-prompt/src/index.ts:164`、`:529`） | 工具注册/注销、scoped 限制、Code Mode 切换 | 第一个变化的 schema token |
| 历史消息 | `Session.deriveMessages()`（`packages/core/session/src/index.ts:726`）逐节点投影 surface | 正常只追加；压缩和剪枝会 `replace` | 追加 → 全命中；replace → 被替换的第一个 token |
| 运行时上下文快照 | `RuntimeContextProjection.project()`（`packages/core/agent-loop/src/runtime-context.ts:64`），排在本步 claimed 消息**之后**（`agent.ts:238`） | 快照字节变化、被压缩掉、全部清空 | 只影响尾部，前缀完好 |
| 每步新增 | 用户输入 / steer / 工具结果 / assistant 输出 | 每步 | 纯追加 |
| 采样标量 | `LlmCallConfig`（`packages/llm/llm/src/call-config.ts:23`） | `agent/request` waterfall 或 adapter 默认值 | 不占 prompt token（见 §十一 的诊断陷阱） |

**头部（system + tools）一动全死，尾部随便加。** dsh 的全部工程努力就是把易变的东西从头部赶到尾部。

---

## 五、三层机制：让 `f` 成为纯函数

### 5.1 append-only 日志 + 纯投影

先说两个词。**append-only（只追加）**指这条日志只会在尾部添新事件，已经写下的事件不删不改。**surface（表面）**是这条日志的一个子视图，只有能被模型看见的那几种事件才会进入它，模型历史就是从 surface 折叠出来的。

会话是一条事件日志。全仓只有三种事件能进入「模型可见历史」（surface）：`user/message`、`assistant/message`、`tool/result`（`packages/core/session/src/surface.ts:15`），而且它们**必须**带一个 `surfaceOp`：要么 `'append'`，要么 `{op:'replace', start, end}`（`packages/core/session/src/types.ts:372`）。其它事件（turn 边界、chunk、usage、错误、重试记录）一律 log-only，永远不进模型上下文。

**投影（projection）**指把一条事件翻译成模型消息的那个函数。它必须是纯函数：同一条事件，无论什么时候、在哪台机器上投影，都得到逐字节相同的结果。投影规则只有一处：`deriveEventMessage`（`surface.ts:83`），一个导出的纯函数，`user/message → data`、`assistant/message → message`（内容为空则返回 null）、`tool/result → message`、其余 null。

`Session.deriveMessages()`（`packages/core/session/src/index.ts:726`）在这之上加了增量缓存：每个 surface 节点只投影一次，只有 `replaceGeneration` 变了才整体重建；返回的是新数组，但元素是共享的深冻结 `Message`。note 里的说法是「mutating logged history through a projection is unrepresentable (it throws)」（`:23`）（意思是：想通过投影结果去改已经落盘的历史，这件事在接口上就表达不出来，真去改会直接抛异常）。

结论很短：**只要日志只追加，`deriveMessages()` 的输出天生是上一次输出的前缀扩展。** 而 agent 循环每一步就是拿它当 `messages`（`packages/core/agent-loop/src/agent.ts:341`）。

### 5.2 `EpochHeader`：把「非历史状态」也钉进日志

历史是纯函数的了，但 system 和 tools 不是历史。dsh 的办法是给它们也造一个日志事件。

**epoch header（纪元头）**是这个事件的名字，可以理解成一次请求的「信封」：调用配置、适配器默认值、渲染好的 system 字符串、装配好的工具 schema 都装在里面。它不是历史消息，但它决定了请求的头部字节，所以也要落进日志，这样任何人拿着日志就能逐字节重建当时那个请求。

`EpochHeader = { config, adapterDefaults?, system?, tools? }`，`canonicalHeader` 把空 system / 空 tools 规范化成「字段缺席」（`packages/core/session/src/request-header.ts:21`），这样「没有 system」和「system 是空串」不会被当成两种状态。

比较用 `headerEquals`（`request-header.ts:44`）：

```ts
export function headerEquals(a: EpochHeader, b: EpochHeader): boolean {
  if (
    !callConfigEquals(a.config, b.config)
    || a.adapterDefaults?.reasoningEffort !== b.adapterDefaults?.reasoningEffort
    || a.adapterDefaults?.maxTokens !== b.adapterDefaults?.maxTokens
    || a.system !== b.system
  ) return false
  const at = a.tools ?? []
  const bt = b.tools ?? []
  return at.length === bt.length && at.every((tool, i) => sameSchema(tool, bt[i] as ToolSchema))
}
```

`sameSchema` 是 `JSON.stringify` 相等（`request-header.ts:34`），工具**按序**比较，顺序变了就算变了，这和 provider 的前缀匹配语义一致。`callConfigEquals`（`packages/llm/llm/src/call-config.ts:49`）逐字段比 provider、model、reasoningEffort、temperature、maxTokens，`stop` 数组逐元素比。

写入规则在循环里（`packages/core/agent-loop/src/agent.ts:464`）：

```ts
    const baseline = this.session.requestHeader()
    if (!this.requestHeaderLogged) {
      this.session.append('request/header', { header, reason: baseline === undefined ? 'initial' : 'resume' })
      this.requestHeaderLogged = true
    } else if (baseline === undefined || !headerEquals(baseline, header)) {
      this.session.append('request/header', { header, reason: 'change' })
    }
```

三种 reason 的含义是明确的：本 loop 实例的第一次请求，日志里没有任何 header 就写 `initial`，有就写 `resume`（说明这是新进程接管了旧会话）；之后只有 `headerEquals` 判不等才写 `change`。

**这就给出了一个可直接使用的诊断法：日志里出现 `request/header{reason:'change'}`，就是「请求头部被改动过」的确定性证据。** note 把它和遥测连起来（`:31`）：「a header change or compaction appears as a cache-read drop on the next step」（意思是：请求头变了或者发生了压缩，下一步的缓存读取量就会掉下来）。看到某一步 `cacheReadTokens` 塌到接近 0，往前找最近的 `request/header{change}` 或 `compaction/*` 事件，就能定位到是谁干的。

注意 `headerEquals` 本身**不产生**前缀稳定性。前缀稳定来自「每步重新 assemble 得到的结果本来就相同」；`headerEquals` 只负责把变化记账，不记也不会让请求变得更稳定。这个因果关系容易被说反。

### 5.3 `buildRequest`：一次性绑定、标记、深冻结

请求组装全在一个方法里（`agent.ts:407`），三步：

1. **种子 config**。第一次请求来自 `AgentOptions`；之后来自 `requestProposal(persistedHeader)`：先把 adapter 填的默认值剥掉，再交给 `agent/request` waterfall（`agent.ts:428`、`:438`）。**waterfall（瀑布事件）**是 Cordis 的环绕式中间件：监听器拿到上一环的值，必须 `await next()` 才轮到下一个，最后的返回值权威。插件在这里只能替换**调用配置**，碰不到 messages / system / tools。
2. **`ctx.llm.prepareCall(proposedConfig)`**（`packages/llm/llm/src/index.ts:779`）：解析出精确模型的默认值，`deepFreeze(structuredClone(...))`，返回一个**只能派发一次**的 `stream()`。派发时若 `!callConfigEquals(options, resolvedConfig)` 就抛 `INVALID_PREPARED_CALL`（`packages/llm/llm/src/index.ts:804`）。这防的是热更新场景：用 A 适配器解析出来的能力，不能拿去 dispatch 给 B 适配器。
3. **标记 + 冻结**（`agent.ts:486`）：

```ts
    const request = markAgentLoopRequest(deepFreeze({
      ...header.config,
      messages: boundaryMessages,
      ...header.system !== undefined ? { system: header.system } : {},
      ...header.tools !== undefined ? { tools: header.tools } : {},
      sessionId: this.session.id,
      signal,
    }))
```

`deepFreeze` 是迭代式深冻结，只跳过 `AbortSignal`（因为那是活的取消通道，冻了 abort 就废了，`packages/llm/llm/src/call-config.ts:88`）。`markAgentLoopRequest` 用 WeakSet 记下「这个对象是 loop 装配的」（`call-config.ts:66`），中间件据此区分主对话请求和辅助一次性请求。

**这就是「插件为什么改不了请求」的完整答案**：任何挂在 `llm/stream` 上的监听器拿到的都是一个已冻结的对象，想改就抛异常；想换 config 也不行，`prepareCall` 会在派发前发现不一致。上游把这条定为「interface-level unrepresentability」（在接口层面就让它表达不出来），明确否决了「事后比较相邻请求、发现分叉就告警」的方案，因为那种做法「catches violations after the fact; a violating request is still constructible and ships」（`:42`）（意思是：它只能事后抓到违规，而一个违规的请求依然构造得出来，也依然发得出去）。

这两个词的差别值得停一下。「事后告警」的前提是坏请求已经发到 provider 那里了，钱已经花了、缓存已经断了，你收到的只是一份事故通知。「接口层面表达不出来」是让那个坏请求根本组装不起来：对象冻着，改就抛；配置对不上，派发前就拦。前者要靠有人去看告警，后者不需要任何人在场。

---

## 六、确定性排序：为什么两台机器能拼出同一个前缀

前缀稳定不只要求「这次和上次一样」，还要求「换台机器、换个进程、重启一次，还是一样」。dsh 在三个地方消掉了不确定性。

**系统提示的段序。** section 按显式 `order` 数值排序（`packages/core/system-prompt/src/index.ts:504`）：harness identity 固定在 order -100，文本是写死的 `'You are an AI agent powered by DeepSeek Harness.'`（`:361`），persona 紧随其后，各插件 section 按自己声明的 order 插入。

**工具的顺序。** 没配 `toolOrder` 时默认字典序，比较函数是这样的（`packages/core/system-prompt/src/index.ts:180`）：

```ts
/** Lexicographic (code-unit) name comparison — locale-independent, so the order is identical on every machine. */
function compareToolNames(a: ToolSchema, b: ToolSchema): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}
```

用 code-unit 比较而不是 `localeCompare`，注释直接点明目的：locale 无关，所以每台机器的顺序都一样。这一行就是「跨机器共享同一前缀」的技术前提。

**工具结果的提交顺序。** 并行工具可以乱序完成，但结果只沿着「连续的模型顺序槽位」提交（`packages/core/agent-loop/src/tool-calls.ts:146`）：`commitReady` 从 `committed` 开始，只要下一个槽位还没有结果就停下来等。于是 `tool/result` 事件永远按模型给出的 call 顺序进日志。

取消也被补齐了：一次取消发生时，那些还没派发的调用会被合成一对 `tool/call` + 错误 `tool/result`（`tool-calls.ts:249`），文本是 `'Error: tool call aborted before dispatch'`，错误码 `ABORTED_BEFORE_DISPATCH`（源码里的常量名是 `TOOL_ABORTED_BEFORE_DISPATCH`，`packages/core/tools/src/index.ts:472`）。这保证 assistant 的 `tool_calls` 和后面的 `role:'tool'` 消息永远配对完整；否则重放或重试会得到一个形状不同的消息序列。

**易变状态被赶到尾部。** system prompt 里没有日期、没有 git 状态、没有当前权限模式。这些东西走另一条路：`RuntimeContextProjection`（`packages/core/agent-loop/src/runtime-context.ts:25`）在每步 assemble 之后，把所有活跃的动态上下文渲染成一个完整快照，前面加一句固定的引导语（`packages/core/system-prompt/src/index.ts:239`）：

> `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.`

（当前运行时上下文。这份快照取代之前所有的运行时上下文快照。）

这句引导语是给模型的排歧指令：历史里会堆着好几份旧快照，模型得知道以最后一份为准。有了它，dsh 就不用回头去删旧快照，只管往尾部追加新的，前缀因此一个字节都不用动。

只有当快照字节与上次保留的不同，`project()` 才返回一条 `user/message`（`runtime-context.ts:64`）；全部上下文消失时发一条 `CLEARED` 标记（`runtime-context.ts:13`）；如果压缩把保留的快照 `replace` 掉了，下一步会重发（`runtime-context.ts:50`）。它排在本步 claimed 消息**之后**（`agent.ts:238`），也就是整个消息数组的最尾巴。

单元测试把这套行为钉死了（`packages/core/agent-loop/tests/loop.spec.ts:409`）：五次请求，`system` 字段全部相等，`request/header` 事件只有一条。

这个设计不是拍脑袋的。上游先把 sandbox 策略放在 system section 里试过，测量结果记在设计记录里（`.agents/notes/implemented/feature/2026-07-30-current-sandbox-policy-context.md:25`）：`/permission` 切换后的第一次请求，**cache-read 只有 256 个 token，14,691 / 14,782 个 token 全部未命中**；策略不变时是 14.7k–15.5k 命中。同一份记录里的否决理由写得很清楚（`:43`）：

> DeepSeek matches complete prefixes; changing the first wire message prevents reuse of the longer system-plus-history prefix.

（DeepSeek 匹配的是完整前缀；只要改动线上的第一条消息，那条更长的「system 加历史」前缀就没法复用了。）

翻译成人话就是：动了 `messages[0]` 一个字，后面攒了一整个会话的历史就全部白攒。

改成尾部 user 快照之后，跨越权限切换和四步变更，「cache reads were 14,848–15,872 tokens while uncached input was 59–306 tokens per request」（`:35`），也就是前面开篇引过的那组数：未命中从 14,691 掉到 59–306。同一份记录还否决了「让每个策略 owner 各自调 `agent.inject()`」的方案（`:45`）：监听器顺序会决定模型看到的顺序，还可能暴露不一致的中间快照。

---

## 七、压缩：最大的破坏者，也是最精细的复用者

### 7.1 主对话：从第一条消息起全部未命中

自动压缩挂在 `agent/pre-step`（`packages/compaction/compaction-basic/src/index.ts:147`），也就是每一步派发之前。选区函数 `selectCompactableRange`（`packages/compaction/compaction-basic/src/region.ts:98`）从 surface 尾部往前累计 token 直到够 `retainTokens`，再往前退到第一个「工具配对平衡」的切点，然后返回 `{ start: surfaceNodes[0], end: ... }`，**起点永远是 surface 的第一个节点**（`region.ts:130`）。

提交时，摘要以一条 `user/message` 落地，`surfaceOp` 是 `replace`（`region.ts:462`）。这条摘要消息叫 **checkpoint（检查点）**：它把一大段旧历史压成一段结构化的文字，替换掉原来那些消息，让模型换一份更短的上下文继续干活。落地的代码是：

```ts
  session.append('user/message', checkpointMessage, {
    surfaceOp: { op: 'replace', start, end },
    sourceEventSeqs: [startEvent.seq, summaryEvent.seq, ...shadowedSeqs],
  })
```

于是下一次主请求是 `[system][checkpoint 消息][保留的尾巴]` + tools：system 和 tools 还能命中，**但 `messages[1]` 变了，从那儿往后全部未命中**。README 把这条写在 KV Cache effect 里（`packages/compaction/compaction-basic/README.md:103`）：「Replacing rather than append-only. Each checkpoint invalidates reuse from the first replaced history token; the unchanged request prefix before that range remains reusable.」（意思是：这是替换，不是只追加。每个 checkpoint 都会让「被替换的第一个历史 token」往后的复用全部作废；在那段区间之前、没被动过的请求前缀仍然可以复用。）这里没被动过的那截前缀，指的就是 system 和 tools。

上游自己也承认这是个问题。一条 status 为 proposed 的提案里写着（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:9`）：「the head checkpoint is rewritten every pass, so the request prefix takes a full prompt-cache miss each time」（意思是：位于头部的那个 checkpoint 每压一轮就被重写一次，于是请求前缀每轮都要吃一次完整的缓存未命中）。这条提案**尚未实现**。

工具结果剪枝也是同一类操作：超过阈值的 `tool/result` 被单节点 `replace`（`packages/compaction/compaction-tool-result-pruner/src/index.ts:167`），README 同样写明「Replacing an earlier result invalidates reuse from the first changed token」（`packages/compaction/compaction-tool-result-pruner/README.md:56`）（意思是：替换掉一条更早的工具结果，会让第一个被改动的 token 往后全部无法复用）。它跑在摘要之前（`packages/compaction/compaction-basic/src/index.ts:308`），所以一次压力事件里前缀可能先被剪枝打断、再被 checkpoint 打断，但都发生在同一个「不得不付」的窗口里。note 把这叫「cache-bust batched by the same pressure logic」（`.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md:53`）（意思是：缓存作废这件事，被同一套压力判定逻辑攒成了一批）。攒成一批的好处是只破一次前缀，而不是这一步剪枝破一次、下一步摘要再破一次。

### 7.2 摘要请求：不是不发，是发得对齐

先纠正一个常见误解：**压缩确实会发一次独立的 LLM 请求**。`summarizeWithLlm` 里有一行明明白白的 `ctx.llm.stream(options)`（`packages/compaction/compaction-basic/src/summarizer.ts:164`）。省下来的不是这次请求，是这次请求的 prefill 成本。

省法是让这次请求的前缀与主对话**逐字节对齐**：`buildSummarizationInput`（`packages/compaction/compaction-basic/src/region.ts:498`）直接从 `session.requestHeader()` 取 `system` 与 `tools`，被压区间的每个事件走同一个 `deriveEventMessage` 投影，于是得到和上一次路由请求完全相同的消息对象；摘要指令只作为**最后一条 user 消息**追加（`summarizer.ts:146`）。

这个「指令放尾部」是一次专门的 bug 修复（`.agents/notes/implemented/bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md:9`），原来的实现用独立的 summarizer system prompt，结果是「Every compaction therefore paid full prompt-processing cost for the whole replayed history twice」（意思是：于是每一次压缩，整段被重放的历史都要按全价付两遍 prompt 处理费）。两遍指的是：一遍付给触发压力的那次对话请求，一遍付给紧接着的摘要请求，而且偏偏发生在历史最长、最贵的时候。修复里有一个反直觉的细节：**即使摘要器一个工具都不会调，`tools` 也必须带上**，否则 token 序列变短、对不齐（`:17`）。

完整的代码、指令原文、以及「哪些情形保证复用、哪些只是正确但不复用」，见 [06 压缩](06-compaction.md)。

---

## 八、其它场景逐一

压缩之外，还有八种日常操作会碰到前缀。把它们摊开看，会发现只有前两种是真正的头部改动，其余要么纯追加、要么根本不在主对话的前缀上。

| 场景 | 发生什么 | 缓存后果 |
| --- | --- | --- |
| **工具集变化**（注册/注销/scoped 限制/Code Mode） | assemble 得到不同 tools → `headerEquals` 失败 → 写 `request/header{change}` | 从第一个变化的 schema token 起失效（`packages/core/tools/README.md:145`） |
| **模型切换**（`agent/request` 返回新路由） | `prepareCall` 重新解析默认值，header 写 `change`，`request/context` 也可能变 | 「Changing the provider or model selects a different cache domain」（`packages/llm/llm-deepseek/README.md:107`）（换 provider 或换模型，就等于选中了另一个缓存域，原来那份攒在旧域里的前缀用不上了） |
| **重试**（`dsh-llm-retry` 返回 `{kind:'retry'}`） | `step()` 内的 `while (true)` 重新走一遍 `buildRequest`（`agent.ts:339`）；日志没变，所以字节相同 | 「The reconstructed request preserves the prior prefix」（`packages/llm/llm-retry/README.md:45`）（重建出来的那个请求保留了原先的前缀，也就是重试不额外破坏缓存）。失败步的 chunk 不进 surface，错误文本也不进模型上下文 |
| **进程重启 / resume** | 新 loop 实例写 `request/header{reason:'resume'}` | 若插件组合导致 system/tools 不同就会漂移，但**可归因**，两份 header 快照可以直接 diff |
| **子代理 fork** | 子 session 以父的完成 turn 前缀为种子 | 同 provider/model 且没有 persona/toolFilter 差异时，子请求的前导字节等于父的，命中父前缀 |
| **continuable 子代理** | 多出 `report` 工具 schema 和 `tool:report` 提示段 | 两个 delta 都在**请求头部**，位于继承历史之前 → 继承的历史全部失效。出厂组合因此把 fork 绑成 `one-shot`（`packages/subagent/subagent-fork-in-process/README.md:42`） |
| **session-title 辅助请求** | 独立小请求，`purpose: 'session-title'` 强制 `thinking: disabled`（`packages/llm/llm-deepseek/src/serialize.ts:38`） | 「No main-request invalidation」（`packages/session/session-title-llm/README.md:42`）（不会让主对话请求的缓存作废） |
| **plan 模式进出** | `plan:policy` 是一个**函数式 system section**（`packages/plan/plan-mode/src/index.ts:225`），order 50 | 「entering or leaving changes the system prompt from order 50 onward」（`packages/plan/plan-mode/README.md:62`）（进入或退出 plan 模式，都会改动 order 50 及其之后的那部分 system prompt），有意接受的失效点 |

先解释表里的三个词。**fork（分叉）**是开子代理的一种方式：子会话不从空白开始，而是拿父会话已完成的历史当种子；对应的 **spawn** 则是给子代理一段全新的空历史。**one-shot（一次性）**指子代理只跑一轮就交结果，**continuable（可续跑）**指它能被再次唤醒接着干，代价是必须多给它一个 `report` 工具，好让它中途汇报。

fork 那一条要多说两句，因为它把这套推理用到了极致。设计记录（`.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md:9`）的论证是：fork 相对 spawn 的唯一差别就是「子会话继承了父的历史前缀」，而这份继承的历史**每次子请求都要重发**，它唯一的回报就是 provider 侧的前缀复用；任何加在继承历史**之前**的东西都会把这个回报花光：「reuse stops at the first differing byte」（复用在第一个不同的字节处就停住了）。continuable 子代理正好加了两样东西在头部（`report` 工具 schema 和 `tool:report` 段落），于是（`:11`）「pays fork's duplication cost and collects none of its benefit」（付了 fork 那份复制历史的代价，却一点好处都收不到）。

结论不是改代码，而是改组合配置：所有出厂组合把 fork 委派工具绑成 `backgroundMode: one-shot`（`:15`），并在 `prepareContinuable` 上留了一个 `TODO(fork-continuable-prefix-reuse)` 标记（`:25`），重新开放的条件写得很具体：等到子代理的 system prompt 和工具 schema 能和父的逐字节相同。

---

## 九、遥测链：命中率数字从哪来

四步：

1. **适配器映射**：`mapUsage`（`packages/llm/llm-deepseek/src/translate.ts:53`）产出不相交的 `TokenUsage`。
2. **落盘**：usage 随 `assistant/chunk{type:'usage'}` 和 `assistant/message.usage` 进日志（`packages/core/agent-loop/src/agent.ts:381`）；压缩的辅助请求用量记在 `compaction/summary.usage`（`packages/compaction/compaction-basic/src/region.ts:460`）。
3. **投影**：`packages/llm/token-meter/src/usage-projection.ts:107` 起的 `tokenUsageProjectionDefinition` 按 (turn, step) 去重累加四个桶。去重是必要的：同一步会先收到一个 usage chunk、后收到 message 上的最终 usage，重复样本替换而不是累加（`usage-projection.ts:126`）。另外 `pressureFrom = inputTokens + cacheRead + cacheWrite`（`usage-projection.ts:71`）被当作上下文压力的分子。
4. **UI**：命中率的公式在 `packages/client/ui-conversation/src/client/chat/StatsLine.tsx:109`：

```ts
export function cacheHitPercent(usage: TokenUsageProjection): number | null {
  const denominator = billedInputTokens(usage)
  return denominator === 0
    ? null
    : Math.round(usage.cacheReadTokens / denominator * 100)
}
```

分母是 `uncachedInputTokens + cacheReadTokens + cacheWriteTokens`（`StatsLine.tsx:121`），也就是全部计费输入。

有一个坑要说明：`reasoningTokens` **不是**第五个桶。投影的桶只有四个（`usage-projection.ts:24`），`bucketsFrom` 也只取四个字段（`usage-projection.ts:31`），因为 `reasoning_tokens` 是 `completion_tokens` 的明细拆分，已经包含在 `outputTokens` 里了，汇总时再加一次就是重复计费。上面那份真实抓包数据可以自己验：`completion_tokens: 69`，`reasoning_tokens: 24`，输出总数是 69 不是 93。

---

## 十、一层容易被误当成机制的东西：文档纪律

到这里为止讲的都是代码。dsh 另外有一层制度：每个模型相关的包 README 必须以 `## Model Experience` 段结尾，其中一个固定小节叫 `KV Cache effect`，要求写清「本包的哪些改动会让已有前缀作废」（`.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.md:15`）。219 个包里 215 个有这一段，剩下 4 个写在校验器的豁免表里并附了理由。

有两点要说准确。**第一，它承诺的很有限**：cookbook 的原文是「"Does not invalidate" means the package preserves an already-reusable prefix; provider cache availability and eviction remain outside the package contract」（`docs/cookbook/adding-a-package.md:105`）（意思是：README 里写「不会使缓存失效」，只表示这个包会保住一段本来就可复用的前缀；至于 provider 那边缓存还在不在、有没有被淘汰，都不在这个包的承诺范围内）：只承诺「不主动破坏」，不承诺真的命中。**第二，校验器校的是结构不是分类**：它检查标题层级、字段非空、锚链接这些，那四种缓存情形是写作指引，不是被机器强制的受控词汇表。

这一层的价值真实：「哪个包会打断前缀」变得可审计。但它是文档纪律，跟运行时一个 token 都没关系。这套自证体系（连同 219 个 `invariant.ts`，其中真装了检查的是 35 个，以及测试门禁）见 [13 自证与工程化](13-self-verification.md)。

---

## 十一、代价与失效点

**1）没有任何运行时的稳定性断言。** 仓库里确实有一个不变量（`packages/core/agent-loop/src/invariant.ts:21`），但它挂在可选的 `dsh-invariants` 服务上，出厂的 `dsh` 配置一个都不挂（`.agents/notes/implemented/simplification/2026-08-03-omit-invariants-from-shipped-config.md:13`），只有测试、示例和自建组合才开。它检查：请求已冻结、带活的 sessionId、日志里有 `step/start` 和 `request/header`、`JSON.stringify(options.messages) === JSON.stringify(session.deriveMessages())`（否则报 log-reconstruction desync）、以及 model/system/temperature/maxTokens/stop/tools 与折叠出来的 header 一致（`invariant.ts:44`）。

这证明的是「请求 = 日志」，**不是**「本次请求是上次请求的前缀扩展」。前缀稳定性在运行时没有任何断言，也没有告警，命中率塌了只能事后从 usage 里看出来。这和 note 自己的定性一致：emergent，不是 managed。

（一个小出入：note 说不变量「independently rebuilds each loop request through a fresh `Session`」（`:31`）（意思是：它另起一个全新的 `Session` 把每次循环请求独立重建一遍，好让活着的那份缓存没法自己给自己作证），但代码用的是 `ctx.sessions.get(...)` 拿到的活 session 的 `deriveMessages()`（`invariant.ts:25`、`:39`）。属于笔记与实现的措辞差异。）

**2）system prompt 仍然有合法的动态来源。** plan 模式的 section 是函数式的（`packages/plan/plan-mode/src/index.ts:228`）；`system-prompt/assemble` 是个 waterfall，插件可以任意改写整个 assembly（`packages/core/system-prompt/src/index.ts:532`）；web-app 组合注册的 `app:web-surface` section 文本里带本地 URL（`packages/bundle/web-app/src/index.ts:146`），URL 变了就是头部变了。任何插件写一个返回时间戳的函数式 section，就会每步全 miss；约束这件事的是文档契约和 code review，不是代码。

**3）压缩之后必然从第一条消息起全 miss，而且每轮压缩都重写头部 checkpoint。** 长会话压缩越频繁，损失越大。上游承认这一点，提案里的 `[system][stubs…][state][tail]` 布局意在把 miss 起点从位置 0 往后挪，但状态是 proposed。

**4）调用配置的粒度偏粗，会让诊断启发式失真。** `temperature`、`maxTokens`、`stop` 变化也会写一条 `request/header{reason:'change'}`，但它们根本不占 prompt token，不影响前缀匹配。于是「看到 header change 就等于缓存 miss」这个诊断法会误报。上游知道这件事，`call-config.ts:15` 有一条 TODO：

```ts
// TODO(call-config-shape): Revisit which fields are epoch-level for cache reuse
// and where provider-specific request options belong.
```

这条 TODO 要办的两件事是：重新界定哪些字段对缓存复用来说算 epoch 级，以及那些 provider 私有的请求选项该放到哪儿去。子系统文档里还有对应的 FIXME（`docs/subsystems/llm-streaming.md:597`）：「revisit which remaining fields are genuinely epoch-level for cache purposes (`model` and the model-owned reasoning effort are explicit; the sampling scalars sit here out of caution)」（意思是：得重新审一遍，剩下这些字段里到底哪些对缓存来说真的是 epoch 级的。`model` 和模型自带的 reasoning effort 是明确该算的；那几个采样标量放在这里只是出于谨慎）。

**5）两个容易被张冠李戴的东西，和 KV cache 无关。**

- `replayState`。它是 pi-ai 适配器的**私有回放元数据**：thinking 签名、响应 id、每个 block 的签名（`packages/llm/llm-pi-ai/src/replay.ts:21`），供 Anthropic / OpenAI-responses 这类要求签名回传的协议重建历史用。`forAdapter` 在跨适配器时把它剥掉（`packages/llm/llm/src/index.ts:823`），这是防止 provider 私有状态泄漏，**不是**缓存机制。「不同 summarization provider 会放弃缓存复用」的真正原因是缓存域和前缀不同，跟 replayState 没关系。
- `session-projection-cache`。名字里有 cache，但它是会话投影状态的持久化折叠捷径，模块头一句就写着「The cache is a fold shortcut, never an authority」（`packages/session/session-projection-cache/src/index.ts:5`）（意思是：这份缓存只是折叠过程的一条捷径，任何时候都不作数；真相以日志为准，缓存对不上就丢掉重折一遍）。和 provider 的 KV cache 毫无关系。

**6）已知的「正确但不复用」路径全靠配置约束**：手动中段压缩、跨路由摘要、continuable fork。fork 那条上游明说了不会有响亮的失败信号。

**7）仓库里没有说明的事**：DeepSeek 服务端把 `tools` 渲染在 system 段之前还是之后；`thinking` 开关切换是否改变 chat template 的前缀；服务端剔除历史 `reasoning_content` 的具体规则（note 只有一句「managed server-side」，意思是「这件事由服务端自己管」，等于没说细节）。这些只能从 provider 侧的公开文档推断，代码里只有字段映射。

---

## 十二、别人怎么做

第一列决定了后两列：**provider 要不要你显式声明缓存断点**。要（Anthropic 系）就得考虑「写入也要花钱」，于是 pi 那种「隔离辅助请求」的做法才讲得通；不要（DeepSeek 这种自动前缀匹配）就只剩一件事可做：别去碰前缀。Claude Code 一行来自官方公开文档与官方博客，其余读自源码。

| Harness | 缓存模型 | 动态信息放哪 | 辅助请求怎么处理 |
| --- | --- | --- | --- |
| **Claude Code** | Anthropic 显式 `cache_control` 断点（最多 4 个），分层排序：静态 system + tools（全局缓存）→ CLAUDE.md（项目内缓存）→ 会话上下文 → 对话消息。订阅账号 1 小时 TTL，API key 默认 5 分钟 | 进 user 消息，用 `<system-reminder>` 标签包裹；plan 模式做成 `EnterPlanMode`/`ExitPlanMode` 两个**工具**而不是换工具集，这样工具定义不变 | `/compact` 复用「完全相同的 system prompt、user context、system context、tool definitions」，只在末尾加一条摘要指令。官方博客说他们「alert on cache breaks and treat them as incidents」（缓存一断就告警，并且按线上事故对待） |
| **Codex** | `prompt_cache_key = session_id`，子 agent 与父共享同一个 key；`store: false` 每次全量重放历史（含加密的 reasoning），完全靠字节级前缀命中服务端缓存 | `WorldState` 分节：首个真实 turn 全量渲染成 developer/user 消息，之后只**追加 diff 片段**，不改旧消息 | 本地摘要在遇到上下文溢出时「从最前面逐条删历史」重试，注释注明是为了保留前缀缓存 |
| **OpenCode** | AI-SDK 路径：给前 2 条 system 和最后 2 条非 system 消息打 `ephemeral`；OpenAI 家族用 `promptCacheKey = sessionID`。实验中的原生运行时改成「最后一个 tool 定义 + 最后一段 system + 最新 user 消息」三锚点 | plan 模式提示走 user 消息里的 synthetic part，不改 system；工具按名字排序保证顺序稳定 | 独立的 compaction agent，有自己的 system prompt，前缀不对齐 |
| **pi** | Anthropic 路径三锚点：system 每段、tools 数组最后一个、最后一条 user 消息的最后一个 block；`cacheRetention` 默认 5 分钟，可切 1 小时 | system 里没有日期/平台/git 状态，只有 cwd | **刻意反向操作**：摘要请求用 `cacheRetention: 'none'` 加一个全新的 sessionId，理由是「Summaries are standalone requests, so isolate routing and avoid cache writes that cannot be reused」（摘要是独立请求，所以把路由隔离开，别去写那些注定复用不上的缓存），避免污染主会话的缓存分片 |
| **mini-swe-agent** | 最简实现：清掉所有旧标记，只给**最后一条消息**打 `ephemeral`；工具恒定只有一个 bash，system 恒定 | 环境信息在第一条 user 消息（instance 模板）里 | 没有压缩，也就没有辅助请求 |
| **dsh** | 什么都不发。DeepSeek 服务端自动前缀匹配，64-token 块粒度 | 尾部 user 消息快照，带 supersession 引导语 | 摘要请求复用主对话的 system + tools + 历史投影，指令放最后一条 user 消息 |

两个观察。

第一，**所有人都在解同一道题，只是位置不同**：Claude Code 用 `<system-reminder>`、Codex 用 WorldState diff、OpenCode 用 synthetic part、dsh 用 runtime-context 快照。四种名字，同一件事：把易变信息从请求头部赶到尾部。dsh 那条 sandbox policy 的设计记录里明确对照了 Codex 和 Hermes 的做法（`.agents/notes/implemented/feature/2026-07-30-current-sandbox-policy-context.md:23`），不是独立发明。

第二，**摘要请求的处理方式出现了真正的分歧**。dsh 和 Claude Code 让摘要请求复用主对话的热前缀；pi 反过来，刻意隔离摘要请求以免污染主分片；OpenCode 用独立 agent，等于放弃复用。哪个对取决于 provider 的缓存计费模型：在有显式写入成本的 Anthropic 模型下，pi 的顾虑（一次用不上的缓存写入要付 1.25× 的钱）是真实的；在 DeepSeek 这种只有读取、没有写入计费的自动缓存下，这个顾虑不成立，复用是纯赚。上游那条提案的自评是（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:13`）：「none of the surveyed implementations makes compaction prefix-cache-aware」（意思是：调研过的实现里，没有一个让压缩这件事本身对前缀缓存友好）。dsh 自己也没做到：它让摘要请求对齐了热前缀，但压缩之后的主对话仍然从第一条消息起全部未命中，同一条提案在紧挨着的上一段就点了这件事。

---

## 十三、怎么自己核

下面几条不需要 API key，在锁定 commit 的 checkout 里直接跑。

```sh
cd sources/checkouts/deepseek-harness

# 1. 确认没有任何显式缓存 API 调用
#    预期：非测试代码 0 行；不加 grep -v 会多出一行 Codex 的响应 fixture
grep -rn "cache_control\|cacheControl\|prompt_cache_key" packages --include=*.ts | grep -v /tests/

# 2. Model Experience 覆盖：219 个包，215 个带段，4 个在豁免表里
ls packages/*/*/package.json | wc -l
grep -rl '^## Model Experience' packages --include=README.md | wc -l
sed -n '32,37p' scripts/verify-package-readme-model-experience.ts   # 豁免表与理由

# 3. 读 serialize.ts 的关键行
sed -n '151,188p' packages/llm/llm-deepseek/src/serialize.ts   # 完整 wire body
sed -n '86,100p'  packages/llm/llm-deepseek/src/serialize.ts   # content:"" 与 reasoning_content 规则
sed -n '126,138p' packages/llm/llm-deepseek/src/serialize.ts   # tool 消息拆分与 (no output)

# 4. 三个决定「跨机器同一前缀」的地方
sed -n '180,183p' packages/core/system-prompt/src/index.ts     # code-unit 字典序
sed -n '145,160p' packages/core/agent-loop/src/tool-calls.ts   # 按模型顺序提交结果
sed -n '464,470p' packages/core/agent-loop/src/agent.ts        # initial|resume|change

# 5. 摘要请求怎么对齐热前缀
sed -n '498,514p' packages/compaction/compaction-basic/src/region.ts
sed -n '145,163p' packages/compaction/compaction-basic/src/summarizer.ts
```

不需要 key 的自动化断言里，`packages/core/agent-loop/tests/loop.spec.ts:357` 那个用例最有说服力：它用 mock 适配器跑五次请求，断言五次的 `system` 字段完全相同、`request/header` 事件只有一条，同时运行时上下文快照按变化次数出现三条。这证明的是「追加扩展」这个形状。

需要 key 的只有一个：`packages/core/agent-loop/tests/request-cache.e2e.ts`，用 `describe.skipIf(!process.env.DEEPSEEK_API_KEY)` 门控（`:71`），跑 `deepseek-v4-flash`，一个含工具调用的 turn 加一个后续 turn，断言除第一次外每次请求的 `cacheReadTokens > 0`（`:92`）。它存在的意义在文件头注释里写着：mock 测试确立的是「append-extension」（追加扩展，指本次请求的字节等于上次请求原样加上一截尾巴）这个结构性质，这个测试确立的是「provider 真的命中了」。两件事得分开证：形状对不代表对面真给你命中，只有带 key 打真接口才知道。

**这个测试我们跑过了，通过**（Node 22，`deepseek-v4-flash`，2.03 秒真实 API 调用；把 key 从环境里去掉再跑，结果是 `1 skipped`，说明上一次是真跑）。完整命令与输出见 [research/runtime-evidence](../research/runtime-evidence/2026-08-16-deepseek-cache-probe.md)。

真跑起来之后的诊断法就是前面说的那条：逐 step 看 `cacheReadTokens`，掉到接近 0 的那一步，往前找最近的 `request/header{reason:'change'}` 或 `compaction/*` 事件；记得先排除掉那些只改了 `temperature` 之类采样标量的假阳性。

---

## 自检

**1）dsh 一行缓存管理代码都没有，为什么缓存反而稳？换成「专门写个模块管缓存」会差在哪？**

因为它维护的是一条更强的性质：请求必须能从事件日志重建（`.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md:17`）。这条性质要求日志只追加、投影是纯函数、请求头单独落事件，三条都成立时，「本次请求 = 上次请求 + 尾部追加」就是逻辑推论，不需要任何人去维护。专门写模块管缓存要靠人不断判断「哪里该设断点、什么时候该重置」，判断漏了就悄悄失效，而且没有信号。note 里那句「stability is emergent, not managed」说的就是这个差别。落到排查上：命中率掉了不去查缓存逻辑，去查那三个前提哪个被破坏了，而破坏的痕迹就在日志里。

**2）列出会打断前缀的操作，并说明为什么打断的位置决定了代价大小。**

真正动到头部的只有三类：一是 system prompt 变了（插件注册或卸载 section、进出 plan 模式、persona 变化），二是工具集变了（注册/注销、scoped 限制、Code Mode 切换），三是压缩或工具结果剪枝对 surface 做了 `replace`。前两类改的是 `messages[0]` 和 `tools`，位置在整个请求最前面，失效从第一个 token 起算；第三类改的是 `messages[1]` 及其后，system 和 tools 还能命中，但历史全废。

模型切换是第四种，性质不同：它不是打断前缀，是整个换了一个缓存域（`packages/llm/llm-deepseek/README.md:107`），旧域里攒的东西根本不参与匹配。

反过来，纯追加的都不打断：用户新消息、工具结果、assistant 输出、运行时上下文快照。快照是这里的关键设计，它带的信息（日期、git 状态、权限模式）恰恰是最易变的，但因为被放在消息数组最尾巴（`agent.ts:238`），改多少次都不碰前缀。上游把 sandbox 策略从 system section 挪到尾部快照，实测结果就是未命中从 14,691 降到每次 59–306（`.agents/notes/implemented/feature/2026-07-30-current-sandbox-policy-context.md:35`）。

重试也不打断：日志没变，`buildRequest` 重跑一遍得到的字节完全相同。

**3）子代理 fork 明明继承了父的历史，为什么一旦做成 continuable 就「付了代价收不到好处」？**

fork 相对 spawn 的唯一收益，就是继承来的那段历史能命中父会话在 provider 侧留下的前缀。这份历史每次子请求都要原样重发，它的成本是固定的，只有命中才能把成本抵掉。continuable 需要多给子代理一个 `report` 工具，于是多出一份工具 schema 和一段 `tool:report` 提示，两样东西都落在**继承历史之前**的请求头部。前缀匹配「reuse stops at the first differing byte」，第一个字节就不同了，后面那段继承历史一个 token 都命中不了，但还得照发照付。这也是为什么出厂组合把 fork 委派工具绑成 `one-shot`（`.agents/notes/implemented/architecture/2026-08-10-fork-children-stay-one-shot.md:15`），而重新开放的条件写得很死：等到子代理的 system prompt 和工具 schema 能和父的逐字节相同。

---

相关阅读：请求头部的另一半怎么拼见 [01 系统提示](01-system-prompt.md)；日志与 surface 的完整模型见 [05 会话](05-session.md)；压缩的触发阈值、事务与失败分类见 [06 压缩](06-compaction.md)；适配器的 SSE、错误码与重试见 [04 LLM 适配器](04-llm-adapter.md)；横向对照的完整矩阵见 [14 对比](14-comparison.md)。
