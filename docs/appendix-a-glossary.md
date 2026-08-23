---
title: 附录 A：术语表
sources: [{"repo":"deepseek-harness","path":"docs/glossary.md","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: stale
---

# 附录 A：术语表

*写给正文读到一半被某个词卡住的人。这里不讲机制，只回答「这个词到底指什么、定义写在哪一行、哪一篇把它讲开了」。*

回想一下你在前面十几篇里卡过的地方：section 和 context 差在哪，为什么要分成两个词？turn 和 step 谁装着谁？spawn 出去的子代理看不见父对话，fork 出去的就看得见，那中间那段历史叫什么？说「压缩」和说「剪枝」是不是同一件事？这些词大多在正文里第一次出现时只解释了一句，隔几篇再遇到就容易串。这一节按它们各自属于哪一层排好，卡住了回来查一条就走。

每条给三样东西：一句话解释、**源码或官方文档里的定义处**（`路径:行号`，指向 dsh 锁定 commit）、以及本仓库哪篇文章把它讲开。路径为 dsh 仓库相对路径。

上游自己有一份术语表 `docs/glossary.md`（45 行，「一词一义」），本表在它之外补上了代码级出处和跨文章索引。

有几组词最容易混，先在这里点明：**seam 是整体能力、Service 是其中一个角色**；**section 是静态文字、context 是每次求值的动态文字**；**turn 是一次排空输入、step 是一次模型请求**；**compaction 换掉一段历史、prune 只砍单条工具结果**；**spawn 不带父对话、fork 带**（fork 带的那段就叫 seed）；**one-shot 出完结果就作废、continuable 可以一直续**；**profile 在磁盘上、bundle 是 npm 包、preset 是会话级的**。看不懂某条时，先看它归在哪一节，分节本身就是语义分层。

## 一、框架层：Cordis

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **harness** | 包在模型外面的那层程序：拼上下文、调工具、管权限、记轨迹。dsh 是其中一个实现。 | `docs/architecture.md:11` | [00 总览](00-overview.md) |
| **Cordis** | dsh 底下的插件框架：插件向共享 context 贡献服务、带类型的事件和可逆 effect。dsh 把它 vendored 进 `vendor/` 并做了 18 处本地修改。 | `vendor/cordis/src/context.ts:42` | [10 Cordis、启动与 preset](10-cordis-boot-preset.md) |
| **Context** | Cordis 的核心对象：服务的注册处、事件的派发点、插件树的节点。`ctx.xxx` 就是取一个服务。 | `vendor/cordis/src/context.ts:42` | [10](10-cordis-boot-preset.md) |
| **Fiber** | 一次插件加载的运行时实体，有生命周期（加载/激活/卸载/销毁）。卸载 fiber 会撤销它注册过的一切。 | `vendor/cordis/src/fiber.ts:184` | [10](10-cordis-boot-preset.md) |
| **Service** | 挂在 `ctx.<key>` 上的能力对象，用抽象类或具体注册表表达，**从不是 TypeScript `interface`**。 | `vendor/cordis/src/service.ts:11` | [10](10-cordis-boot-preset.md) |
| **effect** | 一段「做了什么就能撤销什么」的注册，返回 disposer；fiber 卸载时按序回滚。 | `vendor/cordis/src/fiber.ts:415` | [10](10-cordis-boot-preset.md) |
| **waterfall** | 五种事件派发模式之一：监听器像中间件一样层层包住 `next()`，可以改输入、改输出、短路。dsh 的核心扩展点（`system-prompt/assemble`、`llm/stream`、`tools/execute`）全是它。 | `vendor/cordis/src/events.ts:234` | [03 Agent Loop](03-agent-loop.md) |
| **seam（能力接缝）** | 一个可替换能力的**整体**，由三个角色组成：Service Definition、Service Provider、Consumer。「seam」指整体，不指其中某一个角色。 | `docs/glossary.md:9` | [00](00-overview.md) |
| **scope** | 每个 agent 的注册单元：一项贡献（工具、prompt section、变量、监听器）要么全局，要么归某一个 scope。两层、扁平，不向子代理继承。 | `docs/glossary.md:13` | [08 编排层](08-orchestration.md) |
| **shadowing** | 最具体者胜：同名的 scoped 工具/section/变量在该 scope 内取代全局的那个。per-agent persona 就靠它。 | `docs/glossary.md:18` | [08](08-orchestration.md) |
| **lineage** | 父子关系作为**数据**携带（`parentSession`、`delegationDepth`、`subagentDepth`），永不影响可见性。 | `docs/glossary.md:21` | [08](08-orchestration.md) |
| **realm（域）／`isolate`** | 「服务名 → 实例」这张查找表的一个命名空间。同一个名字 `terminals` 在根 realm 里解析到 A，在某个 isolate realm 里解析到 B。不写 `isolate` 的行发布到根 realm，也就是进程全局；preset 的全部 realm 规则都是这句话的推论。 | `vendor/cordis/src/context.ts:121`（`isolate()`）、`vendor/cordis/src/reflect.ts:286-292`（按 realm symbol 解析并拒绝重复注册） | [10](10-cordis-boot-preset.md) |
| **dispatch mode（emit / parallel / serial / bail / waterfall）** | 事件派发的五种策略。`emit` 不 await 任何监听器（挂在这里只能观察）；`parallel` 并发 await 全部；`serial` 顺序 await 到有人给出返回值为止；`bail` 同步版的 serial；`waterfall` 把监听器套在 `next()` 外面，能改输入改输出也能短路。 | `vendor/cordis/src/events.ts:24-32` | [10](10-cordis-boot-preset.md)、[08](08-orchestration.md) |

表里几个只留了英文的词，中文对一遍：seam 那条里的三个角色，Service Definition 是「服务定义」，Service Provider 是「服务提供方」，Consumer 是「消费方」。harness 字面是「挽具」，fiber 是「纤程」，effect 是「作用」，waterfall 是「瀑布」（监听器一层套一层往下走），shadowing 是「遮蔽」，lineage 是「血缘」，scope 是「作用域」，realm 是「域」，`isolate` 是「隔离」。五种派发模式的名字直译过来：emit 是「发出」，parallel 是「并发」，serial 是「串行」，bail 是「中途退出」，waterfall 同上。

## 二、组合层：profile / bundle / preset / patch

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **profile** | 磁盘上一个目录（`$DSH_HOME/profiles/<name>/`），`package.json` 里的 `dsh.profile.bundles` 给出有序 bundle 列表，外加一份用户自己的 `cordis.patch.yml`。 | `packages/boot/app-boot/src/profile.ts:50` | [10](10-cordis-boot-preset.md) |
| **bundle** | 一个声明了 `dsh.bundle.patch` 的 npm 包，实质就是一份 `cordis.patch.yml`。三个：`base` / `web-app` / `headless`。 | `packages/boot/app-boot/src/profile.ts:74` | [10](10-cordis-boot-preset.md) |
| **patch** | 对 Cordis entry 列表的一次结构化修改（插入/禁用/改 config）。`applyEntryPatches` 在空列表上依次施加各层补丁，所以 `--dump-config` 的输出和真实挂载不可能漂移。 | `vendor/include/src/index.ts:58` | [10](10-cordis-boot-preset.md) |
| **preset（agent preset）** | Web 会话级的组合单元：一个含 `agent.cordis.yml` 的目录，在 agent 的 `setup` 阶段作为 include 子树挂到该 agent 的 scope 上。发行版带四个：`standard` / `code` / `minimal` / `cordis`。 | `packages/preset/agent-presets/src/index.ts:82` | [10](10-cordis-boot-preset.md) |

## 三、会话与事件

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **event log / SessionEvent** | Session 是 append-only 的 `SessionEvent` 日志，是唯一真源；每条带 `type` / `seq` / `time` / `data`。 | `packages/core/session/src/types.ts:404` | [05 Session](05-session.md) |
| **surface** | 从事件日志投影出的「模型看见的消息序列」。不是所有事件都进 surface，只有 message-producing 的那些。 | `packages/core/session/src/types.ts:357` | [05](05-session.md) |
| **surfaceOp** | 一条 surface 事件相对当前 surface 的放置方式：`'append'`，或 `{ op: 'replace', start, end }`（压缩用它遮蔽一段历史）。 | `packages/core/session/src/types.ts:372` | [05](05-session.md)、[06 压缩](06-compaction.md) |
| **log-only 事件** | 只写进会话日志、**不投影成任何模型可见消息**的事件（`plan/mode`、`tool/code-dispatch`、`hook/invoked` 都是）。判据就在 surfaceOp 的定义旁边：`surfaceOp` 在 message-producing 事件上必填、在 log-only 事件上禁止。 | `packages/core/session/src/types.ts:378` | [05](05-session.md)、[08](08-orchestration.md)、[09](09-extensions-and-code-mode.md) |
| **epoch header / request header** | 一次模型调用的完整调用快照：`config`（provider/model/temperature/maxTokens/stop）、`system`、`tools`。以 `request/header` 事件落盘，`foldRequestHeader()` 从日志里把它折叠回来。 | `packages/core/session/src/types.ts:201`、`packages/core/session/src/request-header.ts:65` | [02 KV-Cache](02-kv-cache.md) |
| **turn** | 一次「排空已认领输入」的过程，模型和它的工具都停下来（或被终止策略打断）才结束。 | `docs/glossary.md:37` | [03](03-agent-loop.md) |
| **step** | 一次模型请求 + 它引发的工具执行。一个 turn 含零到多个 step。 | `docs/glossary.md:38` | [03](03-agent-loop.md) |
| **round** | 外层策略的一次迭代（goal round、一次 Ralph 尝试）。计数属于那个策略，不等于 session 里的 turn 数。 | `docs/glossary.md:39` | [08](08-orchestration.md) |
| **checkpoint** | 压缩产出的、代替一段被遮蔽历史的摘要消息，带可识别的 provenance。 | `packages/compaction/compaction/src/checkpoint.ts:21` | [06](06-compaction.md) |

这一节的英文名字直译：event log 是「事件日志」，append-only 是「只追加」（写进去就不改也不删），surface 是「表面」，surfaceOp 里的 `'append'` 是「追加」、`{ op: 'replace', start, end }` 是「把 start 到 end 这一段换掉」，log-only 是「只进日志」，epoch 是「纪元」，checkpoint 是「检查点」，round 是「轮」。

## 四、消息投递

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **inbox** | agent 的两个待办队列：`nextTurn`（普通后续）与 `nextStep`（steering 与注入的上下文）。 | `packages/core/agent/src/inbox.ts:43` | [03](03-agent-loop.md) |
| **send** | 唯一的投递原语：`send(message, target, wakeup)`，`target × wakeup` 的 2×2 矩阵覆盖下面三个别名。 | `packages/core/agent/src/runtime-types.ts:117` | [03](03-agent-loop.md) |
| **followup** | 排一个普通后续 turn 并唤醒驱动；该条消息是它那个 turn 里唯一的普通消息。 | `packages/core/agent/src/runtime-types.ts:124` | [03](03-agent-loop.md) |
| **steer** | 向最近的一个 step 投递引导内容；空闲时会开新 turn，运行中在下一个 step 边界被消费。 | `packages/core/agent/src/runtime-types.ts:133` | [03](03-agent-loop.md) |
| **inject** | 排一段面向模型的补充上下文到 `nextStep`，**不唤醒**驱动；它可能错过一个已经认领完批次的请求。 | `packages/core/agent/src/runtime-types.ts:143` | [03](03-agent-loop.md) |
| **claim（认领）** | 一个 turn 从 inbox 取走待办项这件事本身。区分「取走了但没跑成」和「压根没取」，是崩溃语义的关键。 | `packages/core/agent/src/consumed-work.ts:10` | [03](03-agent-loop.md) |
| **runtime context** | 每步刷新的动态上下文快照（文件策略、沙箱模式等），以持久的 `user/message` 追加，而不是改写 system prompt，后者会破坏可重建性和缓存。 | `packages/core/agent-loop/src/runtime-context.ts:13` | [01 System Prompt](01-system-prompt.md) |

## 五、Prompt 装配

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **section** | system prompt 里的一段静态文字，有唯一名字和 `order`（约定：`-100` 是 harness 身份，`0` 是 persona，`100–199` 是工具指引）。 | `packages/core/system-prompt/src/index.ts:53` | [01](01-system-prompt.md) |
| **context** | 每次装配现算的动态文本片段，按 `order` 拼接。与 section 的区别是「静态 vs 每次求值」。 | `packages/core/system-prompt/src/index.ts:78` | [01](01-system-prompt.md) |
| **variable** | `{{model}}` / `{{cwd}}` 这类插值；名字必须匹配 `/^[a-z][a-z0-9_]*$/`，引用必须是完整的 `{{name}}` 组。全仓只有三个提供者，都在 agent-loop 里。 | 正则 `packages/core/system-prompt/src/index.ts:134`，注册入口 `:446` | [01](01-system-prompt.md) |
| **complete section** | 声明 `complete: true` 的 section：装配瀑布跑完之后，注册表把它恢复成**唯一**的 section，丢弃其余一切。`minimal` preset 的 persona 就是它；多于一个会让装配失败。 | `packages/core/system-prompt/src/index.ts:74` | [01](01-system-prompt.md) |
| **PromptAssembly** | 一次装配的产物：`{ sections, contexts, tools, variables }`。工具 schema 是 prompt 装配的一部分，不是另一条路。 | `packages/core/system-prompt/src/index.ts:115` | [01](01-system-prompt.md) |
| **toolOrder** | 显式声明的模型可见工具顺序；必须且只能含一次保留标记 `<unlisted-tools>`。默认按名字典序，不依赖插件注册顺序。 | `packages/core/system-prompt/src/index.ts:139` | [01](01-system-prompt.md)、[02](02-kv-cache.md) |

## 六、模型调用与缓存

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **KV-cache 前缀** | provider 侧按请求的**逐字节前缀**复用已算好的 KV。dsh 没有一行缓存管理代码，靠「前缀不动」这条纪律命中。序列化在这里发生。 | `packages/llm/llm-deepseek/src/serialize.ts:112` | [02](02-kv-cache.md) |
| **cache read / write tokens** | usage 里与 uncached input 分开报的两项；DeepSeek 侧的 `prompt_cache_hit_tokens` / `cached_tokens` 映射过来。 | `packages/llm/llm/src/types.ts:138` | [02](02-kv-cache.md)、[04 LLM 层](04-llm-adapter.md) |
| **compaction（压缩）** | 上下文接近窗口时把一段历史换成摘要 checkpoint 的机制，本身是能力接缝（`CompactionEngine`）。 | `packages/compaction/compaction/src/index.ts:96` | [06](06-compaction.md) |
| **prune（工具结果裁剪）** | 与压缩不同的一层：超过 `thresholdChars` 的工具结果保留 head/tail、砍掉中间，不动会话结构。 | `packages/compaction/compaction-tool-result-pruner/src/index.ts:50` | [06](06-compaction.md) |

这一节的英文：cache read / write tokens 是「缓存读 token / 缓存写 token」，uncached input 是「没命中缓存的那部分输入」；DeepSeek 侧两个字段名，`prompt_cache_hit_tokens` 直译「提示词缓存命中的 token 数」，`cached_tokens` 是「已缓存的 token 数」。compaction 是「压缩」，prune 是「剪枝」，`thresholdChars` 是「字符数阈值」，head/tail 就是「留头留尾、砍中间」。

## 七、工具、子代理与扩展

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **Code Mode** | `ToolRuntime` 的一种呈现模式（`native` / `code` / `both`）：`code` 下模型不再逐个调工具，而是写 TypeScript。 | `packages/core/tools/src/code-mode.ts:2` | [09 Extensions 与 Code Mode](09-extensions-and-code-mode.md) |
| **run_code** | Code Mode 下唯一暴露给模型的传输工具，system prompt 里附上生成的 SDK 声明。 | `packages/core/tools/src/code-mode.ts:20` | [09](09-extensions-and-code-mode.md) |
| **one-shot** | 委派的两种契约之一：`start()` 发起一次运行，父等它出结果，结果一旦回来这个子会话就作废，父再也够不着它。 | `packages/subagent/subagent/src/index.ts:16-17` | [08](08-orchestration.md) |
| **continuable** | 另一种契约：`startContinuable()` 建立一个**持久**子代理，立刻返回一个持久 id，父可以用 `send_message` 继续跟它对话，它结算时反过来通知父。continuable 子代理永远不会变成 `SubagentRun`，续话由它自己的 inbox 排序。 | `packages/subagent/subagent/src/index.ts:16-17`（两个入口的意图）、`packages/subagent/subagent/src/continuation.ts:403`（实现） | [08](08-orchestration.md) |
| **Activation** | 一个 continuable 子代理「当前这条命」。子会话是磁盘上的持久事件流，Activation 是它此刻活在内存里的那个 Agent 实例，**进程内最多一个**。它不是请求、结果、取消或 Task 的边界：一个 Activation 可以跑很多个 FIFO turn，并且在它创建的后代还没跑完时保持驻留。 | `packages/subagent/subagent/src/continuation.ts:8`（定性注释）、`packages/subagent/subagent/src/continuation.ts:191`（`interface Activation`） | [08](08-orchestration.md) |
| **spawn** | 进程内新建子 agent：自己的 session，**看不到**父对话历史。 | `packages/subagent/subagent-spawn-in-process/README.md:5` | [08](08-orchestration.md) |
| **fork** | 进程内新建子 agent，但用父已完成的对话轮次做种子。与 spawn 的唯一行为差别就是这个种子。 | `packages/subagent/subagent-fork-in-process/README.md:5` | [08](08-orchestration.md) |
| **seed（fork 的对话种子）** | fork 出来的子代理开头自带的那段父会话历史：从 seq 0 起、到父**最后一个 `turn/end`** 为止的连续事件前缀。切在 `turn/end` 是因为当前那个没跑完的工具调用轮次不平衡，重放不出一个合法的子会话；父还没有任何已完成的 turn 时种子为空，此时 fork 等价于 spawn。 | `packages/subagent/subagent-fork-in-process/src/index.ts:3-6`（模块定性）、`packages/subagent/subagent-fork-in-process/src/index.ts:48`（`completedTurnPrefix`） | [08](08-orchestration.md) |
| **skill** | 渐进披露的可复用指令：目录里只放名称与描述，`skill` 工具按需加载全文。 | `packages/skill/skill/src/index.ts:85` | [08](08-orchestration.md) |
| **goal** | 挂在既有 session 上的一个持久完成目标，带 `active`/`paused`/`blocked`/`complete` 相位与 round 上限。它是状态，不是调度器。 | `docs/glossary.md:25` | [08](08-orchestration.md) |
| **Ralph loop** | 前台的「每轮换一个全新 agent」工作流：子代理不带任何对话种子，靠共享工作区和一份有界交接报告传状态。 | `docs/glossary.md:43` | [08](08-orchestration.md) |
| **plan mode** | 一个持久化的会话状态：记录计划、在 step 开始时叙述并施加限制；模式切换**不改变工具目录**，以保住请求缓存稳定。 | `packages/plan/plan-mode/src/index.ts:180` | [08](08-orchestration.md) |
| **hook** | 外部 shell 命令扩展点。dsh 自己的扩展面是带类型的 Cordis 事件；`hooks-claude-code`（7 个事件）/ `hooks-codex`（5 个事件）只是把外部协议映射过来的兼容适配器，默认组装一个都没挂。 | `packages/hooks/hook-protocol/src/index.ts:1-7`（模块定性）、`packages/hooks/hook-protocol/src/runner.ts:20`（默认 600 秒超时） | [08](08-orchestration.md) |

这一节的英文：one-shot 是「一次性」，continuable 是「可以续的」，`startContinuable()` 就是「起一个可续的」，`send_message` 是「发消息」，`SubagentRun` 是「子代理的一次运行」，Activation 是「激活体」（这个子代理此刻活着的那个实例）。spawn 是「另起一个」，fork 是「岔一条出来」，seed 是「种子」，`completedTurnPrefix` 直译「已完成 turn 的前缀」。goal 四个相位 `active` / `paused` / `blocked` / `complete` 分别是进行中、暂停、卡住、已完成。Code Mode 三种呈现模式 `native` / `code` / `both` 是原生调用、写代码、两者都给。hook 是「钩子」。

## 八、自证与文档

| 术语 | 一句话 | 定义处 | 展开于 |
| --- | --- | --- | --- |
| **invariant** | 包自有的运行时契约断言，注册在 `ctx.invariants` 上，只断言「事件流或可变数据之间的关系」。219 个包各有一个 `invariant.ts`、全都调用 `ctx.invariants.register(...)`，但其中 **184 个装的是空实现**（统一带一句 `No runtime invariant:` 注释交代为什么不需要），**真正写了检查的是 35 个**（`grep -rl 'No runtime invariant:' packages --include=invariant.ts \| wc -l` 数得出来）。发行版默认不挂这套伴生插件。 | `packages/runtime-diagnostics/invariants/src/index.ts:94`；空实现的样板见 `packages/attachment/attachment/src/invariant.ts:12-13` | [13 自证与工程化](13-self-verification.md) |
| **Model Experience** | 每个包 README 里强制的一节，回答三个问题：模型看见什么 / token 影响 / KV cache 影响。219 个包里 215 个必须有，4 个豁免包的理由写在门禁脚本里。 | `scripts/verify-package-readme-model-experience.ts:13` | [13](13-self-verification.md) |
| **Agent Note** | 上游的设计记录体裁，路径编码状态（`{lifecycle}/{class}/yyyy-mm-dd-topic.md`），683 篇，`## Alternatives considered` 强制。 | `.agents/notes/README.md:9` | [15 设计记录导读](15-agent-notes-guide.md) |

这一节的英文：invariant 是「不变量」，指一个始终该成立的断言；空实现里那句注释开头的 `No runtime invariant:` 意思是「本包没有运行时不变量」，冒号后面接的是为什么不需要。Model Experience 直译「模型体验」，问的是同一件事在模型那侧长什么样。Agent Note 强制的那一节标题 `## Alternatives considered` 意思是「考虑过的其它方案」，路径模板里的 `{lifecycle}` 是生命周期状态、`{class}` 是类别。

## 九、一个不属于 dsh 的词

| 术语 | 说明 |
| --- | --- |
| **DSML** | **属于模型侧，不属于 harness。** 它是 DeepSeek V4 模型仓库里的聊天模板/工具调用序列化格式。在 dsh 锁定 commit 上 `grep -ril dsml` 全仓库**零命中**（排除 `node_modules` 与 `.git`）：源码、文档、设计记录都没有。dsh 在线发出的是 Chat Completions 的 SSE 请求，序列化代码在 `packages/llm/llm-deepseek/src/serialize.ts`。任何把 DSML 列进「dsh 的协议面」的说法都是把模型仓库的知识混进了 harness 分析。 |

那一格里的 SSE 是 server-sent events（服务端推送事件）的缩写，Chat Completions 是 OpenAI 风格的那套对话补全接口。

## 复核

表里每个 `路径:行号` 都会被本仓库的 `npm run check:anchors` 校验（越界或指向空行即失败），逐条手工核对的办法见[附录 B](appendix-b-verification.md)。上游那份 45 行的官方术语表值得对照读一遍：

```bash
cat docs/glossary.md
grep -ril dsml . --exclude-dir=node_modules --exclude-dir=.git | wc -l   # 0
```

第一条把上游那份术语表打印出来对照读。第二条在整个仓库里不区分大小写地搜 dsml（跳过 `node_modules` 和 `.git`），数一下命中几个文件，行尾那个 `# 0` 就是它应该给出的答案。

## 自检

**1. section 和 context 都会变成 system prompt 里的文字，为什么非要分成两个词？**

section 是静态文字，装配时按 order 排一次就定了；context 是每次求值的动态文字。分开是因为它们对缓存的影响完全不同：一个稳定的 section 每步都产出同样的字节，前缀能一直复用；而一个会随时间变化的 context 如果被放进 system，每一步的开头都不一样，前缀从第一个 token 起就废了。这也是 dsh 把运行时状态赶去 user 消息的原因。展开见 [01](01-system-prompt.md)、[02](02-kv-cache.md)。

**2. spawn 和 fork 都开一个子代理，为什么只有 fork 需要「seed」这个词？**

因为 spawn 出去的子代理看不见父对话，它的历史从零开始，没有什么可命名的；fork 带走了父对话的一段前缀，那段被带走的历史就是 seed。有了这个词才好谈两件事：边界切在哪（不能切在开放的 turn 里），以及血缘怎么记。展开见 [05](05-session.md)、[08](08-orchestration.md)。

**3. 这份表里为什么要专门留一条「不属于 dsh 的词」？**

因为术语表最容易出的错不是解释错，是收录了本不该收的词。DSML 属于模型仓库，把它列进 dsh 的协议面，读者会以为 harness 这一层要处理它。留着这一条并附上「全仓零命中」的复核命令，比悄悄删掉更有用——它同时是一份反例和一次示范：每条术语都该能被一条命令核回去。
