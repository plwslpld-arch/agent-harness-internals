---
title: Agent Loop：一个 turn 里到底发生了什么
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/core/agent-loop/src/tool-calls.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/core/agent/src/runtime-types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# Agent Loop：一个 turn 里到底发生了什么

*这一篇讲给想改 agent 行为、调工具并发策略、或者要往循环里挂插件的人。读完你能回答：一次用户提问在日志里留下哪些事件、工具什么时候并行什么时候串行、按下取消之后日志为什么还是完整的。*

你大概以为 agent loop 就是一个 while 循环：发请求、拿工具调用、执行、再发。dsh 的循环有两层，turn 管一次用户提问，step 管一次模型调用，两层中间还夹着一个队列，用户那句话得先排队、再被「领取」，才有资格进模型历史。

更别扭的一处在工具那段：并发上限默认 10，工具体确实重叠在跑，但 `tool/result` 落盘的顺序被一个游标钉死成模型给出调用的顺序，第 2 个先跑完也得等第 1 个。多花的这段等待买到了什么，答案在取消和重放上。

## 先看见：一条真实的会话日志

dsh 的上游仓库里存了一批端到端快照，每个快照是一个跑得起来的 ACP 会话（ACP 是 dsh 对外的一种 stdio JSON-RPC 协议表面，见 [12 产品表面与协议](12-surfaces-and-protocols.md)），产物包括完整的 session 日志（会话事件日志，一条一行往后追加，模型看到的历史就是从它投影出来的）。这批快照分两类，`recorded` 这个布尔量决定是哪一类（`packages/test-support/acp-snapshot/src/suite.ts:87`）：`recorded: true` 的会被 `test:snapshot:record` 拿真 API 重录，`recorded: false` 的是**手写或手工采集**的 fixture，永不重录，用于那些活模型不肯稳定复现的场景（provider 错误、取消、脚本化的重复动作）。commit 47f9438 上是 38 比 40。

下面这个 `parallel-tool-calls` 属于后者（`examples/acp-agent/tests/acp.snapshot.ts:175-179`），所以别把它的 usage 数字（模型返回的 token 用量）当真实计量看；**它作为「事件顺序长什么样」的证据是可信的**，因为回放同样要过 session 层的全部校验。我把每行的 `type` 和关键字段抽出来，把 `assistant/chunk`（两个 step 一共 13 条流式碎片）折叠成了一行：

```text
session          {"cwd":"…","delegationDepth":0}
agent/inbox/spliced  seq 0  {"target":"next-turn","start":0,"inserted":[<用户那句话>]}
turn/start       seq 1  {"turn":1}
agent/inbox/spliced  seq 2  {"target":"next-turn","start":0,"removedCount":1,"inserted":[]}
step/start       seq 3  {"turn":1,"step":1}
user/message     seq 4  "Use the read tool twice in the same assistant message: read a.txt and b.txt. Then reply DONE."
user/message     seq 5  "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.…"
session/title    seq 6
request/header   seq 7  {"header":{"config":{"provider":"deepseek-official","model":"deepseek-v4-flash"},…},"reason":"initial"}
request/context  seq 8  {"provider":"deepseek-official","model":"deepseek-v4-flash"}
assistant/chunk  seq 9…16
assistant/message seq 17 两个 tool-call 块，sourceEventSeqs=[9,…,16]
tool/call        seq 18 {"callId":"call_read_a","name":"read","arguments":"{\"file_path\":\"a.txt\"}"}
tool/call        seq 19 {"callId":"call_read_b",…}
tool/result      seq 20 sourceEventSeqs=[18]
tool/result      seq 21 sourceEventSeqs=[19]
step/end         seq 22 {"turn":1,"step":1}
step/start       seq 23 {"turn":1,"step":2}
assistant/chunk  seq 24…28
assistant/message seq 29 纯文本 "DONE"
step/end         seq 30
turn/end         seq 31 {"turn":1,"reason":{"kind":"completed"}}
```

块里的两句英文都是模型真会读到的字节。seq 4 是用户那句话，「Use the read tool twice in the same assistant message: read a.txt and b.txt. Then reply DONE.」（在同一条 assistant 消息里调两次 read 工具，读 a.txt 和 b.txt，然后回一句 DONE），这句是故意写成这样，逼模型一次发出两个工具调用。seq 5 开头那句「Current runtime context. This snapshot supersedes earlier runtime-context snapshots.」（当前运行时上下文。这份快照作废先前所有的运行时上下文快照）不是用户写的，是系统追加的；`supersedes` 那半句是写给模型的行为指令，告诉它前面见过的旧快照一律别再当真。

事件名也值得先认一遍：`spliced` 是「队列被改动了」（插入或删除都算），`claimed` 是「这一步把消息领走了」，`reason":"initial"` 是「这个循环实例第一次写请求头」，`reason":{"kind":"completed"}` 是「turn 正常收尾」。

原文在 `examples/acp-agent/tests/snapshots/parallel-tool-calls/session.jsonl`（快照默认跑在 `danger-full-access` 模式下，所以 seq 5 那条运行时上下文写的是「沙箱不限制文件修改」）。

有几件事后面整篇都在解释：

- **turn 和 step 不是一回事。** 一次用户提问开一个 turn（`turn/start` → `turn/end`），turn 内部每次真正打模型 API 开一个 step（`step/start` → `step/end`）。上面这次是 1 个 turn、2 个 step。
- **用户那句话出现了两次**：一次在 `agent/inbox/spliced`（进队列），一次在 `user/message`（进历史）。中间隔着 `turn/start`：排队和进历史是两个动作，中间有一个可以被插件否决的关口。
- **多出来的 seq 5** 不是用户写的。它是运行时上下文快照，由系统提示装配器渲染成一条 plugin 来源的 user 消息追加进历史。沙箱模式、审批策略、当前时间这些「会变的策略」都从这里进模型，而不是改 system prompt。这就是 dsh 保住 KV 前缀的手法，见 [02 KV-Cache](02-kv-cache.md)。
- **`request/header` 只出现了一次**，`reason` 是 `initial`。第二个 step 没有再写。它不是每次请求都记，只在首次和变化时记。
- **`sourceEventSeqs` 把结果指回原因**：`assistant/message` 指回它的全部 chunk，`tool/result` 指回它的 `tool/call`。

## 文本时序图：一个含工具调用的 turn

下面这张图的每个事件名和方法名都来自源码，不是示意。竖线从左到右是：调用方 → Agent 的 inbox（收件箱，一个 agent 唯一的输入队列，所有外部消息先进这里排队）→ 驱动器 `ReactLoopAgent`（driver，真正跑 turn/step 两层循环的那个对象）→ 插件监听器 → 系统提示装配 → LLM → 工具运行时 → session 日志。

```text
调用方        inbox          ReactLoopAgent            插件            systemPrompt     LLM     ToolRuntime   日志
 │ followup(m)  │
 │────────────►│ splice('next-turn', …)
 │             │  append agent/inbox/spliced ─────────────────────────────────────────────────────────► [agent/inbox/spliced]
 │             │  emit agent/inbox/inserted ──────────────► UI
 │             │  wakeDriver(): idle → setPhase(running) → emit agent/status{running}
 │             │              │ kick(): while (await this.turn()) {}
 │             │              │  append turn/start {turn:1} ────────────────────────────────────────► [turn/start]
 │             │◄─ claim('next-turn', 1)：取走全部 next-step + 一条 next-turn
 │             │  append agent/inbox/spliced（纯删除） + emit agent/inbox/claimed ────────────────────► [agent/inbox/spliced]
 │             │              │  systemPrompt.assemble(assembleContextFor(this, signal))
 │             │              │  renderContextSections(assembly) → runtimeContext.project(...)
 │             │              │      → 文本与上次保留的快照不同时，才产出一条 plugin 来源 UserMessage
 │             │              │  waterfall agent/pre-step {messages, turn, step, signal} ──► compaction / hooks / plan-mode / skill …
 │             │              │◄─ {kind:'enter', messages:[m, ctxSnapshot?]}  或  {kind:'reject'}
 │             │              │  append step/start {turn:1, step:1} ───────────────────────────────► [step/start]
 │             │              │  每条 message: append user/message (surfaceOp:'append') ───────────► [user/message]
 │             │              │  step(): system = renderPrompt(assembly)
 │             │              │  buildRequest(): waterfall agent/request → llm.prepareCall()
 │             │              │     append request/header {reason:'initial'|'resume'|'change'}（仅首次/变化）► [request/header]
 │             │              │     append request/context {provider,model,contextWindow}（仅变化）──► [request/context]
 │             │              │  preparedCall.stream(request) ─────────────────────────────► LLM
 │             │              │◄─ chunk*：每个 append assistant/chunk 并记下 seq ─────────────────► [assistant/chunk]*
 │             │              │  assembler.finish.kind === 'stop' 且含 tool-call
 │             │              │  append assistant/message (sourceEventSeqs = 全部 chunk seq) ──────► [assistant/message]
 │             │              │  executeToolCalls(): parseArguments → executionMode() 分组
 │             │              │     startCall(i): append tool/call {callId,name,arguments 原始串} ──► [tool/call]
 │             │              │        TOOL_RUNTIME_SCHEDULER.prepare(exec)：pre-execute + guard（按模型顺序串行）
 │             │              │        TOOL_RUNTIME_SCHEDULER.dispatch(exec)：tools/execute + 工具体（这里才并发）
 │             │              │     commitReady(): 只提交连续就绪的槽位
 │             │              │        finalize()/finish() → tools/post-execute → finalizeContent → emit tools/result
 │             │              │        append tool/result (sourceEventSeqs=[callSeq]) ─────────────► [tool/result]
 │             │              │        additionalContexts → inbox.splice('next-step', …)
 │             │              │  step() 返回 null（本 step 没有结束原因）
 │             │              │  append step/end {turn:1, step:1} ─────────────────────────────────► [step/end]
 │             │              │  target = 'next-step' → 回到 preStep，开 step 2 …
 │             │              │  模型纯文本收尾 → step 返回 {kind:'completed'}
 │             │              │  inbox.nextStep 为空 → serial agent/turn-stopping ──► hooks 的 Stop 可在此 steer 逼出下一步
 │             │              │  仍为空 → break
 │             │              │  append turn/end {turn:1, reason:{kind:'completed'}} ───────────────► [turn/end]
 │             │              │  inbox 无待处理 → kick() 的 finally: setPhase(idle) → emit agent/status{idle}
```

图里几个英文动词按出现顺序讲一遍。`splice` 是往队列里插一段或删一段，它同时落一条持久事件和一条给 UI 的通知，两者名字不同（`agent/inbox/spliced` 进日志，`agent/inbox/inserted` 只发给界面）。`wakeDriver` 是「把驱动器叫醒」，闲着的驱动器被叫醒后才开始 `kick()`，也就是那行 `while (await this.turn()) {}`。`claim` 是「领取」，一次 step 开头从队列里取走属于自己的那批消息，取走这个动作本身也要写进日志。`assemble` 是把十几个插件各自贡献的 prompt 段落排序拼成一份系统提示，`project` 是把当前运行时状态渲染成一份快照并判断「跟上次比变了没有」，没变就什么都不产出。

`waterfall`（瀑布事件）是 Cordis 的环绕式中间件：监听器必须 `await next()` 才轮得到下一个，返回值权威，谁改了就是谁说了算。图里 `agent/pre-step` 和 `agent/request` 都是这种，插件想在模型看见东西之前动手脚，只有这一条路。

图最下面那几行是收尾：`serial` 是「所有监听器依次跑完、没有短路」，`agent/turn-stopping` 用它给插件最后一次机会把 turn 拖住；都不拖就 `break`，写 `turn/end`，驱动器在 `finally` 里翻回 idle。

## Phase：只有三种状态，对外只露两种

驱动器的全部状态是一个三元联合（`packages/core/agent-loop/src/agent.ts:38-46`）：

```ts
type Phase =
  | { kind: 'idle'; lastTurn: number }
  | {
    kind: 'maintenance'
    abort: AbortController
    lastTurn: number
    wakeRequested: boolean
  }
  | { kind: 'running'; abort: AbortController; turn: number; step: number; wakeRequested: boolean }
```

三个分支的字段名直译一下：`kind` 是「当前处在哪一态」，`lastTurn` 是「上一个 turn 的编号」，`turn` / `step` 是「正在跑第几个 turn、第几个 step」，`wakeRequested` 是「有人想叫醒我但没送进去」的闩锁。`abort` 是一个 `AbortController`，Web 标准里的取消把手：它身上的 `signal` 会一路传给 pre-step、模型请求和每个工具，一处 abort，全链路同时收到。只有 idle 态没有 `abort`，因为闲着的驱动器没有什么可取消的。

对外的 `status` 只有 `idle | running` 两态，`maintenance` 对外报 `idle`（`agent.ts:99-101`）。`maintenance` 是「不属于任何 turn 的后台工作」用的相位。`runMaintenance(job)`（`agent.ts:142-162`）先把相位翻过去，跑完在 `finally` 里翻回 `idle`，并且如果期间有人想唤醒，就在这时补一次 `wakeDriver()`。compaction 之类的整理工作走这条路，见 [06 Compaction](06-compaction.md)。

构造时的 turn 号不是从 0 开始猜的，是从日志里倒查出来的：`session.events.findLast(event => event.type === 'turn/start')?.data.turn ?? 0`（`agent.ts:92`）。所以 resume 一个会话，turn 编号接着数，不会撞号。

## 三种输入：`followup`、`steer`、`inject`

三个方法其实是同一个原语的三种参数组合（`agent.ts:113-132`）：

```ts
  send(message: UserMessage, target: InboxTarget, wakeup: boolean): void {
    // Waking input cannot join an aborted activity, so it starts the next turn.
    // Captured before the insertion so a reentrant cancel from a splice observer cannot reclassify it.
    const wakingAfterAbort = wakeup && this.phase.kind !== 'idle' && this.phase.abort.signal.aborted
    const resolvedTarget = wakingAfterAbort ? 'next-turn' : target
    this.inbox.splice(resolvedTarget, Infinity, 0, [message])
    if (wakeup) this.wakeDriver(wakingAfterAbort)
  }
```

块里两行英文注释是这段代码的全部理由。第一行说：会唤醒的输入不能加入一个已经被取消的活动，所以它改去开下一个 turn。第二行说：这个判断在把消息插进队列**之前**就算好，这样即使某个 splice 观察者在插入过程中重入触发了取消，也改不了它的分类。翻译成人话就是，`target` 是调用方的意愿，`resolvedTarget` 是系统核对现实之后的裁定，两者可以不一样。

| 方法 | target | wakeup | 语义 |
| --- | --- | --- | --- |
| `followup(m)` | `next-turn` | `true` | 排一个独立的 turn，并唤醒驱动器 |
| `steer(m)` | `next-step` | `true` | 塞进最近的 step 边界，并唤醒 |
| `inject(m)` | `next-step` | `false` | 塞进最近的 step 边界，但**不**唤醒（agent 闲着时就一直躺着，等别的输入把它带走） |

`inject` 的「不唤醒」是有用的：技能目录、AGENTS.md 内容、后台任务完成通知这类东西希望「下次有活干的时候顺带带上」，而不是自己把 agent 叫醒。`tool-jobs` 就是这么用的：后台任务完成时，只有在「这条通知本来就要唤醒」「owner 正闲着」「而且这个 owner 的唤醒配额还没用完」三个条件同时成立时才 `followup`，否则一律 `inject`（`packages/jobs/tool-jobs/src/index.ts:293-299`）。那个 `wakeBudget` 是防止一堆任务同时完成、把 agent 反复叫醒。

`send` 里那行 `wakingAfterAbort` 是个容易忽略的细节：一条唤醒型输入如果到达时当前 turn 已经被 abort（但还没收敛完），它会被**改判**成 `next-turn`，不能让新输入加入一个已经被放弃的 turn。而且这个判断在插入 inbox **之前**就算好，防止某个同步的 `session/event` 观察者在插入过程中重入取消，把分类改掉。

`cancel` 默认会清空 inbox（`agent.ts:134-140`）：

```ts
  cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
    if (!options.keepInbox) {
      this.inbox.clear()
      if (this.phase.kind !== 'idle') this.phase.wakeRequested = false
    }
    if (this.phase.kind !== 'idle') this.phase.abort.abort(cause)
  }
```

`keepInbox: true` 是「只打断当前这一 turn，排队的东西留着」，`interrupt_agent` 工具对子 agent 用的就是这个。取消原因 `AgentCancelCause` 是封闭的四种：`user | parent | hook{reason} | disposed`（`packages/core/session/src/types.ts:143-148`）。

`wakeRequested` 是个闩锁（`agent.ts:172-193`）。当唤醒到来时驱动器正在 maintenance、或者当前 turn 已 abort 尚未收敛，唤醒送不进去，就把标志位闩住，等 `kick()` 的 `finally`（`agent.ts:215-222`）或 maintenance 结束时重放。唯一不闩的情况是取消原因为 `disposed`：正在拆卸的 agent 不该被自己叫醒。

每个 turn 结束时会换一个新的 `AbortController`（`agent.ts:325-327`），并顺手把旧闩锁清掉。所以「取消」的粒度天然是一个 turn，工具调用、pre-step、模型请求收到的都是同一个 signal。

## `turn()`：从 `turn/start` 到 `turn/end`

`turn()` 的骨架（`agent.ts:246-330`）是一个 while 循环，每圈跑一个 step：

```ts
        const decision = await this.preStep(target, { turn, step })
        if (decision.kind === 'reject') {
          turnEnds = { kind: 'blocked' }
          return false
        }
        if (turnEnds && decision.messages.length === 0) break
        // A removed waking message or an enter decision rewritten to empty
        // still owns the initial turn boundary, but it spends no model call.
        if (phase.step === 0 && decision.messages.length === 0) {
          turnEnds = { kind: 'completed' }
          return false
        }
        signal.throwIfAborted()
        this.session.append('step/start', { turn, step })
```

`preStep` 返回的 `decision` 只有两种：`enter` 表示「这一步可以进行，带上这些消息」，`reject` 表示「别进了」。块里那两行英文注释解释的是中间那个古怪分支：一条被移除的唤醒消息，或者一个被插件改写成空的 `enter` 决定，仍然占着这个 turn 的开头边界，但它不花任何一次模型调用。翻译成人话就是，turn 编号已经发出去了、`turn/start` 已经落盘了，这时候消息没了也不能装作这个 turn 没存在过，只能让它空手收摊。

几个后果：

- `agent/pre-step` 返回 `reject` 会留下一个「有 `turn/start` 紧跟 `turn/end`、中间没有任何 step」的 turn，结束原因是 `blocked`。hooks 的 `UserPromptSubmit` 拒绝就长这样。被领取的消息**不会**退回 inbox，也不会写成 `user/message`，它就到此为止了。
- 第一个 step 如果领到空消息，直接 `completed`，不花模型调用。
- `max-tokens` 是粘性的（`agent.ts:287-290`）：一旦某个 step 撞到输出上限，后面正常完成的 step 也不能把 turn 的结局降级回 `completed`。
- `step/end` 写在 `finally` 里（`agent.ts:291-293`），`turn/end` 也写在 `finally` 里（`agent.ts:316-323`）。不管是抛错还是取消，边界事件都不会悬空。

turn 结束前有一个专门的关口（`agent.ts:295-299`）：

```ts
        if (turnEnds && this.inbox.nextStep.length === 0) {
          await this.dispatch.serial('agent/turn-stopping', { turn, signal })
          signal.throwIfAborted()
        }
        if (turnEnds && this.inbox.nextStep.length === 0) break
```

注意它查了两次 `inbox.nextStep`。`agent/turn-stopping` 是 serial 模式（所有监听器都跑，没有短路），监听器如果不同意结束，就调 `agent.steer(...)` 往 next-step 队列里塞东西，驱动器**再读一次**队列，发现非空就继续下一个 step。Claude Code 方言的 `Stop` hook 就是这么实现的：它 steer 一句 `continue: blocked by Stop hook`（意思是「继续干，这次收尾被 Stop 钩子拦下了」）。这个设计的好处是「数据说了算」：监听器的注册顺序不影响结果。

`TurnEndReason` 是可合并扩展的联合（`packages/core/session/src/types.ts:155-177`）：`completed | aborted{reason} | blocked | error{error} | max-tokens | interrupted`。最后一个 `interrupted` 循环本身从不产生，它只由持久化后端在重载时给崩溃遗留的半截 turn 补上。

## `preStep()` 与运行时上下文快照

`preStep`（`agent.ts:225-243`）是每个 step 开头做的四件事：领取 inbox、装配系统提示、投影运行时上下文、跑 `agent/pre-step` waterfall。

```ts
    const claimed = this.inbox.claim(target, position.turn)
    const assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))
    signal.throwIfAborted()
    const sections = renderContextSections(assembly)
    const context = this.runtimeContext.project(joinContextSections(sections), sections)
```

`inbox.claim(target, turn)`（`packages/core/agent/src/inbox.ts:71-77`）拿走**全部** next-step，外加（当 target 是 `next-turn` 时）**一条** next-turn。它写的持久事件是纯删除的 splice，另外对每条消息发 `agent/inbox/claimed`。

**系统提示和工具 schema 是每个 step 重新装配的**，不是每个 turn 一次。这条对缓存影响很大，后面「代价」一节再说。

`runtimeContext.project(...)` 是 dsh 的一个关键手法（`packages/core/agent-loop/src/runtime-context.ts:64-75`）：

```ts
  project(current: string, sections: readonly ContextSnapshotSection[]): UserMessage | undefined {
    if (this.retained === undefined && current.length === 0) return
    const snapshot = current.length === 0 ? CLEARED : current
    if (this.retained?.text === snapshot) return
    return createUserMessage({
      content: [{ type: 'text', text: snapshot }],
      // The cleared marker has no contributions left to attribute.
      source: sections.length === 0
        ? { kind: 'plugin', plugin: SOURCE }
        : { kind: 'plugin', plugin: SOURCE, form: 'snapshot', sections },
    })
  }
```

块里那行英文注释说的是：清空标记已经没有任何贡献者可以归属了。所以走 `sections.length === 0` 分支时，`source` 里只留一个插件名，不带 `form` 和 `sections` 这些出处字段。这不是省事，是因为「所有上下文都没了」这条消息确实没有来源可写。

只有当渲染出来的文本与「上一条还留在历史表面上的快照」不同，才产生新消息。全部清空时写一句固定的 `Current runtime context: none. Earlier runtime-context snapshots no longer apply.`（`runtime-context.ts:13`，意思是「当前运行时上下文：没有。先前的运行时上下文快照一律失效」）。这个投影的状态不是内存里攒的：构造时从日志倒查，之后订阅 `session/event` 跟随权威事件（`runtime-context.ts:34-56`），所以 resume 后判断依然正确。

它产出的是一条 **user 角色**的消息，`source.kind` 是 `plugin`，既不污染 system prompt 的稳定前缀，也不会被当成用户说的话。合成文本的开头是 `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.`，也就是「当前运行时上下文。这份快照作废先前所有的运行时上下文快照」（`packages/core/system-prompt/src/index.ts:236-240`），正是前面日志里 seq 5 的样子。

## `step()`：一次模型调用的全过程

`step()`（`agent.ts:332-401`）是整个循环里唯一会打模型的地方。它的外层是一个 `while (true)`，存在的唯一理由是请求失败重试：

```ts
      const finish = assembler.finish
      if (finish.kind === 'error' || finish.kind === 'aborted') {
        const action = await this.dispatch.waterfall(
          'agent/request-error', {
            turn,
            step,
            provider: request.provider,
            failure: finish.failure,
            retryPolicy: preparedCall?.retryPolicy,
            signal,
          },
          () => Promise.resolve<RequestErrorAction>(undefined),
        )
        signal.throwIfAborted()
        if (action?.kind !== 'retry') {
          throw new LlmError(finish.failure.message, finish.failure.code, finish.failure)
        }
        continue
      }
```

读法是这样：`assembler.finish` 是这条流的结局，`error` 是请求失败，`aborted` 是被取消。两种结局都先问一次 `agent/request-error` 这个 waterfall，问的内容包括是哪个 provider、失败详情、以及适配器给出的重试策略。默认回答是 `undefined`（没人管），于是抛 `LlmError`；只有当某个监听器回一个 `{kind:'retry'}`，代码才走到最后那行 `continue`，回到 `while (true)` 的开头重新发一次。

**重试是 `continue`，不是新开 step。** 也就是说一个 `step/start`/`step/end` 之间可能有多次 `llm/stream` 调用和多组 `assistant/chunk`；日志里不会因为退避重试而多出 step。`dsh-llm-retry`（退避重试）和 `dsh-compaction-basic`（上下文溢出后压缩再试）都挂在这个 waterfall 上。

流式部分很朴素但有讲究（`agent.ts:347-351`）：

```ts
      for await (const chunk of stream) {
        signal.throwIfAborted()
        chunkSeqs.push(this.session.append('assistant/chunk', { turn, step, chunk }).seq)
        assembler.push(chunk)
      }
```

每个 chunk 都落盘，并记下它的 seq；等 `BlockAssembler` 拼完，一次性写一条 `assistant/message`，`sourceEventSeqs` 就是刚才那一串 chunk seq（`agent.ts:381-390`）。**每次成功的模型调用恰好一个 `assistant/message` 锚点**，包括内容为空的和撞了 max-tokens 的。

收尾三种：

```ts
      if (finish.kind === 'max-tokens') return { kind: 'max-tokens' }

      const toolCalls = message.content.filter(block => block.type === 'tool-call')
      if (toolCalls.length === 0) return { kind: 'completed' }
      const { concluded } = await executeToolCalls(
        this.loopCtx, turn, step, toolCalls, signal,
        context => this.inbox.splice('next-step', this.inbox.nextStep.length, 0, [context]),
      )
      return concluded ? { kind: 'completed' } : null
```

第一行要单独说：**撞到 max-tokens 时，这一步里的工具调用不执行**（`agent.ts:391`）。模型可能已经吐出了半个工具调用块，循环选择不碰它，把结局交给 compaction 或重试插件。

返回 `null` 表示「本 step 没有得出结束原因」，turn 继续开下一个 step。`concluded` 来自工具结果上的 `concludesTurn` 标志；默认组合里只有子 agent 的结构化输出捕获工具会设它。

### 一个常见误读：工具结果**不**走 inbox

看到上面那句 `this.inbox.splice('next-step', …)` 紧挨着 `executeToolCalls`，很容易得出「工具结果被塞进下一 step 的 inbox」这个结论。它是错的，而且会把你对日志的理解整个带偏。

看清楚那个参数是什么：`executeToolCalls` 的最后一个参数叫 `acceptContext`，它接收的是 `result.additionalContexts`，**只有这些「附加上下文」进 next-step inbox**。工具结果本身走完全不同的路：`appendToolResult`（`packages/core/agent-loop/src/tool-calls.ts:268-289`）把它写成 `tool/result` 事件，带 `surfaceOp: 'append'`，于是它直接成为派生历史的一部分。

派生历史 `session.deriveMessages()`（`packages/core/session/src/index.ts:726`）只认三种表面事件：`user/message | assistant/message | tool/result`（`packages/core/session/src/types.ts:343-346`）。surface（表面）是事件日志的一个子视图，只有这三种事件能进去，模型历史就从这个子视图折叠出来；`surfaceOp` 是写事件时必须交代的一句话：这条事件对表面做的是追加还是替换。`tool/result` 就在这个名单里。所以下一个 step 的请求里，工具结果是以 tool 消息的身份出现的，位置紧跟在它的 `assistant/message` 后面；而 `additionalContexts`（例如 `repeat-tool-reminder` 的提醒、`spill-policy` 的定位符、`agent-instructions` 发现的工作区说明）是以额外的 `user/message` 身份，在下一个 step 的 `step/start` 之后才写进历史。两者在日志里的位置、角色、写入时机都不同。

## `buildRequest()`：请求怎么拼出来

`buildRequest`（`agent.ts:407-495`）是「模型到底收到什么」的最后一站。

**配置从哪来。** 第一次请求用 agent 自己声明的路由（provider/model/maxTokens），外加一个条件：只有当持久化的 header 路由与本 agent 完全一致、并且那个 `reasoningEffort` 不是适配器默认填的，才继承它（`agent.ts:419-437`）。之后每次都用 `requestProposal(persistedHeader)`：把适配器默认的字段摘掉，让适配器重新物化（`agent.ts:54-61`）。

**`agent/request` 是切模型的唯一入口**（`agent.ts:438-441`）。它是 waterfall，返回值整体替换 `LlmCallConfig`。它明确不能改 messages：模型可见内容必须走有日志的通道。

**`prepareCall` 绑定适配器**（`agent.ts:449`）。如果抛 `NO_ADAPTER`，就保留提案继续走，让中间件接管（`agent.ts:451-455`），中间件可以服务一个没注册适配器的路由。

**header 与 context 的去重写入**（`agent.ts:458-483`）：

```ts
    const baseline = this.session.requestHeader()
    if (!this.requestHeaderLogged) {
      this.session.append('request/header', { header, reason: baseline === undefined ? 'initial' : 'resume' })
      this.requestHeaderLogged = true
    } else if (baseline === undefined || !headerEquals(baseline, header)) {
      this.session.append('request/header', { header, reason: 'change' })
    }
```

三种 `reason` 的含义是精确的：`initial` = 这个 loop 实例第一次写且日志里之前没有 header；`resume` = 这个实例第一次写但日志里已经有（说明是恢复的会话）；`change` = 同一实例内 header 变了。`request/context` 只在 provider/model/contextWindow 三者任一变化时写。这解释了前面日志里「第二个 step 没有 `request/header`」，不是漏了，是没变。

**最后一步是冻结加打标**（`agent.ts:486-493`）：

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

`markAgentLoopRequest` 不是装饰。agent-loop 包另外发布了一个校验插件（`packages/core/agent-loop/src/invariant.ts:19-55`），它以 `prepend + global` 的方式挂在 `llm/stream` 上（排在所有其它监听器之前、对所有 scope 生效；scope 是按 agent 隔离的注册作用域，一个注册要么是全局的、每个 agent 都看得见，要么只属于某一个 agent），对每个带标记的请求核对：对象已冻结、带活的 sessionId、`messages` 数组已冻结、日志里有 `step/start`、有 `request/header`，并且

```ts
    const expected = session.deriveMessages()
    if (JSON.stringify(options.messages) !== JSON.stringify(expected)) {
      fail(`llm request for session "${String(session.id)}" diverges from the dispatch-time durable derivation (log-reconstruction desync)`)
    }
```

那句报错文本直译是「会话 X 的 llm 请求，与派发时刻从日志推导出来的结果不一致（日志重建失谐）」。翻译成人话就是：这一步发给模型的 `messages`，跟「现在拿日志重放一遍应该得到的 `messages`」逐字节比对，对不上就当场炸。

也就是说「模型看到的 ⟺ 日志里能重建出来的」在 dsh 里被写成了一条可执行的断言，不只是文档承诺。

但这里要打个折，别把它当成生产环境的护栏：这个校验插件挂在可选的 `dsh-invariants` 服务上，而**出厂的 `dsh` 配置一个 invariant 都不挂**。2026-08-03 的一条设计记录明确做了这个决定（`.agents/notes/implemented/simplification/2026-08-03-omit-invariants-from-shipped-config.md:13`），理由是 TUI 和 Web 两个表面当时挂得不一致，而且一次断言失败会直接终止普通用户的一次运行。所以它真正生效的场合是测试、示例组合和自建的开发组合。上游的 `docs/architecture.md:96` 写着「a runtime invariant asserts it」（意思是「有一条运行时断言在保证这件事」），读的时候要补上这个前提。

一直生效的是另一件事：写入侧的强制。surface 事件不带 `surfaceOp` 会当场抛，`sourceEventSeqs` 覆盖不全会当场抛（见 [05 Session](05-session.md)）。断言只是在开发时多加一道复核。本文之所以能拿快照日志当「模型看到什么」的证据用，靠的是快照测试本身跑在开着 invariant 的组合里。

## 工具调度：屏障、滚动池、按模型顺序提交

`executeToolCalls`（`packages/core/agent-loop/src/tool-calls.ts:59-101`）先把每个 tool-call 块解析成一个 `PlannedCall`，然后按「分组」推进：

```ts
    const first = planned[next]!
    const mode = ctx.tools.executionMode(first.exec).kind
    const group = mode === 'parallel' ? planned.slice(next) : [first]
```

规则很简单：从当前位置看第一个调用，如果它是 `parallel`，就把**它之后的全部**调用作为候选组交给 `runGroup`；否则它自己单独成组，形成一个屏障。`runGroup` 返回它实际消耗了几个，外层往前推。

分类是 fail-closed 的（`packages/core/tools/src/index.ts:1276-1285`）：只有工具声明了 `isConcurrencySafe(args)` 且返回**恰好 `true`** 才是 parallel；未声明、返回别的、抛异常、工具根本不存在，一律 exclusive。全仓库里 opt-in 的只有 `read`、`read_image`、`web_search`、`web_fetch`、`subagent`（`subagent_fork` 是同一个包的第二个实例），以及可选包里的 session-query 三个只读工具。`bash`、`write`、`edit`、`glob`、`grep`、`todo_write` 都是 exclusive。

组内是**有界滚动池**（`tool-calls.ts:198-213`）：

```ts
  const fillPool = async (): Promise<void> => {
    while (!aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls) {
      // Re-read later modes after ordered commits so registry changes can create a barrier.
      // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded by the loop condition
      const nextCall = group[nextToStart]!
      if (nextToStart > 0 && mode === 'parallel'
        && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel') break
      await startCall(nextToStart)
      nextToStart++
      throwSchedulerFailure()
      await commitReady()
      throwSchedulerFailure()
      // Abort may arrive while pre-execute awaits.
      if (signal.aborted) aborted = true
    }
  }
```

块里三行注释各管一件事。第一行：在有序提交之后重新读一遍后面那些调用的模式，这样注册表的变化就能造出一个屏障。第二行是给 lint 的豁免声明，`!` 这个非空断言由循环条件保证成立，不是偷懒。第三行：pre-execute 在 await 的时候，取消可能刚好到达，所以每轮补池都要重新看一眼 `signal.aborted`。

注意中间那个 `break`：**每个调用在启动前都会重新分类一次**。如果前面的工具执行过程中改了注册表（比如某个插件动态注册/限制了工具），后面的调用会当场变成屏障，当前池先排空。上限 `maxParallelToolCalls` 是通过 getter 每组读一次的（`packages/core/agent-loop/src/index.ts:331-333`），默认 10（`packages/core/agent-loop/src/constants.ts:6`），设成 `1` 就是完全串行；改设置只影响下一组，不打扰在飞的这一组。

三阶段拆分是这套调度的核心。`startCall`（`tool-calls.ts:164-196`）先 `appendToolCall`（**`tool/call` 在 pre-execute 之前就落盘**），再 `await scheduler.prepare(exec)`；因为 `startCall` 是被 `fillPool` 顺序 await 的，所以 `tools/pre-execute` 和 guard 是**按模型顺序串行**的。只有 `dispatch` 分支的工具体才进 `inFlight` 并发。

提交同样是模型顺序（`tool-calls.ts:146-160`）：

```ts
  const commitReady = async (): Promise<void> => {
    while (committed < group.length) {
      const slot = slots[committed]
      if (slot === undefined) break
      const call = group[committed]
      const result = slot.needsPost
        ? await ctx.tools[TOOL_RUNTIME_SCHEDULER].finalize(slot.exec, slot.result)
        : ctx.tools[TOOL_RUNTIME_SCHEDULER].finish(slot.exec, slot.result)
      // oxlint-disable-next-line typescript/no-non-null-assertion -- bounded index
      appendToolResult(session, turn, step, call!.block, result, callSeqs[committed]!)
      for (const context of result.additionalContexts ?? []) acceptContext(context)
      concluded ||= result.concludesTurn === true
      committed++
    }
  }
```

`committed` 是那个提交游标，`slots[committed] === undefined` 表示这一格还没跑完，直接 `break` 等着。`needsPost` 记的是这个调用要不要走 `tools/post-execute` 策略，要就 `finalize`（异步，能改结果），不要就 `finish`（同步收尾）。那行英文注释同样是 lint 豁免，说的是这个下标由循环条件框住了，不会越界。

游标只跨越**连续就绪**的槽位。第 2 个调用先跑完也不会先提交，它得等第 1 个。于是 `tools/post-execute` 策略、`tool/result` 落盘顺序、`additionalContexts` 的先后，全都是模型顺序，只有工具体真正重叠。

**取消**（`tool-calls.ts:237-242`、`:249-259`）：abort 后停止补池，等已启动的 settle 并按序提交，然后给每个没启动的调用补写一对合成的 `tool/call` + `tool/result`，内容是 `Error: tool call aborted before dispatch`（错误：这个工具调用在派发之前就被取消了），错误码 `ABORTED_BEFORE_DISPATCH`。上游的 `cancel-tool-calls` 快照把这两种码摆在了一起（同样是一份手工采集的 fixture，`examples/acp-agent/tests/acp.snapshot.ts:382`，活模型没法稳定复现一次取消）：`call_wait` 已经跑起来了，拿到的是 `Error: tool call aborted`（工具调用被取消，码 `ABORTED`）；`call_skipped` 根本没启动，拿到的是 `Error: tool call aborted before dispatch`（派发前就被取消，码 `ABORTED_BEFORE_DISPATCH`）。历史因此仍然是「每个 call 都有配对 result」的合法结构，重放不会断。

**调度器自身失败**是另一回事：`schedulerFailure` 一旦置上就停止新派发，`Promise.allSettled(inFlight)` 后原样抛出（`tool-calls.ts:231-235`），**不伪造任何结果**。这可能留下没有 result 的 `tool/call`。上游的取舍是「内部故障宁可留下不完整的日志，也不编造一条模型会当真的工具输出」。

**参数解析失败不会拦住调用**（`tool-calls.ts:104-110`）：

```ts
function parseArguments(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return raw
  }
}
```

解析不了就把原始字符串原样交给工具，由 `defineTool` 的参数校验产出一个正常的工具错误结果。模型于是收到一条能读懂的报错，而不是循环崩溃。另外 `tool/call` 事件里存的 `arguments` 始终是**模型发来的原始字符串**（`tool-calls.ts:262-265`），不是解析后的对象，回放时不会被规范化悄悄改写。

## `agent/*` 事件全表

全部声明在 `packages/core/agent/src/runtime-types.ts`。模式一栏里，`emit` 是纯通知（返回值被忽略），`serial` 是全部依次 await（无短路），`waterfall` 是可改写、可短路（不调 `next()` 就截断下游）。

| 事件 | 行 | 模式 | 何时 | 默认组合里谁在监听 |
| --- | --- | --- | --- | --- |
| `agent/created` | `runtime-types.ts:159` | emit | 配置完成、会话已发布 | UI、subagent 管理 |
| `agent/disposed` | `runtime-types.ts:168` | emit | 离开注册表 | 同上 |
| `agent/status` | `runtime-types.ts:178` | emit | idle ⇄ running | compaction-basic、goal-round-driver、schedule、apiproxy、sdk/server |
| `agent/inbox/inserted` | `runtime-types.ts:186` | emit | 消息进 inbox | UI |
| `agent/inbox/claimed` | `runtime-types.ts:197` | emit | step 边界取走消息 | UI、subagent |
| `agent/inbox/discarded` | `runtime-types.ts:205` | emit | 消息被丢弃 | UI |
| `agent/session-start` | `runtime-types.ts:217` | emit | 发布后、首个 turn 前 | goal、goal-round-driver、hooks 两个方言桥 |
| `agent/pre-step` | `runtime-types.ts:231` | **waterfall** | 每 step 领取消息后 | 挂得最满的一个：compaction-basic、agent-instructions、time-context、tmux-context、goal-round-driver、repeat-tool-reminder、plan-mode、session-checkpoint-policy、tool-skill、tool-cordis、subagent-in-process-driver、hooks 两个桥 |
| `agent/request` | `runtime-types.ts:244` | **waterfall** | 每次模型请求前 | 全仓只有一个监听器：`packages/core/agent/src/model-selection.ts:55`（把 UI 选中的 provider/model 写进请求）。产品里的模型切换就是从这里进的 |
| `agent/request-error` | `runtime-types.ts:260` | **waterfall** | 流以 error/aborted 结束 | llm-retry、compaction-basic |
| `agent/turn-stopping` | `runtime-types.ts:278` | **serial** | 模型无欠账且 next-step 空 | hooks 两个桥（Stop） |
| `agent/error` | `runtime-types.ts:290` | emit | turn/step 出错 | goal-round-driver、acp、apiproxy、session-telemetry |

waterfall 有一个必须知道的坑：监听器忘了调 `next()` 就等于关掉了它下游的一切。`agent/pre-step` 上挂着 compaction 和上下文注入，一个写错的插件能静默地把它们全关了。

## 代价与失效点

1. **没有内建的 turn 预算。** 上游 README 自己列为已知限制（`packages/core/agent-loop/README.md:134`）："tool calls or steering continue the current turn; a policy that bounds runaway turns must cancel from an existing lifecycle extension point such as `agent/turn-stopping`"。这句话的意思是：工具调用和 steering 都算「当前这个 turn 还在继续」，想给失控的 turn 设上限，只能从现成的生命周期扩展点（比如 `agent/turn-stopping`）里主动发起取消。翻译成人话就是，上游把这件事明说成「我们没做，你自己挂」。默认组合里唯一的失控保护是 `repeat-tool-reminder`，而它只是发提醒。一个反复调同一个工具的模型可以一直跑下去。
2. **每个 step 重新装配系统提示和工具 schema。** 只要任一贡献者的文本变了（包括工具描述里嵌的动态字段），请求前缀就变了。`request/header` 的 `change` 只是记录这件事发生过，不是防护。
3. **max-tokens 直接结束 step 且不执行工具**（`agent.ts:391`）。没有内建的「自动续写」，兜底完全靠插件。
4. **调度器失败会留下孤儿 `tool/call`。** 这是明确的设计取舍，但意味着日志的「call/result 配对」只在正常路径和取消路径上成立。
5. **概念密度高。** Phase 三态 + `wakeRequested` 闩锁 + initiator 的 AsyncLocalStorage 传播（Node 的异步上下文存储，让「这次动作是谁发起的」不用逐层传参就能跟着调用链走）+ scope 链 + 符号键的三段调度器接口，都是为极端竞态准备的。想读懂「一次工具调用怎么走」，最少要同时打开 `agent.ts`、`tool-calls.ts`、`packages/core/tools/src/index.ts` 三个文件。

## 别人怎么做

下表全部读自各家源码（Claude Code 闭源，循环内部无从核实，这里不列）。要看的差别集中在两列：**工具何时开始跑**（等模型说完再调度，还是边收流边启动），以及**并发判定**（谁来决定两个调用能不能重叠）。

| 维度 | dsh | Codex CLI | OpenCode | pi | mini-swe-agent |
| --- | --- | --- | --- | --- | --- |
| 循环形态 | `turn()`/`step()` 双层，历史从事件日志派生 | `run_turn` 内 `loop`，每次采样重建 Prompt | `runLoop` 的 `while(true)`，每圈一次 `processor.process` | 外层 `while(true)` + 内层「还有工具调用或待发消息」 | `while True: step()`，最后一条消息 `role == "exit"` 就退出 |
| 工具何时开始跑 | 等完整 assistant 消息，再按组调度 | 边收流边启动：`OutputItemDone` 立刻产出 future 放进 `FuturesOrdered` | 由 AI SDK 在流中并发执行 | 收完消息后按批执行 | 收完消息后逐个 `env.execute` |
| 并发判定 | 每调用 `isConcurrencySafe(args)`，fail-closed，默认上限 10 | 每个工具运行时声明 `supports_parallel_tool_calls`，并行的拿读锁、串行的拿写锁 | 不区分，全交给 SDK | 默认 parallel；任一工具声明 sequential 则整批串行 | 顺序执行；`swebench.yaml` 才开 `parallel_tool_calls` |
| 结果顺序 | 提交游标只跨连续就绪槽位，严格模型顺序 | `FuturesOrdered` 按调用顺序回填 | 流事件顺序 | 并发执行后按原顺序生成结果消息 | 天然顺序 |
| 插队输入 | `steer`（next-step，唤醒）/ `inject`（next-step，不唤醒）/ `followup`（next-turn） | `input_queue.get_pending_input()` 在每圈开头取 steering | 队列里的 subtask/compaction 任务 | `getSteeringMessages` + `getFollowUpMessages`，两个队列各有 `all`/`one-at-a-time` 模式 | 无 |
| 请求失败 | `agent/request-error` waterfall，返回 retry 就在**同一个 step 内** `continue` | provider 级 `stream_max_retries` 指数退避 | `Effect.retry` 包整条流，尊重 `retry-after` 头，最多 5 次 | 镜像官方 SDK 策略，尊重 `x-should-retry` | tenacity 指数退避 4–60s，默认 10 次 |
| 输出截断 | `max-tokens` 结束 step 且**不执行**该步工具 | `ContextWindowExceeded` 触发压缩后重来 | `ContextOverflowError` 不重试，走 compaction | `stopReason === "length"` 时**所有**工具调用一律作废，回一句「重发完整参数」 | `finish_reason == "length"` 与真正的格式错误给不同的纠正提示 |
| 失控保护 | 无内建预算，只能从 `agent/turn-stopping` 取消 | 有 token 预算与自动压缩 | 有 `doom_loop` 检测（默认 `ask`） | `maxSteps`/`shouldStopAfterTurn` | `cost_limit` 默认 3 美元，超限进 `exit` |

Codex 追求延迟（边流边执行），OpenCode 和 pi 把并发交给 SDK 或粗粒度开关，mini-swe-agent 干脆只有一个 `bash` 工具、一个 `while True`；dsh 则把「哪些能并行」下放给每个工具的纯函数分类器，然后用一个提交游标把可观察顺序钉死成模型顺序。代价是调度器本身比别人复杂得多，收益是取消、重放、fork 三种情况下日志都仍然自洽。

## 怎么自己核

这些命令在锁定的 checkout 里跑（把 `<checkout>` 换成 `sources/checkouts/deepseek-harness`）：

```bash
# 一个 turn 的事件顺序：把快照日志的 type 抽出来
cd <checkout>
cut -d, -f1 examples/acp-agent/tests/snapshots/parallel-tool-calls/session.jsonl

# 取消时两种错误码的差别
grep -o 'ABORTED[A-Z_]*' examples/acp-agent/tests/snapshots/cancel-tool-calls/session.jsonl

# 哪些工具 opt-in 了并发（只看声明点，应当恰好 8 处；不加冒号后缀会连
# 接口定义和分类器本身一起数进来）
grep -rn "isConcurrencySafe: () => true" packages/*/*/src/*.ts

# turn()/step()/buildRequest 三段的确切范围
sed -n '246,330p;332,401p;407,495p' packages/core/agent-loop/src/agent.ts

# 事件声明与模式（@mode 标注在每段 JSDoc 末尾）
grep -n "@mode\|^    'agent/" packages/core/agent/src/runtime-types.ts
```

想看「模型到底收到什么」，最快的路是读快照目录里的 `session.jsonl`：它就是重建请求的全部输入，而 `packages/core/agent-loop/src/invariant.ts:39-42` 那条断言保证了这一点在运行期成立。

关于这个循环怎么被组装、agent 怎么被创建与恢复，见 [05 Session](05-session.md) 和 [08 Orchestration](08-orchestration.md)；工具执行流水线的内部（审批、沙箱、guard）见 [07 工具、审批与沙箱](07-tools-approval-sandbox.md)；每 step 重装配对缓存的影响见 [02 KV-Cache](02-kv-cache.md)。

## 自检

**1. 工具体已经并发跑了，为什么 `tool/result` 还要按模型给出调用的顺序落盘？让先跑完的先落盘，会坏掉什么？**

因为日志顺序就是重放顺序。`commitReady` 的提交游标只跨越连续就绪的槽位（`tool-calls.ts:146-160`），第 2 个调用先跑完也得等第 1 个，于是 `tools/post-execute` 的执行顺序、`tool/result` 的落盘顺序、`additionalContexts` 进 next-step inbox 的先后，全都是模型顺序，只有工具体真正重叠。改成按完成顺序落盘，同一批调用在不同机器、不同网络条件下就会写出不同的历史；下一步再拿这份日志重建请求，得到的 `messages` 与派发时那份对不上，正好撞上 `packages/core/agent-loop/src/invariant.ts:19-55` 那条「日志重建失谐」的断言。多花的那点等待，买的是取消、重放、fork 三种情况下日志都还自洽。

**2. `steer` 和 `followup` 都会唤醒驱动器，差别只在 target。什么情况下 `steer` 会被系统改判，实际按 `followup` 的位置落地？**

当前 turn 已经被取消、但还没收敛完的时候。`send`（`agent.ts:113-132`）里先算 `wakingAfterAbort`：wakeup 为真、相位不是 idle、且 signal 已经 aborted，三条同时成立就把 `resolvedTarget` 改成 `next-turn`。理由是一条会唤醒的输入不能加入一个已经被放弃的活动。这个判断还必须在插入队列之前算好，否则某个 `session/event` 观察者在插入过程中重入触发取消，就能把它的分类改掉。

**3. 一个插件在 `agent/pre-step` 上挂了监听器，但忘了 `await next()`。会发生什么？**

`agent/pre-step` 是 waterfall，监听器不调 `next()` 就等于把下游整条链截断。这个事件上挂着默认组合里最多的一批监听器（`runtime-types.ts:231`）：compaction-basic、agent-instructions、time-context、tmux-context、goal-round-driver、repeat-tool-reminder、plan-mode 等等。忘了 `next()`，它们一次都不会跑，而且是静默的：循环照常转，没有报错，只是压缩不再触发、工作区说明不再注入。要确认这类问题，得去看日志里该有的事件是不是没了，而不是等异常。
