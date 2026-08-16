---
title: 产品表面与协议：Web / headless / ACP / MCP / SDK / Python
sources: [{"repo":"deepseek-harness","path":"packages/acp/acp/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# 产品表面与协议：Web / headless / ACP / MCP / SDK / Python

*写给想把 dsh 接进自己系统的人。读完你能回答：dsh 一共有几个对外的面、每个面上谁驱动谁、同一次任务为什么在不同面上会得到相反的成败结论。*

同一个 agent、同一个任务，撞了 token 上限：headless 那边退出码是 1（失败），ACP 那边回给客户端的是 `end_turn`（正常结束）。两个面对同一件事给出了相反的结论，而且都不算 bug。两边各自的做法都有道理，但只要有人拿这两个入口跑同一批任务，成绩单就会直接对不上。

再顺手问一句：`dsh --profile <name>` 的 `<name>` 能填哪些值？如果你以为有一张白名单，那也猜错了。

一个 harness 有几种「被使用的方式」，这件事比它有几个功能更能说明它想被怎么用。这里说的「面」（surface，也叫产品表面：一整套把 harness 暴露给外界使用的入口，包括进程怎么起、消息走什么传输、谁先开口）就是本篇的主角。dsh 的答案写在一篇设计记录里，一句话（`.agents/notes/implemented/simplification/2026-08-04-remove-tui-package.md:11`）：

> Current runnable products use Web, ACP, JSON-RPC, or one-shot CLI entry points, while the SDK continued to offer a terminal choice that no example or product command exercised.

（现在能跑起来的产品用的是 Web、ACP、JSON-RPC 或者一次性 CLI 这几种入口；而 SDK 里还留着一个终端选项，没有任何示例或产品命令用到它。）

这里的 one-shot（一次性）指：起进程、跑一件事、打印结果、退出，会话不留着接着用。反过来的形态叫 continuable（可续），像 Web 那样一个会话能一直聊下去。

这句话出自「删掉 TUI 包」那篇笔记的 Problem 段。TUI 是 2026-08-04 被删掉的，**不留兼容包、不留别名**（`:15`）。删掉的理由不是它不好用，是它让「这个仓库支持哪些应用形态」这件事变得含糊：留着一个产品规模的终端前端，而唯一的消费者是项目脚手架自己。

这篇讲剩下的四类入口各是什么形状、消息长什么样、谁驱动谁。顺便纠正一个上一版分析里的错误：**DSML 不属于 dsh 的协议面**。

---

## 一、先看见：CLI 只有这几种入口

`apps/cli/README.md:9-14` 那张表是权威：

| Command | Purpose |
|---|---|
| `dsh --profile <name>` | Boot the named profile under `$DSH_HOME/profiles/<name>`. |
| `dsh --profile headless "job"` | Run one fresh persisted session, print the final answer, and exit. |
| `dsh web` | Alias of `--profile web`. |
| `dsh plugin --profile <name> <pnpm args>` | Manage a profile's plugins by forwarding to pnpm in the profile directory. |

这张表逐行翻译过来是：`dsh --profile <name>` 启动 `$DSH_HOME/profiles/<name>` 下那个叫这个名字的 profile；`dsh --profile headless "job"` 跑一个全新的、会落盘的会话，打印最终答案，然后退出；`dsh web` 是 `--profile web` 的别名；`dsh plugin --profile <name> <pnpm args>` 管这个 profile 的插件，做法是进到 profile 目录里把参数原样转给 pnpm。

源码侧的形状略有不同，值得说清楚：`apps/cli/src/args.ts` 解析出三种 invocation mode：`profile`（`:22`）、`dump-config`（`:32`）、`plugin`（`:41`）。`--profile <name>` 的 name 是**任意的**，就是 `$DSH_HOME/profiles` 下的一个目录名（`:131` 的选项描述），没有白名单。`web` 是唯一被硬编码的别名（`:13-14` 的模块注释）：

> `web` is a hardcoded alias for `--profile web`; `plugin` manages a profile's plugin dependencies by forwarding to pnpm.

（`web` 是写死在代码里的别名，等价于 `--profile web`；`plugin` 管的是某个 profile 的插件依赖，办法是转给 pnpm 去做。）

而 `headless` 只是一个**随发行版自带模板的 profile 名**。`PROFILE_TEMPLATES` 里只有 `web` 和 `headless` 两条（`packages/boot/app-boot/src/profile.ts:114-117`），别的名字得用 `dsh plugin` 自己建。所以准确的说法是：**两个自动初始化的 profile（web / headless）+ 一个 plugin 子命令 + 两个 dump 开关**。

顺带一个考古发现：launcher 里还留着四处 `tui`，分别是模块注释 `apps/cli/src/args.ts:10` 和帮助文本 `:68`、`:69`、`:71`。它们已经被**部分**改写：`:68` 那行的说明文字改成了 `boot a custom profile with one extra overlay`（启动一个自定义 profile，外加一层 overlay），`tui` 在这里只是「随便一个自定义 profile 名」的占位；但 `:71` 仍写着 `install a plugin into the tui profile`（把插件装进 tui 这个 profile），`:10` 仍写着 `boots the tui profile`（启动 tui profile），读起来还像 TUI 是个真实存在的形态。事实上 TUI 的 bundle 早就不存在，`packages/bundle/` 下只有 `base`、`headless`、`web-app` 三个。

---

## 二、headless：150 行的一次性驱动器

headless 常被误解成「无界面的 Web」。它不是。它的 bundle 补丁只有 35 行（全文见 [10 Cordis、启动、bundle 与 preset](10-cordis-boot-preset.md) 第一节），第 2 行的注释就说清了：

> It mounts no Host, HTTP server, Web runtime, or browser plugin.

（它不挂 Host，不挂 HTTP 服务器，不挂 Web 运行时，也不挂浏览器插件。）

翻译成人话就是：Web 面靠的那一整层东西，headless 一样都没有，它不是「关掉界面的 Web」，是另起的一条极短路径。

主流程在 `packages/bundle/headless/src/index.ts:96-134`，一共 39 行：

```ts
async function run(ctx: Context, task: string, io: HeadlessIo): Promise<void> {
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  if (agents === undefined || defaultModel === undefined || sessions === undefined) return

  const selection = defaultModel.currentSelection()
  const { agent } = await agents.create({ ... })
  await agent.whenIdle()
  const firstSeq = agent.session.seq
  agent.followup(createUserMessage({
    content: [{ type: 'text', text: task }],
    source: { kind: 'user' },
  }))
  await agent.whenIdle()
  await sessions.flush(agent.session)
  const outcome = summarize(agent.session.events, firstSeq)
  io.stdout.write(outcome.text + '\n')
  ...
  io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)
}
```

（节选自 `:96-133`，省略号处是 agent 参数与错误分支。）

这段照着读一遍：先等 `loader` 把插件加载完，再从容器里取三个服务（`agents` 建 agent、`agentDefaultModel` 给默认模型、`sessions` 管会话落盘），少一个就直接 return 什么都不做；`agents.create` 造出一个 agent，`whenIdle()` 等它闲下来；`agent.session.seq` 记一个水位号 `firstSeq`；`followup` 把用户那句任务（`task`）投进去，`source: { kind: 'user' }` 标明这条消息的来源是人；再等一次闲下来，`sessions.flush` 把事件刷到磁盘，`summarize` 从 `firstSeq` 往后汇总出答案，写到 stdout，最后按结果决定退出码。

几个细节：

**先等一次 idle，再投任务**（`:120` 与 `:126` 两次 `whenIdle()`）。第一次是等启动期可能自发产生的轮次落定，之后才记水位 `firstSeq`（`:121`），所以汇总只统计任务投递之后的事件。

**不组合 preset roster，工具从全局层读。** 注释写在 `:107-110`：

> This bundle composes no preset roster, so the model-facing rows sit in the host plane and the agent reads them from the global layer.

（这个 bundle 不组任何 preset 名册，所以模型能看见的那些工具行就待在 host 平面上，agent 直接从全局层去读。）

这是 headless 与 Web 最本质的差别。Web 把每 agent 的工具行全部 `disabled` 然后由 preset 挂回来；headless 直接用 base 层原样的那一套。想改 headless 的工具集，改的是 `cordis.patch.yml`，不是选一个 preset。

**`tools.mode` 由环境变量决定。** `mode: !!js process.env.DSH_TOOLS_MODE`（`packages/bundle/headless/cordis.patch.yml:20`）是 Code Mode 的进程级开关，和 Web 面用的是同一个临时方案（`:19` 的注释：`Keep the same temporary process-wide Code Mode opt-in as the Web surface.`，意思是「跟 Web 面保持同一个临时方案：Code Mode 的开关是进程级的、要显式打开」）。

**flush 在 summarize 之前**（`packages/bundle/headless/src/index.ts:127` 在 `:128` 之前）。持久化是 write-behind 的（事件先进内存、后台再批量落盘），所以如果先汇总再退出，最后几个事件可能还没写下去。

**退出码是二值的**：

```ts
  io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)
```

（`packages/bundle/headless/src/index.ts:133`。这一行读作：汇总结果里那个「本轮为什么结束」的原因，只要不是恰好等于 `completed`，就退 1；`?.` 表示连原因本身没有时也算不通过。）**只有 `turn/end.reason.kind === 'completed'` 才是 0**。`max-tokens`、`aborted`、`interrupted`、`blocked`、`error`，以及根本没有 `turn/end`（`reason === undefined`），全部退 1。`error` 的情况额外往 stderr 打一行 `dsh: <code>: <message>`（`:130-132`），但退出码不变。

`summarize`（`packages/bundle/headless/src/index.ts:61-82`）也很朴素：跳过 `firstSeq` 之前的事件，必须先见到 `turn/start`，之后每条非空 assistant 消息**覆盖**（不是累加）结果文本（`:77`），最后一个 `turn/end` 的 reason 胜出。所以「打印出来的答案」= 那个区间里最后一条非空 assistant 文本。

**退出本身也不是 `process.exit`。** 装配函数从全局服务表里取一个可选的 `appExit`，取不到就在挂载时直接抛：

```ts
  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('headless-runner: the launcher must provide ctx.appExit before the tree mounts')
  }
```

（`packages/bundle/headless/src/index.ts:144-147`。抛出来的那句英文是 `headless-runner: the launcher must provide ctx.appExit before the tree mounts`，意思是「headless-runner：launcher 必须在这棵树挂载之前把 `ctx.appExit` 准备好」。）注释（`:142-143`）解释了为什么用 `ctx.get` 而不是走属性代理：`appExit` 是一个可选的宿主值，不是被注入的依赖；如果写成 `inject`，这一行会在没有 launcher 的组合里安静地停在 PENDING，而不是响亮地报错。`appExit` 由 launcher 提供（`apps/cli/src/profile-boot.ts:255-258`），语义是「等这棵树 dispose 完之后再以 `code` 退出进程」。这一层间接换来的是：headless 打印完结果之后，session 的写批处理、遥测的 drain、子进程的回收都有机会走完。

---

## 三、ACP：dsh 是被驱动方

ACP（Agent Client Protocol，一套让「客户端程序」和「agent」互相通话的开放协议：一端是发任务、管权限的 client，另一端是干活的 agent，报文走 JSON-RPC）在 dsh 里出现两次，方向相反。搞混这两个是上一版分析的错误之一。

### 作为 server：`packages/acp/acp/src/index.ts`（436 行）

模块注释第一句（`:2`）：

> Automation-only Agent Client Protocol server over JSON-RPC stdio.

（一个只面向自动化的 ACP 服务端，报文走 JSON-RPC、通道走标准输入输出。）

`Automation-only` 这个限定词后面还有戏，第十节会回头算账：它意味着这个实现不打算做通用 ACP agent，编辑器插件那类客户端接过来会撞墙。

代码层面的证据是它实现的是 SDK 的 **Agent** 接口，用的是 **AgentSideConnection**：

```ts
  const makeAgent = (connection: AgentSideConnection): AcpAgent => {
```

（`:231`）

```ts
  conn = new AgentSideConnection(makeAgent, stream)
```

（`packages/acp/acp/src/index.ts:353`。类型名本身就是答案：`AgentSideConnection` 的字面意思是「站在 agent 这一侧的连接」，`makeAgent` 是「造一个 agent 出来」，`stream` 是 stdio 那条流。谁被驱动，写在名字里了。）方法实现集中在 `makeAgent` 返回的对象字面量里：`initialize`（`:234`）、`authenticate`（`:247`）、`newSession`（`:251`）、`prompt`（`:277`）、`cancel`（`:338`）。插件本体只注入一个服务：`export const inject = ['agents']`（`:44`）。

**`session/new` 的三条校验**（`packages/acp/acp/src/index.ts:430-436`）：

```ts
function validateSessionParams(params: NewSessionRequest): void {
  if (!isAbsolute(params.cwd)) throw invalidParams(`cwd must be an absolute path: ${params.cwd}`)
  if (params.additionalDirectories !== undefined && params.additionalDirectories.length > 0) {
    throw invalidParams('additionalDirectories is not supported')
  }
  if (params.mcpServers.length > 0) throw invalidParams('mcpServers is not supported')
}
```

这段是对客户端发来的 `session/new` 报文做入参检查，三条依次是：`cwd`（工作目录）必须是绝对路径，否则回一个 `invalidParams` 错误，错误文案是「cwd 必须是绝对路径」；`additionalDirectories`（客户端想额外授权访问的目录列表）只要非空就报「不支持 additionalDirectories」；`mcpServers`（客户端想转接给 agent 的 MCP 服务器列表）只要非空就报「不支持 mcpServers」。`invalidParams` 对应 JSON-RPC 的参数非法错误，报文回的是 error 而不是 result，客户端那边会直接抛。

第三条最要紧：**dsh 的 ACP 面明确拒绝 `mcpServers`**。ACP 客户端不能通过这个入口给 dsh 转接 MCP 服务器。

**只发已提交的 assistant 文本。** 注释（`:152-154`）：

> Emit only committed assistant text. Raw chunks, reasoning, tools, plans, titles, and retry markers are presentation or trace data and stay off the automation wire.

（只往外发已经定稿的 assistant 文本。原始流式片段、思考过程、工具调用、计划、标题、重试标记这些，要么是给人看的、要么是排查用的痕迹，不上自动化这条线。）

翻译成人话就是：ACP 这条线只运结论，不运过程。想看过程得去别的地方看。

实现监听的是 `session/event` 里的 `assistant/message`（`:155`、`:159`），是已提交的完整消息，不是流式 chunk。图片块降级成文本占位符。这条纪律的意思是：**ACP 是自动化通道，不是展示通道**。

**turn end reason 的映射有一个陷阱。** 映射表在 `packages/acp/acp/src/codec.ts:14-34`：`completed`/`aborted`/`blocked`/`error` → `end_turn`，`max-tokens` → `max_tokens`，`interrupted` → `cancelled`。但 prompt 级的最终结果里有一个覆盖分支：

```ts
              inflight.resolve(end.kind === 'max-tokens' ? 'end_turn' : turnEndToStopReason(end))
```

（`packages/acp/acp/src/index.ts:331`。这一行读作：如果本轮结束原因是 `max-tokens`，就把它当成 `end_turn` 报出去，其余原因才交给映射表 `turnEndToStopReason` 正常翻译；`inflight.resolve` 是把那个还悬着的 `prompt` 请求兑现掉。）理由在上一行注释：token 上限不是 prompt 级的停止原因。**所以 `end_turn` 不代表这个 turn 正常完成**：它可能是 aborted、blocked、error 或撞了 token 上限。跟 headless 那个严格的退出码语义对比一下就知道，同一个 `TurnEndReason` 在两个面上被投影成了完全不同的粒度。

**审批是 dsh 向客户端发起的**（`:215-229`）：拦 `approval/request` waterfall（waterfall 是 cordis 的一种事件形式，多个监听者排队接手，谁先给出答案就用谁的，都不接就走默认值），转成 `conn.requestPermission`，只提供两个一次性选项（`allow-once` / `reject-once`），**永不产生持久授权**（`:213-214` 的注释）。顺带一个对照：整条 waterfall 没人应答时的默认值是 `'unavailable'`（`packages/interaction/user-approval/src/index.ts:320`），也就是 fail-closed。

### 作为 client：`packages/subagent/subagent-acp`

反过来，当 dsh 要把工作委派给另一个 ACP agent 时，它做 client：

```ts
  const makeClient = (_agent: AcpAgent): Client => ({
```

（`packages/subagent/subagent-acp/src/run.ts:242`）

```ts
  const conn = new ClientSideConnection(
```

（`:266`。同一个包里的类型名换成了 `ClientSideConnection`（站在 client 这一侧的连接）、`makeClient`（造一个 client），和上面那对正好镜像。）它自动应答子 agent 的许可请求：

```ts
        const allow = params.options.find(o => o.kind === 'allow_once' || o.kind === 'allow_always')
```

（`:257`。子 agent 发来的许可请求报文里带一个 `options` 数组，每个选项有个 `kind` 字段；这行是从里面挑出第一个 `allow_once`（只允许这一次）或 `allow_always`（以后都允许）的选项，挑到就当作答复回过去。）两端对得很整齐：dsh 做 server 时提供 `allow_once`/`reject_once` 两个 kind，dsh 做 client 时正好按 `allow_once`/`allow_always` 去挑。而且 `packages/acp/acp/src/index.ts:213` 的注释直接点名 `dsh-subagent-acp` 是它的目标客户端：**dsh 的 ACP server 面主要是给 dsh 自己的子代理机制用的**。

---

## 四、MCP：dsh 只做消费方

方向相反且更简单：**dsh 是 MCP client，没有 MCP server 实现**。

`packages/mcp/mcp-client`（`export const name = 'mcp-client'`，`packages/mcp/mcp-client/src/index.ts:28`）注入的是 `tools`（`:31`），它把外部 MCP server 的工具注册进 dsh 的工具注册表。公开名的拼法：

```ts
export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}
```

（`packages/mcp/mcp-client/src/tools.ts:96-102`。这个函数把「哪个 server」和「原始工具名」拼成一个对模型公开的名字：先按 `mcp__<server>__<tool>` 拼成 `joined`，把非法字符全换成下划线得到 `normalized`；如果一个字符都没被换掉、长度也没超限，就直接用它；否则拿 `server\0tool` 算一个 sha256、截前几位当 hash，把名字截短再接上这个 hash。）常量是 64 字符上限、`[A-Za-z0-9_-]` 字符集、12 位 hash（`:45`、`:48`、`:51`），注释说明这是 DeepSeek 的 function-name 契约（`:82-91`）。超限时截到 51 字符再拼 hash；hash 输入用 `\0` 分隔 server 名与工具名，避免命名空间碰撞。

工具更新是**整代替换**，两阶段：

```
  // Phase 1: fetch and build the next generation without touching the registry.
  // Phase 2: swap generations.
```

（`:134` 与 `:157`。两行注释的意思是：阶段一「先把下一代工具拉下来、组装好，全程不碰注册表」，阶段二「把两代整个换过去」。）阶段一失败（网络错误、server 重复列出同名工具）直接 reject，上一代注册**一动不动**；阶段二的冲突只可能是外部注册占了 `mcp__<serverName>__` 命名空间，此时回滚到零工具。

两种传输在同一个 schema union 里（`packages/mcp/mcp-client/src/index.ts:107-128`）：`stdio`（command/args/env/cwd）与 `streamable-http`（url/headers），共享 `toolCallTimeoutMs`、`failOnStartupError` 和一组重连参数。

全仓搜 `McpServer`，只在测试里出现两处构造（`packages/mcp/mcp-client/tests/fixture-server.ts:12` 与 `packages/mcp/mcp-client/tests/mcp-client.e2e.ts:434`），都是给 client 当对手用的假 server；`src/` 下零命中。这与 ACP 面拒绝 `mcpServers` 是同一个立场：**dsh 消费 MCP 工具，不对外暴露 MCP 服务**。

---

## 五、SDK：JSON-RPC over stdio

`packages/sdk` 三个包：`protocol`（线格式与类型）、`server`（跑在 dsh 里的插件）、`client`（TypeScript 客户端）。

**分帧**是最朴素的 NDJSON（newline-delimited JSON：一行一个完整 JSON 对象，换行就是帧边界）：

```ts
  private drainLines(): void {
    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) break
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!line) continue
      void this.handleLine(line)
    }
  }
```

（`packages/sdk/protocol/src/transport.ts:180-189`。这段是收包侧的拆帧循环：在缓冲区里找换行符，找不到就退出等更多数据；找到就把换行之前的部分切出来当一帧、去掉首尾空白，缓冲区从换行之后重新开始；空行跳过，非空的交给 `handleLine` 去解析处理。）用 `StringDecoder` 处理跨 chunk 的 UTF-8 边界（`:64`），写出是 `JSON.stringify(message) + '\n'`（`:260-261`）。两个错误码是 JSON-RPC 的标准码：没有注册 request handler 回 `-32601`（method not found，方法不存在，`:229`），handler 抛异常回 `-32603`（internal error，内部错误，`:236`）。

**方法表只有三条**：

```ts
export interface HarnessSdkRequestMap {
  'initialize': { params: InitializeParams; result: InitializeResult }
  'session/prompt': { params: SessionPromptParams; result: SessionPromptResult }
  'shutdown': { params: undefined; result: Record<string, never> }
}
```

（`packages/sdk/protocol/src/types.ts:101-105`。这张表把每个方法名映射到它的请求参数类型 `params` 和返回结果类型 `result`：`initialize` 是握手，`session/prompt` 是投一条用户消息，`shutdown` 关闭运行时、返回一个空对象（`Record<string, never>` 就是「一个键都不能有的对象」）。整个 SDK 面对外能调的就这三条，别的方法名发过去只会得到 `-32601`。）`initialize` 带 `cwd`/`provider`/`model`/可选 `maxTokens`（`:16-25`），返回一个固定身份 `{ name: 'deepseek-harness-sdk-runtime', version: '0.0.1' }`（`packages/sdk/server/src/server.ts:124`）。

**`session/prompt` 只返回入队回执**：

```ts
export interface SessionPromptResult {
  /** Identity of the queued user message. */
  messageId: string
}
```

（`packages/sdk/protocol/src/types.ts:41-45`。结构体里只有一个字段 `messageId`，上面那行英文注释 `Identity of the queued user message.` 是说「刚入队的那条用户消息的身份标识」。返回的是回执，不是答案。）这是它和 ACP 最大的行为差别。ACP 的 `prompt` 会**等到 agent idle 才 resolve** 并返回 stopReason；SDK 的 `session/prompt` 立刻返回一个 `messageId`，一轮什么时候结束要靠通知流自己观察。

**四条通知**（`:93-98`）：`session.event`（会话里发生了一条事件）、`session.status`（会话状态变了）、`subagent.started`（有子代理起来了）、`subagent.finished`（有子代理结束了）。通知是单向的，服务端往客户端推，不带 id、没有回包。注意分隔符不一样：请求用 `/`，通知用 `.`。两个容易踩的语义：`session.event` 推送的是 **runtime 里所有 session** 的完整事件信封，不只是 SDK 创建的那些（`:52` 的注释）；`subagent.finished` **不报告 remote 运行**（`:74`），也就是走 `subagent-acp` 那种跨进程子代理不在里面。

**已知限制**上游自己列了，很坦率：

- `packages/sdk/protocol/README.md:37`：无协议版本协商，握手只带一个 `serverInfo.version`（`0.0.1`），客户端也不校验。
- `:38`：**无 cancel、无 session close**，客户端放弃一轮的办法是关掉 runtime 进程。
- `packages/sdk/server/README.md:45`：SDK 创建的 agent 一直活到进程关闭。
- `:47`：stdout 纯净性是**部署约束不是代码约束**：插件注释里写了 `Stdout is reserved for protocol frames, so the tree must not load a stdout logger.`（stdout 是留给协议帧的，所以这棵树里不能加载任何往 stdout 写的 logger），`packages/sdk/server/src/index.ts:4`，但 README 承认「this plugin does not inspect or veto sibling loggers」（这个插件不检查、也不否决同级的那些 logger），也就是说这条规矩全靠组合的人自觉。

顺便：headless 往 stdout 打结果（`packages/bundle/headless/src/index.ts:129`），SDK server 把 stdout 留给协议帧。这两个 bundle 绝不能出现在同一棵树里。

`packages/sdk/server` 和 ACP 一样只注入一个服务：`export const inject = ['agents']`（`packages/sdk/server/src/index.ts:22`）。headless 用的是 `ctx.get('agents')`（`packages/bundle/headless/src/index.ts:100`）。三个协议面共享同一个 agent 工厂，这是「协议面只是薄适配层」最直接的证据。

---

## 六、Python SDK：一个单文件可执行的壳

`python/` 下两个包。`python/sdk` 是纯 Python 客户端，`python/sdk-runtime` 是按平台分发的 wheel，里面装着打包好的 Node 可执行文件。

用法就是包一层子进程：

```python
    def run(
        self,
        input: str | list[JsonObject],
        *,
        session_id: str | None = None,
        on_notification: Callable[[Notification], None] | None = None,
    ) -> RunResult:
```

（`python/sdk/src/deepseek_harness/api.py:117-123`。`input` 收一段文本或一串 JSON 对象；`*` 之后的三个都是只能按名字传的可选参数：`session_id` 指定接着哪个会话跑，`on_notification` 给一个回调、每来一条通知就调一次。）返回：

```python
@dataclass(slots=True)
class RunResult:
    session_id: str
    final_response: str
    finish_reason: str | None
    events: list[JsonObject]
    notifications: list[Notification]
    session_root: str | None = None
```

（`:38-45`。六个字段依次是：这次跑在哪个会话里、最终回答的文本、结束原因、完整事件列表、收到的全部通知、会话落盘的根目录。）注意 `events` 和 `notifications` 都在里面：**跑完一次任务，完整的事件流就在返回值里**，不用另外去读日志。这是 benchmark 场景想要的形状。

构造参数（`:22-35`）里几个映射成环境变量：`session_root` → `DSH_SESSION_ROOT`、`cordis` → `DSH_CORDIS_CONFIG`、`cwd` → `DSH_CWD`、`base_url`/`api_key` → `DEEPSEEK_BASE_URL`/`DEEPSEEK_API_KEY`（`:64-72`）。cwd 一律 `Path(...).resolve()` 成绝对路径（`:60-61`）。

不显式给 `cordis` 时，bundled 运行时会注入一份自带的配置：

```python
        env["DSH_CORDIS_CONFIG"] = str(bundled_default_config_path())
```

（`python/sdk/src/deepseek_harness/client.py:454`。这一行是往子进程的环境变量表里塞一个 `DSH_CORDIS_CONFIG`，指向 wheel 里自带的那份默认配置文件。）优先级很干净：显式配置或非 bundled 运行时都直接 return，绝不覆盖（`:449`）。

**平台限制写在一个 14 行的 JSON 里**（`python/sdk-runtime/platforms.json`）：`linux-x64`（manylinux_2_28_x86_64）、`linux-arm64`（manylinux_2_28_aarch64）、`macos-arm64`（macosx_14_0_arm64）。**没有 Windows，没有 macOS x64。** 发布脚本 `scripts/build-python-release.py:47` 直接读这个 manifest，CLI 的合法平台取值就是它的 key。

打包路线在另一个脚本：`const PKG_SPEC = '@yao-pkg/pkg@6.21.0'`（`scripts/build-exe-for-python-sdk.ts:25`），用 `--sea` 模式（`:390`）打成单文件 Node 24 可执行。设计记录在 `.agents/notes/implemented/architecture/2026-07-10-single-file-executable-sdk-runtime-distribution.md`，代价那一节（`:85`）诚实地写着产物量级 174MB，源码原样进 blob、无字节码混淆。

---

## 七、BENCHMARK.md 上游只有三句话

`BENCHMARK.md` 全文 3 行、231 字节：

```
# Running benchmarks

Follow [Get started with the Python SDK](docs/user/guide/python-sdk.md) to install the SDK and run the `jsonrpc-agent` minimal variant. Use separate workspaces and session IDs for independent benchmark tasks.
```

这三行的意思是：标题「跑 benchmark」，正文一句「照着《Python SDK 上手》那篇装好 SDK，跑 `jsonrpc-agent` 这个 minimal 变体。相互独立的 benchmark 任务，各用各的 workspace 和 session ID。」

**上游不发布分数，也没有内置的评分器或任务集。** 「benchmark」在 dsh 的语境里就是：用 Python SDK 驱动一个 minimal 组合跑任务、收 JSONL。全仓搜 `swe-bench`/`swebench` 只有一处命中，是一个 e2e 冒烟测试的注释里说自己「swebench-style」（意思是「照 SWE-bench 那个样子来的」，`examples/headless-agent/tests/coding-task.e2e.ts:12`）。没有数据集加载器，没有 patch 评分，没有结果表。所以「dsh 自带 SWE-bench 跑分」的说法不成立。

它指向的组合是 `examples/jsonrpc-agent/minimal.cordis.yml`，82 行的**完整独立配置**（不是补丁，也就是说它不叠在 `dsh-base` 上，整棵树就这些），12 行插件。文件头（`:1-4`）：

> Complete unattended minimal-agent composition for the Python SDK. The model sees one deployment-selected system prompt and only the owner-scoped persistent Bash and string-replace editor tools. Runtime-context injection and context compaction are absent.

（给 Python SDK 用的、完整的无人值守 minimal agent 组合。模型只看得到一条由部署方选定的系统提示词，工具只有 owner 作用域下的持久 Bash 和字符串替换编辑器这两个。运行时上下文注入和上下文压缩都没有。）

做减法的那一段最能说明问题（`:47-57`）：

```yaml
- id: agent-spine
  name: '@deepseek-ai/dsh-agent-spine-demo'
  config:
    includeHarnessIdentity: false
    includeRuntimeContext: false
    persona: !!js process.env.DSH_SYSTEM_PROMPT ?? 'You are a helpful software engineer assistant.'
    workspaceContext: false
    skills:
      enabled: false
    toolBash: false
    toolJobs: false
```

这段 YAML 里被关掉的东西按行读是：不带 harness 自我介绍、不注入运行时上下文、persona（人设提示词）由环境变量 `DSH_SYSTEM_PROMPT` 决定、取不到就用那句默认的 `You are a helpful software engineer assistant.`（你是一个乐于助人的软件工程师助手）、不给工作区上下文、技能系统关、Bash 工具关、Jobs 工具关。

`docs/user/guide/python-sdk.md:84-93` 把结果列成一张表：system prompt 是 `You are a helpful software engineer assistant.`；模型默认 `deepseek-v4-flash`；模型可见工具**只有持久 bash 和 str_replace_editor**；bash 超时 300 秒；编辑器输出上限 16,000 字符；**上下文压缩关闭**；裸本地文件系统，绝对路径可寻址运行时进程能看到的任何路径；未压缩 JSONL。`contextWindow` 默认 1,000,000（`examples/jsonrpc-agent/minimal.cordis.yml:18`），`streamIdleTimeoutMs` 172,800,000 毫秒即 48 小时（`examples/jsonrpc-agent/minimal.cordis.yml:15`），沙箱 `danger-full-access`（`examples/jsonrpc-agent/minimal.cordis.yml:26`）。

安全提示写得很直白（`docs/user/guide/python-sdk.md:102`）：只在一次性 checkout 或容器里跑；持久 PTY 后端需要 POSIX 终端，所以这个组合不支持 Windows agent。

这个配方和发行版自带的 `minimal` agent preset（`apps/cli/config/agent-presets/minimal/agent.cordis.yml`，62 行）是同一个东西的两种封装：一个给 Web 会话用，一个给 Python SDK 用。上游把这条对应关系写进了 `.agents/notes/implemented/bug-fix/2026-08-10-minimal-preset-owns-rl-composition.md`。

意味着什么？**dsh 把「跑分用的 agent」和「产品用的 agent」在组合层面彻底分开了**，而分开的方式是两个 YAML 文件，不是编译开关也不是配置项。这也意味着任何拿 dsh 跑出来的分数，都必须同时说明用的是哪个组合：用 `standard` preset 和用 `minimal` 跑同一个任务集，是两个不同的系统。

---

## 八、DSML 澄清：它不在这个仓库里

上一版分析把 DSML 列进了 dsh 的协议面清单。这是错的。

在 `47f94385` 上跑：

```bash
grep -riI "dsml" --exclude-dir=node_modules --exclude-dir=.git . | wc -l
```

结果是 **0**。源码、`docs/`、`.agents/notes/`、示例配置，全仓零命中。

DSML 属于 **DeepSeek V4 模型仓库**（`encoding_dsv4.py`），是模型侧的聊天模板与工具调用序列化格式。它和 dsh 的在线 wire 没有关系：dsh 发出去的是 Chat Completions 的 SSE 请求，序列化在 `packages/llm/llm-deepseek/src/serialize.ts`，见 [附录 A 术语表](appendix-a-glossary.md)。

把 DSML 放进 dsh 的协议面表格会让读者以为源码里有对应实现。**它是外部内容，属于模型侧**。如果要研究「chat template 到 token 序列」这一层，那是模型仓库的话题，不是 harness 的。

---

## 九、六个面的矩阵

前面几节各讲各的，这里横过来对一遍。最值得盯的是第三列「dsh 的角色」和最后一列「权限怎么结算」：同一套 agent 内核，在六个面上被摆成了 server / client / 无协议三种姿势，而审批这件事在其中两个面上根本没有通道。

| 面 | 入口文件 | dsh 的角色 | 传输 | 消息形状 | 会话生命周期 | 权限怎么结算 |
|---|---|---|---|---|---|---|
| Web | `packages/bundle/web-app/` | server | HTTP POST 上行 + 两条 WebSocket 下行 | `POST /api/<ns>/<method>` `{args}`；下行 mux/host 帧 | 浏览器 `session.create`，长命 | 浏览器弹审批面板；配置面钉死回环 |
| headless | `packages/bundle/headless/src/index.ts` | 无协议，直接驱动 core | 无 | 无 | 一次性，跑完退出 | 沙箱策略来自 base 层；无审批应答者则 fail-closed |
| ACP（server） | `packages/acp/acp/src/index.ts` | **被驱动方** | JSON-RPC over stdio | `session/new`、`session/prompt`、`session/cancel` | 客户端建，进程内 | `session/request_permission`，一次性两选项 |
| ACP（client） | `packages/subagent/subagent-acp/` | 驱动方 | 同上，子进程 | 同上 | 子代理一次运行 | 按 `spec.permission` 自动应答 |
| MCP | `packages/mcp/mcp-client/` | **消费方（client）** | stdio / streamable-http | MCP 标准；工具注册为 `mcp__<server>__<tool>` | 每个 server 一个插件实例 | 走 dsh 自己的审批链 |
| SDK JSON-RPC | `packages/sdk/server/` | server | NDJSON JSON-RPC over stdio | `initialize` / `session/prompt` / `shutdown` + 4 条通知 | 一直活到进程关闭 | 无审批通道（协议里没有） |

方向再强调一遍，因为上一版把它写反过：**ACP 是外部工具来驱动 dsh（dsh 是 agent），MCP 是 dsh 去消费外部工具（dsh 是 client）**。`packages/subagent/subagent-acp` 是 ACP 方向上的例外，但那是 dsh 驱动**另一个** agent，不改变 `packages/acp/acp` 的角色。

---

## 十、代价与失效点

**同一个 `TurnEndReason` 在三个面上被投影成三种粒度。** headless 只认 `completed`（其余全退 1），ACP 把 `max-tokens` 也说成 `end_turn`，SDK 干脆不给每轮结果、只给入队回执。跨面比较「这个任务成功了吗」需要先统一口径。

**SDK 协议没有 cancel。** 三个 README 都写了（`protocol:38`、`server:45`、`client:47`）。放弃一轮的唯一办法是杀掉 runtime 进程，对 benchmark 场景可以接受，对交互场景不行。ACP 反而有 `session/cancel`（`packages/acp/acp/src/index.ts:338`），这是两个协议面最大的能力差。

**stdout 纪律是约定不是强制。** SDK server 的 README 自己承认它不检查也不否决兄弟 logger。一个部署组合里多挂一行 stdout logger，协议通道就坏了，而且坏得很难查。

**Python 运行时只覆盖三个平台。** 没有 Windows。而且 minimal 组合本身也不支持 Windows agent（持久 PTY 需要 POSIX 终端）。

**ACP 面拒绝 `mcpServers` 和 `additionalDirectories`。** 一个通用 ACP 客户端按标准发过来会被 `invalidParams` 拒掉。上游把这个包定位成「automation-only」（`:2`），字面意思是「只面向自动化」，不是通用 ACP 实现。

**两个协议面都不做版本协商，但不做的方式不同。** SDK 这边是**真的没有**：server 握手回一个 `serverInfo: { name, version: '0.0.1' }`（`packages/sdk/server/src/server.ts:124`），client 收到后只检查这两个字段是不是字符串（`packages/sdk/client/src/client.ts:270-274`），从不比对版本号，协议演进时两端对不上也没人会报错。ACP 这边不一样：`initialize` 是**返回** `protocolVersion` 的（`packages/acp/acp/src/index.ts:238`），只是这个实现刻意只支持一个版本，源码注释把这个选择写明了（`packages/acp/acp/src/index.ts:235`「Single-version agent」，译作「只认一个版本的 agent」；接着说 ACP 规范里「支持就回同一版本，否则回自己支持的最新版本」这两条分支在这里都落到同一个值上）。也就是说 ACP 面是「协商机制在、可选项只有一个」，客户端能从回包里发现不匹配；SDK 面是「连发现的手段都没有」。两者都属于 pre-release 姿态，没有兼容承诺，但排查成本差一个量级。

---

## 十一、别人怎么做

最后一列是这一篇的主题：**谁允许别的程序反过来驱动自己**。

| harness | 交互入口 | 程序化入口 | MCP | 对外提供 agent 协议 |
|---|---|---|---|---|
| dsh | Web（唯一；TUI 已删） | headless CLI、SDK JSON-RPC (stdio)、Python SDK | client only | ACP server |
| Claude Code | CLI、桌面端、Web、IDE 扩展 | Agent SDK | client（含 deferred 工具加载） | 无公开 agent 协议；有 hooks/skills/plugins |
| Codex | Rust CLI，可选 UI | app server、Extension API | client **+ server**（`codex!codex-rs/mcp-server/src/codex_tool_config.rs:106`：把 codex 自己包成一个名叫 `codex` 的 MCP 工具） | 经由上面那个 MCP server |
| OpenCode | TUI | server（HTTP）、SDK | client（tools/resources/OAuth/instructions） | **ACP server**（`opencode acp`，`opencode!packages/opencode/src/cli/cmd/acp.ts:58`，和 dsh 用同一个 `@agentclientprotocol/sdk`） |
| pi | 自定义 TUI | `-p` print/JSON、RPC、SDK、`packages/server` | **无**（可用扩展自建） | 无 |
| mini-swe-agent | CLI | 作为 Python 库 | 无 | 无 |

对着这张表：

**「被别的 agent 驱动」不是 dsh 独有的，但三家的做法不一样。** OpenCode 走的是和 dsh 同一条路：同一个 `@agentclientprotocol/sdk`、同样的 `AgentSideConnection`，`opencode acp` 就是一个完整的 ACP agent。Codex 走的是另一条：不做 ACP，而是发一个 `codex-mcp-server` 二进制，把整个 agent 包成一个名叫 `codex` 的 MCP 工具，让上游 agent 用 MCP 这条既有通道调它。pi 和 mini-swe-agent 两条都没有。

dsh 的特点在**定位**而不是有无：它的 ACP 面被明写成 `Automation-only`（`packages/acp/acp/src/index.ts:2`），拒绝 `mcpServers` 和 `additionalDirectories`，只发已提交的 assistant 文本，而且 `:213` 的注释直接点名首要客户端是 `dsh-subagent-acp`，也就是 dsh 自己的子代理机制。它是一个可以被任何 ACP 客户端调用的入口，但它是照着「给程序用」而不是「给编辑器插件用」设计的。

**dsh 的交互面最窄。** 别家至少两种（CLI + TUI，或 CLI + IDE），dsh 只有浏览器。这是 2026-08-04 主动收窄的结果，代价是没有终端形态；收益是不用为两套前端各维护一遍 slot 体系、命令面板、审批交互。

**程序化入口的形状差别很大。** Claude Code 的 Agent SDK 和 OpenCode 的 HTTP server 都是「长命服务 + 多种客户端」；dsh 的 SDK 是「一个 stdio 子进程，跑完返回完整事件流」。后者更适合批量跑任务：`RunResult.events` 里就是全部数据，不用另外拉。

---

## 十二、怎么自己核

```bash
# CLI 的入口形状
sed -n '9,16p' apps/cli/README.md
grep -n "mode: '" apps/cli/src/args.ts

# headless 主流程与退出码
sed -n '96,134p' packages/bundle/headless/src/index.ts

# ACP：确认它实现的是 Agent 接口（被驱动方）
grep -n "AgentSideConnection\|ClientSideConnection" packages/acp/acp/src/index.ts packages/subagent/subagent-acp/src/run.ts

# MCP：确认没有 server 实现
grep -rn "McpServer" packages --include=*.ts | grep -v '/tests/'

# SDK 方法表与通知表
sed -n '92,105p' packages/sdk/protocol/src/types.ts

# Python 运行时支持哪些平台
cat python/sdk-runtime/platforms.json

# BENCHMARK.md 全文与它指向的组合
cat BENCHMARK.md
wc -l examples/jsonrpc-agent/minimal.cordis.yml

# DSML 零命中
grep -riI "dsml" --exclude-dir=node_modules --exclude-dir=.git . | wc -l
```

跑 headless 验证退出码语义（需要凭据）：

```bash
dsh --profile headless "print the current directory"
echo $?
```

（第一行让 headless 跑一句「打印当前目录」，第二行打印上一条命令的退出码。）

---

## 自检

**1. 同一次任务撞了 token 上限，为什么 headless 退 1 而 ACP 回 `end_turn`？这两种投影各自服务的是什么需求？**

答：headless 是一次性入口，它的输出只有一个退出码和一段文本，脚本要靠退出码判断「这次到底成没成」，所以它把 `completed` 之外的一切都算失败，宁可严格。ACP 是被客户端长期驱动的通道，`stopReason` 回的是「这一轮 prompt 为什么停下来」；`max-tokens` 是模型在某个 turn 上撞了上限，不是这次 prompt 的停止原因，所以被折成 `end_turn`。同一个 `TurnEndReason` 因此在两个面上被投影成不同粒度，跨面比成绩之前得先统一口径。

**2. 如果把 `packages/sdk/server` 和 headless bundle 装进同一棵树，会发生什么？**

答：会坏，而且坏得不好查。headless 把最终答案往 stdout 打，SDK server 把 stdout 整条留给协议帧。两者同时在场，答案文本会混进协议流，客户端拆帧时读到一行不是 JSON 的东西。更麻烦的是这条规矩没有代码强制：SDK server 的 README 自己承认它不检查也不否决兄弟 logger，所以装配阶段不会有任何报错，要等到运行时才炸。

**3. ACP 面拒绝 `mcpServers`，这个选择让它失去了什么？为什么上游认为可以接受？**

答：失去的是「通用 ACP agent」这个身份：按标准来的客户端可以给 agent 转接一组 MCP 服务器，dsh 直接 `invalidParams` 拒掉，编辑器插件那类客户端接过来就撞墙。上游认为可以接受，是因为它给这个包的定位写在模块注释第一句里（automation-only），而且源码注释直接点名首要客户端是 `dsh-subagent-acp`，也就是 dsh 自己的子代理机制。这个面主要是给自己人用的，通用性不在目标里。

---

相关：[10 Cordis、启动、bundle 与 preset](10-cordis-boot-preset.md) 讲这些入口各自的组合从哪来；[11 Web 客户端与 host](11-web-client-and-host.md) 讲 Web 面的内部结构；[03 Agent Loop](03-agent-loop.md) 讲 `TurnEndReason` 的六种取值；[08 编排](08-orchestration.md) 讲子代理与委派；[13 自证制度](13-self-verification.md) 讲上游怎么保证这些包的文档不漂移；[14 横向对比](14-comparison.md) 有更完整的六家对照。
