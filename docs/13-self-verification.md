---
title: 自证与工程化：一个仓库如何证明自己没坏
sources: [{"repo":"deepseek-harness","path":"packages/runtime-diagnostics/invariants/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# 自证与工程化：一个仓库如何证明自己没坏

一个 agent harness 最难验证的地方不是「函数返回值对不对」，而是「模型这一步收到的东西，跟我们记下来的东西是不是同一份」。单元测试断言不了这个：它需要在真实运行中，把即将发出的请求和会话日志重新推导出来的请求逐字节比一遍。

dsh 为这类断言建了一套机制，叫 invariant：每个包自带一个 `src/invariant.ts`，在运行时挂上监听器，一旦发现自己负责的那条关系被破坏就当场抛异常。下面先看两段真实的断言代码，再讲它什么时候生效、失败时会发生什么、以及它**证明不了**什么。

## 一、先看见：请求必须等于日志重建的结果

`packages/core/agent-loop/src/invariant.ts` 全文 63 行，核心是挂在 `llm/stream` 上的一个 waterfall 监听器（waterfall 是 Cordis 的一种派发模式：监听器串成一条链，每一环拿到上一环的结果、必须显式调用 `next()` 才把控制权交下去，所以它既能读也能改）：

```ts
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  // Prepend prevents a short-circuiting replay listener from silencing the check.
  ctx.on('llm/stream', (options: GenerateOptions, next) => {
    if (!isAgentLoopRequest(options)) return next()
    if (!Object.isFrozen(options)) fail('a loop-built request must be frozen')
    if (options.sessionId === undefined) fail('a loop-built request must carry a session id')
    const session = ctx.sessions.get(options.sessionId)
    if (!session) fail(`a loop-built request must carry a live session id, got "${String(options.sessionId)}"`)
    if (!Object.isFrozen(options.messages)) {
      fail('a loop-built request must carry a frozen messages array')
    }

    const events = session.events
    if (!events.some(event => event.type === 'step/start')) {
      return fail('a loop-built request with no step/start in its session log')
    }
    const header = foldRequestHeader(events)
    if (header === undefined) {
      return fail('a loop-built request with no request/header event in its session log')
    }
    const expected = session.deriveMessages()
    if (JSON.stringify(options.messages) !== JSON.stringify(expected)) {
      fail(`llm request for session "${String(session.id)}" diverges from the dispatch-time durable derivation (log-reconstruction desync)`)
    }
```

这段在 `packages/core/agent-loop/src/invariant.ts:19-42`。它做的事情是：**把马上要发给模型的 `options.messages`，和从 append-only 会话日志现场重新折叠出来的 `session.deriveMessages()`，做 JSON 全等比较**；再把请求的 `model`/`system`/`temperature`/`maxTokens`/`stop`/`tools` 和日志里折叠出的 `request/header` 逐项比一遍（`packages/core/agent-loop/src/invariant.ts:44-52`）。任何一项不等，就抛出。

这条断言是[《05 Session》](05-session.md)里「模型可见 ⟺ 已记录」那条原则的运行时执法者。设计记录写得比代码更直白：`.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md` 第 17 行说「Anything that reaches a model request must be reconstructable from the session log and the immutable content-addressed objects it references.」。invariant 就是把这句话变成一个会在开发期炸掉的检查。

第二段是 prompt 装配的结构校验，`packages/core/system-prompt/src/invariant.ts:46-52`：

```ts
const install: InvariantInstaller = (ctx, fail) => {
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    validateAssembly(assembled, fail)
    return assembled
  }, { global: true, prepend: true })
}
```

注意它包住的是 `next()` 的**返回值**，也就是所有插件都改完之后的那份权威装配结果。`validateAssembly`（`packages/core/system-prompt/src/invariant.ts:16-43`）检查 section 名非空且不重名、context 名非空且不重名、tool 名非空、变量名匹配 `/^[a-z][a-z0-9_]*$/`。这些看起来琐碎，但它们保证的是[《01 System Prompt》](01-system-prompt.md)里那份逐字文本不会因为两个插件抢同一个 section 名而静默丢一段。

第三段可以对比着看，`packages/core/session/src/invariant.ts` 250 行里全是会话日志的语法规则：

```ts
  if (event.seq <= trace.lastSeq) {
    fail(`seq must strictly increase: saw ${event.seq} after ${trace.lastSeq}`)
  }
```

这是 `packages/core/session/src/invariant.ts:60-62`。同一个文件里还有 turn/step 的配对与嵌套（`packages/core/session/src/invariant.ts:74-102`）、`tool/result` 必须能找到同一步内的 `tool/call`（`packages/core/session/src/invariant.ts:139-141`）、核心执行事件必须被 turn 包住（`packages/core/session/src/invariant.ts:154`）。

三段代码的共同点：断言的对象都是**事件流或可变数据之间的关系**，不是某个函数的返回值。这是写在根 `AGENTS.md:103` 里的硬规矩：「Runtime invariants assert owned relationships. Check authoritative event streams or mutable data, not service or method presence, plugin metadata or effects, or fixed pure examples.」

## 二、219 个包，219 个 `invariant.ts`

`packages/AGENTS.md:18` 写着「Every package owns `./invariant`」。这是字面意义上的：

```bash
ls -d packages/*/*/ | wc -l                                  # 219
find packages -name invariant.ts -path '*/src/*' | wc -l     # 219
grep -rl "No runtime invariant:" packages --include=invariant.ts | wc -l   # 184
```

219 个包各有一个 `src/invariant.ts`，其中 184 个是**带理由的空实现**，只有 35 个真的装了检查。空实现长这样（`packages/llm/llm-deepseek/src/invariant.ts:17-21`）：

```ts
/**
 * No runtime invariant: this package exposes no independent event sequence or mutable data relation
 * beyond contracts enforced at its owning seam.
 */
const install: InvariantInstaller = () => {}
```

写成空的是被门禁强制的表态，不是偷懒。`scripts/verify-package-invariants.ts` 会用 TypeScript AST 解析每个 `invariant.ts`：空的 `install` 函数体，如果它的声明语句里没有 `No runtime invariant:` 这个字符串，直接失败（`scripts/package-invariants.ts:265-275`）；非空的 `install`，如果第二个参数（那个 `fail` 报告器）不存在、或者存在但函数体里从没被引用，也失败（`scripts/package-invariants.ts:278-285`）。**你不能写一个看起来在检查、实际上永远不会报错的 invariant**。

## 三、它什么时候开启，失败时会发生什么

这两个问题比「有多少个」重要得多。

**什么时候开启**：默认不开。`.agents/notes/implemented/simplification/2026-08-03-omit-invariants-from-shipped-config.md` 的决定是：发行版 `dsh` 的配置树（`apps/cli/config/` 下的 cordis 组合）既不挂 `@deepseek-ai/dsh-invariants` 服务，也不挂任何包的 `./invariant` 伴生插件；`apps/cli/package.json` 里连这个依赖都没有。笔记里的原话是「Ordinary `dsh` TUI and Web runs install no invariant listeners or trace state and cannot fail through `InvariantError`.」（当时 TUI 还在，后来被 `.agents/notes/implemented/simplification/2026-08-04-remove-tui-package.md` 删掉了）。

真正开启它的是 vitest 拓扑：每个包的测试挂本包的伴生插件，另有一个把全部伴生插件都挂上的穷举拓扑，用来验证注册与释放的接线（`packages/runtime-diagnostics/invariants/README.md` 写明了这个安排）。除此之外，那篇笔记说 invariant「remains available for focused tests, example bundles, generated SDK compositions, and custom deployments that opt into diagnostics explicitly」。这句话说的是「可用」而不是「已挂」：在锁定的 commit 上，`examples/` 下没有任何一份 `cordis.yml` 挂了这个服务。服务本身有 `enabled` / `package_allowlist` / `package_blocklist` 三个配置项（`packages/runtime-diagnostics/invariants/src/index.ts:15-22`），正则不合法、重复、带空白直接在启动时抛错。

**失败时会发生什么**：旧版分析一字没讲，这里把链路走完。

`fail(message)` 是注册时现场闭包出来的函数，它只做一件事：抛 `InvariantError`（`packages/runtime-diagnostics/invariants/src/index.ts:160-164`）。这个错误类在 `packages/runtime-diagnostics/invariants/src/index.ts:50-66`，带一个稳定的 `code = 'INVARIANT'` 和违规包的 npm 全名，消息前缀是 `invariant violated by "<package>": …`。

**没有任何地方 catch 它**：全仓非测试源码里 `InvariantError` 只在定义它的那个文件出现三次。所以它按普通异常向上传播：

1. agent-loop 那条断言挂在 `llm/stream` 上，而 `llm/stream` 是 waterfall。`packages/llm/llm/src/index.ts:906-909` 的文档注释把责任划得很清楚：「Adapter selection, dispatch, and iteration failures become terminal `error` or `aborted` finish chunks; middleware, nested-call, cleanup, and consumer failures remain thrown.」。invariant 是 middleware，所以它**不会**被转换成一个 finish chunk，而是原样抛出。
2. 异常从 `step()` 冒到 turn 循环的 catch（`packages/core/agent-loop/src/agent.ts:302`）。既然 signal 没 abort，就走 `packages/core/agent-loop/src/agent.ts:309-314`：`turnEnds = { kind: 'error', error: { message: errorChain(error), code: 'UNKNOWN' } }`。`InvariantError` 不是 `LlmError`，所以它被压平成 `UNKNOWN` 码的文本。
3. `this.throwError(error)`（`packages/core/agent-loop/src/agent.ts:315`）先 `dispatch.emit('agent/error', …)` 再重抛（`packages/core/agent-loop/src/agent.ts:206-207`）。
4. `finally` 块无论如何都会追加 `turn/end`（`packages/core/agent-loop/src/agent.ts:319`），所以这个 turn 以 `reason.kind === 'error'` 落盘。
5. 重抛的异常最终被驱动边界吞掉：`kick()` 的 `catch (_error)` 里那句注释写着「Reported failures and cancellation are contained at the driver boundary.」（`packages/core/agent-loop/src/agent.ts:211-215`）。

结论：**一次 invariant 违规会杀掉当前 turn，写下一条 `error` 的 `turn/end`，但不会杀掉进程**。而挂在 `session/event` 这种 `emit` 事件上的断言（`packages/core/session/src/invariant.ts:223-231`）传播路径更短：Cordis 的 `emit` 是 `this.dispatch('emit', args).map(cb => cb(...args))`（`vendor/cordis/src/events.ts:194-195`），同步、无 try/catch，所以异常直接从 `session.append()` 的调用点抛出，通常也就是 turn 里的某一步。

### 它证明什么，不证明什么

证明的：在**开启了它的那次运行里**，某条被显式建模的关系没有被破坏。比如「这次发出的 messages 数组，等于此刻从日志推导的结果」。

证明不了的，逐条写清楚：

- **不证明前缀稳定**。`packages/core/agent-loop/src/invariant.ts` 比的是「本次请求 vs 本次日志」，它从不比较「本次请求 vs 上次请求」。也就是说，一个每步都重写 system prompt 的插件可以让 KV-cache 全线塌方，而这条 invariant 一声不吭，因为日志也如实记下了那个被改写的 header。缓存稳定性靠的是[《02 KV-Cache》](02-kv-cache.md)里讲的那些设计约束和快照 fixture，不是 invariant。
- **不证明发行版正确**。发行版根本不挂它。它是开发期与测试期的诊断，不是生产护栏。真正常开的是 Session 自己的不可变性与来源事件校验（`packages/runtime-diagnostics/invariants/README.md` 明确把这部分划在服务之外）。
- **不证明语义正确**。它只知道 `deriveMessages()` 和 loop 构造出的数组一致；如果两边共用了同一个有 bug 的推导，它们会一致地错。
- **184 个包没有任何运行时检查**。这不是覆盖率漏洞，是设计：纯工具库、薄实现、组合包、二进制入口、持久化适配器都被明确列为「没有可断言关系」的类别。

## 四、`packages/runtime-diagnostics/invariants` 只有 200 行

这个服务包自己不含任何产品检查，也不 import 任何产品包。它做四件事：选择（正则允许/阻断名单）、名字预留、子 fiber 生命周期、以及带包名归属的失败上报。

`register(packageName, installer)` 的实现（`packages/runtime-diagnostics/invariants/src/index.ts:136-197`）值得看一眼：包名先进 `registrations` 集合占位（重名直接抛错，两个插件不可能悄悄争抢同一个包名），然后在 `ctx.effect(...)` 里判断过滤器；被过滤掉就只留占位、不装检查；没被过滤就 `ctx.plugin(...)` 起一个子 fiber 跑 installer（`packages/runtime-diagnostics/invariants/src/index.ts:166-168`），installer 的 `inject` 声明决定这个子 fiber 能拿到哪些服务。installer 失败会 dispose 子 fiber 并释放占位，两件事原子完成。

「服务不 import 产品包，产品包不 import 服务」这个双向解耦，是这套东西能塞进 219 个包而不把依赖图搅成一团的原因。

## 五、六个 test-support 包：让哪些测试成为可能

219 个包里有 6 个专门用来测别的包，全在 `packages/test-support/`。它们各自解锁一类原本做不了的测试：

| 包 | 让什么变得可能 |
| --- | --- |
| `agent-loop-testkit` | 一行 `mountAgentLoopTestDependencies(ctx)` 按依赖顺序装好 LLM/session/system-prompt/tool/agent 五个服务，然后**在挂载 loop 之前返回**，让测试自己决定挂哪个 loop、配什么参数。没有它，每个 loop 测试都要手抄一遍装配顺序。 |
| `llm-mock-server` | 一个可编排的 OpenAI 兼容 HTTP/SSE 服务器，按到达顺序消费预设行为。**无需 key 就能测真适配器**：被 mock 掉的是 provider，不是 adapter，于是 SSE 解析、重试退避、超时都跑的是真代码。 |
| `llm-replay` | 从**录制好的 session JSONL** 重建模型流。它的关键设计是「fixture 就是持久化的会话日志本身」：`assistant/chunk` 事件里存了每一个 `StreamChunk`，按 `(turn, step)` 分组就能还原每次 `stream()` 调用的 chunk 序列。于是「无 key 跑一整轮真 agent」成立。 |
| `acp-snapshot` | 快照套件的全部机械：启动器（用 tsx 跑源码或用裸 node 跑构建产物）、场景驱动器、一组归一化器（JSON-RPC id 按首见顺序编号、UUID 与生成 cwd 的各种拼法都换成 token、时间归零）、以及套件工厂。示例只需要给一张场景表加一个 fixture 目录。 |
| `client-runtime` | jsdom 里的 slot 测试台：真 Cordis `Context` + 生产的 `SlotRegistry` 和 web-react 渲染器 + 类型化的 session/workspace 替身。替身实现的是功能插件通过 ctx 看到的同一批对外面（`TestSessions implements ISessions`），所以生产接口一改，测试台**编译期**就红。 |
| `loader-smoke` | 通过 Cordis Loader 起一个真子进程跑 app + `cordis.yml`，`resolveExampleLaunch` 在本地 `src` 模式和 CI `lib` 模式之间选。这是「按发布产物的真实入口路径测试」那条规则的载体。 |

它们撑起来的规模：`packages/` 下非测试 TS/TSX 源码 228,300 行，`tests/` 目录下 268,040 行，**测试比源码多 17%**。测试文件 854 个（口径与行数同一套，见[附录 B](appendix-b-verification.md)）。而且覆盖率门禁是逐文件 100%：`vitest.config.ts:273-278` 写着 `perFile: true` 加四个 100，注释是「100% or it doesn't merge … Per-file so a well-covered big file can't subsidize a bare one.」（`vitest.config.ts:269-270`）

`docs/testing.md:10` 还补了一句很清醒的话：「Line coverage is necessary, never sufficient — it proves lines ran, not that the feature works as shipped.」

## 六、最值得读的证据：快照 fixture

如果只允许看仓库里的一样东西来判断「模型到底收到了什么」，应该看 `examples/*/tests/snapshots/`。

三个示例各自带一套：`examples/acp-agent/tests/snapshots/` 78 个场景、`examples/headless-agent/tests/snapshots/` 11 个、`examples/jsonrpc-agent/tests/snapshots/` 4 个。一个场景目录长这样（`text-turn`）：

```
input.json                    # 场景脚本：initialize → newSession → prompt
system-prompt.expected.md     # 模型收到的 system prompt 逐字文本
tool-schemas.expected.json    # 模型收到的工具 schema，27 KB
session.jsonl                 # 完整会话事件日志
stdout.expected.jsonl         # 归一化后的 ACP JSON-RPC 输出
```

`system-prompt.expected.md` 只有 24 行，但那 24 行就是模型第一眼看到的全部文字，第一段是：

```
You are an AI agent powered by DeepSeek Harness.

You are a coding assistant powered by the deepseek-v4-flash model. Your working directory is {{cwd}}. Your bash tool runs under a file sandbox — a `[sandbox: file access denied …]` result is policy, not a command bug.
```

它是最有价值的可读证据，因为**它是 diff 的**。改动任何一个 prompt section、任何一个工具描述、任何一个变量渲染规则，这个文件都会变，PR 里就有一行行的红绿。`docs/testing.md:49` 那条规则是硬的：「Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless scenario in the same PR through a runnable example's owning snapshot suite.」

另一个巧思在 `session.jsonl` 里。所有场景的 `request/header` 事件都长这样，`text-turn` 也不例外：

```json
{"type":"request/header","seq":7,"time":1785498761318,"data":{"header":{"config":{"provider":"deepseek-official","model":"deepseek-v4-flash"},"system":"{{system}}","tools":"{{tools}}"},"reason":"initial"}}
```

`system` 和 `tools` 在会话日志里一律被换成 token。完整内容不放在日志里，而是放在旁边的 sidecar 文件（`system-prompt.expected.md` / `tool-schemas.expected.json`）里，且**每一类请求头只由一个场景持有 sidecar**：场景表用 `pinsHeader: true` 标出这个「班长」，同班的其余场景只检查自己重建出来的请求头是否与班长相等（`packages/test-support/acp-snapshot/src/suite.ts:104`）。`examples/acp-agent` 的 78 个场景分成 19 个这样的班，其中 12 个持有 system prompt sidecar、14 个持有 tool schema sidecar（差额来自 `systemPromptSource` / `toolSchemasSource`，允许一个班长复用另一个班长的 sidecar）。

好处是：改一句 prompt，只有受影响那个班的 sidecar 会出 diff；同班其余场景的 fixture 里躺的是常量 token，一个字节都不用动。既保住了「有人在逐字盯着完整内容」，又不至于每次 prompt 微调都要 review 78 份大 diff。`docs/testing.md:12` 用「One ACP scenario (`text-turn`) pins full system-prompt/tool-schema content; other fixtures tokenize it」概括了这个安排（那句话说的是默认那一班），理由在 `.agents/notes/archived/testing/2026-07-06-pin-request-header-content-in-one-scenario.md`。

## 七、文档不是文档，是有门禁的产物

dsh 有 28 个文档门禁，编在 `scripts/run-gates.ts:581-615` 的 `docSyncLeafGates()` 里，一条 `pnpm run doc-sync` 全跑。挑几条对读者有用的：

**每个包 README 必须有 `## Model Experience`。** 这是 `.agents/notes/implemented/process/2026-07-12-package-model-experience-contract.md` 定的，脚本是 `scripts/verify-package-readme-model-experience.ts`。它把 219 个包分成四类：

- **4 个豁免包**，列在 `scripts/verify-package-readme-model-experience.ts:32-37` 的 `NO_MODEL_EXPERIENCE_SECTION` 表里，每个带一句审计理由：`packages/core/scope`（模型无关的注册与生命周期原语）、`packages/util/brand`（编译期擦除的类型原语）、`packages/util/home-paths`、`packages/util/launch-environment`（只解析宿主路径/环境值）。这四个包**必须没有**这个小节，写了反而失败。注释里写得很清楚：理由留在这里作为可复查的审计证据，「so an absent section cannot be mistaken for forgotten documentation」。
- **121 个「一句话」包**，在 `SENTENCE_MODEL_EXPERIENCE` 表里（`scripts/verify-package-readme-model-experience.ts:44-165`），又分 `indirect`（55 个，模型可见效果由别的包渲染，如 `packages/shell/shell` → 「delegates all model rendering to dsh-tool-bash」）和 `none`（66 个，压根不面向模型，如浏览器端 UI 层）。
- **其余 94 个包**必须写完整的三段：`#### What the model sees` / `#### Token effect` / `#### KV Cache effect`（三个小标题定义在 `scripts/verify-package-readme-model-experience.ts:15-17`）。

所以 `grep -l "^#### KV Cache effect" packages/*/*/README.md | wc -l` 得到 215 = 219 − 4。这是一份机器校验过的、逐包的「我对 prompt / token / KV-cache 有什么影响」清单，**可以直接当索引用**：想知道哪些包会动缓存前缀，grep 这个小标题然后读下面那句话就行。

**Agent Note 有格式门禁。** `scripts/verify-agent-note-format.ts` 强制：第 1 行必须是 `# Agent Note: <title>`、第 2 行空、第 3 行是对应 lifecycle 的 `Status:` 语法（`scripts/verify-agent-note-format.ts:22-26`）、第 4 行空；第一个 `##` 必须是 `## Problem`；proposed 必须有 Proposal/Acceptance criteria/Risks，implemented 必须有 Decision/Consequences（`scripts/verify-agent-note-format.ts:29-33`）；implemented 里出现 `## Proposal` / `## Plan` / `## Migration plan` / `## Acceptance criteria` 一律拒绝，理由写在错误信息里：「an implemented Agent Note states what is」（`scripts/verify-agent-note-format.ts:74`）。`## Alternatives considered` 强制，2026-07-05 之前的老笔记可以用一行豁免注释代替，之后的不行（`scripts/verify-agent-note-format.ts:13-16`、`:82`）。

**28 条里有 8 条是「生成物新鲜度」检查。** `verify-cordis-catalog`、`verify-client-catalog`、`verify-tool-catalog`、`verify-config-catalog`、`verify-persistence-catalog`、`verify-doc-graphs`、`verify-scoped-events`、`verify-module-graph` 都是 `gen-*.ts --check`：重新生成一遍，跟仓库里的字节不一致就失败。其中 `docs/tool-catalog.md` 的生成器不做静态分析，而是**真的把每个工具插件启动起来**读 `ctx.tools.schemas()`，因为工具 schema 静态不可知（枚举是运行时展开的、描述是拼接的、MCP 工具是裸 JSON Schema）。

**双语是三元组。** 每篇文档/笔记是 `x.md` + `x.zh.md` + `x.i18n.yaml`。sidecar 里存的是两侧最近一次「确认一致」时的 git blob hash：

```yaml
2026-08-03-omit-invariants-from-shipped-config.md: a691a0949806a752203a41bd6c66a50e97d8f1d7
2026-08-03-omit-invariants-from-shipped-config.zh.md: aa1f775804de1bee7b69f355fc4afddf48c63a61
```

改了任一侧而没同步另一侧，`verify-translation-pairing` 会发现 hash 对不上。它检查的是「配对状态」而非翻译质量，后者明确留给人评审（`scripts/verify-translation-pairing.ts:9`）。

**还有字数上限。** `scripts/doc-budgets.manifest.json` 给 9 个高层文档定了词数天花板：`docs/architecture.md` 2400、`docs/testing.md` 1150、`packages/AGENTS.md` 675。写超了就得删，逼着细节下沉到该在的地方（`.agents/notes/implemented/process/2026-07-04-doc-tiers-and-budgets.md`）。

## 八、构建与发布

- **构建**：`tsc -b` 出 JS，`tsdown` 打包。`tsdown.config.ts:19-20` 里 workspace 是 `vendor/*` + `packages/*/*` + `apps/cli`，每个包固定三个入口：`lib/types/{index,invariant,startup}.js`。注意 `invariant` 是一等构建入口，不是可选附件。
- **版本**：`packages/*/*` 219 个 `package.json` 全是 `0.1.0-rc.5`，跟根 `package.json:3` 一致。
- **没有 CHANGELOG**。仓库里根本没有这个文件。变更史靠 git tag（`dsh-v*` / `vendor-<pkg>-v*` / `landlock-run-v*`）加 683 篇 Agent Note，三条独立发布序列见 `.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md`。
- **Python SDK 打成单文件可执行**：`scripts/build-exe-for-python-sdk.ts:25` 固定 `@yao-pkg/pkg@6.21.0`，走 `--sea` 路线（`scripts/build-exe-for-python-sdk.ts:390`），产出 `dsh-jsonrpc-agent-pkg-<platform>-<arch>` 装进平台 wheel。理由在 `.agents/notes/implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.md`。
- **native landlock**：`native/landlock-run/` 是一个约 300 行 C11、静态链接 musl 的「先自限再 exec」启动器，发成 entry 包 + 两个平台包，靠 npm 的 `os`/`cpu` 字段分发。它 fail-closed：内核不支持就不跑命令。

## 九、失效点：100% 覆盖率骗过的那一次

上面这些机制加起来仍然会漏，而且漏过一次很典型的。`docs/postmortem/0001-acp-default-export-drops-inject.md:13` 记着：ACP 服务器在真实编辑器（Zed）连上的瞬间就崩，第一个 `session/new` 返回 `cannot get property "agents" without inject`。复盘里的原话是「despite 178 green unit tests and 100% line coverage」。

两个独立 bug 藏在同一句报错后面：`export default` 让 Loader 丢掉了插件的 `inject` 声明；另一个是带 trace 的可选服务查找跨 shadow 边界失败。测试全绿的原因是同一个：**每个测试都用 `ctx.plugin(...)` 手动挂载，没有一个走 Loader 的真实加载路径**。逐文件 100% 覆盖率在这里一点用都没有：那些行确实都跑了，只是没按发布产物的方式跑。

修复不是补几个用例，而是加了两条规则：产品可见插件必须有一个「真组合」测试（把测试用的 `cordis.yml` 通过 Loader 和 app 进程启起来），以及 `docs/testing.md:34` 那条更刁的补充：「A guard only guards if the regression actually fails it」。对没有 `inject` 的组合型插件，Loader smoke 在默认导出替换掉具名导出时**依然会绿**，所以要显式断言 `expect('default' in mod).toBe(false)`，并且要真的把回归引进来、看它红、再回滚。

四篇 postmortem 沉淀出的通用规则收在 `docs/defensive-patterns.md`，7 条，每条都是真出过的缺陷类别：正交结果各自独立上报（`docs/defensive-patterns.md:9`）、公共契约两侧都要守（`docs/defensive-patterns.md:13`，正是本文第三节引的那条「middleware and consumer defects remain thrown」的另一面）、异步状态不是同步状态、dispose 必须到静默而不只是发出请求、在派发器里包住回调异常、不给不可信输出环境变量与可预测路径、unlink 形似链接的路径。

**门禁能证明的东西是有边界的**。219 个 invariant、268k 行测试、28 个文档门禁，合起来仍然挡不住「测试和产品走了两条不同的加载路径」这类错误；只有把真实入口路径本身变成被测对象才行。

## 十、这套自证要花多少钱

前面几节的数字（测试行数见 §五、invariant 的 219/184 见 §二、文档门禁的 28 条见 §七、快照场景数见 §六）不必再列一遍，这里只记它们换算成的**日常摩擦**：改一句 README 可能连带改 `.zh.md`、重录 sidecar、重新生成三份目录；改一句 prompt 要 review 一批 fixture diff；每一个新 `if` 分支要么有测试要么有一条带理由的 `v8 ignore`；而且每个非平凡改动都必须在同一个 PR 里增改至少一篇 Agent Note（`.agents/notes/README.md:46`），那批笔记连同它们的 `.zh.md` 与索引一起，是仓库里文件数最多的一类产物。这套成本只有在一个前提下划算：**主要贡献者是 agent，而 agent 不会记得上下文**。11 个 `.agents/skills/` 技能（评审、找简化、归档笔记、推送前选测试集…）指向的是同一个前提。人类团队大概率负担不起这个比例；但如果每个 PR 的作者都是新来的，把「为什么这么定」和「怎么证明没坏」写成机器可校验的产物，就不再是洁癖。

## 十一、别人怎么做

只比得了开源的四家（Claude Code 闭源，不做源码级对照）。以下数字都在锁定 commit 上实测：

| | 结构化决策记录 | 运行时不变量 | 快照证据 | CHANGELOG |
| --- | --- | --- | --- | --- |
| dsh | `.agents/notes/` 683 篇，路径即状态，三个门禁脚本 | 219 个 `invariant.ts`，35 个可执行 | 93 个 keyless 场景，含逐字 system prompt | 无（tag + 笔记） |
| Codex | 无（`docs/` 15 篇用户文档，无 ADR 树） | 无 | 715 个 insta `.snap`，1,023 个路径含 `tests` 的 `.rs` | 有 |
| OpenCode | 无 | 无（唯一同名文件是 e2e 视觉稳定性工具） | 3 个 `__snapshots__` 目录 | 无 |
| pi | 无 | 无 | 无 | 无 |
| mini-swe-agent | 无 | 无 | 无 | 无 |

**结构化决策记录树只有 dsh 有。** Codex 的测试量和快照量并不低（715 个 `.snap` 是很扎实的回归网），但它把「为什么」放在 PR 描述和 CHANGELOG 里，几个月后要回答「当初为什么不选 X」只能翻 git log。dsh 反过来：没有 CHANGELOG，但有 683 篇带 `## Alternatives considered` 的笔记；具体读哪些，见[《15 设计记录导读》](15-agent-notes-guide.md)。

至于「模型收到的逐字 prompt 存在仓库里、被 CI diff」这件事，四家都没有等价物。这也是本仓库大量引用 `system-prompt.expected.md` 的原因。

## 十二、怎么自己核

以下命令都不需要凭据，在 dsh 的 checkout 根目录跑（完整的核对方法见[附录 B](appendix-b-verification.md)）：

```bash
# invariant 的三个数字
ls -d packages/*/*/ | wc -l
find packages -name invariant.ts -path '*/src/*' | wc -l
grep -rl "No runtime invariant:" packages --include=invariant.ts | wc -l

# 219 - 4 = 215：带 KV Cache effect 小节的包
grep -l "^#### KV Cache effect" packages/*/*/README.md | wc -l

# 模型第一眼看到的全部文字
cat examples/acp-agent/tests/snapshots/text-turn/system-prompt.expected.md

# 哪些场景持有完整内容的 sidecar（12 个 prompt / 14 个 schema）
ls examples/acp-agent/tests/snapshots/*/system-prompt.expected.md
ls examples/acp-agent/tests/snapshots/*/tool-schemas.expected.json

# 场景表里有多少个「班长」（19）
grep -c 'pinsHeader: true' examples/acp-agent/tests/acp.snapshot.ts

# 断言失败后的传播路径，逐段读
sed -n '19,55p'   packages/core/agent-loop/src/invariant.ts
sed -n '905,912p' packages/llm/llm/src/index.ts
sed -n '300,322p' packages/core/agent-loop/src/agent.ts
```

要看 invariant 真的会炸，装一个开着诊断的组合跑上游单测最省事：`packages/core/system-prompt/tests/invariant.spec.ts` 与 `packages/preset/agent-presets/tests/invariant.spec.ts` 都是现成的正反例。运行它们需要先 `pnpm install`（本仓库的 checkout 是不带 `node_modules` 的裸 clone）。
