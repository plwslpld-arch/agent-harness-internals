---
title: Session：事件溯源、surface 与持久化
sources: [{"repo":"deepseek-harness","path":"packages/core/session/src/types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/core/session/src/surface.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/session/session-persistence/src/coordinator.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/session/session-checkpoint-policy/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# Session：事件溯源、surface 与持久化

*这一篇讲给要做会话存储、崩溃恢复或历史改写的人。读完你能回答：模型看到的历史到底从哪来、什么时候一定落盘、压缩改写历史时日志里发生了什么。*

你大概会先去找那个存 message 数组的地方。找不到，还会撞上两件反直觉的事：压缩把一大段历史换成一句摘要之后，日志一行没少，反而更长了；模型吐出来的每个 token 都以 `assistant/chunk` 记在日志里，而模型自己一条都看不到。

日志和模型看到的历史是两样东西，中间隔着一次**投影（projection）**：把事件日志按固定规则折叠成模型历史的纯函数。

dsh 的会话不是「一个消息数组」，而是一条只追加的事件日志。模型看到的历史是从这条日志上投影出来的，请求头（system prompt、工具 schema、模型路由）也在日志里，连崩溃修复和压缩都是往日志上追加事件。这篇讲清楚：日志里都有什么、模型能看到其中哪一部分、什么时候一定落盘、以及派生服务是怎么从这条日志上长出来的。

## 先看见：一段真实的 JSONL 会话日志

JSONL 就是「每行一个独立 JSON 对象」的文本格式，一行读完就能解析一条，不用等整个文件。下面是上游 e2e 快照里的一整个会话（`examples/acp-agent/tests/snapshots/bash-tool-turn/session.jsonl`，共 35 行，为了排版截去了每行的长尾）。这是一次「让模型跑 `echo TERMINAL_OK` 然后回 DONE」的完整交互：

```jsonl
{"type":"session","version":0,"id":"e128dda9-…","createdAt":1783352050748,"cwd":"{{cwd}}","delegationDepth":0}
{"type":"agent/inbox/spliced","seq":0,"time":…,"data":{"target":"next-turn","start":0,"inserted":[{…用户消息…}]}}
{"type":"turn/start","seq":1,"time":…,"data":{"turn":1}}
{"type":"agent/inbox/spliced","seq":2,…,"data":{"target":"next-turn","start":0,"removedCount":1,"inserted":[]}}
{"type":"step/start","seq":3,…,"data":{"turn":1,"step":1}}
{"type":"user/message","seq":4,…,"data":{…},"surfaceOp":"append"}
{"type":"user/message","seq":5,…,"data":{"content":[{"type":"text","text":"Current runtime context. …"}]…},"surfaceOp":"append"}
{"type":"session/title","seq":6,…,"data":{"title":"Use the bash tool to","messageSeqs":[4],"source":{"kind":"fallback"}}}
{"type":"request/header","seq":7,…,"data":{"header":{"config":{"provider":"deepseek-official","model":"deepseek-v4-flash"},"system":"{{system}}","tools":"{{tools}}"},"reason":"initial"}}
{"type":"request/context","seq":8,…,"data":{"provider":"deepseek-official","model":"deepseek-v4-flash"}}
{"type":"assistant/chunk","seq":9,…,"data":{"turn":1,"step":1,"chunk":{"type":"block-start","index":0,"blockType":"reasoning"}}}
{"type":"reasoning-chunks","seq0":10,"time0":…,"data":{"turn":1,"step":1,"index":0,"dt":[0,1,0,…],"texts":["The"," user"," wants",…]}}
{"type":"assistant/chunk","seq":28,…,"chunk":{"type":"block-start","index":1,"blockType":"tool-call"}}}
{"type":"tool-call-chunks","seq0":29,…,"data":{…,"id":"call_00_fkbBRJ…","name":"bash","args":["","{","\"","command",…]}}
{"type":"assistant/chunk","seq":60,…,"chunk":{"type":"block-end","index":0,"block":{"type":"reasoning","text":"…"}}}}
{"type":"assistant/chunk","seq":61,…,"chunk":{"type":"block-end","index":1,"block":{"type":"tool-call",…}}}}
{"type":"assistant/chunk","seq":62,…,"chunk":{"type":"usage","usage":{"inputTokens":2877,"outputTokens":90,"cacheReadTokens":0,"reasoningTokens":18}}}}
{"type":"assistant/chunk","seq":63,…,"chunk":{"type":"finish","reason":{"kind":"tool-calls"}}}}
{"type":"assistant/message","seq":64,…,"data":{…},"sourceEventSeqs":[…],"surfaceOp":"append"}
{"type":"tool/call","seq":65,…,"data":{"turn":1,"step":1,"callId":"call_00_fkbBRJ…","name":"bash","arguments":"{\"command\": \"echo TERMINAL_OK\", …}"}}
{"type":"tool/result","seq":66,…,"data":{…"content":[{"type":"text","text":"TERMINAL_OK\n"}],"isError":false…},"sourceEventSeqs":[65],"surfaceOp":"append"}
{"type":"step/end","seq":67,…,"data":{"turn":1,"step":1}}
{"type":"step/start","seq":68,…,"data":{"turn":1,"step":2}}
… 第二步的 chunk …
{"type":"assistant/chunk","seq":97,…,"chunk":{"type":"usage","usage":{"inputTokens":168,"outputTokens":25,"cacheReadTokens":2816,"reasoningTokens":22}}}}
{"type":"assistant/message","seq":99,…}
{"type":"step/end","seq":100,…}
{"type":"turn/end","seq":101,…,"data":{"turn":1,"reason":{"kind":"completed"}}}
```

每行的英文字段名含义固定：`type` 是事件类型，`seq` 是会话内单调递增的序号，`time` 是 Unix 毫秒时间戳，`data` 是这个类型专属的载荷，`surfaceOp` 说明这条事件是怎么进入 surface 的。**surface（表面）**是事件日志的一个子视图，模型能看到的历史只从它上面折叠出来；**`surfaceOp`** 记的是「怎么进的」，取值只有「追加」和「替换某一段」两种。这些行全部由 harness 写，模型只在 `data` 里出现过（自己吐的消息、自己发的工具调用参数），信封长什么样它说了不算。

几处事实先说清楚：

- **第一行不是事件**，是会话头（`type:"session"`，无 `seq`）。事件从 `seq: 0` 开始，`seq` 与行序严格对应。
- **整个 35 行文件里只有 5 行带 `surfaceOp`**：`seq 4`、`seq 5`、`seq 64`、`seq 66`、`seq 99`（两条 user、两条 assistant、一条 tool result）。带这个标记的事件才是模型能看到的历史，其余全是证据。
- `seq 5` 是运行时上下文快照（sandbox / approval 策略），走的是 **user 消息**而不是 system prompt，原因见 [02 KV-Cache](02-kv-cache.md)。
- `reasoning-chunks` 和 `tool-call-chunks` 不是事件类型，是**存储打包行**：`seq0: 10` 那一行在读回来时展开成 `seq 10..27` 共 18 个 `assistant/chunk` 事件。
- 两步之间 `cacheReadTokens` 从 0 跳到 2816，`inputTokens` 从 2877 掉到 168：第一步没有热缓存，第二步整个前缀命中。

下面按层拆开。

## 事件信封

`SessionEvent`（`packages/core/session/src/types.ts:404-436`）的形状：

```ts
export type SessionEvent<T extends SessionEventType = SessionEventType> = {
  [K in SessionEventType]: {
    type: K
    /** Monotonic sequence number within the session. */
    seq: number
    /** Unix epoch milliseconds. */
    time: number
    data: SessionEventMap[K]
    /** …大段 JSDoc 见 :412-422，正文下面转述… */
    ignorable?: true
  } & (K extends SurfaceEventType ? {
    /** …见 :424-431… */
    sourceEventSeqs?: number[]
    /** How this event entered the surface; absent for non-surface events. */
    surfaceOp?: SurfaceOp
  } : object)
}[T]
```

（为了看清结构，上面两处长 JSDoc 用 `…` 折叠了，其余逐字。）

块里三条短注释的意思：`seq` 是「会话内单调递增的序号」，`time` 是「Unix 纪元毫秒」，`surfaceOp` 是「这条事件以什么方式进入了 surface；非 surface 事件上没有这个字段」。最后一句是类型层面的承诺，不是提醒：这个字段的类型只长在三种 surface 事件的变体上。

这是一个真正的可辨识联合：`switch (event.type)` 会直接把 `event.data` 收窄，不需要断言。`surfaceOp` 和 `sourceEventSeqs` 两个字段**只存在于三种 surface 事件的变体上**，编译期就挡住了「给 `turn/start` 加 surfaceOp」这种写法。

`ignorable` 的缺省语义是「必需」。注释（`packages/core/session/src/types.ts:412-422`）把理由写全了：读到一个不认识、又没有这个标记的事件类型，必须**拒绝重建整个会话**，因为一个不认识的必需事件可能改变后面整条日志的解释方式；漏标 `ignorable` 只会导致过度拒绝（不方便），漏判则会静默恢复出一个被掏空的会话（灾难）。

会话头 `SessionHeader`（`packages/core/session/src/types.ts:61-99`）在日志之外：`version` / `id` / `createdAt` / `cwd?` / `parentSession?` / `seedLength?` / `origin?:'subagent'` / `delegationDepth?` / `agentPreset?`。`SESSION_FORMAT_VERSION = 0`（`packages/core/session/src/types.ts:56`）。这个 0 容易被误读成「没有版本机制」，其实反了：升级链、内存态视图转换、continue 时迁移这一整套机制是**已实现**的（`.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md`，状态 implemented；`packages/core/session/src/types.ts:52-54` 的注释直接指向它），协调器里也真的有迁移函数在跑，比如把已删除的 `steering/message` 事件升级成等价的 user 消息（`packages/session/session-persistence/src/coordinator.ts:383-385`）。版本号停在 0，是因为**至今没有触发过一次 bump**。注释说明只有结构性变更才算（header 形状、事件信封、核心事件语义、surface 机制），加一个普通事件类型不算，那由每事件的 `ignorable` 标记兜着。所以真正的现状是：比 0 新的日志拒绝读（让你升 harness），比 0 旧的日志本 build 没有升级步骤可用（`coordinator.ts:80-82`），而不是「机制不存在」。

## 核心事件全表

核心 `SessionEventMap` 声明了 13 个事件（`packages/core/session/src/types.ts:236-333`）：

| 事件 | 载荷 | surfaceOp |
| --- | --- | --- |
| `turn/start` | `{turn}` | 无（log-only） |
| `turn/end` | `{turn, reason: TurnEndReason}` | 无 |
| `step/start` | `{turn, step}` | 无 |
| `step/end` | `{turn, step}` | 无 |
| `user/message` | `UserMessage` | **必需** |
| `assistant/chunk` | `{turn, step, chunk: StreamChunk}` | 无 |
| `assistant/message` | `{turn, step, message: AssistantMessage, usage?}` | **必需** |
| `tool/call` | `{turn, step, callId, name, arguments}` | 无 |
| `tool/result` | `{turn, step, message: ToolResultMessage, error?, meta?}` | **必需** |
| `todo/write` | `{todos}` | 无 |
| `request/header` | `{header: EpochHeader, reason: 'initial'\|'resume'\|'change'}` | 无 |
| `request/context` | `{provider, model, contextWindow?}` | 无 |
| `session/end-seed` | `{}` | 无 |

`TurnEndReason` 有六种（`packages/core/session/src/types.ts:155-174`）：`completed`、`aborted{reason}`、`blocked`、`error{error: LlmFailure}`、`max-tokens`、`interrupted`。最后一种循环永远不会写，它是持久化后端在重载时给崩溃遗留的开放 turn 补上的标记。

`RequestHeaderReason` 三种（`packages/core/session/src/types.ts:222-228`）：`initial`（日志的第一条 header，全新会话）、`resume`（一个 loop 实例在已有 header 的日志上发的第一个请求，即进程重启或 fork 种子；**fork（分叉）**是把一段日志前缀拷给一个新会话当开局，细节见本篇最后一节）、`change`（后来的请求换了 header）。**日志里出现 `request/header{reason:'change'}` 就是前缀被改动的确定性证据**。

上面 13 个只是核心的。插件可以用 TypeScript 的声明合并（declaration merging，别的包往同一个接口里加字段的机制）往 `SessionEventMap` 里加自己的事件类型，全部加起来是 44 个，写在一个生成文件里（`packages/core/session/src/known-event-types.ts:19-64`）：从 `agent-preset/selected` 到 `web/deepseek-search-llm-request`。这个集合是持久化读路径的门禁。文件头注释直说，这里的意图是「新版 harness 写的日志被旧版读到时，宁可拒绝也不要静默跳过」。

## Surface：模型可见历史的唯一来源

只有三种事件类型可以上 surface（`packages/core/session/src/surface.ts:14-19`）：

```ts
const SURFACE_EVENT_TYPES = new Set<string>([
  'user/message',
  'assistant/message',
  'tool/result',
])
```

而且它们**必须**带 `surfaceOp`，其它事件带了就抛（`surfaceOpOf`，`packages/core/session/src/surface.ts:184-208`）。这两条一起构成了一个双向约束：符合条件的事件不带标记会被拒，不符合条件的事件带了标记也会被拒。

`SurfaceOp` 只有两种（`packages/core/session/src/types.ts:372-374`）：

```ts
export type SurfaceOp =
  | 'append'
  | { op: 'replace'; start: number; end: number }
```

`replace` 的 `start` / `end` 是**当前 surface 上存在的节点 seq**，是位置语义而不是数值区间。因为一次 replace 会把一个高 seq 的新节点放到旧区间的位置上，所以后续的 `start` 可以比 `end` 大；这个反直觉的事实在 `packages/compaction/compaction/src/types.ts:106-113` 有专门说明。`sourceEventSeqs` 必须覆盖所有被遮蔽的节点（`assertProvenance`，`packages/core/session/src/surface.ts:211-243`）。

`tool/result` 的 replace 有额外约束（`assertToolResultRewrite`，`packages/core/session/src/surface.ts:287-317`）：只能替换**恰好一个** `tool/result` 节点，而且除了 `content` 之外所有字段必须深度相等。这是给工具结果剪枝专用的窄门，防止有人借 replace 之名改写工具调用的身份。

投影规则只有一处，就是 `deriveEventMessage`（`packages/core/session/src/surface.ts:83-114`），四个分支：

- `user/message` → `event.data` 本身；
- `assistant/message` → `event.data.message`，但**内容为空时返回 null**（那种只承载 usage 的 max-tokens 消息不能变成一个空的 assistant 轮次）；
- `tool/result` → `event.data.message`；
- 其它 → null。

函数上方的注释还立了一条规矩：不要在这里加每类型的框架（比如 `<context>` 标签）。框架是生产者的事，要么烘进 `content`，要么走 `meta` + 专门的渲染器，这个投影必须是逐字透传。

`Session.deriveMessages()`（`packages/core/session/src/index.ts:726-746`）是带缓存的：每个 surface 节点只投影一次，`replaceGeneration`（每次 replace 递增，`packages/core/session/src/surface.ts:432-434`）变化才整体重建；返回的是一个新数组，但里面的 `Message` 对象是**共享且深冻结**的。JSDoc 里说明了为什么不做第二次深拷贝：内容直接复用已冻结的日志数据，消费者还是改不了。

这就得到了本篇最重要的一条不变量：**模型可见 ⟺ 已记录**。任何进入模型上下文的东西都是某条带 `surfaceOp` 的事件投影出来的；反过来，surface 上的每个节点在日志里都有一条对应事件。也因此，「日志 ≠ transcript」：`assistant/chunk` 记录逐 token 的过程、`tool/call` 记录调用被派发过、`llm/retry` 记录重试等待过、`request/header` 记录当时的 system 和 tools，这些都是**证据**，模型一个都看不到。`packages/core/session/src/surface.ts:40-54` 还专门给出了 `isAppendSurfaceEvent`，注释解释道：给人看的 transcript 应该用 append 起源的事件，因为 surface 会遮蔽被替换的区间，直接用 surface 会把用户已经看过的对话抹掉。

## `Session.append`：一次写入要过几道关

`append`（`packages/core/session/src/index.ts:604-655`）的顺序是：

1. `snapshotJsonValue(data)` 校验并复制。拒绝任何非无损 JSON 的东西（BigInt、`undefined`、`-0`、`NaN`、Map、Date、循环引用……）。
2. `assertSupportedRequestHeader` 对 `request/header` 做额外检查。
3. surface 元数据同样过 `snapshotJsonValue`。
4. 拒绝重入：一次 append 正在发布时不允许再 append。
5. 构造事件对象（`seq: this.log.length`，`time: Date.now()`）并 `deepFreeze`。
6. `surfaceManager.validateNext(event)`：surface 校验发生在**入库之前**，不合法就不会进日志。
7. push 进日志，然后同步派发 `session/event` 通知；观察者的失败被隔离，不影响写入。

`requestHeader()`（`packages/core/session/src/index.ts:670-680`）是增量折叠：每条 header 事件只折一次，读一次的代价是 O(新事件)。返回值被冻结，注释解释道：这是按引用暴露的会话状态，就地改它会让后面每一次与日志的比较都失准，所以宁可让改动抛错。

## `request-header.ts`：三个函数

- `canonicalHeader`（`packages/core/session/src/request-header.ts:21-31`）：空 system、空 tools 规范化为**字段缺席**，与请求实际构造方式对齐。日志、折叠、比较都用这一种表示。
- `headerEquals`（`:44-54`）：逐字段比，`config` 走 `callConfigEquals`，`adapterDefaults` 比两个布尔标记，`system` 直接 `===`，`tools` **按顺序**用 `JSON.stringify` 比每个 schema。
- `foldRequestHeader`（`:65-70`）：扫一遍事件，取最后一个 `request/header` 的 canonical 形式。这是纯离线重建路径；活会话用同一个折叠函数增量维护。

循环只在 header 变化时写事件（`packages/core/agent-loop/src/agent.ts:464-470`）。因此「任何一次请求 = 最新 header + surface 派生消息」是可以从日志离线重建的，这也是 [02 KV-Cache](02-kv-cache.md) 里那套稳定性论证的地基。

## 崩溃修复：`repair.ts`

`interruptedTurnClosers(events)`（`packages/core/session/src/repair.ts:27-133`）扫描开放的 turn / step 和未配对的工具调用，为每个未配对调用合成一条错误 `tool/result`，然后补 `step/end` 和 `turn/end{interrupted}`。两种错误码对应两种情况（`packages/core/session/src/repair.ts:13, 16`）：`TOOL_NOT_STARTED`（assistant 请求了工具，但 harness 还没记录它启动）和 `TOOL_OUTCOME_UNKNOWN`（记录了启动，但结果没落盘）。

后一种给模型的原文如下（`packages/core/session/src/repair.ts:104`）：

> The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. Do not retry blindly.

（这次工具调用在被记录之后中断了，但结果没有可靠落盘，所以它的结局未知。要不要重试，你自己按这个工具的语义判断：只有只读或幂等的操作才能直接重试；可能有副作用的，先去核对外部状态，或者问用户。不要盲目重试。）

这段话是给模型的行为指令，不是给人看的错误信息：它把「不知道刚才那个 `rm` 到底跑没跑」这个事实和处理原则一起交给模型。合成的顺序也有讲究（`packages/core/session/src/repair.ts:89-90, 126-129`）：先关工具调用（provider 会拒绝悬空的 assistant tool call），再关 step，最后关 turn。这个函数只对**冷日志**（从存储里读回来、没有任何进程正在往里写的那种）跑；活跃会话不做静默修复。

## 持久化：什么时候一定落盘

### 抽象与协调器

`SessionPersistence` 是一个抽象类（`packages/session/session-persistence/src/index.ts`），定义 `locate/create/append/load/inspect/prepare/list/...`。真正干活的是 `PersistenceCoordinator`（`packages/session/session-persistence/src/coordinator.ts`），它挂四个监听（`packages/session/session-persistence/src/coordinator.ts:1118-1133`）：`session/created` → 初始化；`session/event` → 把事件 `structuredClone` 一份塞进写队列；`session/flush` → 立即 drain；`session/disposed` → 退役。

写队列是 `SessionWriteBehind`（`packages/session/session-persistence/src/write-behind.ts`）：第一个待写事件启动一个**固定窗口**，后续事件不重置窗口（`packages/session/session-persistence/src/write-behind.ts:43-56`）；到期写一批。默认窗口 200 毫秒（`packages/session/session-persistence/src/coordinator.ts:29-30`）。写失败会保留事件并暂停自动重试，新事件重开窗口，显式 flush 会立刻重试。另外还有一个冷会话准备结果的 LRU，默认 5 个（`packages/session/session-persistence/src/coordinator.ts:26-27`），供「先看历史、再接着 resume」复用。

### 三个语义检查点

**检查点（checkpoint）**在这里指一个「过了这条线，前面的事件必须已经在磁盘上」的语义边界，和数据库里的检查点是同一个意思。「什么时候一定落盘」的真正答案不在协调器里，而在 `session-checkpoint-policy`（`packages/session/session-checkpoint-policy/src/index.ts:63-83`）。整个插件只有三个监听：

```ts
export function apply(ctx: Context): void {
  ctx.on('llm/stream', (options, next): AsyncIterable<StreamChunk> => {
    if (options.sessionId === undefined) return next()
    const session = ctx.sessions.get(options.sessionId)
    return session === undefined ? next() : afterCheckpoint(ctx, session, next)
  })

  ctx.on('tools/execute', async (exec, next): Promise<ToolExecutionResult> => {
    if (exec.agent === undefined || exec.parent !== undefined) return next()
    await ctx.sessions.flush(exec.agent.session)
    if (exec.signal.aborted) return abortedBeforeDispatchResult()
    return next()
  })

  // Before each request, persist everything committed by the preceding step;
  // the first step's call is an intentional no-op beyond any prompt intake.
  ctx.on('agent/pre-step', async ({ agent }, next): Promise<PreStepDecision> => {
    await ctx.sessions.flush(agent.session)
    return next()
  })
}
```

块里那行英文注释说的是：每次请求之前，把上一步已提交的东西全部落盘；第一步的这次调用除了收一下 prompt 之外，故意什么都不做。

翻译成三句话：**发请求前，请求前缀必须已落盘**；**跑顶层工具体之前，那条 `tool/call` 必须已落盘**（如果这期间被取消，返回一个 `TOOL_ABORTED_BEFORE_DISPATCH` 结果而不是真去执行）；**开始下一步之前，上一步产生的一切必须已落盘**。检查点失败是 fail-closed 的：下游适配器和工具体都不会被调用（`packages/session/session-checkpoint-policy/src/index.ts:58-59` 的注释）。嵌套工具调用复用外层已经落盘的那次（`:71` 的 `exec.parent !== undefined` 分支）。

### JSONL 后端

目录布局（`packages/session/session-persistence-jsonl/src/format.ts:147-207`）：`<root>/<projectKey(cwd)>/<encodeSegment(id)>/session.jsonl[.zstd]`。`projectKey` 把 `/`、`\`、`:` 折成 `-`，其它不安全字符转成 `~XXXX`，最后包一层 `--…--`（`packages/session/session-persistence-jsonl/src/format.ts:166`）；没有 cwd 就放进 `_no-cwd`（`packages/session/session-persistence-jsonl/src/format.ts:177`）。

第一行是会话头行（`HeaderLine`，`packages/session/session-persistence-jsonl/src/format.ts:33-44`），带 `type:'session'` 标签好和事件行区分。之后每行要么是一个事件，要么是一个**打包行**。

打包的逻辑在 `packages/core/session/src/chunk-rows.ts`。模块注释给出了动机和实测数字：provider 流回来的是 token 级的 delta，日志里会有几百行 JSON 信封比载荷还大的事件，实测「~56×」（信封大约是载荷的 56 倍，数字实测自一次真实的 DeepSeek 会话）。连续至少 3 个（`MIN_RUN = 3`，`packages/core/session/src/chunk-rows.ts:77`）同块的 delta chunk 打成一行 `text-chunks` / `reasoning-chunks` / `tool-call-chunks`（`packages/core/session/src/chunk-rows.ts:65-67`），时间戳存成差值数组 `dt`。README 与配置注释里给的收益是「~60% smaller logs measured on a real session」（`packages/session/session-persistence-jsonl/src/index.ts:71-76`）（在一次真实会话上实测，日志小了约 60%）。编码器只对完全识别的形状打包，认不出的原样存：「unknown fields or future chunk variants lose compression, never data」（不认识的字段、或者将来才会有的 chunk 变体，丢的是压缩率，绝不会丢数据）。翻译成人话就是：这个优化被设计成永远不会成为「读不回来」的原因，代价最多是文件大一点。读是无条件解包的，日志的可读性不依赖写入时的开关。

压缩默认是 zstd（`packages/session/session-persistence-jsonl/src/index.ts:37-38`），文件名后缀因此是 `.jsonl.zstd`（`packages/session/session-persistence-jsonl/src/format.ts:24-25`）。首帧单独放 header 行（列表页只解首帧就够），之后每个 append 批一帧。一个 root 只允许一种编码。写入时首次物化走「fsync 临时文件 → hard link 发布」，Windows 上走 `MoveFileExW WRITE_THROUGH`（`packages/session/session-persistence-jsonl/src/win32.ts`）。

### SQLite 后端

用 `node:sqlite` 的同步 API。`SCHEMA_VERSION = 15`（`packages/session/session-persistence-sqlite/src/schema.ts:20`），`application_id = 0x44534850`（`:23`），一个防呆措施，避免往不相关的数据库里写。

两张表：`sessions`（`packages/session/session-persistence-sqlite/src/schema.ts:32-46`，一行一个会话的元数据，另加 `incarnation` 和 `revision` 两个本后端自己的字段）和 `events`（`packages/session/session-persistence-sqlite/src/schema.ts:48-60`，一行一个事件，`data` 是 JSON 文本，`source_event_seqs` / `surface_op` 各自 JSON 编码，`ignorable` 是 1 或 null）。

`sessions` 行的**存在本身**就是物化信号（`packages/session/session-persistence-sqlite/src/schema.ts:26-30`）：只有第一次 append 才写这一行，所以「创建了但从没写过」的会话没有行、不出现在 `list` 里，刻意对齐 JSONL 后端「第一次 append 之前没有文件」的行为。journal 默认 `wal`，可选 `delete`/`truncate`/`persist`（网络挂载上 WAL 的共享内存文件不工作），`memory`/`off` 被拒绝，理由写在注释里（`packages/session/session-persistence-sqlite/src/schema.ts:62-70`）：悄悄放弃 journal 持久性就等于悄悄违背这个后端的承诺。这个后端没有独立的 per-session 文件，`locate()` 返回 undefined。

### 两道拒绝闸门

读路径上有两处会拒绝而不是降级：格式版本不符抛 `SessionFormatUnsupportedError`（`packages/session/session-persistence/src/coordinator.ts:55-63`），数据校验失败抛 `SessionPersistenceCorruptionError`（`:36-43`）。前者的诊断信息会带上原始日志的位置（`packages/session/session-persistence/src/coordinator.ts:1069-1075`），因为「没有东西损坏，只是这个 build 读不了」。

未知事件类型的门禁在 `assertEventsSupported`（`packages/session/session-persistence/src/coordinator.ts:1061-1066`）：不在 `KNOWN_SESSION_EVENT_TYPES` 里、又没有 `ignorable` 标记的，直接拒绝解释整条日志，错误信息里会说「它很可能是更新版本的 harness 写的」。

## 派生服务

**`session-projection`**：把「日志 → 某个视图」抽象成三个纯同步函数（`packages/session/session-projection/src/index.ts:42-73`）：`init()` 给空日志的初始状态，`apply(state, event)` 是纯转移（不感兴趣的事件**必须返回同一个引用**，`Object.is` 相等就意味着零下游工作），`view(state)` 出 wire 载荷。每个定义还带一个 `stateVersion`，序列化形状或折叠语义一变就要 bump，好让持久化的旧缓存行被丢弃而不是被错误地继续前推。

**`session-projection-cache`**：把每个投影的 `(ver, seq, val)` 写进 storage 域。这里要说一件容易误导的事：**它和 KV cache 毫无关系**。包头注释（`packages/session/session-projection-cache/src/index.ts:1-12`）说得很明确：它是折叠捷径，永远不是权威；一行可能过时（`seq` 会说明过时多少）但绝不会错，所以每条写路径都是 fail-soft 的，丢一次写只是下次冷读时多重放一段尾巴；`ver` 不匹配就丢弃而不是迁移。名字里的 "cache" 指的是「投影状态的检查点」，不是模型侧的前缀缓存。

**`session-stats`**：全日志折叠出八个数字（`packages/session/session-stats/src/types.ts:22-40`）：`turns` / `steps` / `llmMs` / `toolMs` / `ttftMs` / `ttftSteps` / `decodeMs` / `decodeTokens`。定义都很具体，例如 `turns` 只数「至少有一个已关闭 step」的 turn，被拒绝或空的 turn 不算。

**`session-telemetry`**（含 `-otel`）是捕获侧；`session-telemetry/record` 是一个 **waterfall（瀑布事件）**，也就是 Cordis 的环绕式中间件：每个监听器都要 `await next()` 才轮到下一个，返回值权威（`packages/session/session-telemetry/src/index.ts:43`）。它在这里作为脱敏扩展点，默认没有任何规则。

**`session-title`**：`session/title` 事件带 `{title, messageSeqs, source}`，source 三种（`packages/session/session-title/src/index.ts:48-58`）：`fallback`（截取第一条人类消息，就是上面快照 `seq 6` 那条）、`provider`（模型生成）、`user`（手动改名）。三个策略包分别是：`session-title-llm` 定义共享的 LLM 起名机制（把辅助请求全文记进 `session/title-llm-request` 事件，并用 `purpose: 'session-title'` 让 DeepSeek 适配器关掉 thinking，`packages/session/session-title-llm/src/index.ts:259-262`）、`session-title-first-prompt-llm` 只用第一条人类消息、`session-title-all-prompts-llm` 用全部。

**`session-query`** 家族（`packages/session-query/`）提供跨会话的授权检索：`session-query` 定义可信读、关系查询和搜索操作；`session-query-sqlite` 用 SQLite 全文搜索实现；`session-log-export` 提供 Web `/export`；`tool-session-query` 把这些能力暴露给模型。它与压缩是相互独立的两件事，README 第一句就强调 "independently of compaction"。

另外三个相邻的包：`storage` 是命名后端注册表（JSON / SQLite / 带 zod 校验的 KV 域）；`spill` 把超大工具文本存到会话私有位置、只给模型一个预览加定位符；`attachment` 是图像字节的内容寻址存储，`ImageBlock` 里只放引用。

## fork 与 resume

`SessionStore.fork(source, boundary?)`（`packages/core/session/src/index.ts:1081-1095`）拷贝 `events[0..boundary]` 作为子会话的种子，头部记下 `parentSession` 和 `seedLength`。边界校验有四条（`_forkSeed`，`:1097-1138`）：必须是非负安全整数；必须存在于源日志中；必须与连续的 seq 对应；**边界不能落在一个开放的 turn 里**，否则抛 `OPEN_TURN`。最后一条是硬性的：从一个半截 turn 分叉出去，子会话一开始就是一个 provider 拒绝的消息序列。

种子会话在构造时补一条 `session/end-seed` 标记（`packages/core/session/src/index.ts:544-547`），同时记下 `firstLiveSeq`（`:539`）。两者的区别在注释里讲得很细（`packages/core/session/src/index.ts:456-472`）：`firstLiveSeq` 是**进程内的构造事实**，不持久化；`session/end-seed` 是它在日志里的投影，供读存储历史的消费者使用；而 `header.seedLength` 是**持久的 fork 血缘边界**。已经以该标记结尾的种子不会被重复标记，所以反复打开一个没动过的会话不会让日志变长。

resume 时会发生什么：日志被完整读回（含解包 chunk 行、格式版本与事件类型门禁）；`repair.ts` 给崩溃遗留的开放 turn 补上关闭事件；`deriveMessages()` 从头折叠出模型历史；loop 实例发第一个请求时写 `request/header{reason:'resume'}`（`packages/core/agent-loop/src/agent.ts:465-467`），因为日志里已经有 header 了。如果这次进程的插件组合导致 system 或 tools 与上次不同，这条 resume 快照会与上一条不同：**漂移被记录，但不被阻止**。

## 代价与失效点

1. **`SESSION_FORMAT_VERSION` 一直停在 0，所以升级链从没被真正演练过**（`packages/core/session/src/types.ts:56`）。机制齐全，但零条版本步骤跑在生产日志上；第一次 bump 会是这套代码的首考。判断「什么算结构性变更、该不该 bump」目前完全靠人，注释里那句「When in doubt, bump」（拿不准就往上加）就是承认这一点。它给的理由是：多加一步几乎等价的升级步骤，成本近乎为零；漏加一次，旧 runtime 会把新日志**读错，而且不报错**。
2. **未知事件类型一律拒绝**是安全的默认，代价是：装了插件 A 写的日志，在没装 A 的组合里打不开，除非 A 记得给自己的事件打 `ignorable`。
3. **200ms 写窗口 + 三个检查点**给的是「语义边界处一定持久」，不是「每个事件立刻持久」。在两个检查点之间崩溃，最近一批事件可能丢失，靠 `repair.ts` 补齐一致性，而不是靠数据完整。
4. **`replace` 会遮蔽历史**。surface 是模型视角，不是人的视角；任何直接拿 surface 当 transcript 渲染的消费者，在一次压缩之后就会让用户看见的对话凭空消失。上游的应对是提供 `isAppendSurfaceEvent`（`packages/core/session/src/surface.ts:51-54`），但这是约定，不是强制。
5. **`deriveMessages()` 在 replace 之后整体重建**（`packages/core/session/src/index.ts:730-734`）。一次压缩会让下一次派生的成本回到 O(surface)，而不是 O(新节点)。
6. **`headerEquals` 用 `JSON.stringify` 比工具 schema**（`packages/core/session/src/request-header.ts:34-36`）。语义相同但键序不同的两个 schema 会被判为不等，从而多写一条 `request/header{change}`，也就多一次「前缀可能失效」的假信号。
7. **SQLite 后端没有 busy 超时设置**：在 `packages/session/session-persistence-sqlite/src` 下 grep 不到 `busy_timeout`，也没有重试循环。多进程同时写同一个库时的行为由 `node:sqlite` 的默认值决定。
8. **投影缓存的 fail-soft 是有条件的**：`ver` 不符会丢弃，但如果一个投影改了折叠语义却忘了 bump `stateVersion`，旧行会被继续前推成垃圾；这条靠代码评审，不靠机制。

## 别人怎么做

六家的存储形态差得很远，但可以按一个问题排队：**「分支」是存储模型天生支持的，还是靠拷贝一份日志模拟出来的**。pi 在这一栏走到了最远（日志本身就是一棵树），mini-swe-agent 走到了另一端（连恢复都没有）。Claude Code 那一行来自官方公开文档，其余读自源码。

| harness | 存储形态 | 恢复 / 分支 | 特点 |
| --- | --- | --- | --- |
| **dsh** | JSONL（zstd 分帧 + chunk 打包行）或 SQLite（schema v15，一行一事件），二选一的后端 | resume 走完整重放 + `repair.ts` 补齐；`fork(boundary)` 拷贝前缀，禁止切在开放 turn 内 | 事件溯源；模型可见历史是日志的纯投影；三个语义 flush 检查点 |
| **Codex** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`，支持 `.jsonl.zst`，另有 SQLite 索引 | `New / Resumed / Forked` 三态；`Compacted` 行带 `replacement_history`，恢复时从最后一个压缩点起重放；`ThreadRolledBack` 可回退 N 个 turn | 行类型丰富（`WorldState` 首个全量、之后 merge-patch），恢复后第一个 turn 只发上下文增量 |
| **Claude Code** | `~/.claude/projects/<project>/<session-id>.jsonl`，每行一个消息/工具调用/元数据条目 | `--continue` / `--resume` / `--from-pr`；`--fork-session` 与 `/branch` 复制 transcript 到新 ID | 官方文档明说「条目格式是内部的，版本间会变」；`cleanupPeriodDays` 默认 30 天 |
| **OpenCode** | SQLite（bun:sqlite + drizzle），`session` / `message` / `part` 等表，**每个 part 一行** | `runLoop` 完全基于 DB 重建，中断后重开即可继续；`session/revert.ts` 支持撤销到某条消息 | 文本、推理、工具、step 标记、patch 各自成行，天然支持增量推送给 TUI/Web |
| **pi** | JSONL **追加树**：每个 entry 有 `id` 和 `parentId`，`leaf` 指针标记当前位置 | 分支就是把 leaf 移到更早的 entry；`/tree` 可在树上跳转并自动生成 branch summary；`/fork` | 分支是存储模型的原生能力，不是「复制一份日志」 |
| **mini-swe-agent** | 每步 `finally` 把完整轨迹重写成一个 JSON 文件 | **没有 resume**（`run()` 开头 `self.messages = []`） | 轨迹是给分析/微调/inspector 用的，不是给续跑用的 |

一条可以对照的分野：dsh 和 Codex 都把「压缩」表达成日志里的一等事件（前者是 `compaction/*` 加一条 `replace` 的 `user/message`，后者是 `Compacted` 行带 `replacement_history`），恢复时不需要重新做一次压缩；OpenCode 靠 `filterCompacted` 在读的时候重排消息；pi 则把压缩记成树上的一个 `CompactionEntry`。而 mini-swe-agent 根本没有这个问题，因为它没有压缩也没有恢复。

## 怎么自己核

看一个真实会话的事件类型分布：

```bash
cd sources/checkouts/deepseek-harness
grep -o '^{"type":"[^"]*"' examples/acp-agent/tests/snapshots/bash-tool-turn/session.jsonl | sort | uniq -c | sort -rn
```

数一数哪些行带 surfaceOp（应当只有 `user/message`、`assistant/message`、`tool/result`）：

```bash
grep -c 'surfaceOp' examples/acp-agent/tests/snapshots/bash-tool-turn/session.jsonl
grep 'surfaceOp' examples/acp-agent/tests/snapshots/bash-tool-turn/session.jsonl   | grep -o '^{"type":"[^"]*","seq":[0-9]*'
```

核对本文引用的关键行号：

```bash
sed -n '19,64p'   packages/core/session/src/known-event-types.ts   # 44 个已知事件
sed -n '83,114p'  packages/core/session/src/surface.ts             # deriveEventMessage
sed -n '63,83p'   packages/session/session-checkpoint-policy/src/index.ts  # 三个检查点
sed -n '26,33p'   packages/session/session-persistence/src/coordinator.ts  # 200ms / LRU 5
sed -n '20,23p'   packages/session/session-persistence-sqlite/src/schema.ts
```

相关阅读：请求是怎么从 header + surface 拼出来的见 [04 LLM 层](04-llm-adapter.md)；为什么只追加就自然保住前缀缓存见 [02 KV-Cache](02-kv-cache.md)；`replace` 的两个使用者见 [06 压缩](06-compaction.md)；turn/step 的边界语义见 [03 Agent 循环](03-agent-loop.md)；扩展点机制见 [12 表面与协议](12-surfaces-and-protocols.md)；术语见 [附录 A 词汇表](appendix-a-glossary.md)。

## 自检

**一、压缩要把一大段历史换成一句摘要，为什么做法是往 surface 上追加一条 `replace` 事件，而不是把被压掉的事件删掉？**

因为「模型可见 ⟺ 已记录」是硬不变量：任何进入模型上下文的东西都必须能从日志重建出来。删事件会同时毁掉两样东西。一是离线重建能力，「最新 header + surface 派生消息」这条路走不通了，[02 KV-Cache](02-kv-cache.md) 里那套稳定性论证的地基也跟着塌。二是人的视角，用户已经看过的对话会凭空消失。追加 `replace` 只动模型视角，日志里那些被遮蔽的节点还在，`isAppendSurfaceEvent`（`packages/core/session/src/surface.ts:51-54`）能筛出 append 起源的事件把人看的 transcript 还原出来。代价在失效点第 4、5 条：这只是约定不是强制，谁直接拿 surface 当 transcript 渲染，谁就会在第一次压缩后掉对话；而且 `deriveMessages()` 在 replace 之后要整体重建一次。

**二、崩溃修复为什么必须按「先关工具调用、再关 step、最后关 turn」的顺序？换个顺序会怎样？**

顺序写在 `packages/core/session/src/repair.ts:89-90, 126-129`。真正的约束来自 provider：assistant 消息里声明了一个 tool call，历史里却找不到对应的 tool result，这个消息序列本身就是非法的，发出去直接被拒。所以必须先给每个未配对的调用补上一条错误 `tool/result`，这段历史才重新变成能发的输入；`step/end` 和 `turn/end` 只是结构标记，晚补无所谓。同一条道理解释了 fork 为什么禁止把边界切在开放的 turn 里（`packages/core/session/src/index.ts:1081-1095`）：那样分叉出来的子会话，开局第一个请求就会被 provider 拒绝。

**三、200 毫秒的写窗口意味着崩溃时最近一批事件可能没落盘。为什么这不算数据丢失事故？它在什么情况下会真的咬人？**

因为落盘承诺给的粒度是语义边界，从来没承诺过每个事件都立刻持久。三个检查点（`packages/session/session-checkpoint-policy/src/index.ts:63-83`）卡的是：发请求前请求前缀已落盘、跑顶层工具体之前那条 `tool/call` 已落盘、开始下一步之前上一步产生的一切已落盘。窗口里能丢的只有两个边界之间的过程性事件，绝大多数是 `assistant/chunk`，丢了不影响会话能不能接着跑。咬人的地方是失效点第 3 条说的那句：补回来的是一致性，不是数据。工具真跑完了、结果还没落盘就断电，恢复后模型收到的是 `TOOL_OUTCOME_UNKNOWN`，那个 `rm` 到底执行没执行，日志里没有答案，只能靠模型按上面那段指令去外部核对。
