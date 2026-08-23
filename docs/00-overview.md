---
title: 总览：一次请求是怎么拼出来、发出去、记下来的
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: stale
---

# 总览：一次请求是怎么拼出来、发出去、记下来的

*这一篇讲给第一次翻 dsh 源码的人。读完你能回答：一次请求从进程启动到落盘经过了哪些环节、219 个包里哪几组真正在这条路径上、其余的该去看本系列哪一篇。*

你要找 dsh（DeepSeek Harness）的「主流程」，大概会去 grep `main.ts`、`prompts.ts`。**都没有。**

dsh 是一棵 Cordis 插件树（Cordis 是一个 TypeScript 的依赖注入 / 插件框架，上游 fork 了一份自用，为什么要 fork 见 [10](10-cordis-boot-preset.md)）：树上每个节点是一个插件实例，插件之间靠事件和服务互相找。模型每一步收到的字节就由这几十个互不认识的插件各自贡献一小块，在 `preStep()` 这一个函数里汇合。所以读懂 dsh 的第一步不在找入口：入口是一次汇合，不是一条主干。

这一篇给出那条完整路径，把术语在原地讲清楚，再列出上游 49 个包组各管什么、由本系列哪一篇覆盖。

## 一次 dsh 请求，从进程到落盘

先看骨架。下面每一行的函数名与事件名都是源码里的字面量；出现的「row（行）」指的是 Cordis 配置文件里的一条插件条目，一行声明装哪个包、给它什么配置：

```text
$ dsh web
 └─ apps/cli/src/bin.ts        parseDshArgs() → 'profile' 分支 → runProfile()
     └─ apps/cli/src/profile-boot.ts   composeProfile(): 把 bundle 补丁叠加到空的 entry 列表
         └─ @deepseek-ai/dsh-app-boot  boot(): 建根 context、装 Loader、挂载 include 树
             ├─ dsh-base    78 个 row：llm / session / tools / sandbox / approval / persistence …
             ├─ dsh-web-app HTTP 服务 + 27 个 ui-* 浏览器插件；把 agent 级的工具行全部 disabled
             └─ agent-presets  standard / code / minimal / cordis 四个会话级组合

用户在 Web 里敲一句话
 └─ agent.send(message, 'next-turn', wakeup=true)          agent.ts:113
     └─ 驱动被唤醒 → turn()                                 agent.ts:246
         ├─ session.append('turn/start')                    agent.ts:255
         └─ 循环 { preStep() → step/start → step() }
             preStep()                                      agent.ts:225
              ├─ inbox.claim(target, turn)                   :229   领取本步的用户消息
              ├─ systemPrompt.assemble(assembleContextFor(agent, signal))  :230
              ├─ renderContextSections(assembly)             :232
              │   → runtimeContext.project(joinContextSections(…), …)      :233
              └─ waterfall 'agent/pre-step'                  :234-240
                   默认返回 [...claimed, runtimeSnapshot?]
                   AGENTS.md / skill 目录 / plan 叙述在这里插入自己的 user 消息
             session.append('step/start')                    agent.ts:279
             逐条 session.append('user/message', m, {surfaceOp:'append'})  agent.ts:282-284
             step()                                          agent.ts:332
              ├─ system = renderPrompt(assembly)             :337
              ├─ buildRequest(turn, step, assembly.tools, system,
              │               session.deriveMessages(), signal)            :340-342
              │    ├─ waterfall 'agent/request' → 整体替换 LlmCallConfig    :438-441  (事件名 :439)
              │    ├─ header = canonicalHeader({config, adapterDefaults, system, tools})  :458
              │    ├─ 首次/变化时 session.append('request/header')          :466 / :469
              │    ├─ 路由变化时 session.append('request/context')          :482
              │    └─ request = deepFreeze({...header.config, messages, system, tools, sessionId, signal})  :486
              └─ llm.stream(request)                         :345
                   └─ 逐 chunk session.append('assistant/chunk')           :349
                      BlockAssembler 聚合 → assistant/message
                      tool/call → tools/pre-execute → tools/execute → tools/post-execute → tool/result
             session.append('step/end')                      agent.ts:292
         step 循环收敛 → serial 'agent/turn-stopping' → turn/end
```

这张图怎么读：空行以上是进程启动，缩进表示「谁装载了谁」；空行以下是运行时，缩进表示调用与事件的先后。右边一列是出处，写全的形如「路径:行号」，只写 `:229` 这种冒号加数字的，承接上一行给出的同一个文件。`waterfall`、`inbox`、`surface`、`preset` 这些词在下一节就地解释，先照字面往下读不影响理解。

先说清三件事：

**一、模型每一步收到的是三块，不是一块。** system 字符串由 `renderPrompt(assembly)` 现拼（`packages/core/system-prompt/src/index.ts:212`），工具 schema 数组由同一次 `assemble()` 一起产出，会话历史由 `session.deriveMessages()` 从事件日志投影出来（`packages/core/session/src/index.ts:726`）。三块在 `buildRequest` 里合成一个冻结对象，再交给 **adapter（适配器）** 序列化成 DeepSeek chat-completions 请求体（`packages/llm/llm-deepseek/src/serialize.ts:151`，system 进 `messages[0]` 在 `:156-158`）。adapter 就是把 dsh 内部那套统一的请求对象翻译成某一家厂商 HTTP 请求体的那一层，换一家模型就换一个 adapter。哪一块放什么，见 [01 System Prompt](01-system-prompt.md)。

**二、`assemble()` 每一步都重跑，但设计目标是字节不变。** `request/header` 事件只在首次或 `headerEquals` 判定变化时才写（`packages/core/agent-loop/src/agent.ts:464-470`），这既是审计记录，也是「前缀有没有断」的可观测量。为什么这条约束值得整套架构围着它转，见 [02 KV-Cache](02-kv-cache.md)。

**三、「模型可见 ⟺ 已记录」是硬不变量。** 任何进入请求的内容都必须先成为一条 session 事件，所以你在 `agent.ts:282-284` 看到的是「先 append 再发」，而不是「发完再记」。上游把这条写进了 `docs/architecture.md:96`，还写了一句「a runtime invariant asserts it」（有一条运行时不变量在断言这件事）。这句话要打个折：那条断言确实存在（`packages/core/agent-loop/src/invariant.ts:39-42`），但它挂在可选的 `dsh-invariants` 服务上，而出厂的 `dsh` 配置**一个 invariant 都不挂**（`.agents/notes/implemented/simplification/2026-08-03-omit-invariants-from-shipped-config.md:13`）。也就是说，你正常跑起来的进程里那条断言根本没上岗。真正一直生效的是写入侧的强制：surface（表面，事件日志里模型能看见的那个子视图，下一节详解）事件不带 `surfaceOp` 直接抛。展开见 [05 Session](05-session.md)。

## 术语（就地解释，不用翻附录）

- **surface（表面）**是事件日志的一个子视图：只有 `user/message`、`assistant/message`、`tool/result` 三种事件能进入 surface（`packages/core/session/src/surface.ts:15-19`），`deriveMessages()` 只从 surface 折叠模型历史。压缩改写历史时不是删事件，而是往 surface 上追加一条「替换」事件。
- **epoch header / `request/header`** 是一次请求的「信封」：调用配置 + adapter 默认值标记 + 渲染好的 system 字符串 + 装配好的工具 schema（`packages/core/session/src/request-header.ts:21`）。它是持久事件，所以任何人拿着日志就能逐字节重建当时那个请求。
- **scope（作用域）**是按 agent 隔离注册的单位。一个工具、一段 prompt、一个变量，要么是全局的（每个 agent 都看得见），要么属于恰好一个 scope key；上游约定「一个活着的 agent 就是自己 scope 的 key」（`docs/glossary.md` 的 agent-scope 条目）。同名注册在更近的 scope 上遮蔽全局的那份，per-agent persona 就是这么实现的。
- **waterfall（瀑布事件）**是 Cordis 的环绕式中间件：监听器必须 `await next()` 才会往下走，返回值权威。`agent/pre-step`、`agent/request`、`llm/stream`、`system-prompt/assemble`、三个 `tools/*` 都是 waterfall（`docs/architecture.md:84`）。这是 dsh 唯一的拦截机制，没有第二套钩子系统。
- **fiber（纤程）**是 Cordis 里一个插件实例的生命周期句柄。所有注册都是 `ctx.effect(...)`，插件卸载时 fiber 一起 dispose，注册自动撤销。所以「装了什么插件」和「模型看到什么」永远是同一件事。
- **inbox（收件箱）**是 agent 的唯一输入队列。`send(message, target, wakeup)` 把消息投进去，`target` 是 `'next-turn'` 或 `'next-step'`，`wakeup` 决定要不要立刻唤醒驱动（`packages/core/agent-loop/src/agent.ts:113-131`）。注入的上下文可以不唤醒，等下一条真消息把它带上车。
- **seam（能力接缝）**指一个可替换能力的三个角色：Service Definition（定义方，抽象类或注册表，绝不是 TS `interface`）、Service Provider（提供方，真正干活的实现）、Consumer（使用方，通常就是模型能调的那个工具）。`packages/shell` 是范本：`dsh-shell` 定义、`dsh-bash-local`/`dsh-bash-sandbox` 提供、`dsh-tool-bash` 消费。换一个 provider 就换掉整个产品的一整块行为。
- **preset（agent preset）**是会话级的插件组合，一个目录里一份 `agent.cordis.yml`。每进程挂载一次到一个「standing scope」（常驻作用域：preset 挂上去以后一直在，不随某个 session 生灭），session 通过 scope 父链加入，于是 `agent → preset → global` 三层。Web 下模型看到的工具与 prompt 段落几乎全部由 preset 决定。
- **bundle** 是一种发行格式：一个声明了 `dsh.bundle` 的 npm 包，实质是一份 `cordis.patch.yml`。`dsh-base` 是每个 profile 的第一层，`dsh-web-app` / `dsh-headless` 叠在上面。补丁按 id 定位行并**整块替换** `config`，不做深合并。

## 上游 49 个包组

`packages/` 下是两级层次：`packages/<group>/<package>/`。用 `ls -d packages/*/ | wc -l` 数出 49 个组、`ls -d packages/*/*/ | wc -l` 数出 219 个包。下表每行一个组，`src` 是该组非测试 TypeScript 行数（`find … | grep -v -E '/tests?/|__tests__' | xargs cat | wc -l`，完整命令见 [附录 B](appendix-b-verification.md)）。

| 组 | 包数 | src 行 | 管什么 | 本系列哪篇 |
| --- | ---: | ---: | --- | --- |
| `core` | 8 | 13,589 | session 日志、system-prompt 装配、工具注册表、Agent 接口与默认 ReactLoop、scope 原语 | [01](01-system-prompt.md) [03](03-agent-loop.md) [05](05-session.md) |
| `llm` | 5 | 8,065 | Message/StreamChunk 词汇、adapter seam、DeepSeek 与 pi-ai 两个实现、重试、token meter | [04](04-llm-adapter.md) |
| `session` | 13 | 8,385 | 持久化（JSONL/SQLite）、投影、统计、标题、遥测、检查点策略 | [05](05-session.md) |
| `session-query` | 4 | 5,298 | 跨会话检索、事件追溯、日志导出 | [05](05-session.md) |
| `storage` | 4 | 2,088 | 键值与域存储 | [05](05-session.md) |
| `attachment` | 2 | 564 | 图片等附件的内容寻址存储 | [05](05-session.md) |
| `workspace` | 1 | 1,142 | 工作区的稳定 id、标题、会话成员 | [05](05-session.md) |
| `compaction` | 4 | 2,893 | 压缩 seam、basic 实现、工具结果裁剪、`/compact` | [06](06-compaction.md) |
| `spill` | 3 | 664 | 超大工具输出落盘 + 有界预览 | [06](06-compaction.md) |
| `context` | 4 | 3,411 | AGENTS.md/CLAUDE.md 注入、时间、tmux、被引用会话 | [01](01-system-prompt.md) |
| `skill` | 4 | 2,520 | skill 注册表、文件系统发现、`skill` 工具与目录注入 | [01](01-system-prompt.md) |
| `fs` | 7 | 5,746 | 文件 seam、本地实现、观察策略、沙箱包裹、`read/write/edit`、ripgrep 搜索 | [07](07-tools-approval-sandbox.md) |
| `shell` | 9 | 3,749 | bash/pwsh 的 local 与 sandbox 后端、持久 shell、`shell-env` | [07](07-tools-approval-sandbox.md) |
| `subprocess` | 2 | 1,819 | 子进程 seam | [07](07-tools-approval-sandbox.md) |
| `sandbox` | 4 | 3,945 | 沙箱 seam + bwrap / Landlock / Seatbelt / Windows ACL 后端链 | [07](07-tools-approval-sandbox.md) |
| `interaction` | 5 | 1,996 | 人类命令、权限预设、审批瀑布、向用户提问 | [07](07-tools-approval-sandbox.md) |
| `terminal` | 3 | 2,306 | PTY 会话与 `dsh-tool-terminal` | [07](07-tools-approval-sandbox.md) |
| `lsp` | 3 | 2,486 | 四个语义操作 + 通用 stdio 后端 + `lsp` 工具 | [07](07-tools-approval-sandbox.md) |
| `web` | 6 | 2,903 | `ctx.web` 的 search/fetch 两操作、三个搜索 provider、`web_search`/`web_fetch` | [07](07-tools-approval-sandbox.md) |
| `e2b` | 3 | 2,659 | 实验性：把 fs 与 subprocess 搬到 E2B 远程沙箱 | [07](07-tools-approval-sandbox.md) |
| `subagent` | 11 | 8,436 | 子代理 seam 与 in-process / ACP / SDK / Codex / Claude Code 五种 provider，以及委派工具 | [08](08-orchestration.md) |
| `workflow` | 4 | 3,610 | 模型写脚本扇出的 `workflow`、Ralph 循环、worker-thread 引擎 | [08](08-orchestration.md) |
| `goal` | 4 | 2,610 | 会话内长目标：状态机、轮次驱动、`/goal` 与工具 | [08](08-orchestration.md) |
| `plan` | 1 | 563 | plan 模式与 `exit_plan_mode` | [08](08-orchestration.md) |
| `todo` | 1 | 326 | `todo_write` | [08](08-orchestration.md) |
| `jobs` | 3 | 1,423 | 后台任务注册表与 `job_*` 工具 | [08](08-orchestration.md) |
| `schedule` | 1 | 2,028 | 定时触发的会话 | [08](08-orchestration.md) |
| `guard` | 2 | 374 | 重复工具调用提醒、超时策略 | [08](08-orchestration.md) |
| `hooks` | 3 | 1,813 | Claude Code / Codex 的 shell hook 协议桥接 | [08](08-orchestration.md) |
| `extensions` | 4 | 16,096 | 让模型在运行时定义/运行/撤销 Cordis 插件（`cordis_*` 工具 + vm 宿主 + 浏览器半边） | [09](09-extensions-and-code-mode.md) |
| `code-runtime` | 2 | 2,019 | Code Mode 的执行 seam 与 worker-thread 后端 | [09](09-extensions-and-code-mode.md) |
| `boot` | 2 | 1,500 | profile 组合、Loader 装配、分层 env、命令行参数快照 | [10](10-cordis-boot-preset.md) |
| `bundle` | 3 | 571 | `base` / `web-app` / `headless` 三份补丁 | [10](10-cordis-boot-preset.md) |
| `preset` | 2 | 1,783 | agent preset 词汇与发现、可组合的 persona 行 | [10](10-cordis-boot-preset.md) |
| `settings` | 2 | 1,532 | 「schema 默认 → 组合 base → 用户段」三层设置解析 | [10](10-cordis-boot-preset.md) |
| `credentials` | 2 | 741 | 配置里只放引用，key 从环境与 `$DSH_HOME` 解析 | [10](10-cordis-boot-preset.md) |
| `identity` | 1 | 131 | 一个匿名 Harness-home 关联 id | [10](10-cordis-boot-preset.md) |
| `client` | 39 | 71,896 | 浏览器半边：shell、连接、运行时、slot 扩展点、约 22 个 `ui-*` 特性插件 | [11](11-web-client-and-host.md) |
| `host` | 8 | 10,680 | Web GUI 的 Node 半边：apiproxy、webserver、静态资源、目录选择、插件清单 | [11](11-web-client-and-host.md) |
| `api` | 2 | 1,817 | Typert 一元 RPC 网关与 BFF remotes | [11](11-web-client-and-host.md) |
| `typert` | 4 | 8,430 | 源码类型反射 → 运行时注册表 → 生成 Host/Client 契约 | [11](11-web-client-and-host.md) |
| `feedback` | 2 | 785 | `/feedback` 与每条 assistant 消息的本地评分 | [11](11-web-client-and-host.md) |
| `acp` | 1 | 532 | ACP stdio JSON-RPC 服务器 | [12](12-surfaces-and-protocols.md) |
| `mcp` | 1 | 929 | MCP 客户端，只桥接 tools | [12](12-surfaces-and-protocols.md) |
| `sdk` | 3 | 1,754 | NDJSON JSON-RPC 协议、服务器插件、TS 客户端 | [12](12-surfaces-and-protocols.md) |
| `runtime-diagnostics` | 1 | 230 | 开发期运行时契约断言服务 | [13](13-self-verification.md) |
| `test-support` | 6 | 7,003 | 快照录制、loop 测试工具、mock LLM 服务器、录制回放 | [13](13-self-verification.md) |
| `examples` | 3 | 659 | demo 骨架包 | [13](13-self-verification.md) |
| `util` | 7 | 1,269 | 品牌类型、`$DSH_HOME` 解析、超时、输出保留、原子写 | [13](13-self-verification.md) |

`client` 一个组就占了源码的 32%，而它与 harness 核心机制关系最小；`core` + `llm` + `session` 三组加起来 30,039 行，才是「一次请求怎么成形」的全部代码。

## 规模事实

以下数字都在锁定 commit `47f94385` 上实测（命令见 [附录 B](appendix-b-verification.md)）：

| 事实 | 值 |
| --- | ---: |
| `packages/` 下的包目录 | 219 |
| 包组（两级层次的第一级） | 49 |
| `packages/` 非测试 TS/TSX 行数 | 228,300 |
| `packages/` 测试行数 | 268,040 |
| 测试文件数 | 854 |
| `.agents/notes/` 英文设计记录 | 683 |
| `docs/` 英文文档 | 110 |
| 所有包与 app 的版本号 | `0.1.0-rc.5` |

测试比源码多 17%。原因是上游把「每个包必须有 README 的 Model Experience 小节」（这一节固定写清「模型在什么条件下、看到这个包贡献的什么内容」）、「每个非平凡改动必须配一篇 Agent Note」、「行号快照必须可重录」都做成了脚本门禁。这套自证机制单独占一篇，见 [13 自证与工程化](13-self-verification.md)。

683 篇设计记录是 dsh 最不寻常的地方：它把「为什么这么定」全部写进了 `.agents/notes/`，路径即状态（`{lifecycle}/{class}/yyyy-mm-dd-topic.md`，三层依次是生命周期、类别、日期与主题，看一眼路径就知道这篇记录处在什么阶段、属于哪一类改动）。本系列的「为什么这么设计」几乎全部引自那里，导读见 [15 设计记录导读](15-agent-notes-guide.md)。

## 这个系列怎么读

| # | 文章 | 读完你会明白 |
| --- | --- | --- |
| 00 | 本篇 | 一次请求从进程启动到落盘的完整路径，以及 49 个包组各管什么 |
| 01 | [System Prompt](01-system-prompt.md) | 模型第一眼看到的那段文字逐字长什么样、每一段由哪个包按什么 order 贡献、runtime 状态为什么走 user 消息 |
| 02 | [KV-Cache](02-kv-cache.md) | 为什么 dsh 一行 `cache_control` 都不发却能持续命中，以及哪些操作会把前缀打断 |
| 03 | [Agent Loop](03-agent-loop.md) | 一个 turn 里 `step()` 逐段做了什么，工具怎么并行、怎么有序结算、怎么取消 |
| 04 | [LLM 层](04-llm-adapter.md) | 请求 JSON 怎么序列化、SSE 怎么解析成 `StreamChunk`、重试与错误分层怎么走 |
| 05 | [Session](05-session.md) | 事件日志的形状、surface 投影、`deriveMessages()` 的折叠，以及崩溃恢复怎么修补半截工具调用 |
| 06 | [压缩](06-compaction.md) | 压力什么时候判定、砍哪一段、摘要请求为什么能复用暖缓存前缀 |
| 07 | [工具、审批与沙箱](07-tools-approval-sandbox.md) | 工具从 `defineTool` 到执行的完整管线，审批瀑布何时 fail-closed，沙箱在每个平台怎么落地 |
| 08 | [编排层](08-orchestration.md) | 子代理、plan、goal、Ralph、workflow、hooks 各自挂在循环的哪个点上 |
| 09 | [Extensions 与 Code Mode](09-extensions-and-code-mode.md) | 让模型在运行时改自己的插件树是怎么做到的，以及只给它一个 `run_code` 会发生什么 |
| 10 | [Cordis、启动与 preset](10-cordis-boot-preset.md) | 默认到底装了哪些行、四个 preset 差在哪、为什么要 fork 一份 Cordis |
| 11 | [Web 客户端与 host](11-web-client-and-host.md) | 39 个前端包如何把一条事件日志变成你看到的界面 |
| 12 | [产品表面与协议](12-surfaces-and-protocols.md) | Web / headless / ACP / MCP / Python SDK 各是什么、谁驱动谁、退出码怎么定 |
| 13 | [自证与工程化](13-self-verification.md) | invariant 服务、测试分层、文档门禁：一个仓库如何用脚本证明自己没坏 |
| 14 | [横向对照](14-comparison.md) | dsh 与 Claude Code / Codex / OpenCode / pi / mini-swe-agent 在七个维度上的机制差异 |
| 15 | [设计记录导读](15-agent-notes-guide.md) | 683 篇 Agent Note 里最值得读的那些，以及上游 110 篇文档的分工 |
| A | [术语表](appendix-a-glossary.md) | 每条术语带源码出处 |
| B | [怎么自己核对](appendix-b-verification.md) | 不用凭据能核什么、要凭据才能核什么，以及本系列所有统计数字的命令 |

想省时间就读 01 → 02 → 14 三篇：模型看到什么、为什么这么排、别人怎么做。其余按需查。

## 自检

**1. `assemble()` 每一步都重跑一遍，为什么反而要求它每次产出的字节一模一样？**

重跑是为了让插件树的当前状态说了算：谁装上了、谁卸了、哪个 scope 遮蔽了哪个，都在这一步现算。字节不变是为了让这件事对模型不可见，因为模型看到的开头一变，前缀复用就断了。dsh 把这个约束做成了可观测量：`request/header` 事件只在首次或 `headerEquals` 判定变化时才写（`packages/core/agent-loop/src/agent.ts:464-470`），所以日志里凭空多出一条 header，就等于告诉你「这一步前缀断了」。展开见 [02 KV-Cache](02-kv-cache.md)。

**2. 上游说「模型可见 ⟺ 已记录」由一条运行时不变量保证，这篇为什么要给这句话打折？打完折还剩什么在兜底？**

断言本身确实存在（`packages/core/agent-loop/src/invariant.ts:39-42`），但它挂在可选的 `dsh-invariants` 服务上，而出厂的 `dsh` 配置一个 invariant 都不挂（`.agents/notes/implemented/simplification/2026-08-03-omit-invariants-from-shipped-config.md:13`），所以正常跑起来的进程里它没上岗。兜底的是写入侧那道更硬的门：surface 事件不带 `surfaceOp` 就直接抛，想绕过记录的内容压根写不进日志，也就进不了请求。

**3. 只想搞懂「一次请求怎么成形」，该盯哪几组包？为什么浏览器那一侧的代码可以先整个跳过，哪怕它是全仓最大的一坨？**

盯 `core` + `llm` + `session`，13,589 + 8,065 + 8,385 = 30,039 行，请求的拼装、序列化与记录全在这里。行数第一的是 `client`，39 个包、71,896 行，占源码 31%，它是浏览器那半边，干的是把一条事件日志渲染成你看到的界面，不参与请求怎么拼、怎么发。想知道界面是怎么来的，再去看 [11 Web 客户端与 host](11-web-client-and-host.md)。
