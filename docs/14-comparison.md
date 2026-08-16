---
title: 横向对照：六个 harness 在同一件事上的不同做法
sources: [{"repo":"deepseek-harness","path":"packages/core/system-prompt/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"codex","path":"codex-rs/core/src/client.rs","commit":"c4941302c73c6322b153bba13ac0a9f4396301d6"}, {"repo":"opencode","path":"packages/opencode/src/session/system.ts","commit":"4643e65ad6334de3e4e68dedc201d5fbb828c9fe"}, {"repo":"pi","path":"packages/coding-agent/src/core/system-prompt.ts","commit":"086c32e74530564922d011ade23ff582c9d63116"}, {"repo":"mini-swe-agent","path":"src/minisweagent/models/utils/cache_control.py","commit":"a83fcae82d2a08f0ee0c688f9d137b3566c097f8"}]
last_verified: 2026-08-16
status: draft
---

# 横向对照：六个 harness 在同一件事上的不同做法

*写给已经把 01–13 读完、想知道别人家怎么解同一道题的人。读完你能回答：七个维度上六家分别怎么做，哪几处是共识，哪几处是真分歧。*

先自问两个问题。第一个：「system prompt 存在哪个文件里」，你多半会答「不就是源码里一个常量字符串」。六家里有两家压根没有这么一个文件，dsh 的是插件在运行时各贡献一段拼出来的，Codex 的是服务端随模型元数据下发的。第二个：模型开始反复调同一个工具、参数都一样，该拦下来还是只提醒一句？OpenCode 和 dsh 的判据一字不差，处置却相反。真正能学到东西的就是这类地方：判据一样、选择不同，差别落在产品立场上而不是技术能力上。

这一篇不比谁好谁坏，也不比代码行数：比行数只能得出「Codex 一百四十万行、mini-swe-agent 一万五千行」这种没有信息量的结论。这里比的是**同一个问题，六家分别怎么解**。

先说清楚对照对象和证据来源，因为它们不是一个层次的东西：

| 项目 | 形态 | 本篇证据来源 |
| --- | --- | --- |
| **dsh**（DeepSeek Harness） | 开源，Cordis 插件树，219 个包 | 源码，commit `47f9438` |
| **Codex**（OpenAI） | 开源，Rust 核心 `codex-rs` | 源码，commit `c494130` |
| **OpenCode**（anomalyco） | 开源，TypeScript | 源码，commit `4643e65` |
| **pi**（earendil-works） | 开源，TypeScript，刻意极简 | 源码，commit `086c32e` |
| **mini-swe-agent**（SWE-agent） | 开源，Python，190 行 agent | 源码，commit `a83fcae` |
| **Claude Code**（Anthropic） | **闭源** | 只用公开官方文档，逐条给链接 |

Claude Code 不开源，所以它在下面每张表里都标注了文档出处而不是文件行号。本篇不使用任何泄露的 prompt 转储。

**这一篇和前面十几篇的分工**：dsh 自己怎么做，01–13 每篇都讲透了，这里不重讲；凡是涉及 dsh 机制的地方，一律只给结论加一个指针。本篇的产出是那张七维矩阵，以及从矩阵里读出来的**跨维度模式与分歧**：哪些做法六家不约而同（通常说明背后有个共同的硬约束），哪些是真正的分歧（通常说明背后是产品判断而不是技术判断）。矩阵每一格都是可核的事实，段落只讲矩阵横着读、竖着读能看出什么。

---

## 维度一：system prompt 怎么拼出来

这是差异最大的一维。五家能核源码的分成两派，分界线不在「提示词写得好不好」，在**提示词这份资产归谁所有**。（Claude Code 闭源，无法判断它的 system prompt 怎么组织，本篇不给它归派。）

**「没有中心 prompt 文件」派：只有 dsh。** system 字符串是运行时由插件各自贡献的 section 按 `order` 拼出来的，装一个插件就多一段。机制、逐段 order 表、每段归哪个包，全在 [01 System Prompt](01-system-prompt.md)，这里不重复。

**「中心 prompt 模板」派：Codex、OpenCode、pi、mini-swe-agent 四家。** 但这四家内部还有一条更有意思的分线：模板存在哪。

- Codex 走到了另一个极端：system prompt（Responses API 的 `instructions` 字段）**是模型元数据的一部分**，由 `/models` 下发模板，客户端只填 personality 占位符，本地 `prompt.md` 只是兜底。提示词升级不需要发新版客户端。它和 dsh 在光谱上其实是邻居：两家都拒绝「提示词是客户端源码里的一个常量」，只是一个把所有权交给了插件，一个交给了服务端。
- OpenCode 按模型家族分发不同的主提示（`packages/opencode/src/session/system.ts:27`）：Claude 系用 `anthropic.txt`，GPT-4/o1/o3 用 `beast.txt`，Gemini、Kimi、Meta 各有各的。承认「同一段提示词在不同模型上效果不同」。
- pi 只有一份极简 prompt（`packages/coding-agent/src/core/system-prompt.ts:121`），项目可以用 `SYSTEM.md` 整体替换、`APPEND_SYSTEM.md` 追加。
- mini-swe-agent 就两段 Jinja 模板：一句话的 `system_template`（系统提示模板）+ 带任务和示例的 `instance_template`（每个任务实例各渲染一份的模板）。

**动态信息放哪，是这一维里更要紧的问题。** 六家的答案惊人地一致，而且都是被缓存逼出来的：

| 项目 | 环境/权限/状态这类每轮可能变的信息放哪 |
| --- | --- |
| dsh | user 消息里的「runtime context 快照」，只有内容变了才追加一条新的 |
| Claude Code | user 消息里的 `<system-reminder>` 块（官方博客明说：「pass in this information via messages in the agent's next turn instead」） |
| Codex | developer 角色的 WorldState 分节，首轮全量、之后只发 diff |
| OpenCode | `<env>` 段在 system 里（含 `Today's date`，按天变），plan 模式提醒走 user 消息 |
| pi | `<project_context>` 在 system 里，但不含日期、平台、git 状态——靠「不放易变信息」保持稳定 |
| mini-swe-agent | 环境信息在 `instance_template` 渲染出的第一条 user 消息里 |

表里 Claude Code 那格引的官方博客原话「pass in this information via messages in the agent's next turn instead」，意思是：这类信息别往 system 里塞，改成在 agent 下一轮的消息里带进去。`<system-reminder>` 是它给这段注入内容包的标签名，字面就是「系统提醒」。Codex 那格的 WorldState 直译是「世界状态」，指的是环境、权限、状态这一整包信息。

OpenCode 把日期放进 system 是这里唯一明显的缓存漏洞：跨天的会话第一次请求整个前缀作废。pi 的做法相反，干脆不给模型日期。

**AGENTS.md / CLAUDE.md 这类项目指令文件**，六家都支持，但发现规则差别很大：

| 项目 | 发现规则 | 注入位置 |
| --- | --- | --- |
| dsh | `$DSH_HOME/AGENTS.md` + 项目根到 cwd 的整条目录链，同目录里 `AGENTS.md`/`CLAUDE.md` 都加载，之后按内容去重；65536 字节预算（是组合里配的值，schema 没有默认，`packages/bundle/base/cordis.patch.yml:232-235`），超了先丢最宽的 | user 消息里的 `<system-reminder>`，只有 fs 工具动过文件才刷新 |
| Claude Code | 目录树向上全量拼接，子目录惰性加载，`@import` 最多 4 跳，另有 `.claude/rules` 可按 `paths:` 限定作用域 | user 消息（官方文档明确说是为了保住 system 缓存） |
| Codex | 项目根到 cwd 逐级找 `AGENTS.override.md`/`AGENTS.md`，32 KiB 预算（`codex!codex-rs/core/src/config/mod.rs:210`） | `input` 数组头部的 developer 消息 |
| OpenCode | 从 cwd 向上 `findUp`，**第一个命中的文件名类别为准**（不堆叠所有祖先）；支持 http(s) 远程 URL | system 段；另有懒加载——模型 read 某个子目录文件时，才把沿途未加载的 AGENTS.md 作为工具结果附件注入 |
| pi | 全局 + 完整祖先链的 `AGENTS.override`/`AGENTS`/`CLAUDE.md` | system 里的 `<project_context>` |
| mini-swe-agent | 不支持 | — |

表里几个英文名字直译一下：OpenCode 的 `findUp` 是「从当前目录一路往上找」；Claude Code 的 `@import` 是在指令文件里引另一个文件的语法，`paths:` 是「这条规则只对哪些路径生效」；Codex 的 `AGENTS.override.md` 字面就是「覆盖版的 AGENTS」。

OpenCode 的「懒加载嵌套 AGENTS.md」是这一维里最聪明的设计：不预先把整棵树塞进上下文，等模型真读到那个目录下的文件时再补。

---

## 维度二：缓存策略

先分清 provider 侧的两种模型，否则没法比：

- **自动前缀缓存**（DeepSeek、OpenAI）：服务端按请求前导 token 序列自动匹配，客户端不需要标记任何东西，唯一能做的是别改前缀。
- **显式断点**（Anthropic）：客户端用 `cache_control: {type:"ephemeral"}` 标记最多 4 个断点，读的时候从断点往回看最多 20 个 block。字段名照字面读就是「缓存控制：类型为短暂」，block 指请求里的一个内容块。

于是「谁做得好」这个问题要分两半看：用自动缓存的，比的是**前缀纪律**；用显式断点的，比的是**断点放得准不准**。

| 项目 | 做法 | 关键实现 |
| --- | --- | --- |
| **dsh** | 没有任何缓存 API 调用。让 `请求 = f(事件日志)`，日志只追加，投影是纯函数，于是每次请求天然是上次的字节级扩展 | `deriveMessages()` + `EpochHeader` 按值比较，见 [02 KV-Cache](02-kv-cache.md) |
| **Claude Code** | 显式断点分四层：静态 system+tools（全局缓存）→ CLAUDE.md（项目内）→ 会话上下文 → 对话消息。切模式用工具（`EnterPlanMode`）而不是换工具集；压缩请求复用父会话完全相同的 system/tools | 官方文档 [prompt-caching](https://code.claude.com/docs/en/prompt-caching) |
| **Codex** | `prompt_cache_key = session_id`，子 agent 共享同一个 key；`store: false` 全量重放历史 + 加密 reasoning 内容 | `codex!codex-rs/core/src/client.rs:484`（key 取 session_id）、`:921`（挂进请求）、`:931`（`store: false`） |
| **OpenCode** | AI-SDK 路径给**前 2 条 system + 末 2 条消息**打 ephemeral；OpenAI 家族用 sessionID 当 `promptCacheKey`；工具按名字排序保证顺序稳定 | `packages/opencode/src/provider/transform.ts:359` |
| **pi** | 三锚点：system 块、最后一个工具、最后一条用户消息，可选 1 小时保留；**摘要请求刻意用 `cacheRetention: "none"` + 新 sessionId**，避免污染主会话的缓存分片 | `pi!packages/coding-agent/src/core/compaction/compaction.ts:573` |
| **mini-swe-agent** | 只给最后一条消息打 ephemeral，工具恒为一个 bash | `src/minisweagent/models/utils/cache_control.py:49` |

表里的英文字段先过一遍：`deriveMessages()` 是「从日志派生出消息」的那个函数，`EpochHeader` 直译「纪元头」，指一次模型调用的那份调用快照；Codex 的 `prompt_cache_key` 是「提示词缓存键」，`store: false` 是告诉服务端「别帮我存这次的历史」；OpenCode 的 `promptCacheKey` 同理，ephemeral 就是上面那个「短暂」标记；pi 的 `cacheRetention: "none"` 意思是「这次请求不要写缓存」。`EnterPlanMode`（进入计划模式）是 Claude Code 用来切模式的那个工具的名字。

横着读这张表：

1. **缓存纪律靠的是流程而不是代码。** 六家的缓存实现都不复杂，难的是「别人改了一行就把前缀弄脏」这件事没法靠类型系统挡住。Claude Code 的答案是把缓存断裂当事故（官方博客原话「We alert on cache breaks and treat them as incidents」，意思是缓存一断就报警，按线上事故的流程处理），dsh 的答案是 CI 门禁（每个包 README 必须声明自己对 KV-cache 的影响，见 [13 自证](13-self-verification.md)）。两条路都不是技术方案，是工程流程。

2. **旁路请求怎么处理，是这一维唯一的真分歧。** 摘要、起标题这类请求如果和主会话共用缓存分片，会把主会话的热前缀挤掉。pi 的答案是**隔离**：换 sessionId 并禁止写缓存。dsh 的答案是**复用**：摘要请求原样带上主会话的 system/tools，指令放尾部（见 [02 KV-Cache](02-kv-cache.md)、[06 压缩](06-compaction.md)）。两者不是谁对谁错：隔离针对的是显式断点语义（断点数量有限，得省着用），复用针对的是自动前缀缓存（前缀越长越划算）。剩下四家没有对这个问题表态，等于默认让旁路请求去挤主会话。

3. **压缩之后主对话必然全 miss，六家都没有解决。** Claude Code 的 `/rewind`（回到一个已缓存的前缀，比压缩便宜）是绕过而不是解决；dsh 的上游把这个缺陷写进了一份还没实现的提案里，自评见 [15 设计记录导读](15-agent-notes-guide.md)。这是全篇唯一一处六家一致的**失败**，说明它大概率不是工程投入不够，而是「摘要既要冻结又要可改写」这个矛盾本身还没有好解法。

---

## 维度三：上下文压缩

压缩要回答三个问题：什么时候动手、保住哪一段、摘要那次请求怎么发。前两列是前两个问题，第三列是各家的分歧点。[06 压缩](06-compaction.md) 篇末有更细的版本（多一列「摘要怎么发」）。表里 dsh 那格出现的 surface，指模型实际看见的那串消息（从事件日志投影出来的那一层，不等于日志本身）。

| 项目 | 触发阈值 | 保留什么 | 特别之处 |
| --- | --- | --- | --- |
| **dsh** | 上下文压力超过配置比例，或 `CONTEXT_WINDOW_EXCEEDED` 溢出后恢复 | 从 surface 头开始压，保留尾部一段，不拆 tool 配对 | 摘要请求逐字复用主会话的 system/tools，指令放尾部；压缩前先跑工具结果剪枝 |
| **Claude Code** | 默认到模型上限（可 `/autocompact` 调），**先清旧工具输出，再摘要** | 明确的幸存清单：CLAUDE.md 和 auto memory 从磁盘重注入、已调用 skill 正文重注入（单个 5k、总计 25k tokens 上限） | 有防抖动：单个大输出导致压完立刻又满时，几次后停止自动压缩并报错，而不是死循环 |
| **Codex** | `(context_window * 9) / 10`，配置只能往低调不能往高调（`codex!codex-rs/protocol/src/openai_models.rs:482-493`） | 保留 ≤20k tokens 的用户消息（`codex!codex-rs/core/src/compact.rs:57`）+ 摘要 | 三种实现回退链（远程 v2 → 远程 v1 → 本地）；还有一种「不摘要，直接开新窗口 + 让模型自管预算」的模式；摘要注入位置刻意对齐训练分布 |
| **OpenCode** | 可用额度 = 输入上限 − reserved，reserved 默认取 20,000 与该模型 maxOutputTokens 的**较小值**（`opencode!packages/opencode/src/session/overflow.ts:8-19`） | 尾部 25% 预算，夹在 2k–15k 之间（`opencode!packages/opencode/src/session/compaction.ts:118`），可在 turn 内切分 | 用一个**专用的、没有工具的 compaction agent** 做摘要；可选清空旧工具输出为 `"[Old tool result content cleared]"` |
| **pi** | 给「提示词 + 模型回复」预留 16,384 token，用不下了就压（`pi!packages/coding-agent/src/core/compaction/compaction.ts:134`） | 保留最近 20,000 token（`:135`），**绝不在工具结果处切** | 摘要作为 `CompactionEntry` 追加进 JSONL 会话树；跨 turn 时做 split-turn 双摘要 |
| **mini-swe-agent** | **没有压缩** | — | 唯一保护是 observation 超 10,000 字符做 head/tail 截断（`mini-swe-agent!src/minisweagent/config/mini.yaml:113-124`）；撞上窗口直接终止任务 |

表里的英文照抄自源码：dsh 那格的 `CONTEXT_WINDOW_EXCEEDED` 是「上下文窗口已超出」这个错误码；OpenCode 用来顶掉旧工具输出的 `"[Old tool result content cleared]"` 意思是「旧的工具结果内容已清空」；Codex 的 `context_window` 就是上下文窗口大小，`maxOutputTokens`（OpenCode 那格）是该模型单次最多能吐多少 token。pi 那格的 `CompactionEntry` 直译「压缩条目」，是它写进会话文件的那种记录类型。

OpenCode 和 pi 的摘要模板高度相似（目标 / 约束 / 进度 / 决策 / 下一步 / 涉及文件），而且都会把上一次的摘要合并进新摘要。dsh 的摘要指令则更强调「你现在是压缩引擎，压缩上面的对话」。

mini-swe-agent 没有压缩不是缺陷，是立场：它主张 harness 应该薄，轨迹本身就是训练数据，加压缩会污染这份数据。

---

## 维度四：agent 循环与工具执行

循环本身六家都差不多：发请求、拿工具调用、执行、再发。真正拉开差距的是**出岔子时怎么办**：模型死循环了、回复被截断了、工具列表中途变了。第四列收的就是这些。

| 项目 | 循环形态 | 并行工具 | 有意思的细节 |
| --- | --- | --- | --- |
| **dsh** | turn / step 状态机，每步先写日志再派生请求 | exclusive 工具形成屏障，parallel 工具进有界滚动池，结果按**模型给出的顺序**提交 | 取消时给未派发的调用合成 `ABORTED_BEFORE_DISPATCH` 结果，保证 tool_calls 与结果配对完整 |
| **Claude Code** | 全量重发 + 缓存；并行工具批次 | 是 | 超时命令自动转后台；用户可以在模型跑的时候排队补充消息 |
| **Codex** | ThreadManager → Session → Task → `run_turn` → 采样请求 | 是，`FuturesOrdered`，**边流边执行**（`OutputItemDone` 一到就启动工具 future） | `StepContext` 快照：一次采样内的上下文、工具列表、工具执行共享同一份快照，避免「工具列表变了但历史里的调用对不上」 |
| **OpenCode** | `runLoop` 每步一次 `streamText` | 是 | **doom-loop 检测**：末尾 3 个 part 全是同名同参的工具调用（`DOOM_LOOP_THRESHOLD = 3`，`opencode!packages/opencode/src/session/processor.ts:29`）就转成一次权限询问；`invalid` 工具调用会尝试修复 |
| **pi** | 手写显式循环 + steering / follow-up 消息队列 | 默认并行，单个工具可声明 `executionMode: "sequential"` | `stopReason === "length"` 时**作废本轮所有工具调用**（`pi!packages/coding-agent/src/core/agent-session.ts:665`）——截断的工具调用参数可能是残缺 JSON，执行它很危险 |
| **mini-swe-agent** | `while True: execute_actions(query())` | 否，顺序 | 每个动作起一个新 subshell（`cd`、环境变量都不保留）；用一个哨兵字符串判断任务完成 |

表里的英文名字挨个翻一下：dsh 合成的 `ABORTED_BEFORE_DISPATCH` 字面是「还没派发出去就被中止了」；Codex 的 `run_turn` 就是「跑一个 turn」，`FuturesOrdered` 是一个按提交顺序交还结果的并发容器，`OutputItemDone` 是「一条输出项已完成」这个流式事件，`StepContext` 直译「一步的上下文」，也就是那份快照本身；OpenCode 的 `runLoop` 是主循环、`streamText` 是发一次流式请求，`DOOM_LOOP_THRESHOLD = 3` 直译「死循环阈值 = 3」，`invalid` 指参数没通过校验的那种工具调用；pi 的 `stopReason === "length"` 意思是「模型这次停下来的原因是顶到了长度上限」，`executionMode: "sequential"` 是「这个工具只能串行执行」；mini-swe-agent 那行 `while True: execute_actions(query())` 就是「一直循环：问模型一次，执行它给出的动作」。

竖着读第四列，出现了一个反复的模式：**同一个失效模式，各家的判据往往一样，分歧在处置力度**。

- **重复调用**：OpenCode 与 dsh 的判据一字不差，末尾若干次工具调用同名同参就算死循环。区别只在处置：OpenCode 拦截（转成一次权限询问），dsh 只提醒（`repeat-tool-reminder`，见 [08 编排层](08-orchestration.md)），循环本身不停。这不是「谁想到了」的差别，是「愿不愿意打断模型」的产品判断。
- **`length` 截断保护**：pi 在 `stopReason === "length"` 时作废本轮全部工具调用，理由是截断的参数可能是残缺 JSON。这是六家里唯一一处有人做、其余五家都没做的保护，dsh 也没有（这是我读源码后的判断，不是上游的说法）。
- **上下文漂移**：Codex 用 `StepContext` 显式冻结一次采样看到的上下文与工具列表；dsh 不需要这个东西，因为它的请求本来就是不可变对象（[03 Agent 循环](03-agent-loop.md)）。同一个问题，一家靠加机制解决，一家靠数据结构让问题不成立。这是全篇最能说明「架构选择会决定你需要写多少防御代码」的一格。

---

## 维度五：审批与沙箱

这一维分歧最大，因为它是产品决策而不是技术决策。

| 项目 | 权限模型 | OS 级沙箱 |
| --- | --- | --- |
| **dsh** | 三个正交旋钮：approval policy（ask/never）× sandbox mode（read-only / workspace-write / danger-full-access）× 工具可见性。**默认组合下写文件和跑命令不弹窗**，审批只在沙箱拒绝后模型主动请求升级时出现 | 有：bwrap / Landlock / Seatbelt / Windows ACL |
| **Claude Code** | 6 种权限模式，含用第二个模型做分类器的 auto mode；deny > ask > allow 规则语言；受保护路径 | 有：Seatbelt / bubblewrap + 域名代理 + 凭据脱敏；**原生 Windows 无沙箱** |
| **Codex** | `AskForApproval` 四态 × `PermissionProfile`；审批 → 选沙箱 → 被拒后请求升级免沙箱重试的三段式编排；execpolicy 前缀规则；guardian 模型自动审核（fail-closed） | 有：Seatbelt / Landlock+seccomp / bwrap / Windows 受限令牌 |
| **OpenCode** | 完整规则引擎（allow/ask/deny，findLast 匹配）+ tree-sitter 解析 bash/PowerShell + 一张 LLM 生成的命令 arity 表来支持「永远允许某个前缀」；外部目录检测；`.env` 读取门控 | **没有** |
| **pi** | **刻意没有权限系统**。README 的立场是：要隔离就用容器 | 没有 |
| **mini-swe-agent** | `human` / `confirm` / `yolo` 三档 + 正则白名单 | 「沙箱」就是换一个环境类（docker exec / singularity / bubblewrap） |

这些权限档位的英文名字翻过来是：dsh 的审批策略两档，`ask`（每次问）和 `never`（从不问）；沙箱三档，`read-only`（只读）、`workspace-write`（只能写工作区）、`danger-full-access`（不设防，名字里就带警告）。Codex 的 `AskForApproval` 是「要不要找人批」，`PermissionProfile` 是「权限档案」，guardian 模型的 fail-closed 指判不出来时按拒绝走。OpenCode 规则引擎里的 allow / ask / deny 分别是放行、询问、拒绝，`findLast` 是「取最后一条匹配上的规则」。mini-swe-agent 三档 `human`（每步由人来）、`confirm`（执行前确认）、`yolo`（全放开）。

OpenCode 的「命令 arity 表」值得单独提（arity 是「元数」，即一个函数或命令接受几个参数）：要支持「以后所有 `git log ...` 都自动放行」，就得知道 `git log` 这个前缀吃几个参数，它用 LLM 预先生成了这张表。这是低成本高收益的做法。

pi 的「不做权限」也是一个完整的论点：一个进程内的权限检查挡不住真正的恶意代码，不如老实告诉用户「跑在容器里」。

---

## 维度六：会话持久化

存储结构决定了能力上限：存成一条线就只能续跑，存成树才有分支，存成事件日志才能把「模型看到的」和「实际发生的」分开。

| 项目 | 存储 | 能力 |
| --- | --- | --- |
| **dsh** | append-only 事件日志，JSONL 或 SQLite 两种后端可换 | 事件溯源：模型看到的历史是日志的投影，不是日志本身；崩溃后可修复 |
| **Claude Code** | 每会话一个 JSONL | `--continue` / `--resume` / `--fork-session`；检查点回退 |
| **Codex** | `~/.codex/sessions/.../rollout-*.jsonl(.zst)` + SQLite 索引 | 行类型区分 SessionMeta / ResponseItem / Compacted / WorldState（全量 + merge-patch）；恢复时能复原世界状态基线；fork / rollback |
| **OpenCode** | SQLite（drizzle），session / message / part 三张表 | part 级流式写入；配合快照做 revert |
| **pi** | JSONL **树**（每条带 id / parentId / leaf） | 原生分支：`/tree`、`/fork`；会话可分享 |
| **mini-swe-agent** | 每步覆写一份完整轨迹 JSON | 可复现、可拿去微调；**不能 resume** |

表里的英文：Codex 那四种行类型直译过来是 `SessionMeta`（会话元信息）、`ResponseItem`（一条模型响应项）、`Compacted`（一条压缩记录）、`WorldState`（世界状态），merge-patch 是「合并式补丁」，即后面只记增量、要用时再合回全量。Claude Code 的 `--continue` 是「接着上一个会话」、`--resume` 是「挑一个会话恢复」、`--fork-session` 是「从这个会话岔出一条新的」。pi 每条记录带的 `id` / `parentId`（父节点 id）/ `leaf`（叶子）就是树的骨架。append-only 直译「只追加」，指写进去的东西不再改也不再删。

pi 的 JSONL 树是这里最优雅的：分支不是事后加的功能，是存储结构本身就支持的。dsh 的事件溯源换来的是另一样东西：「模型看到的」和「实际发生的」被显式分开，压缩这类改写必须以 replace 事件的形式留痕。

---

## 维度七：扩展模型

第二列是「能加什么」，第三列是那个真正的分水岭：**核心循环本身算不算一个可替换的东西**。只有 dsh 回答「算」。

| 项目 | 怎么扩展 | 能不能替换核心循环 |
| --- | --- | --- |
| **dsh** | Cordis 插件树，**连 agent loop 本身都是插件**；还能让模型在运行时增删插件（见 [09 Extensions](09-extensions-and-code-mode.md)） | 能 |
| **Claude Code** | subagents（frontmatter 定义）、30+ 事件的 hooks、skills、plugins、MCP | 不能 |
| **Codex** | 内置 explorer / worker 角色的子 agent、mailbox 通信、11 个 hook 事件、skills fragments、MCP、extension-api | 不能 |
| **OpenCode** | 四个内置 agent（build/plan/general/explore）、可 resume 的 task 子代理、npm 插件（`Hooks` 接口 21 个键，`opencode!packages/plugin/src/index.ts:222-334`）、完整 MCP | 不能 |
| **pi** | `ExtensionAPI` 上 33 个 `on(event, …)` 生命周期事件（`pi!packages/coding-agent/src/core/extensions/types.ts:1198`）+ `registerTool`/`registerCommand`/`registerProvider`/`registerShortcut`/`registerFlag`；**没有 MCP、没有子代理、没有 plan 模式、没有 todo** | 不能 |
| **mini-swe-agent** | Python 子类覆写 + yaml/Jinja | 不适用（`DefaultAgent` 总共 190 行，`mini-swe-agent!src/minisweagent/agents/default.py:38`） |

表里 pi 那格的注册函数照字面读就行：`on(event, …)` 是「在某个事件上挂个回调」，`registerTool` 注册工具、`registerCommand` 注册命令、`registerProvider` 注册模型提供方、`registerShortcut` 注册快捷键、`registerFlag` 注册命令行开关。OpenCode 四个内置 agent 的名字是 build（干活）/ plan（先出计划）/ general（通用）/ explore（探查），`Hooks` 就是「钩子」接口。mini-swe-agent 的 `DefaultAgent` 是「默认 agent」那个类。

这一列的答案基本决定了各家的源码规模：五家「不能」的，扩展点是有限枚举出来的事件与配置项，核心可以写得很紧；dsh 那个「能」是它 22 万行的主要来源，因为每个能力都得拆成服务定义 / 提供方 / 消费方三个角色才能被替换（[09 Extensions](09-extensions-and-code-mode.md)、[10 Cordis 与 preset](10-cordis-boot-preset.md) 讲了这套代价怎么摊开）。

这个选择在**别处**换来了什么：正因为「一个 agent 后端」只是一行插件，dsh 才能把 Claude Code、Codex 和任意 ACP agent 当成子代理驱动（[08 编排层](08-orchestration.md)），也才能兼容它们的 hook 协议。其它五家不是想不到，是它们的 agent 循环没有留出这个接缝（seam，指一个能力被整块换掉的那个位置）。反方向也成立：Codex 发 `codex-mcp-server`、OpenCode 发 `opencode acp`，走的都是「把整个 agent 包成一个标准协议端点」这条更省事的路，代价是被驱动方只能作为黑盒使用（[12 表面与协议](12-surfaces-and-protocols.md)）。

---

## 七维之外：各家最值得偷的一个想法

| 项目 | 想法 |
| --- | --- |
| **dsh** | 让请求成为日志的纯函数——缓存友好不是优化项，是这个结构的副产品 |
| **Claude Code** | 把缓存断裂当事故；模式切换用工具而不是换工具集 |
| **Codex** | system prompt 作为模型元数据下发，提示词与客户端发布解耦 |
| **OpenCode** | 懒加载嵌套 AGENTS.md；用 LLM 生成命令 arity 表来做前缀放行 |
| **pi** | 旁路请求（摘要、标题）隔离缓存分片；`length` 截断时作废所有工具调用（dsh 没有对应保护） |
| **mini-swe-agent** | 190 行就能跑通一个 SWE agent——这本身就是对「harness 必须很厚」的反驳 |

---

## 设计取向的坐标

如果要给这六家排一个「设计取向」的坐标：

- **mini-swe-agent** 在一端：harness 越薄越好，复杂度应该在模型里。
- **pi** 靠近它：不做权限、不做子代理、不做 MCP，但把 loop、缓存、压缩这三件核心事做扎实。
- **OpenCode** 和 **Codex** 在中间：功能完整，工程成熟，扩展靠配置和插件钩子。
- **Claude Code** 偏产品：功能面最广，权限和上下文管理做得最细，但核心不可见。
- **dsh** 在另一端：一切皆插件，连循环本身都能换掉，代价是理解成本最高。

没有哪一端是对的。选哪一端取决于你要的是「一个能用的编码 agent」还是「一个能长出很多种 agent 的底座」。

## 自检

**1. 六家几乎都把「每轮可能变的信息」放进 user 消息而不放进 system prompt。这个一致是被什么逼出来的？OpenCode 把日期放进 system 之后，跨天的会话会发生什么？**

答：被缓存前缀逼出来的。system 在请求的最前面，它一改，后面所有内容的缓存全部作废；而环境、权限、状态这类信息本来就每轮都可能变，放进 system 等于每轮都把整个前缀弄脏。放在 user 消息里，前面那一大段前缀原样不动，只有新追加的部分要重算。OpenCode 的 `<env>` 段里带了 `Today's date`，所以一旦跨天，同一个会话的下一次请求前缀对不上，整段要重新算一遍。

**2. pi 让摘要请求换一个 sessionId 并禁止写缓存，dsh 让摘要请求逐字复用主会话的 system 和 tools。把两家的做法对调，各自会亏在哪？**

答：两种做法各自贴着自己 provider 的缓存语义。pi 面对的是显式断点，断点最多 4 个，是稀缺资源，摘要这种一次性的旁路请求占掉一个，就挤掉了主会话的热前缀。dsh 面对的是自动前缀缓存，前缀越长命中越划算，摘要请求原样带上主会话的前缀等于顺手蹭一次命中。对调之后：pi 那边复用，主会话的断点会被旁路请求挤占；dsh 那边隔离，摘要请求从零算起，本来白捡的那段命中就没了。

**3. Codex 用 `StepContext` 把一次采样看到的上下文和工具列表冻结起来，dsh 没有这个东西也不出问题。为什么？如果把 dsh 的请求对象改成可变的，会冒出什么故障？**

答：dsh 的请求是从只追加的事件日志派生出来的不可变对象，一次采样对应的那份请求一旦生成就不会再变，所以「工具列表中途换了、历史里的调用对不上」这个失效模式根本不成立。改成可变之后，插件在采样进行中增删工具，就可能出现模型调的工具在当前列表里已经查不到、或者同名工具的 schema 已经换了一版的情况，那时 dsh 也得像 Codex 一样补一层快照来挡。
