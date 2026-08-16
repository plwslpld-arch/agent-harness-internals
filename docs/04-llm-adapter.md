---
title: LLM 层：从 Message 到 SSE 帧，再到重试
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/serialize.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/llm/llm-retry/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/llm/token-meter/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# LLM 层：从 Message 到 SSE 帧，再到重试

*这一篇讲给要接一个新 provider、要查「请求为什么发不出去」、或者想知道界面上那些 token 数字从哪来的人。读完你能回答：wire 上那个 JSON 每个字段是谁填的、一次失败之后由谁决定重试、usage 里的几个数为什么不能直接相加。*

「适配器」听起来像最没内容的一层：把内部消息转成 provider 要的 JSON，发出去，把回来的流转回来。真动手写才会卡在几个没想过的问题上：assistant 的历史消息里 `content` 能不能是 `null`？工具返回了空字符串，wire 上该发什么？模型一个字都没说，算成功还是算失败？这三个问题在 dsh 里都有一个写死的答案，而且每答错一个，代价都不止于这一次请求。

dsh 把「跟模型说话」这件事拆成四层：一套提供商无关的消息词汇（`packages/llm/llm`）、两个内部实现完全不同的适配器（`llm-deepseek` 直连 fetch，`llm-pi-ai` 走第三方 SDK）、一个挂在失败点上的重试插件（`llm-retry`），以及一个用于估算上下文压力的计量器（`token-meter`）。这篇文章沿着一次真实请求走一遍：JSON body 是怎么拼出来的、SSE 帧是怎么变回结构化 chunk 的、失败之后谁决定重试。

## 先看见：一次请求的 body 与一段 SSE 帧

DeepSeek 适配器最终发出去的 JSON 由 `serializeRequest` 一次性拼好，字段顺序由代码写死（`packages/llm/llm-deepseek/src/serialize.ts:173-186`）：

```ts
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
```

这段里每个 `...x !== undefined ? { … } : {}` 都是一次「缺省就不发」的判断：`thinking`、`reasoning_effort`、`tools`、`temperature`、`max_tokens`、`stop` 只有真的被设定过才会出现在 body 里。前四个字段（`model`、`messages`、`stream`、`stream_options`）无条件写死，位置也固定，所以同一个会话连着发的两次请求，body 的开头是逐字节一样的。

一个最小请求长这样（单元测试里的实际断言，`packages/llm/llm-deepseek/tests/serialize.spec.ts:165-171`）：

```ts
    expect(wire).toEqual({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
    })
```

这就是「缺省即不发」的实际效果：没设 `temperature`、没给工具、没开思维链时，wire 上只剩四个字段。

回来的是 **SSE（Server-Sent Events）**，服务端按行往下推、客户端按空行切事件的单向流协议。测试用的最小完整帧序列（`packages/llm/llm-deepseek/tests/mock-server.ts:28-33`）保留了真实响应的形状，注意第一帧的 `content: null` 和空字符串 `reasoning_content`（reasoning content 是模型的思维链通道，与正文 `content` 分开推）：

```ts
export const textEvents = [
  '{"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":""}}]}',
  '{"choices":[{"delta":{"content":"hello"}}]}',
  '{"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}',
  '[DONE]',
]
```

三帧加一个 `[DONE]`：第一帧只声明 `role`，正文是 `null`、思维链是空字符串，什么内容都没有；第二帧才带真正的文本增量；第三帧的 `delta.content` 又是空字符串，但它捎上了 `finish_reason` 和 `usage`。适配器必须能吃下这些空值，它们是 DeepSeek 真实响应的形状，不是测试凑出来的。

带工具调用时，参数是逐片流回来的（`packages/llm/llm-deepseek/tests/translate.spec.ts:104-108` 的输入，注释标明是 live capture 的形状）：

```ts
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_00_x', type: 'function', function: { name: 'get_weather', arguments: '' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"city"' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ': "Paris"}' } }] } }] },
      { choices: [{ delta: { content: '' }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 28, completion_tokens: 6 } },
```

工具参数不是一次给全的：`arguments` 被切成 `''`、`'{"city"'`、`': "Paris"}'` 三片，靠 `index: 0` 认领同一个调用，只有第一片带 `id`、`type` 和函数名。拼回完整 JSON 是消费侧的活，所以后面才需要 `BlockAssembler`。

**chunk（流片段）** 是 dsh 内部的流词汇，一个 provider 无关的联合类型；SSE 帧被翻译成 chunk 之后，上层再也见不到 provider 的字段名。翻译之后得到的 chunk 序列（同文件 `:112-123` 的断言）依次是 `block-start` → 三个 `tool-call-delta` → `block-end`（携带拼好的完整 `arguments`）→ `usage` → `finish`。**usage 一定在 finish 之前，finish 之后没有任何 chunk**。这是流协议的硬约定，写在 `packages/llm/llm/src/types.ts:283-290` 的类型注释里。

下面把这条路径拆开讲。

## 提供商无关的词汇：`packages/llm/llm`

### 消息与内容块

`Message` 只有三种 role：`system` / `user` / `assistant`（`packages/llm/llm/src/message.ts:129-138`）。**没有 `tool` role**，工具结果是一条 `role:'user'` 消息，内容里放一个 `tool-result` 块（`createToolResultMessage`，`packages/llm/llm/src/message.ts:231-241`，一个结果一条消息）。把它翻成 wire 上的 `role:'tool'` 是适配器的事。

内容块共五种，登记在一张可声明合并（declaration merging，TypeScript 里让别的包往同一个接口里加字段的机制）的表上：`text` / `reasoning` / `image` / `tool-call` / `tool-result`（`packages/llm/llm/src/types.ts:99-105`）。`ToolCallBlock.arguments` 是**原始 JSON 字符串**，全程不解析（`packages/llm/llm/src/types.ts:83-84`）：谁解析谁负责，核心层不替模型擦屁股。

每条消息带一个 `source`（`packages/llm/llm/src/message.ts:100-105`）：`user` / `plugin` / `model` / `tool`。插件源可以再声明一个语义化的 `form`：`instructions`、`catalog`、`snapshot`、`notice`、`relay`、`recall`（`packages/llm/llm/src/message.ts:48-60`）。这个词汇刻意只说「这是什么」，不说「长什么样」；注释里写得很直白：颜色、图标、排序、默认折叠都是消费者的事，不许进这个联合类型。

`TokenUsage` 的计数是**不相交**的（`packages/llm/llm/src/types.ts:127-141`）：`inputTokens` 只含未命中缓存的输入，缓存读写另算，计费输入 = 三者之和。`reasoningTokens` 是个例外：它不是第五个桶，而是 `outputTokens` 的明细拆分，汇总时不能再加一遍（口径写在 `packages/llm/token-meter/src/index.ts:43`：「without double-counting reasoning output」，意思是把几个不相交的桶加起来求总量，别把 reasoning 那部分再算第二遍）。DeepSeek 的 `prompt_tokens` 是含缓存命中的，所以适配器要减出来（下文 `mapUsage`）。

失败事实用 `LlmFailure` 表达（`packages/llm/llm/src/types.ts:39-51`）：`{message, code, status?, providerRetryAfterMs?, requestId?}`，可序列化，**不带任何策略字段**：没有 `retryable`、没有 `partialOutput`。要不要重试是上层的判断，不是失败本身的属性。

### `LlmCallConfig`：请求头部的可变部分

`LlmCallConfig`（`packages/llm/llm/src/call-config.ts:23-30`）只有六个字段：`provider`、`model`、`reasoningEffort`、`temperature`、`maxTokens`、`stop`。它是 session 日志里 `EpochHeader.config` 的内容（**epoch header** 是一次请求的信封：调用配置、适配器默认值、渲染好的 system 字符串、装配好的工具 schema，只有它变了才写一条新事件），也是唯一允许插件在 `agent/request` 这个 waterfall 上替换的东西。**waterfall（瀑布事件）** 是 Cordis 的环绕式中间件：监听器必须 `await next()` 才轮到下一个，返回值权威。`callConfigEquals` 逐字段比较，`stop` 数组按元素比（`packages/llm/llm/src/call-config.ts:49-59`）。

文件顶上留着一条自认的 TODO：哪些字段真的属于「epoch 级、影响缓存复用」还没定论（`packages/llm/llm/src/call-config.ts:15-16`）。这条 TODO 的后果在 [02 KV-Cache](02-kv-cache.md) 里会再碰到：改一次 `temperature` 也会写一条 header 变更事件，但它并不改变 prompt token。

`markAgentLoopRequest` / `isAgentLoopRequest` 用一个 `WeakSet` 标记「这个请求对象是 agent loop 装配的」（`packages/llm/llm/src/call-config.ts:12-13, 65-79`）。中间件靠它区分主对话请求和辅助一次性请求。`deepFreeze` 是迭代式深冻结、带循环保护，**唯独跳过 `AbortSignal`**，冻住它会让取消功能失效（`packages/llm/llm/src/call-config.ts:88-117`，跳过的那行在 `:104`）。

### `LlmRuntime`：注册、绑定、归一

适配器注册是 all-or-nothing 的：`registerAdapter(providers, adapter)` 先在 `prepareRoutes` 里全量校验，任何一条 route 重复就抛 `DUPLICATE_ADAPTER`，注册表一个字节都不改（`packages/llm/llm/src/index.ts:338-397`）。返回的 handle 带一个 `replace(providers)`，在一个同步段里先删后加（`commitRoutes`，`packages/llm/llm/src/index.ts:405-413`），观察者看不到「这个 provider 消失了又回来」的空档。

**每条 route 在注册时捕获 `providerRetryPolicy()`**（`packages/llm/llm/src/index.ts:387-388`）。这是全流程里唯一一个「注册期确定、请求期刷新不了」的事实；`llm-deepseek` 因此在配置里的 `retryPolicy` 变化时要调 `registration.replace([PROVIDER])` 原地重注册（`packages/llm/llm-deepseek/src/index.ts:258-268`）。

`resolveCallFor`（`packages/llm/llm/src/index.ts:734-768`）做两件事：`maxTokens` 缺省时物化适配器的 `defaultMaxTokens`；`reasoningEffort` 缺省时物化 `defaultEffort`。显式传了一个模型不支持的 effort 会抛 `UNSUPPORTED_REASONING_EFFORT`，**不做 clamp**，不猜用户想要什么。

`prepareCall(config, signal)`（`packages/llm/llm/src/index.ts:779-813`）把「解析后的 config + 那次注册 + retryPolicy + context + adapterDefaults」一次性打包成 `PreparedLlmCall`（接口在 `packages/llm/llm/src/index.ts:155-172`）。其中 `adapterDefaults` 是这次被物化出来的适配器默认值（比如调用方没传、由适配器补上的 `maxTokens` 和 `reasoningEffort`），它要进 header，因为它同样决定 wire 上到底发了什么。返回的 `stream()` 只能调一次，而且传进去的 call-config 必须与 prepared 的一致，否则抛 `INVALID_PREPARED_CALL`。目的写在 JSDoc 里：HMR（热更新）时不能拿 A 适配器的能力探测结果去 dispatch 到 B 适配器。

`stream()` 本身只有一行（`packages/llm/llm/src/index.ts:913-915`），转手交给私有的 `streamWithRegistration`；后者也只做一件事，就是把请求交给 `llm/stream` 这个 waterfall（`packages/llm/llm/src/index.ts:921-926`）：

```ts
    return this.ctx.waterfall(
      this,
      'llm/stream',
      options,
      () => this.adapterStream(options, prepared),
    )
```

`waterfall` 的四个参数依次是：发起者、事件名、往下传的载荷、以及所有监听器都放行之后才执行的兜底动作。监听器可以改 `options`、可以把返回的流整个包起来、也可以干脆不调 `next()`，用自己的流替掉真实请求。录制回放和落盘纪律都挂在这个点上。

分两层是因为 `prepareCall()` 拿到的那个一次性 `stream()` 也走 `streamWithRegistration`，只是多带一个已绑定的 registration。

`adapterStream`（`packages/llm/llm/src/index.ts:843-900`）是**终点边界**。适配器选择、dispatch、迭代过程中抛出的任何东西，都被 `normalizeLlmFailure` 变成一条终止 `finish` chunk（`adapterFailureChunk`，`packages/llm/llm/src/index.ts:931-939`）；signal 已 abort 或 code 是 `ABORTED` 就归为 `{kind:'aborted'}`，否则 `{kind:'error'}`。而中间件和消费者抛的异常照常抛出：生成器里 `yield item.value` 特意挪到 try 之外，注释说得很清楚：「consumer/middleware failures resumed into this generator must remain thrown」（被 resume 回这个生成器里的消费者与中间件异常，必须继续往外抛）。翻译成人话就是：适配器自己坏了要变成一条 finish chunk 记进日志，好让循环有机会重试；但读流的人或者中间件抛的错吞掉就等于把调用方的 bug 藏起来，那种错必须原样炸出去。

`forAdapter`（`packages/llm/llm/src/index.ts:823-836`）处理跨适配器污染：历史 assistant 消息上的 `source.replayState`（适配器私有的回放状态，见 `packages/llm/llm/src/message.ts:18`）只在「当前拥有该历史 provider 的适配器实例 === 目标适配器实例」时才透传，否则整条 source 被重建、`replayState` 剥掉。

### 错误分类

规范码是常量：`CONTEXT_WINDOW_EXCEEDED`、`QUOTA`、`EMPTY_RESPONSE`、`INVALID_CREDENTIAL`（`packages/llm/llm/src/error.ts:25, 28, 39, 48`）。判断「是不是上下文溢出」靠一组正则匹配 provider 的英文文案（`packages/llm/llm/src/error.ts:80-86`），配额同理（`:94-100`）。这是全仓唯一一处集中的文案解析，两个适配器共用，也是这套设计最脆的一环，后面「代价」一节再说。

`normalizeLlmFailure`（`packages/llm/llm/src/adapter-failure.ts:16-28`）有个细节要记：跨包拷贝的 error 会丢掉 class identity，所以它只在「own-property 上的 `failure` 存在，且 `failure.code === error 自己的 code`」时才整份采信那条 failure。不满足时它并不直接判 `UNKNOWN`，而是退回 `harnessErrorCode(error)`（`:102-104`）：还是 `HarnessError` 就保留它自己的 `code`，只有连这都不是（第三方 SDK 的错误、随手 throw 的字符串）才落到 `UNKNOWN`。理由写在函数注释里：第三方 SDK 的错误码不属于 harness 的分类体系，不能冒充。

### `BlockAssembler` 与归因头

**`BlockAssembler`（块装配器）** 负责把零碎的 delta 拼回完整的内容块。它（`packages/llm/llm/src/assembler.ts:36-164`）按 index 累积 partial，`block-end` 带的 block 是权威值，之后到达的同 index delta 直接忽略。`blocks()` 有一条安全规则（`packages/llm/llm/src/assembler.ts:134-138`）：

```ts
  blocks(): ContentBlock[] {
    const blocks = this.order.map(index => this.assemble(this.mustGet(index), index))
    return this.finish.kind === 'max-tokens'
      ? blocks.filter(block => block.type !== 'tool-call')
      : blocks
  }
```

`this.order` 记的是块的开启顺序，`assemble()` 把累积到一半的 partial 折成成品块。整段的重点在最后那个三元判断：被输出上限截断的工具调用参数可能是半截 JSON，执行它不安全，所以直接丢掉。副作用是：`max-tokens` 那一步会产生一条内容为空、只承载 usage 的 `assistant/message`，[05 Session](05-session.md) 里的 `deriveEventMessage` 会跳过这种消息。

每个适配器每次请求必须带归因头（`packages/llm/llm/src/attribution.ts:40-44、:53-55`）：`User-Agent: deepseek-harness/<version> (+https://github.com/deepseek-ai/deepseek-harness)`，版本从 package.json 读，不许手抄。这条是仓库制度，出处是 `.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`。

## `llm-deepseek`：直连 fetch 的适配器

### 路由与配置

只有一条 route：`deepseek-official`（`packages/llm/llm-deepseek/src/index.ts:47`）。默认 catalog 两个模型，`contextWindow` 都是 1,000,000（`packages/llm/llm-deepseek/src/index.ts:49-52`，常量在 `packages/llm/llm-deepseek/src/adapter.ts:91`）；默认输出上限 256,000（`packages/llm/llm-deepseek/src/adapter.ts:93`）；空闲看门狗 300 秒（`packages/llm/llm-deepseek/src/adapter.ts:89`）。

配置里 `thinking: 'disabled'` 时只允许 `reasoningEffort: 'off'`，其它组合在解析期就抛（`packages/llm/llm-deepseek/src/index.ts:161-166`）。`baseURL` 的回退链是「配置 → 受信启动环境的 `$DEEPSEEK_BASE_URL` → 公共端点」（`packages/llm/llm-deepseek/src/index.ts:185-187`）。

配置是**每次操作重新解析**的：闭包比较 raw 引用，变了才重新算；解析失败时保留上一次的好值并打一次错误日志（`packages/llm/llm-deepseek/src/index.ts:204-222`）。凭据优先走 `ctx.credentials.resolve(ref)`，没有 credentials seam 才读启动环境（**seam（能力接缝）** 指一个可替换能力的接缝：一份抽象定义、若干 provider、以及消费者三个角色，换掉 provider 就换掉整块行为），都没有就抛 `MISSING_CREDENTIAL`（`packages/llm/llm-deepseek/src/index.ts:225-246`）；拿到的 key 还要过 `assertUsableApiKey`，空白或含非 ByteString 字符直接拒（`packages/llm/llm/src/index.ts:137-152`）。

`resolveModel`（`packages/llm/llm-deepseek/src/adapter.ts:175-212`）对没登记在 catalog 里的模型也声明 `inputModalities: ['text']`。注释解释了为什么不写「unknown」（「不知道支不支持」）：那会让宿主接受并持久化图片，然后在序列化时才拒绝。

### `serializeRequest` 完整字段表

wire body 上可能出现的字段就这九类，一个不多。注意「规则」一列里反复出现的「缺省即不发」。这不是省事，是把「用 provider 的默认值」和「显式设成某个值」区分开。

| wire 字段 | 来源 | 规则 |
| --- | --- | --- |
| `model` | `options.model` | 直传 |
| `messages[0]` | `options.system` | `system !== undefined` 时作为第一条 `role:'system'` 消息（`packages/llm/llm-deepseek/src/serialize.ts:155-158`） |
| `messages[1..]` | `serializeMessages(options.messages)` | 见下表（`packages/llm/llm-deepseek/src/serialize.ts:112-141`） |
| `stream` | 恒为 `true` | 只走流式（`packages/llm/llm-deepseek/src/serialize.ts:176`） |
| `stream_options.include_usage` | 恒为 `true` | 不开就拿不到 usage（`packages/llm/llm-deepseek/src/serialize.ts:177`） |
| `thinking` | `resolveThinking` | **顶层字段**，不是 `extra_body`（`packages/llm/llm-deepseek/src/serialize.ts:178`） |
| `reasoning_effort` | `resolveThinking` | 只可能是 `'high'` 或 `'max'`；`off` 永远不上 wire（`packages/llm/llm-deepseek/src/serialize.ts:179-181`） |
| `tools` | `options.tools` 映射 | **空数组不发**（`packages/llm/llm-deepseek/src/serialize.ts:161-168, 182`） |
| `temperature` / `max_tokens` / `stop` | 同名 config 字段 | 缺省即不发，让 provider 用自己的默认（`packages/llm/llm-deepseek/src/serialize.ts:183-185`） |

没有映射的字段包括 `tool_choice`、`response_format`、`top_p`；核心词汇 `GenerateOptions`（`packages/llm/llm/src/types.ts:320-356`）里根本没有它们。

`resolveThinking`（`packages/llm/llm-deepseek/src/serialize.ts:37-53`）的判定顺序：

1. `purpose === 'session-title'` → 直接返回 `thinking: disabled`，后面全不看（`:38`）。理由在调用处的注释里（`packages/llm/llm-deepseek/src/serialize.ts:169-170`）：短标题必须产出可见文本，思维链会把预算吃光。
2. 解析出本次的 effort：请求里给了就用请求的，没给就用配置默认（`:39-41`）。
3. **部署配置是 `thinking:'disabled'` 而这个 effort 既存在又不是 `off` → 当场抛 `UNSUPPORTED_REASONING_EFFORT`（`:42-47`）。** 这一步在下面两步**之前**，所以在一个禁用了思维链的部署上传 `effort: 'high'`，得到的是异常，不是悄悄开启思维链。
4. effort 为 `off` → `thinking: disabled`（`:48`）。
5. effort 为 `high` / `max` → `thinking: enabled` + 对应 `reasoning_effort`（`:49-51`）。
6. 以上都不是（effort 压根没定）→ 只发配置里的 `thinking`（若有）（`:52`）。

每种内部消息转成什么 wire 消息（`packages/llm/llm-deepseek/src/serialize.ts:112-141`）：

| 内部 Message | wire |
| --- | --- |
| `role:'system'`（历史里的） | `{role:'system', content: 文本拼接}` |
| `role:'assistant'` | `{role:'assistant', content: 文本拼接, reasoning_content?, tool_calls?}` |
| `role:'user'` | 有文本或没有 tool-result 时先发一条 `{role:'user', content: 文本}`，然后**每个** tool-result 单独一条 `{role:'tool', tool_call_id, content}` |
| 任何含 image 的消息 | 抛 `UNSUPPORTED_CONTENT`（`assertTextOnly`，`packages/llm/llm-deepseek/src/serialize.ts:64-68`） |

两条规则在源码注释里有完整交代，原样引在下面：

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

（`packages/llm/llm-deepseek/src/serialize.ts:87-95`）。这段注释一口气交代了三种情况。没有文本的回合发空字符串，永远不发 `null`。纯工具调用的回合，官方示例是把 `message.content` 原样回放（那就是空字符串），而且有的网关直接拒收 `null`。只有思维链的回合（模型可以整段都在 reasoning 通道里作答，比如 v4-flash 打个招呼）线上 API 会用 400 拒掉「既没有 content 又没有 tool_calls」的 assistant 消息。

翻译成人话就是：这条消息会永久留在会话日志里，写进去一个 `null`，之后这个会话的每一轮都发不出去。所以 assistant 的 `content` 永远是字符串。

```ts
    // Official passback rule (guides/thinking_mode.mdx): reasoning_content
    // must return on tool-call turns; it is ignored on plain turns, so we
    // drop it there to save tokens.
    ...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
```

（`packages/llm/llm-deepseek/src/serialize.ts:96-99`）。注释引的是官方 `guides/thinking_mode.mdx` 里的回传规则：工具调用的回合必须把 `reasoning_content` 传回去，普通回合传了也会被忽略，所以这里干脆不传，省 token。落到代码上就是那个条件：`reasoning_content` 只出现在带 `tool_calls` 的 assistant 历史消息上。

空工具输出会被替换成 `'(no output)'`（`packages/llm/llm-deepseek/src/serialize.ts:135-136`），注释理由是「空输出在 wire 上仍然需要 SOME content」。

### 传输：请求头、看门狗、错误归一

请求头一共七类（`packages/llm/llm-deepseek/src/adapter.ts:283-295`）：`authorization`、`content-type`、`accept: text/event-stream`、归因 `user-agent`、`x-deepseek-harness-user-id`（匿名 id）、`x-deepseek-harness-session-id`（有 sessionId 时）、`x-deepseek-harness-compact: 1`（`purpose === 'compaction'` 时）。这些是传输元数据，不进 body。

`POST ${baseURL}/chat/completions`（chat-completions 是 OpenAI 定义、后来被大量 provider 沿用的那套请求格式）用的是原生 `fetch`，**不走 Cordis 的 HTTP 服务**，源码里挂着 `TODO(http)` 说明理由是运行时依赖权衡（`packages/llm/llm-deepseek/src/adapter.ts:297-306`）。这意味着统一代理、统一拦截在这条路径上不生效。

`stream()` 开头一次性冻结连接事实和凭据（`packages/llm/llm-deepseek/src/adapter.ts:220-227`）：

```ts
    const connection = this.config.options()
    const apiKey = await this.config.resolveApiKey(connection)
    const userId = this.config.resolveUserId()
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
```

这几行把一次请求要用的外部事实一次钉死：`connection` 是配置快照，`apiKey` 从这个快照里解析，`userId` 是匿名 id。`AbortSignal.any` 把调用方的取消信号和适配器自己的 `consumer` 合成一个，任一触发都能中断流；`using` 声明让看门狗在函数退出时自动释放。

key 从 `connection` 这个快照里解析，而不是重新读配置；注释说明目的是「一个请求永远不可能把某一代的 URL 配上另一代的密钥」。空闲看门狗每收到一个 SSE 注释或事件就 pulse；超时映射成 `TIMEOUT`，调用方 abort 映射成 `ABORTED`，其它一律 `TRANSPORT`（`packages/llm/llm-deepseek/src/adapter.ts:246-258`）。

非 2xx 的处理（`packages/llm/llm-deepseek/src/adapter.ts:321-339`）：读 error body 取 `error.message`；解析 `retry-after`（纯数字按秒，否则按 HTTP 日期算差值，`:117-125`）；取 `x-request-id` 或 `x-deepseek-request-id`（`:127-130`）；然后抛一个带 `status` / `providerRetryAfterMs` / `requestId` 的 `LlmError`。

错误码映射是**顺序敏感**的（`packages/llm/llm-deepseek/src/adapter.ts:138-149`）：

```ts
export function httpErrorCode(status: number, error?: WireError['error']): string {
  if (status === 401 || status === 403) return 'AUTH'
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}
```

`detail` 把 provider 返回的 `code`、`type`、`message` 三段拼成一个字符串，再交给两个正则去匹配，所以除了 401/403 之外的判定用的都是文案，不是状态码。

注意 quota 判定在 429 之前：一个带配额文案的 429 归 `QUOTA`（不可重试）而不是 `RATE_LIMIT`（可重试）。这一行顺序直接决定了会不会在余额耗尽时空转重试。

### SSE 解析与翻译

`parseSse`（`packages/llm/llm-deepseek/src/sse.ts:28-40`）把字节流接到 `TextDecoderStream` 再接 `EventSourceParserStream`，逐条 yield `data`，遇到 `[DONE]`（`packages/llm/llm-deepseek/src/sse.ts:18`）就 return。**EOF 前没见到 `[DONE]` 就抛 `STREAM_CLOSED`**（`packages/llm/llm-deepseek/src/sse.ts:39`）：截断的响应不可信。模块注释还强调 framing 是 spec-strict 的：事件只在空行终止符处派发，EOF 处未终止的尾巴算截断，不算可 flush 的载荷。

`translate`（`packages/llm/llm-deepseek/src/translate.ts:86-185`）维护一个 text block、一个 reasoning block、以及每个 wire `tool_calls[].index` 一个 tool-call block，harness 侧的 index 按开块顺序递增。三个关键行为：

- 首个空字符串 `reasoning_content` **不开块**（`packages/llm/llm-deepseek/src/translate.ts:132-133`），否则每次思维链请求都会多一个空 reasoning 块。
- `finish_reason` 与 `usage` 都**延迟到 `[DONE]`** 才 yield（`packages/llm/llm-deepseek/src/translate.ts:101-118`）。这同时兼容「usage 挂在 finish chunk 上」和「usage 是独立尾随 chunk」两种形态，也保证了 finish 之后无 chunk。
- `stop` 且一个块都没开过 → 转成 `finish{error, code: EMPTY_RESPONSE}`（`packages/llm/llm-deepseek/src/translate.ts:108-116`）。这是「模型合法地什么都没说」的退化完成，被当成可重试失败。

`mapFinishReason`（`packages/llm/llm-deepseek/src/translate.ts:31-43`）把 `stop`/`tool_calls`/`length` 映射成 `stop`/`tool-calls`/`max-tokens`，其它（`content_filter`、`insufficient_system_resource` 等）一律变成 `error` 并把原值大写当 code。

`mapUsage`（`packages/llm/llm-deepseek/src/translate.ts:53-62`）是不相交计数的落地：

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

两个 `??` 在兼容 DeepSeek 的新旧两种字段名（`prompt_tokens_details.cached_tokens` 与 `prompt_cache_hit_tokens`）。真正的关键是 `inputTokens` 那一行做了减法：DeepSeek 的 `prompt_tokens` 是含缓存命中的，减掉之后剩下的才是「这次真的重新算了一遍」的部分，与 `cacheReadTokens` 不重叠。上面说的「不相交计数」就落在这一行。

DeepSeek 不报 cache-write 指标，所以这里没有 `cacheWriteTokens`，包 README 里明说了这一点（`packages/llm/llm-deepseek/README.md:73`）。

## `llm-pi-ai`：设计验证用的孪生适配器

第二个适配器经由 `@earendil-works/pi-ai`（版本 `^0.82.1`，`packages/llm/llm-pi-ai/package.json:45`）接多家 provider。它存在的意义写在 `.agents/notes/implemented/architecture/2026-06-13-twin-llm-adapters.md` 里：两个内部实现完全不同的适配器共用一套 `StreamChunk` 词汇，凡是一方表达不了的，都算核心词汇的 bug。

与直连适配器的差别：

- **可手动声明的协议只有三个**（`packages/llm/llm-pi-ai/src/provider.ts:47-51`）：`openai-completions`、`openai-responses`、`anthropic-messages`。Bedrock/Vertex/Azure/OAuth 类不能手动声明，注释解释了原因：这些的鉴权形态没法用「key + URL」（一个密钥加一个地址）这种配置形状表达，给出去只会得到一个认证不了的 provider。catalog 里自带的 route 仍可用其自身实现。
- **catalog 来自依赖**：内置 provider 列表由 `@earendil-works/pi-ai` 的版本决定，本仓库不硬编码。
- **思维链方言**：`compat.thinkingFormat` 可选 `openai`、`deepseek`、`openrouter`、`together`、`zai`、`qwen`、`string-thinking`、`ant-ling`（`packages/llm/llm-pi-ai/src/catalog.ts:100-109`）。这张 `Record` 是一个「漂移门」：pi-ai 升级新增格式时编译会失败，逼人显式分类。reasoning 等级同理，七档 `off/minimal/low/medium/high/xhigh/max`（`packages/llm/llm-pi-ai/src/catalog.ts:69-80`）。
- **缓存语义不同**：profile 可以声明 `cacheRetention`（`packages/llm/llm-pi-ai/src/adapter.ts:92`），并且映射 `cacheWriteTokens`（`packages/llm/llm-pi-ai/src/stream.ts:27`）。这是 Anthropic 那类**显式断点**缓存模型；DeepSeek 路径没有任何等价物。
- **`maxRetries: 0`**（`packages/llm/llm-pi-ai/src/adapter.ts:96-97`），注释直白：「agent 恢复层拥有可见的重试次数，一次 adapter 调用 = 一次 SDK 尝试」。
- **replayState**：`PiAiReplayState`（`packages/llm/llm-pi-ai/src/replay.ts:20-32`）记录 api/provider/model/responseId/stopReason 以及每个块的签名（`thinkingSignature`、`textSignature`、`thoughtSignature`）。Anthropic、OpenAI-responses 这类协议要求把签名回传才能延续推理，这就是 `forAdapter` 那道过滤保护的东西。
- **支持图像**：通过 `ctx.attachments.readImage` 读出字节转 base64（`packages/llm/llm-pi-ai/src/context.ts:39-46`）；直连适配器直接拒绝。

## `llm-retry`：谁决定重试、等多久

策略的形状定义在 `packages/llm/llm/src/retry-policy.ts`，执行在 `llm-retry`，挂载点是 `agent/request-error` waterfall。

默认值（`packages/llm/llm/src/retry-policy.ts:14-24`）：

```ts
const DEFAULT_MAX_RETRIES = 2
const DEFAULT_INITIAL_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 10_000
const DEFAULT_JITTER_RATIO = 0.1
const DEFAULT_RETRYABLE_CODES = Object.freeze([
  EMPTY_RESPONSE_CODE,
  'RATE_LIMIT',
  'SERVER',
  'TIMEOUT',
  'TRANSPORT',
])
```

五个默认值连起来是一句话：最多重试 2 次，第一次等 500 毫秒，之后翻倍但不超过 10 秒，每次再乘一个 ±10% 的随机抖动（抖动是为了避免一堆客户端在同一毫秒一起重来）。可重试的码只有列出的那五个，`AUTH`、`QUOTA`、`INVALID_REQUEST`、`CONTEXT_WINDOW_EXCEEDED` 都不在里面：这些错重试多少次结果都一样。

两种模式：`normal`（只重试列表里的码，有次数上限）和 `always`（无上限重试所有失败，`packages/llm/llm/src/retry-policy.ts:48-54`）。

`recover()` 的判定（`packages/llm/llm-retry/src/index.ts:156-208`）：

1. 没有 policy（说明请求根本没到达终点适配器）→ 直接 `next()`。
2. `always` 模式**先问下游**（`settleDownstream(next)`，`:166`），下游返回 retry 就用下游的，这让压缩的溢出恢复优先于盲目重试。下游失败只记一条 warn，不影响自己重试。`normal` 模式则先看 code 在不在 `retryableCodes` 里，不在就 `next()`。
3. `policyKey = JSON.stringify([...])`（`:65-76`）把整套策略参数序列化成一个键。然后在 `session.events` 里 `findLast` 找同 turn / step / provider / policyKey 的 `llm/retry` 事件，得到已重试次数（`:182-189`）。`normal` 且已达上限 → `next()`。
4. 延迟计算（`:193-205`）：如果 provider 给了有效的 `Retry-After` 且不超过 `maxDelayMs`，**精确采用，不加抖动**；超过 `maxDelayMs` 时 `normal` 直接放弃（不违背 provider 的指示去抢），`always` 退回本地退避。否则本地退避 `min(min(initial · 2^(retry-1), max) · U[1-j, 1+j], max)`（`:58-63`）。
5. `backoff()`（`:111-154`）先 `append('llm/retry', ...)` 把这次重试写进日志，再做可取消的等待，等待成功后 `append('llm/retry-started', ...)`，最后返回 `{kind:'retry'}`。

事件形状在 `packages/llm/llm-retry/src/types.ts:16-46`：`normal` 事件带 `maxRetries`，`always` 事件不带（UI 因此渲染无穷）。两个事件都是 log-only，不上 surface（**surface（表面）** 是事件日志的一个子视图，只有 `user/message`、`assistant/message`、`tool/result` 三种事件能进去，模型历史只从这个子视图折叠出来）；**失败的那一步的 `assistant/chunk` 也不进 surface**，所以重试请求与失败请求的消息完全相同，错误文本永远不进模型上下文。

插件销毁时会 abort 所有等待并 drain（`packages/llm/llm-retry/src/index.ts:221-225`）。

与压缩的关系在 [06 压缩](06-compaction.md) 展开：`compaction-basic` 也挂在 `agent/request-error` 上，专门处理 `CONTEXT_WINDOW_EXCEEDED`。这个码不在默认 `retryableCodes` 里，所以 `normal` 模式的 llm-retry 会直接放行给下游。

## `token-meter`：4 字符一个 token 的增量式计量

没有真正的 tokenizer。估算器是固定密度启发式（`packages/llm/token-meter/src/estimate.ts:12-19`）：`CHARS_PER_TOKEN = 4`，每个块 `+4` 结构开销，每条消息再 `+4` role 开销。tool-call 按 name 加 arguments 的长度算（`:34-38`）；system 按 `length/4 + 4`（`:65-68`）；tools 按 `JSON.stringify(header.tools).length/4 + 4`（`:75-78`）。

`measure(session, requestHeader?)`（`packages/llm/token-meter/src/index.ts:116-147`）不是每次重算全量，而是「锚点 + 增量」：

```ts
    if (anchor !== undefined && optionalHeaderEquals(anchor.header, header)) {
      baseline = anchor.baseline
      surfaceDeltaTokens = state.surfaceTokens - anchor.surfaceTokens
    } else if (…) {          // 空日志走零基线，否则整体估算
```

这几行是增量的入口：只有锚点存在、而且锚点记下的 header 与本次 header 相等时，才敢拿「当前 surface token 数减去锚点当时的 surface token 数」当增量用。header 一变就得整体重估，因为 system 段落和工具 schema 都可能换了。

锚点在折叠 `assistant/message` 时建立（`packages/llm/token-meter/src/index.ts:225-255`）。有 usage 且有 header 时，锚点基线取 provider 报的真实用量之和（`usageTokens`，`:44-49`：input + cacheRead + cacheWrite + output），**但仅当它不小于同一时刻的完整启发式估算**，否则退回估算值。注释说明了原因：带符号的启发式增量只有从「至少和全量估算一样大」的锚点出发才保持保守。

header 变了或者压根没有锚点，就整体估算。这也意味着：压缩把 surface 改了以后，下一次 measure 拿到的仍是相对同一锚点的增量，直到下一条带 usage 的 `assistant/message` 重新落锚。

三个投影注册到 `sessionProjections`（`packages/llm/token-meter/src/index.ts:85-90`）：`tokenUsage`（`packages/llm/token-meter/src/usage-projection.ts:109`）、`contextPressure`（同文件 `:165`）、`contextBreakdown`（`packages/llm/token-meter/src/breakdown-projection.ts:44`）。上下文压力的分子口径写在一行里（`packages/llm/token-meter/src/usage-projection.ts:70-72`）：

```ts
/** Prompt-side pressure of one request: input plus cache traffic, no output. */
const pressureFrom = (usage: TokenUsage): number =>
  usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
```

那行英文注释的意思是：一次请求的压力只看 prompt 侧，等于未命中输入加上缓存读写的流量，输出不计。所以这里只算 prompt 侧，不含输出。

## 循环怎么把这些拼起来

agent loop 每一步的组装（`packages/core/agent-loop/src/agent.ts:340-345`）：

```ts
      const { request, preparedCall } = await this.buildRequest(
        turn, step, assembly.tools, system, this.session.deriveMessages(), signal,
      )
      const assembler = new BlockAssembler()
      const chunkSeqs: number[] = []
      const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
```

`buildRequest` 返回 `request` 和一个可选的 `preparedCall`：拿到了 prepared 就用它那个一次性的 `stream()`，没拿到才回落到 `llm.stream()`。`assembler` 和 `chunkSeqs` 留给下面的循环，一边把 chunk 写进日志，一边把它们折成成品消息。

`buildRequest` 里先 `prepareCall`（`packages/core/agent-loop/src/agent.ts:449`），再把 header 与日志里的基线比较、变了才写 `request/header`（`packages/core/agent-loop/src/agent.ts:464-470`），最后组装并深冻结请求（`packages/core/agent-loop/src/agent.ts:486-493`）。每个 chunk 都会先 `append('assistant/chunk', ...)` 再喂给 assembler（`packages/core/agent-loop/src/agent.ts:349-350`）：日志先行。

流结束后如果 finish 是 `error` 或 `aborted`，就走 `agent/request-error` waterfall；只有拿到 `{kind:'retry'}` 才 `continue` 重来，否则把失败抛成 `LlmError`（`packages/core/agent-loop/src/agent.ts:355-372`）。重来时重新 `buildRequest`，日志没变，所以请求字节相同。

另外有一道纪律：`session-checkpoint-policy` 挂在 `llm/stream` 上（注册在 `packages/session/session-checkpoint-policy/src/index.ts:64-68`），把下游包进一个生成器，生成器第一件事就是 `await ctx.sessions.flush(session)`，flush 完才 `yield* next()`（`:29-38`，flush 在 `:35`）。也就是说**请求前缀落盘之后才 dispatch**。

## 代价与失效点

1. **上下文溢出与配额判定靠正则匹配英文文案**（`packages/llm/llm/src/error.ts:80-100`）。provider 改一句话，`CONTEXT_WINDOW_EXCEEDED` 就可能退化成 `INVALID_REQUEST`，压缩的溢出恢复也就不会触发。源码把这处集中起来是为了好维护，但没有消除风险。
2. **`fetch` 不经统一 HTTP 层**（`packages/llm/llm-deepseek/src/adapter.ts:297-298` 的 `TODO(http)`）：没法统一配代理、加拦截、共享连接池。
3. **直连适配器只支持文本**：任何图片内容在序列化时抛 `UNSUPPORTED_CONTENT`（`packages/llm/llm-deepseek/src/serialize.ts:64-68`）。要图像就得走 pi-ai 路由。
4. **`stop` 且无内容 = `EMPTY_RESPONSE`**（`packages/llm/llm-deepseek/src/translate.ts:108-116`）：模型合法地一句话不说也会被判失败并重试。对绝大多数场景这是对的，但它不是无代价的判断。
5. **`always` 重试可以在永久性错误上无限烧钱**：`AUTH`、`QUOTA` 在这个模式下同样会被重试（`packages/llm/llm-retry/src/index.ts:161-176`），文档要求配合可取消的调用使用。
6. **查重试历史是 O(n) 扫描**：`agent.session.events.findLast(...)`（`packages/llm/llm-retry/src/index.ts:182-188`）在长会话里每次失败都要扫全表。
7. **4 字符/token 的估算对中文和代码偏差大**。而 `contextWindow` 默认 1,000,000、压缩阈值 0.8，意味着默认配置在 DeepSeek 上极少触发自动压缩；阈值的绝对值完全建立在这个启发式之上。
8. **`reasoning_content` 只在工具轮回传**是官方规则，但后果是：没有工具调用的那些回合，模型的思维链对后续请求不可见。
9. **retryPolicy 是注册期捕获的**（`packages/llm/llm/src/index.ts:387-388`）。这是唯一一处「改配置不能靠下一次请求生效」的事实，适配器必须自己记得 `replace`，忘了就静默沿用旧策略。

## 别人怎么做

各家都读自源码。真正的分野在第一列：**是自己写协议，还是套一个现成 SDK**。这决定了后面三列有多少东西是自己能控制的。

| harness | provider 层 | 重试 | 思维链回传 | 缓存字段 |
| --- | --- | --- | --- | --- |
| **dsh** | 自己的 `LlmAdapter` seam，两个实现：直连 fetch + SSE，或经 pi-ai SDK | 独立插件挂 `agent/request-error`，默认 2 次 / 500ms / 10s / 10% 抖动，事件化可审计 | 仅 tool-call 轮回传 `reasoning_content`；pi-ai 侧用 `replayState` 带签名 | DeepSeek 只有 `cacheReadTokens`；pi-ai 侧有 `cacheRetention` 与 `cacheWriteTokens` |
| **Codex** | 直接对接 OpenAI **Responses API**（非 chat completions），`store: false` 客户端全量重放历史 | Rust 侧自有重试与 fallback | `reasoning.encrypted_content` 回传加密推理 | `prompt_cache_key = session_id`，靠服务端前缀命中 |
| **OpenCode** | Vercel **AI SDK**（`@ai-sdk/*` 一族），provider 由 npm 包名分派 | `retry.ts`，上下文溢出错误**不重试**、直接转压缩 | 由 AI SDK provider 各自处理 | 按 provider 分派：Anthropic 打 `cacheControl` 断点，OpenAI 系传 `promptCacheKey` |
| **pi** | 自研 `packages/ai`，多协议 | 镜像 OpenAI/Anthropic SDK 策略：尊重 `x-should-retry`，408/409/429/5xx 可重试，正则区分配额类不可重试，最大延迟 60s | 有 | 有 |
| **mini-swe-agent** | **litellm**，一行 `litellm.completion(...)` | tenacity 指数退避 4–60s、默认 10 次；上下文溢出列在放弃列表里 | 无 | Anthropic 模型自动给最后一条消息打 `ephemeral` 断点，无命中统计 |

两处对照：mini-swe-agent 把上下文溢出当作**放弃条件**（任务直接失败），OpenCode 把它当作**压缩触发器**且明确不重试，dsh 则把它交给 `agent/request-error` 上的下游插件，`always` 模式的 llm-retry 会特意先问下游要不要处理（`packages/llm/llm-retry/src/index.ts:166-176`）。三种做法对应三种对「上下文用完」的定性。

## 怎么自己核

在 checkout 里逐条验证本文引用的行号：

```bash
cd sources/checkouts/deepseek-harness
sed -n '173,186p' packages/llm/llm-deepseek/src/serialize.ts     # wire body
sed -n '138,149p' packages/llm/llm-deepseek/src/adapter.ts       # httpErrorCode 顺序
sed -n '53,62p'   packages/llm/llm-deepseek/src/translate.ts     # mapUsage
sed -n '14,24p'   packages/llm/llm/src/retry-policy.ts           # 重试默认值
sed -n '12,19p'   packages/llm/token-meter/src/estimate.ts       # 4 字符/token
```

看一个真实会话里 usage 的变化（下一篇会详细读这个文件）：

```bash
grep -o '"usage":{[^}]*}' examples/acp-agent/tests/snapshots/bash-tool-turn/session.jsonl
```

相关阅读：请求前缀为什么稳定见 [02 KV-Cache](02-kv-cache.md)；请求是怎么从日志里重建出来的见 [05 Session](05-session.md)；`CONTEXT_WINDOW_EXCEEDED` 之后发生什么见 [06 压缩](06-compaction.md)；`llm/stream` 这类扩展点的机制见 [12 表面与协议](12-surfaces-and-protocols.md)；术语见 [附录 A 词汇表](appendix-a-glossary.md)。

## 自检

**1. 适配器补上的默认值（比如 `defaultMaxTokens`、`defaultEffort`）为什么要跟着调用配置一起进 epoch header，而不是「反正是默认值，不记也行」？**

因为 header 的用途是让人拿着日志逐字节重建当时那个请求，而这些默认值真的上了 wire。`resolveCallFor`（`packages/llm/llm/src/index.ts:734-768`）在 `maxTokens` 或 `reasoningEffort` 缺省时会把适配器的默认值物化出来，物化之后它们就跟显式传入的值一样出现在 body 里。只记 `LlmCallConfig` 的六个字段，日志里就会缺一块：换个适配器版本、默认输出上限从 256,000 改成别的值，重建出来的请求和当初发的就不是同一个了。同理，它们变了也应该被看作 header 变更，因为 wire 上的字节确实变了。

**2. 哪类失败重试是安全的，哪类不是？为什么 `QUOTA` 的判定要排在 429 之前？**

默认可重试的只有五个码：`EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT`、`TRANSPORT`（`packages/llm/llm/src/retry-policy.ts:14-24`）。共同点是「同样的请求再发一次，结果可能不同」：限流会过去、服务端 5xx 可能是偶发、传输层断了可以重连。`AUTH`、`QUOTA`、`INVALID_REQUEST` 不在列，因为请求字节没变，再发一百次也是同一个答案。

429 这个状态码本身两种情况都可能：临时限速，或者余额耗尽。`httpErrorCode`（`packages/llm/llm-deepseek/src/adapter.ts:138-149`）先用文案匹配 quota，匹配上就归 `QUOTA`（不可重试），匹配不上才落到 `RATE_LIMIT`（可重试）。这一行顺序颠倒过来，余额用完时就会变成按退避策略空转重试。代价也在这里：判定靠正则匹配 provider 的英文文案（`packages/llm/llm/src/error.ts:94-100`），provider 改一句话，分类就会退化。

**3. SSE 流跑到一半断了，前面已经 `append` 进日志的 `assistant/chunk` 会怎样？重试的那次请求发出去的字节和失败那次一样吗？**

chunk 是先落盘再喂给 assembler 的（`packages/core/agent-loop/src/agent.ts:349-350`），所以断流之前收到的每一片都已经在日志里了，事后能看到模型当时说到哪一句。但它们**不进 surface**，`llm/retry` 与 `llm/retry-started` 两个事件也是 log-only（`packages/llm/llm-retry/src/types.ts:16-46`）。`deriveMessages()` 只从 surface 折叠模型历史，于是重试时 `buildRequest` 拿到的消息数组与失败那次完全相同，请求字节也相同，前缀缓存照样命中。这条设计还有个附带效果：错误文本和半截回答永远不会进入模型的上下文，模型看不到自己刚才失败过。
