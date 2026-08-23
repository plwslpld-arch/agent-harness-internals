---
title: 设计记录导读：683 篇 Agent Note 里最值得读的那些
sources: [{"repo":"deepseek-harness","path":".agents/notes/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: stale
---

# 设计记录导读：683 篇 Agent Note 里最值得读的那些

*写给想搞清楚「这里当初为什么这么定」的人。读完你能回答：一篇笔记的状态藏在哪、为什么被否掉的方案反而最值得读、想找某个主题的决策该怎么捞出来。*

想查一个设计的来龙去脉，多数人的第一反应是翻 git log、找 CHANGELOG，再不行就找个索引页照着挑。这三条路在这里全是死的，最后一条还是**故意**堵上的。所以得先知道这些笔记按什么规则摆，否则你只能一个目录一个目录地翻。

dsh 没有 CHANGELOG。你想知道「为什么 compaction 的摘要请求要把用不上的 `tools` 也一起带上」，git log 帮不了你，答案在 `.agents/notes/` 里的一篇 Agent Note 中，而且写得比任何代码注释都清楚。

这个语料库有 683 篇英文笔记。每篇是一个三件套：英文原文 `x.md`、中文镜像 `x.zh.md`、记录两侧配对状态的 `x.i18n.yaml`，所以落到磁盘上是 683 × 3 = 2,049 个文件。日期跨度 2026-06-11 到 2026-08-13，两个月。本文做两件事：讲清它的组织规则，然后挑出二十篇（十四篇 implemented、三篇 rejected、三篇 proposed）逐篇说明它解决你什么疑问。二十篇不是「最重要的二十篇」的排名，是一份够用的入口。组织规则讲清楚之后，剩下的 663 篇你自己按路径捞比看别人的清单快。

## 一、先看见：一篇 Agent Note 长什么样

这是完整的一篇（`.agents/notes/implemented/simplification/2026-08-03-omit-invariants-from-shipped-config.md`，正文略去中间段落）：

```markdown
# Agent Note: Omit runtime invariants from shipped dsh config

Status: implemented

English | 中文（这里是一个指向同名 .zh.md 的相对链接）

## Problem

`@deepseek-ai/dsh-invariants` and package-owned `./invariant` companions are optional
development diagnostics. The shipped TUI mounted the service and four stateful companions
while the shipped Web tree omitted them, so the two product surfaces had different
diagnostic cost and failure behavior. …

## Decision

The shipped `dsh` configuration trees under `apps/cli/config/` mount neither
`@deepseek-ai/dsh-invariants` nor any package-owned `./invariant` companion. …

## Alternatives considered

- **Mount the service with `enabled: false`.** Rejected because the shipped tree and CLI
  dependency would still carry diagnostics that install no checks.
- **Keep the TUI-only mount.** Rejected because the shipped surfaces would retain
  different diagnostic and failure behavior.
- **Remove invariant support from the repository.** Rejected because package-owned checks
  remain useful in tests, examples, generated SDKs, and explicit development compositions; …

## Consequences

- Ordinary `dsh` TUI and Web runs install no invariant listeners or trace state and cannot
  fail through `InvariantError`.
- …
```

上面这块英文按四段走，中文对应是这样：`## Problem` 讲问题，说的是 invariant（不变量检查）本来是可选的开发期诊断，但发布出去的 TUI 挂了它、Web 树没挂，两个产品面因此有了不一样的诊断开销和失败行为；`## Decision` 讲决定，`apps/cli/config/` 下发布用的配置两个都不挂；`## Alternatives considered` 讲考虑过的其他做法，三条分别是「挂上但 `enabled: false`」（否，因为发布树和 CLI 依赖还是背着一套装不上检查的诊断）、「保留只有 TUI 挂」（否，两个产品面的诊断和失败行为还是不一样）、「干脆把 invariant 支持从仓库删掉」（否，测试、示例、生成的 SDK 和显式的开发组合里还用得上）；`## Consequences` 讲后果，普通的 TUI 和 Web 跑起来不装任何 invariant 监听器和 trace 状态，也就不可能因 `InvariantError` 失败。

一篇好的设计记录的信息密度就在 `## Alternatives considered` 里：三个被否掉的方案，各写了为什么输。`.agents/notes/README.md:111` 把这一节列为强制，理由是「A decision recorded without what it beat invites re-litigation — the failure Agent Notes exist to prevent.」

（一个决定，如果不把它赢过了谁一起记下来，早晚会被人翻出来重吵一遍，而这正是 Agent Note 要防的事。）

## 二、路径即状态

`.agents/notes/README.md:9`：「Every Agent Note has two axes, both encoded in its **path** — `{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`」。

（每篇 Agent Note 都有两个维度，两个都写在路径里：`{生命周期}/{类别}/年-月-日-主题标题.md`。）

也就是说，你不用打开文件就知道这篇处于什么状态、属于哪一类、什么时候写的。lifecycle 指一篇笔记走到了哪一步，class 指它属于哪一类改动。

lifecycle 四种：`proposed/`（还没做，或只做了一部分）、`implemented/`（做了；事实要跟着代码更新）、`rejected/`（考虑过、决定不做；上游明说这类笔记只在「理由还能拦住一个诱人的错误」时保留，否则整个三件套删掉）、`archived/`（已实现但被取代或不再有指导价值，冻结归档）。class 是封闭集合六种，定义在 `scripts/agent-note-tree.ts:19`：`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`。`refactor` 被**刻意排除**，因为它和 simplification 的判据（可观察行为是否改变）重叠。

数量分布，我自己数了一遍：

| lifecycle | architecture | feature | bug-fix | process | simplification | testing | 合计 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| implemented | 129 | 170 | 77 | 69 | 48 | 12 | **505** |
| archived | 14 | 54 | 19 | 20 | 27 | 8 | **142** |
| proposed | 10 | 4 | — | 7 | 2 | 2 | **25** |
| rejected | — | 1 | — | — | 10 | — | **11** |
| 合计 | 153 | 229 | 96 | 96 | 87 | 22 | **683** |

复算命令在文末。几条值得知道的规则：

- **没有中心索引，而且是故意的。** `.agents/notes/README.md:19`：「The active lifecycle tree is the working inventory … Do not add a centralized `INDEX.md`」，意思是活着的那几棵 lifecycle 目录树本身就是清单，别再另外加一个集中的 `INDEX.md`。理由记在 `.agents/notes/implemented/process/2026-07-19-remove-generated-agent-note-index.md`：交叉引用必须写成相对 markdown 链接，才能被机器检查是否失效。所以你**只能**靠目录浏览和搜索，这也是本文存在的理由。
- **每个非平凡改动必须在同一 PR 里增改至少一篇笔记**（`.agents/notes/README.md:46`）。
- **implemented 不许被改写成另一个决定。** 事实（路径、包名、默认值）要跟着代码同步更新，但决定本身要反转就得写新笔记并交叉链接。
- **archived 是冻结树**（`.agents/notes/README.md:42`：「Once sealed, every archived triplet is permanently frozen」，一旦封存，归档的那一套三件套就永久冻住），只允许五种改动，由 `scripts/verify-archived-agent-notes.ts` 用 append-only 的哈希清单校验。
- 格式由 `scripts/verify-agent-note-format.ts` 强制，细节见[《13 自证与工程化》](13-self-verification.md)。

## 三、按主题的十四篇

683 篇里真正会改变你读源码方式的没那么多。下面挑十四篇，覆盖前面几篇正文用得最多的五个主题；每格给出「日期 · 状态」和一句话论点，路径都相对 `.agents/notes/`。这不是全集；同主题的其余笔记用第九节最后那条 `grep` 按关键词自己捞，路径本身就带着状态和日期，捞出来一眼能判断值不值得读。

### A. 骨架：三条定住全局的原则

| 笔记 | 论点 | 读它能解决什么 |
| --- | --- | --- |
| `implemented/architecture/2026-07-05-reconstructable-requests.md`<br>*Every LLM request is reconstructable from the session log*<br>（每一次 LLM 请求都能从会话日志重建出来）<br>07-05 · implemented | 「**Model-visible ⟺ durably referenced.**」（`.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md:17`）这一句是说：模型看得见的，必然被持久引用；反过来也成立。任何进入模型请求的内容都必须能从日志加内容寻址对象逐字节重建。 | 「某次请求究竟发了什么、能不能复现」。整个仓库最重要的一条原则。 |
| `implemented/architecture/2026-06-11-event-sourced-sessions.md`<br>*Event-sourced sessions with derived message history*<br>（会话按事件溯源存，消息历史是从事件派生出来的）<br>06-11 · implemented | 「A `Session` is an append-only log of typed `SessionEvent`s — the single source of truth.」（`.agents/notes/implemented/architecture/2026-06-11-event-sourced-sessions.md:13`）这一句是说：一个 `Session` 就是一串只追加的、带类型的 `SessionEvent`，它是唯一真源。消息历史由 `deriveMessages()` 派生；append 同步、持久化 write-behind（先记内存再异步落盘）。 | 「消息历史存在哪、为什么不能直接改数组、fork/resume 怎么实现」。 |
| `implemented/architecture/2026-06-11-microkernel-event-taxonomy.md`<br>*Microkernel — extension via Cordis event taxonomy, one concrete loop*<br>（微内核：扩展全靠 Cordis 的事件分类学，具体循环只有一个）<br>06-11 · implemented | 不自建中间件栈，扩展机制就是**纯 Cordis 事件分类学**：按 waterfall / serial / parallel / emit 四种派发模式定义带类型的扩展点（waterfall 指前一个处理器的结果接着喂给下一个，一层层往下淌；emit 只把事件广播出去，不收结果），`dsh-agent-loop` 只是唯一且可替换的具体循环。 | 「我要加的功能该挂在哪个事件、用哪种派发语义」。 |

### B. Prompt 与工具呈现

| 笔记 | 论点 | 读它能解决什么 |
| --- | --- | --- |
| `implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md`<br>07-05 · implemented | 「**One principle: every fact in the prompt has exactly one owner.**」（`.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md:21`）这一句是说：prompt 里的每个事实，有且只有一个归属方。模型名/cwd 是变量，工具语义在 description，跨调用习惯在工具包的 prompt section，身份在 `harness:identity`，角色在 persona。 | 「一段面向模型的文字该写在哪个包」。 |
| `implemented/feature/2026-07-06-explicit-tool-order.md`<br>07-06 · implemented | 「The system-prompt assembly owns the canonical model-facing tool order」（`:13`），意思是模型看到的那份工具顺序以 system prompt 的拼装环节为准。不再依赖插件注册顺序（那曾导致 CI 快照漂移）。 | 「工具在请求里的排列由什么决定、`toolOrder` 怎么配」。 |
| `implemented/feature/2026-06-15-code-mode.md`<br>06-15 · implemented | Code Mode 是 `ToolRuntime` 的第一等呈现模式（`native | code | both`）：`code` 下只暴露 `run_code` 加生成的 SDK 声明。 | 「模型怎么用写程序代替逐次工具调用、隔离边界在哪」。 |

### C. KV-cache、token 与压缩

| 笔记 | 论点 | 读它能解决什么 |
| --- | --- | --- |
| `implemented/bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md`<br>07-21 · implemented | 摘要调用逐字复用上一条路由请求的前缀：「The summarization directive moves from the **front** of the request (a fresh `system` prompt) to the **end** of the conversation」（`:13`），这句话是说，那条要求做摘要的指令从请求最前面的一段新 `system` prompt，挪到了对话的最末尾。于是它是暖缓存的前缀扩展而不是新请求。 | 「压缩那次辅助调用长什么样、为什么连用不上的 `tools` 也要带上」。见[《06 压缩》](06-compaction.md)。 |
| `implemented/architecture/2026-07-10-after-call-compaction-pressure-and-overflow-recovery.md`<br>07-10 · implemented | 压力判定挪到**下一次 pre-step 边界**，用上一次调用的真实 usage；provider 因超窗拒绝时走窄的恢复路径，只有 surface（这次请求摆到模型面前的那一整面：prompt、工具、消息）确实变化才允许 retry。 | 「压缩在生命周期哪个点判定、超限失败后怎么自动恢复」。 |
| `implemented/architecture/2026-07-15-replay-token-meter-service.md`<br>07-15 · implemented | `ctx.tokenMeter`：以最新精确 usage 为锚点 + 保守启发式重定价，暴露 `logRevision`。 | 「界面上那个 token 数字怎么来的、准不准」。 |

### D. Session 与持久化

| 笔记 | 论点 | 读它能解决什么 |
| --- | --- | --- |
| `implemented/bug-fix/2026-07-21-semantic-session-checkpoints.md`<br>07-21 · implemented | `dsh-session-checkpoint-policy` 在 pre-step、记下 `request/header` 之后、记下 `tool/call` 之后各加一道 flush 屏障，turn 不再是唯一崩溃恢复点。 | 「被 SIGKILL 时能保住什么、恢复后怎么判断工具到底跑没跑」。 |
| `implemented/architecture/2026-08-10-session-log-version-mechanism.md`<br>08-10 · implemented | 单个递增整数版本 + n→n+1 升级链，「**The writer decides bumps, not the reader.**」（版本号什么时候往上跳，由写日志的那一方定，读的一方说了不算）；逐事件的 `ignorable` 标记（这条事件老 harness 不认识也可以直接跳过）吸收词表增长。 | 「加一个新事件类型要不要升版本、老 harness 读到新日志会怎样」。 |

### E. 工具执行、子代理与安全

| 笔记 | 论点 | 读它能解决什么 |
| --- | --- | --- |
| `implemented/feature/2026-07-10-parallel-tool-call-execution.md`<br>07-10 · implemented | 每个工具可选一个同步纯函数分类器 `isConcurrencySafe(args)`，只有显式 `true` 才并行，其余 fail-closed（拿不准就按不安全算）为独占并成为排序屏障。 | 「我的工具怎样才能被并行、为什么 bash 永远独占」。 |
| `implemented/feature/2026-06-21-subagent-capability-seam.md`<br>06-21 · implemented | seam 指一处留好的能力接缝：接口定死，谁来实现由配置挑。subagent 是**按名字注册的 provider 注册表**（对标 LLM adapter），不是单实例服务；fork 与 fresh 是两个独立后端，不是请求上的开关。 | 「为什么 subagent 不像 bash 那样单实例、怎么同时暴露多种委派方式」。 |
| `implemented/feature/2026-07-06-sandbox.md`<br>07-06 · implemented | 「One seam, one per-platform chain of local backends, one consumer, and two levers on top」（`:17`），意思是一个接缝、每个平台一条本地后端链、一个消费方，上面再架两个开关：每次调用的一次性提权 + 每会话模式，全部从叶子 `cordis.yml` 组合，不动 agent-loop。 | 「`[sandbox: file access denied]` 是什么意思、模型怎么合法提权」。见[《07 工具、审批与沙箱》](07-tools-approval-sandbox.md)。 |

## 四、`rejected/` 十一篇：信息密度最高的一批

被拒绝的方案往往比实现了的更有信息量，因为 `Status:` 那一行就是完整的论证。十一篇里十篇是 simplification，也就是**有人提议删掉某个东西，被否了**。整批一屏就能读完（命令见第九节），这里只挑三条最能说明这个语料库价值的：

- `rejected/simplification/2026-06-20-truncate-interrupted-turns.md`：「a single turn can contain substantial real work, including many steps and large tool output」（`.agents/notes/rejected/simplification/2026-06-20-truncate-interrupted-turns.md:3`），意思是一个 turn（一次用户输入到助手答完的完整来回）里可能已经干了大量真活，包括很多 step 和很大的工具输出。结论是不能在加载时截断未完成的 turn。这条直接解释了会话日志里那些「有工具输出、没有助手回答」的残缺 turn 为什么被保留。
- `rejected/simplification/2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.md`：**实现之后才被证伪**。理由是「vitest's fake clock does not intercept `node:timers/promises`, so the swap costs deterministic fast tests for ~10 deleted lines」（`.agents/notes/rejected/simplification/2026-07-26-builtin-timer-promises-for-hand-rolled-sleeps.md:3`），翻过来是：vitest 的假时钟拦不住 `node:timers/promises`，这一换，等于拿确定性的快测试去换十来行代码的删减。一条「用标准库替手写代码」的常识性改进，被测试基础设施的一个具体事实否掉。
- `rejected/feature/2026-07-26-evaluate-landstrip-for-windows-sandbox-rung.md`：十一篇里唯一的非 simplification。评估一个第三方 Windows 沙箱库，因为它「a days-old single-maintainer project, ~48 GitHub stars at rejection」而否（一个建起来才几天、只有一个维护者的项目，被否时约 48 个 GitHub star）：承担安全不变量的依赖必须有被验证过的采用度。

剩下八篇的模式是一样的：有人认真想删某个东西，被一条具体证据拦下来。想知道「这个仓库为什么长这样」，这一批比任何架构文档都直接。

## 五、`proposed/` 二十五篇，以及一篇自我批评

proposed 里最值得读的是 `proposed/feature/2026-07-06-recallable-compaction.md`，因为它是**对当前压缩机制的自我批评**。

它指出两个缺陷。一是压缩不可逆：模型看到的摘要里没有任何指向被遮蔽内容的引用（`shadowedRange` 只存在于纯日志事件上），也没有工具能读回去，尽管 append-only 日志一个字节都没丢。二是缓存：「the head checkpoint is rewritten every pass, so the request prefix takes a full prompt-cache miss each time」（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:9`），翻过来就是：唯一的那个头部 checkpoint 每压一轮就被就地重写一次，于是请求前缀每次都彻底错过 prompt 缓存，从位置 0 起整体失效。

根因诊断很漂亮：「The root cause is one artifact playing two conflicting roles.」（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:11`），也就是根因在于同一份产物被拿去扮两个互相打架的角色。索引想要冻结、按时序、廉价；模型的工作记忆想要全局视图、可重排、可变。一份摘要两者都做不好。

提案是拆成两类：一批**冻结的 index stub**（每块约 100–200 token，提交后永不重写）加一份**可变的 state checkpoint**，再加一个 `history_read` / `history_search` 工具让模型回读被遮蔽的区间。index stub 指一小块只用来说明「这一段原本讲了什么」的定长摘要片，state checkpoint 则是模型当前的工作记忆快照。缓存收益写得很具体：「The request prefix after a pass is `[system][stubs…][state][tail]`. Frozen stubs are byte-stable across passes, so the miss begins at the token replacing the previous state checkpoint」（`.agents/notes/proposed/feature/2026-07-06-recallable-compaction.md:53`）。

（压完一轮之后，请求前缀是 `[system][stubs…][state][tail]` 这个形状。冻结的 stub 每轮逐字节都一样，所以未命中要等到替换上一份 state checkpoint 的那个 token 才开始。）

**它还没实现**。读[《06 压缩》](06-compaction.md)和[《02 KV-Cache》](02-kv-cache.md)时把这篇当作「作者自己知道的短板清单」。

其余 24 篇里另外点名两篇，它们各自补上了正文某一篇的已知短板：`proposed/testing/2026-06-11-mutation-testing.md` 提议用变异测试对冲逐文件 100% 覆盖率，理由是覆盖率只证明行跑过，恰好接住[《13 自证与工程化》](13-self-verification.md)里那个「100% 覆盖率骗过的那一次」；`proposed/architecture/2026-07-19-required-cancellation-through-tool-capability-seams.md` 提议让漏传 `AbortSignal` 变成编译错误，对应[《07 工具、审批与沙箱》](07-tools-approval-sandbox.md)里取消路径靠约定而非类型保证的那一段。

## 六、`.agents/skills/`：写给贡献者（主要是 agent）的十一份操作手册

skill 不是设计记录，是**可加载的工作流程**。11 个目录，每个一份 SKILL.md：`dsh-archive-agent-notes`（新笔记的取代审计与归档判定）、`dsh-code-review`（本仓 PR 评审导向）、`dsh-doc-site-sync`（VitePress 站点映射）、`dsh-doc-standards`（分层与预算，含 `verify-doc-budgets` 失败怎么办）、`dsh-find-simplifications`（找死代码、重复、过度设计）、`dsh-merging-stacked-prs`、`dsh-pre-push-checks`（选覆盖本次 diff 的最小测试集，而不是反射式跑全量）、`dsh-prose-standard`（散文/注释/prompt/诊断信息的统一文体）、`dsh-translate-docs`、`dsh-trim-cot-leakage`（清除「推理转录腔」，比如残留的 `(decision N)`、审计编号、「used to / no longer」式变更叙述，也就是「以前是这样、现在不这样了」的写法）、`record-browser-gif`（改动 GUI 的 PR 必须配一段真实录制的 GIF）。

把过程规范写成可加载的 SKILL.md 而不是散落在 CONTRIBUTING 里，本身就说明了这个仓库的主要贡献者是谁。

## 七、上游 `docs/`：110 篇里哪些是机器写的

英文文档 110 篇、27,598 行。**15 篇是纯生成物**，文件头第一行就写着 `Generated by scripts/xxx.ts — do not edit by hand`（由某个脚本生成，别手工改）：

| 生成物 | 行数 | 内容 |
| --- | --- | --- |
| `docs/config-catalog.md` | 3,151 | 每个可加载包的 `config:` 声明逐字粘贴（JSDoc 一起），并交叉校验运行时 schema |
| `docs/tool-catalog.md` | 1,873 | 模型可见的全部工具 schema。生成器**真的把每个工具插件启动起来**读 `ctx.tools.schemas()`，因为 schema 静态不可知 |
| `docs/module-graph.md` | 1,638 | 包依赖图，从 `peerDependencies` 推导 |
| `docs/persistence-catalog.md` | 944 | 每种持久化产物 |
| `docs/capability-seams.md` | 471 | 全部 seam 的 Definition/Provider/Consumer 图 |
| `docs/agent-lifecycle.md` / `docs/tool-execution-pipeline.md` / `docs/event-producer-consumer.md` / `docs/graph-atlas.md` | 82 / 62 / 76 / 24 | turn-step 顺序图、工具流水线图、事件生产消费矩阵、图索引 |
| `docs/cordis-api/*.md` | 6 篇 | Cordis 框架 API |

另有 43 篇**含嵌入的生成区**，全部落在 `docs/subsystems/` 的 46 篇子系统页里（另外 3 篇没有生成区）。`<!-- BEGIN GENERATED cordis-surface -->`（这一行的意思就是「生成区从这里开始」）到 `END` 之间是从源码抽的 Cordis API 区，人只能写标记之外的部分。所有这些都由 `doc-sync` 里的 `--check` 门禁保证新鲜。

**人写的部分**里，按性价比排序值得读的：

- `docs/architecture.md`（129 行）：地图。短、准、有权威，但故意不讲实现细节。
- `docs/AGENTS.md`（75 行）：文档标准本身：tutorial/reference 二分、一个事实一个家、**写现状不写历史**、`ts` 围栏必须能编译、双语配对、slop 清单（一份被禁的套话和写法名单）。读它你就明白上游为什么不会写「以前是 X 现在是 Y」。
- `docs/defensive-patterns.md`（33 行）：7 条真出过 bug 的规则。信息密度最高的一页。
- `docs/testing.md`（49 行）：测试分层与「验证世界而不是自述」等规则。
- `docs/glossary.md`（45 行）：一词一义，seam / scope / turn / step / round / goal 的官方定义。
- `docs/postmortem/`（4 篇）：真事故复盘。
- `docs/cookbook/`（8 篇）：加一个包 / 一个工具 / 一个 LLM 适配器的逐文件清单。
- `docs/subsystems/`（46 篇）：查类型和契约用，不适合通读。

### 上游文档和本仓库的分工

上游已经讲清楚的：**类型与契约**（subsystems）、**配置字段**（config-catalog）、**工具 schema**（tool-catalog）、**事件生产消费矩阵**、**包依赖图**、**每个包对 prompt/token/缓存的影响**（215 份 README 的 Model Experience 小节）、以及**每个决策的 why**（Agent Note）。这些都比本仓库全，需要精确答案时应该直接查上游。

上游按自己的文档标准**不会**写的：跨包的端到端机制叙事（一次请求从 inbox 到 wire 的逐步走读）、历史演进（被 slop 清单禁止）、横向对比、以及把 505 篇 implemented 笔记浓缩成的设计原则清单。这四块就是本仓库的位置。

## 八、别人怎么做

在锁定 commit 上实测四个开源对照仓（Claude Code 闭源，不做源码级对照）：`codex`、`opencode`、`pi`、`mini-swe-agent` 中，**没有一个有结构化的决策记录树**：没有 `adr/`、`decisions/`、`rfc/` 或等价目录。Codex 有 CHANGELOG.md 和 15 篇 `docs/` 用户文档，另外三家连 CHANGELOG 都没有。

这不是说别家没记决策，而是说决策记录在别处：PR 描述、issue 讨论、提交信息。区别在于**可检索性和格式约束**：dsh 的 683 篇笔记每一篇都有 `## Alternatives considered`，路径直接编码了状态，三个脚本门禁盯着格式，而且「被拒绝的方案」被单独保存了十一篇。翻 git log 找不到「当初为什么不选 X」，翻 `rejected/` 十分钟就能读完。

代价在[《13 自证与工程化》](13-self-verification.md)里算过：683 × 3 个文件，加上每个非平凡 PR 都要动笔记的规则。

## 九、怎么自己核

```bash
# 各 lifecycle × class 的篇数（改路径复算表格里任意一格）
find .agents/notes/implemented/architecture -name '*.md' ! -name '*.zh.md' | wc -l

# 683 篇英文笔记
find .agents/notes -name '*.md' ! -name '*.zh.md' \
  ! -name 'AGENTS.md' ! -name 'README.md' ! -name 'CLAUDE.md' | wc -l

# 日期跨度（先滤掉 AGENTS/README/CLAUDE，否则 README.md 会排到最后一行冒充日期）
find .agents/notes -name '*.md' ! -name '*.zh.md' \
  ! -name 'AGENTS.md' ! -name 'README.md' ! -name 'CLAUDE.md' -printf '%f\n' \
  | cut -c1-10 | sort -u | sed -n '1p;$p'

# 十一篇 rejected 的理由，一屏读完
for f in .agents/notes/rejected/*/*.md; do case $f in *.zh.md) continue;; esac; sed -n '1p;3p' "$f"; echo; done

# 哪些上游文档是纯生成物（15 篇；只看顶层会漏掉 docs/cordis-api/ 那 6 篇）
grep -rl "^<!-- Generated by" docs --include='*.md' | grep -v '\.zh\.md'

# 某个主题的笔记（比如缓存）
grep -rl "KV cache\|prompt-cache\|cache miss" .agents/notes --include='*.md' | grep -v zh.md
```

想按主题横扫，最有效的办法不是浏览目录，而是 `grep -rl` 关键词再看命中笔记的 `## Decision` 段。因为没有索引，这就是设计上唯一的检索方式。

## 自检

**1. 上游明令禁止加集中索引，可你要找某个主题的决策，靠 grep 一个个捞明显更费劲。为什么这个规则还是划算的？**

答：索引是一份需要人手同步的副本，笔记加一篇、改一次状态它就可能对不上，而且没有任何机器手段能发现它过期了。目录树不一样：状态和日期直接编码在路径里，改状态就是移动文件，不存在「忘了更新索引」这种状态。交叉引用也被要求写成相对 markdown 链接，链接失效机器查得出来，索引里的一行条目失效则查不出来。用「捞的时候费点劲」换「捞到的东西一定是准的」。

**2. `rejected/` 只有十一篇，`implemented/` 有 505 篇，为什么本文说前者信息密度更高？**

答：implemented 的笔记你还可以从代码里反推出结论，甚至读源码就够了；rejected 的方案代码里一个字都没有，它证伪的恰恰是那些看起来很对、很可能被你再提一次的想法。timer promises 那篇就是例子：换标准库是常识性的好改动，是测试基础设施的一个具体事实把它否掉的，这个事实不写下来，下一个人还会再提一遍再踩一次。

**3. 一篇 `implemented/` 的笔记，后来发现当初的决定错了，能不能把它改成新的决定？改了会怎样？**

答：不能。事实层面（路径、包名、默认值）要跟着代码同步更新，但要反转决定本身，得写一篇新笔记并跟旧的交叉链接。如果直接改写，等于把「当初为什么选它」这条论证抹掉了，后来的人看到的是一个从没被质疑过的结论，`## Alternatives considered` 那节要防的重吵一遍就会发生。而且旧笔记里被否掉的方案，可能正是你现在要选的那个。
