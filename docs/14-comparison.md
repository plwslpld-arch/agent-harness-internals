---
title: 横向对照：六个 harness 在同一件事上的不同做法
sources: [{"repo":"deepseek-harness","path":"packages/core/system-prompt/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"codex","path":"codex-rs/core/src/client.rs","commit":"c4941302c73c6322b153bba13ac0a9f4396301d6"}, {"repo":"opencode","path":"packages/opencode/src/session/system.ts","commit":"4643e65ad6334de3e4e68dedc201d5fbb828c9fe"}, {"repo":"pi","path":"packages/coding-agent/src/core/system-prompt.ts","commit":"086c32e74530564922d011ade23ff582c9d63116"}, {"repo":"mini-swe-agent","path":"src/minisweagent/models/utils/cache_control.py","commit":"a83fcae82d2a08f0ee0c688f9d137b3566c097f8"}]
last_verified: 2026-08-16
status: draft
---

# 横向对照：六个 harness 在同一件事上的不同做法

这一篇不比谁好谁坏，也不比代码行数——比行数只能得出「Codex 一百四十万行、mini-swe-agent 一万五千行」这种没有信息量的结论。这里比的是**同一个问题，六家分别怎么解**。

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

---

## 维度一：system prompt 怎么拼出来

这是差异最大的一维。六家分成了三派。

**「没有中心 prompt 文件」派——只有 dsh。** 模型看到的 system 字符串是运行时由插件各自贡献的 section 按 `order` 拼起来的（`packages/core/system-prompt/src/index.ts:212`），装一个插件就多一段，卸掉就少一段。默认 Web 组合下大约 19 段，每段一两句话。细节见 [01 System Prompt](01-system-prompt.md)。

**「中心 prompt 模板」派——Codex、OpenCode、pi、mini-swe-agent。**

- Codex 更进一步：system prompt（Responses API 的 `instructions` 字段）**是模型元数据的一部分**，由 `/models` 下发模板，客户端只填 personality 占位符，本地 `prompt.md` 只是兜底。提示词升级不需要发新版客户端。
- OpenCode 按模型家族分发不同的主提示（`packages/opencode/src/session/system.ts:27`）：Claude 系用 `anthropic.txt`，GPT-4/o1/o3 用 `beast.txt`，Gemini、Kimi、Meta 各有各的。承认「同一段提示词在不同模型上效果不同」。
- pi 只有一份极简 prompt（`packages/coding-agent/src/core/system-prompt.ts:121`），项目可以用 `SYSTEM.md` 整体替换、`APPEND_SYSTEM.md` 追加。
- mini-swe-agent 就两段 Jinja 模板：一句话的 `system_template` + 带任务和示例的 `instance_template`。

**动态信息放哪，是这一维里更要紧的问题。** 六家的答案惊人地一致，而且都是被缓存逼出来的：

| 项目 | 环境/权限/状态这类每轮可能变的信息放哪 |
| --- | --- |
| dsh | user 消息里的「runtime context 快照」，只有内容变了才追加一条新的 |
| Claude Code | user 消息里的 `<system-reminder>` 块（官方博客明说：「pass in this information via messages in the agent's next turn instead」） |
| Codex | developer 角色的 WorldState 分节，首轮全量、之后只发 diff |
| OpenCode | `<env>` 段在 system 里（含 `Today's date`，按天变），plan 模式提醒走 user 消息 |
| pi | `<project_context>` 在 system 里，但不含日期、平台、git 状态——靠「不放易变信息」保持稳定 |
| mini-swe-agent | 环境信息在 `instance_template` 渲染出的第一条 user 消息里 |

OpenCode 把日期放进 system 是这里唯一明显的缓存漏洞：跨天的会话第一次请求整个前缀作废。pi 的做法相反——干脆不给模型日期。

**AGENTS.md / CLAUDE.md 这类项目指令文件**，六家都支持，但发现规则差别很大：

| 项目 | 发现规则 | 注入位置 |
| --- | --- | --- |
| dsh | `$DSH_HOME/AGENTS.md` + 项目根到 cwd 的整条目录链，同目录里 `AGENTS.md`/`CLAUDE.md` 都加载，之后按内容去重；65536 字节预算，超了先丢最宽的 | user 消息里的 `<system-reminder>`，只有 fs 工具动过文件才刷新 |
| Claude Code | 目录树向上全量拼接，子目录惰性加载，`@import` 最多 4 跳，另有 `.claude/rules` 可按 `paths:` 限定作用域 | user 消息（官方文档明确说是为了保住 system 缓存） |
| Codex | 项目根到 cwd 逐级找 `AGENTS.override.md`/`AGENTS.md`，32 KiB 预算 | `input` 数组头部的 developer 消息 |
| OpenCode | 从 cwd 向上 `findUp`，**第一个命中的文件名类别为准**（不堆叠所有祖先）；支持 http(s) 远程 URL | system 段；另有懒加载——模型 read 某个子目录文件时，才把沿途未加载的 AGENTS.md 作为工具结果附件注入 |
| pi | 全局 + 完整祖先链的 `AGENTS.override`/`AGENTS`/`CLAUDE.md` | system 里的 `<project_context>` |
| mini-swe-agent | 不支持 | — |

OpenCode 的「懒加载嵌套 AGENTS.md」是这一维里最聪明的设计：不预先把整棵树塞进上下文，等模型真读到那个目录下的文件时再补。

---

## 维度二：缓存策略

先分清 provider 侧的两种模型，否则没法比：

- **自动前缀缓存**（DeepSeek、OpenAI）：服务端按请求前导 token 序列自动匹配，客户端不需要标记任何东西，唯一能做的是别改前缀。
- **显式断点**（Anthropic）：客户端用 `cache_control: {type:"ephemeral"}` 标记最多 4 个断点，读的时候从断点往回看最多 20 个 block。

于是「谁做得好」这个问题要分两半看：用自动缓存的，比的是**前缀纪律**；用显式断点的，比的是**断点放得准不准**。

| 项目 | 做法 | 关键实现 |
| --- | --- | --- |
| **dsh** | 没有任何缓存 API 调用。让 `请求 = f(事件日志)`，日志只追加，投影是纯函数，于是每次请求天然是上次的字节级扩展 | `deriveMessages()` + `EpochHeader` 按值比较，见 [02 KV-Cache](02-kv-cache.md) |
| **Claude Code** | 显式断点分四层：静态 system+tools（全局缓存）→ CLAUDE.md（项目内）→ 会话上下文 → 对话消息。切模式用工具（`EnterPlanMode`）而不是换工具集；压缩请求复用父会话完全相同的 system/tools | 官方文档 [prompt-caching](https://code.claude.com/docs/en/prompt-caching) |
| **Codex** | `prompt_cache_key = session_id`，子 agent 共享同一个 key；`store: false` 全量重放历史 + 加密 reasoning 内容 | `codex-rs/core/src/client.rs:484`、`codex-rs/core/src/client.rs:921` |
| **OpenCode** | AI-SDK 路径给**前 2 条 system + 末 2 条消息**打 ephemeral；OpenAI 家族用 sessionID 当 `promptCacheKey`；工具按名字排序保证顺序稳定 | `packages/opencode/src/provider/transform.ts:359` |
| **pi** | 三锚点：system 块、最后一个工具、最后一条用户消息，可选 1 小时保留；**摘要请求刻意用 `cacheRetention: "none"` + 新 sessionId**，避免污染主会话的缓存分片 | `packages/ai/src/api/anthropic-messages.ts` |
| **mini-swe-agent** | 只给最后一条消息打 ephemeral，工具恒为一个 bash | `src/minisweagent/models/utils/cache_control.py:49` |

**三个值得单独说的点：**

1. **Claude Code 把缓存断裂当事故处理。** 官方博客原话是「We alert on cache breaks and treat them as incidents」。这不是技术细节，是工程文化——dsh 用另一种方式表达了同一件事：每个包的 README 必须声明自己对 KV-cache 的影响，由 CI 校验（见 [13 自证](13-self-verification.md)）。

2. **pi 的「旁路请求隔离缓存」是六家里唯一想到这一层的。** 摘要、起标题这类请求如果和主会话共用缓存分片，会把主会话的热前缀挤掉。pi 显式给它们换 sessionId 并禁止写缓存。dsh 走的是相反的路——让摘要请求**复用**主会话的热前缀（system/tools 原样带上，指令放在尾部 user 消息），少付一次全量 prefill。两种思路针对的是不同的 provider 语义，都成立。

3. **压缩之后主对话必然全 miss，六家都没有真正解决。** Claude Code 有 `/rewind`（回到已缓存前缀，比压缩便宜）算是绕过；dsh 的上游在 `.agents/notes/proposed/` 里有一份 `recallable-compaction` 提案，明确自评「the head checkpoint is rewritten every pass, so the request prefix takes a full prompt-cache miss each time」，状态还是 proposed。

---

## 维度三：上下文压缩

| 项目 | 触发阈值 | 保留什么 | 特别之处 |
| --- | --- | --- | --- |
| **dsh** | 上下文压力超过配置比例，或 `CONTEXT_WINDOW_EXCEEDED` 溢出后恢复 | 从 surface 头开始压，保留尾部一段，不拆 tool 配对 | 摘要请求逐字复用主会话的 system/tools，指令放尾部；压缩前先跑工具结果剪枝 |
| **Claude Code** | 默认到模型上限（可 `/autocompact` 调），**先清旧工具输出，再摘要** | 明确的幸存清单：CLAUDE.md 和 auto memory 从磁盘重注入、已调用 skill 正文重注入（单个 5k、总计 25k tokens 上限） | 有防抖动：单个大输出导致压完立刻又满时，几次后停止自动压缩并报错，而不是死循环 |
| **Codex** | `context_window * 0.9`（可配） | 保留 ≤20k tokens 的用户消息 + 摘要 | 三种实现回退链（远程 v2 → 远程 v1 → 本地）；还有一种「不摘要，直接开新窗口 + 让模型自管预算」的模式；摘要注入位置刻意对齐训练分布 |
| **OpenCode** | 可用额度 = 输入上限 − 约 20k | 尾部 25% 预算（2k–15k），可在 turn 内切分 | 用一个**专用的、没有工具的 compaction agent** 做摘要；可选清空旧工具输出为 `"[Old tool result content cleared]"` |
| **pi** | `contextTokens > window − 16384` | 保留最近 20k，**绝不在工具结果处切** | 摘要作为 `CompactionEntry` 追加进 JSONL 会话树；跨 turn 时做 split-turn 双摘要 |
| **mini-swe-agent** | **没有压缩** | — | 唯一保护是 observation 超 10k 字符做 head/tail 截断；撞上窗口直接终止任务 |

OpenCode 和 pi 的摘要模板高度相似（目标 / 约束 / 进度 / 决策 / 下一步 / 涉及文件），而且都会把上一次的摘要合并进新摘要。dsh 的摘要指令则更强调「你现在是压缩引擎，压缩上面的对话」。

mini-swe-agent 没有压缩不是缺陷，是立场：它主张 harness 应该薄，轨迹本身就是训练数据，加压缩会污染这份数据。

---

## 维度四：agent 循环与工具执行

| 项目 | 循环形态 | 并行工具 | 有意思的细节 |
| --- | --- | --- | --- |
| **dsh** | turn / step 状态机，每步先写日志再派生请求 | exclusive 工具形成屏障，parallel 工具进有界滚动池，结果按**模型给出的顺序**提交 | 取消时给未派发的调用合成 `ABORTED_BEFORE_DISPATCH` 结果，保证 tool_calls 与结果配对完整 |
| **Claude Code** | 全量重发 + 缓存；并行工具批次 | 是 | 超时命令自动转后台；用户可以在模型跑的时候排队补充消息 |
| **Codex** | ThreadManager → Session → Task → `run_turn` → 采样请求 | 是，`FuturesOrdered`，**边流边执行**（`OutputItemDone` 一到就启动工具 future） | `StepContext` 快照：一次采样内的上下文、工具列表、工具执行共享同一份快照，避免「工具列表变了但历史里的调用对不上」 |
| **OpenCode** | `runLoop` 每步一次 `streamText` | 是 | **doom-loop 检测**：同一个调用连续 3 次就转成权限询问；`invalid` 工具调用会尝试修复 |
| **pi** | 手写显式循环 + steering / follow-up 消息队列 | 默认并行，单个工具可声明 `executionMode: "sequential"` | `stopReason === "length"` 时**作废本轮所有工具调用**——截断的工具调用参数可能是残缺 JSON，执行它很危险 |
| **mini-swe-agent** | `while True: execute_actions(query())` | 否，顺序 | 每个动作起一个新 subshell（`cd`、环境变量都不保留）；用一个哨兵字符串判断任务完成 |

pi 的 `length` 保护和 OpenCode 的 doom-loop 检测都是 dsh 目前没有的（这是我读源码后的判断，不是上游的说法）。Codex 的 `StepContext` 快照解决的问题 dsh 用另一种方式解决了——它的请求本来就是从日志派生的不可变对象。

---

## 维度五：审批与沙箱

这一维分歧最大，因为它本质上是产品决策而不是技术决策。

| 项目 | 权限模型 | OS 级沙箱 |
| --- | --- | --- |
| **dsh** | 三个正交旋钮：approval policy（ask/never）× sandbox mode（read-only / workspace-write / danger-full-access）× 工具可见性。**默认组合下写文件和跑命令不弹窗**，审批只在沙箱拒绝后模型主动请求升级时出现 | 有：bwrap / Landlock / Seatbelt / Windows ACL |
| **Claude Code** | 6 种权限模式，含用第二个模型做分类器的 auto mode；deny > ask > allow 规则语言；受保护路径 | 有：Seatbelt / bubblewrap + 域名代理 + 凭据脱敏；**原生 Windows 无沙箱** |
| **Codex** | `AskForApproval` 四态 × `PermissionProfile`；审批 → 选沙箱 → 被拒后请求升级免沙箱重试的三段式编排；execpolicy 前缀规则；guardian 模型自动审核（fail-closed） | 有：Seatbelt / Landlock+seccomp / bwrap / Windows 受限令牌 |
| **OpenCode** | 完整规则引擎（allow/ask/deny，findLast 匹配）+ tree-sitter 解析 bash/PowerShell + 一张 LLM 生成的命令 arity 表来支持「永远允许某个前缀」；外部目录检测；`.env` 读取门控 | **没有** |
| **pi** | **刻意没有权限系统**。README 的立场是：要隔离就用容器 | 没有 |
| **mini-swe-agent** | `human` / `confirm` / `yolo` 三档 + 正则白名单 | 「沙箱」就是换一个环境类（docker exec / singularity / bubblewrap） |

OpenCode 的「命令 arity 表」值得单独提：要支持「以后所有 `git log ...` 都自动放行」，就得知道 `git log` 这个前缀吃几个参数，它用 LLM 预先生成了这张表。这是低成本高收益的做法。

pi 的「不做权限」也是一个完整的论点：一个进程内的权限检查挡不住真正的恶意代码，不如老实告诉用户「跑在容器里」。

---

## 维度六：会话持久化

| 项目 | 存储 | 能力 |
| --- | --- | --- |
| **dsh** | append-only 事件日志，JSONL 或 SQLite 两种后端可换 | 事件溯源：模型看到的历史是日志的投影，不是日志本身；崩溃后可修复 |
| **Claude Code** | 每会话一个 JSONL | `--continue` / `--resume` / `--fork-session`；检查点回退 |
| **Codex** | `~/.codex/sessions/.../rollout-*.jsonl(.zst)` + SQLite 索引 | 行类型区分 SessionMeta / ResponseItem / Compacted / WorldState（全量 + merge-patch）；恢复时能复原世界状态基线；fork / rollback |
| **OpenCode** | SQLite（drizzle），session / message / part 三张表 | part 级流式写入；配合快照做 revert |
| **pi** | JSONL **树**（每条带 id / parentId / leaf） | 原生分支：`/tree`、`/fork`；会话可分享 |
| **mini-swe-agent** | 每步覆写一份完整轨迹 JSON | 可复现、可拿去微调；**不能 resume** |

pi 的 JSONL 树是这里最优雅的：分支不是事后加的功能，是存储结构本身就支持的。dsh 的事件溯源换来的是另一样东西——「模型看到的」和「实际发生的」被显式分开，压缩这类改写必须以 replace 事件的形式留痕。

---

## 维度七：扩展模型

| 项目 | 怎么扩展 | 能不能替换核心循环 |
| --- | --- | --- |
| **dsh** | Cordis 插件树，**连 agent loop 本身都是插件**；还能让模型在运行时增删插件（见 [09 Extensions](09-extensions-and-code-mode.md)） | 能 |
| **Claude Code** | subagents（frontmatter 定义）、30+ 事件的 hooks、skills、plugins、MCP | 不能 |
| **Codex** | 内置 explorer / worker 角色的子 agent、mailbox 通信、11 个 hook 事件、skills fragments、MCP、extension-api | 不能 |
| **OpenCode** | 四个内置 agent（build/plan/general/explore）、可 resume 的 task 子代理、npm 插件（约 14 个钩子）、完整 MCP | 不能 |
| **pi** | 约 30 个生命周期事件 + `registerTool/Command/Provider`；**没有 MCP、没有子代理、没有 plan 模式、没有 todo** | 不能 |
| **mini-swe-agent** | Python 子类覆写 + yaml/Jinja | 不适用（总共 190 行） |

dsh 的插件化是它 22 万行源码的主要来源：为了让一切可替换，每个能力都要拆成服务定义 / 提供方 / 消费方三个角色。代价很直接——**要改一个行为，先得判断是改插件、改配置、改 preset，还是真要动核心**。

反过来，dsh 能把 Claude Code 和 Codex 当成子代理来驱动，也能兼容它们的 hook 协议（`packages/subagent/subagent-claude-code`、`packages/hooks/hooks-claude-code`），这是插件化换来的直接好处，其它五家都做不到。

---

## 维度八：各家最值得偷的一个想法

| 项目 | 想法 |
| --- | --- |
| **dsh** | 让请求成为日志的纯函数——缓存友好不是优化项，是这个结构的副产品 |
| **Claude Code** | 把缓存断裂当事故；模式切换用工具而不是换工具集 |
| **Codex** | system prompt 作为模型元数据下发，提示词与客户端发布解耦 |
| **OpenCode** | 懒加载嵌套 AGENTS.md；用 LLM 生成命令 arity 表来做前缀放行 |
| **pi** | 旁路请求（摘要、标题）隔离缓存分片；`length` 截断时作废所有工具调用 |
| **mini-swe-agent** | 190 行就能跑通一个 SWE agent——这本身就是对「harness 必须很厚」的反驳 |

---

## 一句话总结

如果要给这六家排一个「设计取向」的坐标：

- **mini-swe-agent** 在一端：harness 越薄越好，复杂度应该在模型里。
- **pi** 靠近它：不做权限、不做子代理、不做 MCP，但把 loop、缓存、压缩这三件核心事做扎实。
- **OpenCode** 和 **Codex** 在中间：功能完整，工程成熟，扩展靠配置和插件钩子。
- **Claude Code** 偏产品：功能面最广，权限和上下文管理做得最细，但核心不可见。
- **dsh** 在另一端：一切皆插件，连循环本身都能换掉，代价是理解成本最高。

没有哪一端是对的。选哪一端取决于你要的是「一个能用的编码 agent」还是「一个能长出很多种 agent 的底座」。
