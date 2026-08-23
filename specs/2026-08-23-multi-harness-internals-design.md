---
title: 从 DeepSeek Harness Internals 到 Harness Internals：agent harness 与 eval harness 的对照设计
date: 2026-08-23
status: draft
---

# 设计：两种 harness，一个仓库

## 一、为什么要改

### 现有承诺有个窟窿

仓库现在自称的硬保证是：「CI 抽查正文里每一处 `路径:行号` 是否真的指向那一行，这是结论可追溯的唯一硬保证」。

这句话在 DSH 部分完全成立，在横向对照部分基本不成立。实测：

| harness | 正文提及次数 | 带行号锚点的引用数 |
| --- | --- | --- |
| Claude Code | 98 | 0 |
| Codex | 93 | 12 |
| OpenCode | 76 | 11 |
| pi | 58 | 11 |
| mini-swe-agent | 51 | 4 |
| dsh | — | 1021 |

全仓 1059 处锚点里，指向非 DSH 仓库的只有 38 处，占 3.6%。`docs/14` 一整篇七维矩阵，非 dsh 侧只有 14 处唯一锚点撑着，其余是无证据的散文断言。

### 单 harness 导读已经是红海

两周内 GitHub 上出现了至少 9 个 DSH 源码分析仓库。其中 `xiaonancs/deepseek-harness-deep-dive` 锁定的是和本仓库完全相同的 commit `47f9438`，写了 35 章、7 个 Part，篇幅全面超过本仓库的 21 篇。`hippone/deepseek-harness-internals` 和本仓库同名。Claude Code 赛道更卷，`shareAI-lab/learn-claude-code` 已经 7.4 万星。

篇幅上赢不了。唯一压过对手的是 CI 行号门禁：对手用 `[verified]` / `[inferred]` / `[claimed]` 人工标注，没有机器校验。

### 两块真空

**多 harness 对照。** GitHub 上只有两类：十几个 awesome 清单（链接目录加打分排名，零机制剖析零行号），以及一本停更的开发手册 `holny/Agent-Harness-Develop-Book`（教你怎么造，不是逐机制对照）。「逐机制 × 行号可核 × CI 门禁」这个交集没有人做。

**Codex 与 Gemini CLI 的源码级解析。** OpenAI 在 2026-08-20 以 Apache-2.0 开源了驱动 Codex 的执行引擎（`codex exec`、Codex SDK、`app-server`，载体就是 `openai/codex` 仓库本身），此后唯一相关的 `AlexKenbo/codex-harness-internals` 只有 5 星且是开源之前的逆向规格。Gemini CLI 的源码级解析在 GitHub 搜索里返回 0 个结果。

### 还有一块更大的真空：两种 harness 没人放在一起讲

「harness」这个词在两个圈子里指两个不同的东西：

- **agent harness**：包在模型外面、决定模型每一步收到什么、能碰什么的那一层。本仓库现在讲的就是这个。
- **eval harness**：给模型或 agent 打分的那一层。这个用法更早，来自 `EleutherAI/lm-evaluation-harness`（2021 年起，★13,750）。

它们正在合流，而且证据很硬。在 SWE-bench Pro 上，同一个模型换 agent harness，pass@1 从 23% 变到 52%（GLM-5.2）、从 15% 变到 36%（Gemma-4 26B）；harness 排名几乎不跨模型迁移（秩相关 -0.05）；Codex 对大模型过拟合，GLM-5.2 上排第 2、Gemma-4 上掉到第 9。结论是 *swapping the agent harness changed pass@1 more than many model upgrades do*（换 agent harness 对 pass@1 的影响，比很多次模型升级还大）。

这直接推出两件事：

1. **eval harness 不披露它用的 agent harness，分数就没有意义。** arXiv 2605.23950 的标题就叫 *Stop Comparing LLM Agents Without Disclosing the Harness*（别在不披露 harness 的情况下比较 agent）。
2. **两者已经在代码层面互相嵌入。** `laude-institute/terminal-bench` 把 agent harness 做成可插拔适配器；`SWE-agent/mini-swe-agent` 一身两役，既是一个 190 行的 agent harness，又是 SWE-bench 的基线跑分器，它已经在本仓库的 `sources.yml` 里。

GitHub 上做 agent harness 清单的有十几个，做 eval harness 清单的有几个（`Lhy723/awesome-ai-agent-evaluation` 只有 1 星），**把两者的耦合讲清楚的一个都没有**。

所以这次改造的定位是：**模型外面那层怎么造（agent harness），这层怎么被量出来（eval harness），以及为什么两者不能分开谈。**

## 二、目标与非目标

### 目标

1. Agent harness 四个主角（DSH、Codex、Gemini CLI、Claude Code）在同一个维度上并置剖析，每一格证据可核。
2. Eval harness 四个样本（lm-evaluation-harness、inspect_ai、terminal-bench、SWE-bench）讲清任务规格、执行、记分三段结构。
3. 用一篇专门的交汇篇把「换 harness 比换模型更能改分数」这件事讲到可复现。
4. 横向对照从「一篇附录」变成「每一篇的骨架」，同一件事不讲两遍。
5. 门禁从「行号存在」升级到「跨仓证据覆盖率达标」，让对照没法退化成清单。
6. 上游漂移可被机器发现，不靠人记得去看。

### 非目标

- 不做 harness 排行榜、不做打分、不做「谁更好」的结论。矩阵每格是可核事实，段落只讲矩阵横着读竖着读能看出什么。
- 不自己跑 benchmark。跑一次 SWE-bench Pro 的成本和可复现性都不是这个仓库能扛的。交汇篇引用公开数据并标明出处，不生产新分数。
- 不覆盖 100 个 harness。宁可四家讲透，不要二十家各浅一层。
- 不使用任何泄露的 prompt 转储、反编译产物或第三方逆向仓库。

## 三、上游漂移实测

`sources.lock.yml` 锁在 `47f9438`（2026-08-14），上游 HEAD 已到 `b150a55`（2026-08-21），期间发布了 `0.1.0-rc.7`、`0.1.0-rc.8`、`0.1.1-rc.1`、`0.1.1-rc.2` 四个版本。

- 854 个 commit，3423 个文件变化（新增 519、删除 28、修改 2848、重命名 20 余）
- 被引的 359 个上游文件里 116 个变了，占 32%
- 1059 处锚点里 396 处落在已变化的文件上，占 37.4%
- `.agents/notes/implemented` 变了 1030 个文件，`docs/15` 里「683 篇设计记录」这个数字已经过期

逐篇风险（落在变化文件上的锚点数 / 该篇锚点总数）：

| 篇目 | 比例 | 处理 |
| --- | --- | --- |
| `04-llm-adapter` | 82 / 123（67%） | 按重写对待 |
| `11-web-client-and-host` | 43 / 75（57%） | 按重写对待 |
| `09-extensions-and-code-mode` | 37 / 80（46%） | 逐节复核 |
| `02-kv-cache` | 36 / 82（44%） | 逐节复核 |
| `05-session` | 28 / 69（41%） | 逐节复核 |
| `13-self-verification` | 19 / 46（41%） | 逐节复核，另需重数 invariant 与测试文件数 |
| `08-orchestration` | 40 / 121（33%） | 逐节复核 |
| `07-tools-approval-sandbox` | 29 / 89（33%） | 逐节复核 |
| `12-surfaces-and-protocols` | 17 / 51（33%） | 抽查 |
| `appendix-a-glossary` | 17 / 66（26%） | 抽查 |
| `10-cordis-boot-preset` | 12 / 50（24%） | 抽查 |
| `01-system-prompt` | 18 / 86（21%） | 抽查 |
| `03-agent-loop` | 9 / 24（38%） | 抽查 |
| `00-overview` | 6 / 14 | 抽查，另需重数包组数 |
| `15-agent-notes-guide` | 1 / 14 | 重数设计记录篇数 |
| `06-compaction` | 0 / 47 | 干净 |
| `14-comparison` | 0 / 19（其中 14 处指向非 dsh 仓库） | dsh 侧干净，非 dsh 侧随各自重锁复核 |
| `concepts` / `for-product` / `for-ops` | 0 / 0 | 随正文结论联动 |

最高频被引的文件全部在变动列表里：`packages/core/agent-loop/src/agent.ts`（26 处锚点）、`packages/llm/llm-deepseek/src/serialize.ts`（22）、`packages/core/tools/src/code-mode.ts`（21）、`packages/core/session/src/types.ts`（19）。

## 四、目标形态

### Part A：agent harness，四主角三对照

| 角色 | 项目 | 源 | 许可 | 证据等级 |
| --- | --- | --- | --- | --- |
| 主角 | **DSH** | `deepseek-ai/deepseek-harness` | MIT | 源码，行号 |
| 主角 | **Codex** | `openai/codex` | Apache-2.0 | 源码，行号。`codex-rs` 下 104 个 crate |
| 主角 | **Gemini CLI** | `google-gemini/gemini-cli` | Apache-2.0 | 源码，行号 |
| 主角 | **Claude Code** | `anthropics/claude-agent-sdk-python` | MIT | 契约面源码 + 官方文档，见下 |
| 对照 | OpenCode | `anomalyco/opencode` | MIT | 源码，一句话级 |
| 对照 | pi | `earendil-works/pi` | MIT | 源码，一句话级 |
| 对照 | mini-swe-agent | `SWE-agent/mini-swe-agent` | MIT | 源码，一句话级。同时是 Part B 的样本 |

**Claude Code 的证据边界要在正文里说死。** 它的本体闭源，但 `claude-agent-sdk-python` 是 MIT 开源的官方 SDK，其中 `src/claude_agent_sdk/types.py`（88 KB）完整定义了 hook 事件、工具 schema、权限模式、settings 结构。这些是 harness 对外的契约面，可以给行号。契约面之外的内部实现（怎么装配 prompt、怎么压缩、缓存怎么落地）仍然只用官方公开文档，逐条给链接。每一格必须标清楚属于哪一种，不允许把契约面的确定性借给内部实现的推断。

**Codex 与 DSH 的子系统映射**（升主角后可用的对应关系）：

| 维度 | dsh | codex-rs |
| --- | --- | --- |
| system prompt | `packages/core/system-prompt` | `prompts` / `context-fragments` / `models-manager` |
| 循环与工具 | `packages/core/agent-loop`、`packages/core/tools` | `core` / `tools` / `exec-server` |
| 审批与沙箱 | 三平台四后端 | `execpolicy` / `bwrap` / `linux-sandbox` / `windows-sandbox-rs` / `sandboxing` / `process-hardening` / `shell-escalation` |
| 会话 | `packages/session/*` | `rollout` / `rollout-trace` / `thread-store` / `history` / `state` / `memories` |
| 扩展 | Cordis 插件树 | `plugin` / `core-plugins` / `skills` / `hooks` / `codex-mcp` / `connectors` |
| Code Mode | `packages/core/tools/src/code-mode.ts` | `code-mode` / `code-mode-host` / `code-mode-protocol` / `code-mode-runtime` |
| 产品表面 | web / headless / ACP / MCP / SDK / Python | `app-server` / `exec` / `cli` / `tui` / `cloud-tasks` / `mcp-server` / `sdk` |

两家都有 Code Mode、都有插件系统、都有多沙箱后端。这是现成的对照，别人短期内写不出来。

**Gemini CLI 的入口**：`packages/core/src` 下的目录是 `agent`、`agents`、`config`、`confirmation-bus`、`context`、`core`、`hooks`、`mcp`、`policy`、`prompts`、`routing`、`safety`、`sandbox`、`scheduler`、`services`、`skills`、`telemetry`、`tools`。目录名几乎就是本仓库的维度划分。`confirmation-bus`、`policy`、`safety` 三者分开，和 dsh 把审批合进工具管线、Codex 放进内核沙箱，是三种不同取舍，值得单独一节。

### Part B：eval harness，四个样本

| 项目 | 源 | 许可 | 在本仓库里的角色 |
| --- | --- | --- | --- |
| **lm-evaluation-harness** | `EleutherAI/lm-evaluation-harness` | MIT | 词源。任务注册表、few-shot 装配、`log_likelihood` 与 `generate_until` 两种请求形态 |
| **inspect_ai** | `UKGovernmentBEIS/inspect_ai` | MIT | agent 时代的标准形态。`solver` / `scorer` / `sandbox` 三段分离 |
| **terminal-bench** | `laude-institute/terminal-bench` | Apache-2.0 | 交汇点的实证：把 agent harness 做成可插拔适配器 |
| **SWE-bench** | `princeton-nlp/SWE-bench` | MIT | 任务规格与判定：容器化仓库快照 + `FAIL_TO_PASS` / `PASS_TO_PASS` 判据 |
| mini-swe-agent | 已在 `sources.yml` | MIT | 一身两役，Part A 与 Part B 共用 |

Part B 讲三件事：**任务怎么定义**（SWE-bench 的容器快照与判据、terminal-bench 的终端任务、METR task-standard 的接口约定）、**执行怎么跑**（inspect_ai 的 solver 与 sandbox、lm-evaluation-harness 的批处理）、**分怎么记**（判据式 vs LLM 裁判，pass@k 的口径分歧）。

不打算把 HELM、openai/evals、METR/vivaria 也纳入锁定源。它们在正文里以官方文档级引用出现，不给行号。理由是每加一个源，`npm run bootstrap` 的时间和磁盘都要涨，而它们对讲清结构没有新增信息。

### 交汇篇

单独一篇，讲 agent harness 与 eval harness 的耦合：

- 词源分岔：eval harness 的用法早于 agent harness，两者为什么撞名
- 实证：SWE-bench Pro 上换 agent harness 造成的分数变化（引公开数据，标明出处，不自己跑）
- 代码层面的证据：`terminal-bench` 的 agent adapter 接口长什么样，`mini-swe-agent` 怎么同时充当两者
- 由此推出的方法论：报告分数必须披露哪些 harness 参数（迭代预算、上下文管理策略、工具调用格式与错误面、是否回传上一次的测试失败输出）
- 对读者的用处：你自选的 harness 在你自己的任务上是什么水平，怎么在不跑全量 benchmark 的前提下得到一个可信数字

### 目录重构

现在的问题是同一件事讲两遍：`01` 讲 dsh 的 system prompt 并在结尾附一段别人怎么做，`14` 再统一对照一遍，而第二遍没有证据。

改成每篇一个维度，多家并置：

```
docs/00-overview.md              两种 harness、这个仓库怎么读
docs/concepts.md                 不写代码也要懂的
docs/for-product.md              产品视角
docs/for-ops.md                  成本、部署与风险

docs/a1-system-prompt.md         prompt 装配：谁拥有这份资产
docs/a2-kv-cache.md              缓存：前缀稳定性从哪来
docs/a3-agent-loop.md            一个 turn 里发生什么
docs/a4-compaction.md            上下文压缩与记忆
docs/a5-tools-approval-sandbox.md    工具、审批、沙箱、网络
docs/a6-session.md               会话持久化与可恢复
docs/a7-extensions.md            插件、skills、hooks、MCP
docs/a8-code-mode.md             新增。dsh 与 Codex 都有，其余没有
docs/a9-surfaces.md              产品表面与协议
docs/a10-orchestration.md        子代理、计划、工作流

docs/e1-what-is-eval-harness.md  词源、和 agent harness 同名不同物
docs/e2-tasks-and-envs.md        任务怎么定义：SWE-bench / terminal-bench / task-standard
docs/e3-run-and-score.md         执行与记分：inspect_ai 的三段结构
docs/e4-harness-decides-score.md 交汇篇

docs/deep/dsh-*.md               只属于 DSH 的深度内容
docs/appendix-a-glossary.md
docs/appendix-b-verification.md
```

现有文件的去向：

| 现有 | 去向 |
| --- | --- |
| `00-overview` | 拆：dsh 部分进 `docs/deep/dsh-overview.md`，另写跨家的 `docs/00-overview.md` |
| `01` / `02` / `03` / `06` / `07` / `12` | 分别升级为 `a1` / `a2` / `a3` / `a4` / `a5` / `a9`，加入其余三主角 |
| `05` → `a6`，`08` → `a10`，`09` → `a7` + `a8` | 拆分 |
| `10-cordis-boot-preset` | `docs/deep/dsh-cordis-boot-preset.md` |
| `11-web-client-and-host` | `docs/deep/dsh-web-client.md` |
| `13-self-verification` | `docs/deep/dsh-self-verification.md` |
| `15-agent-notes-guide` | `docs/deep/dsh-agent-notes.md` |
| `14-comparison` | 拆进 a1–a10，本文件删除 |
| `concepts` / `for-product` / `for-ops` | 保留在顶层，内容改成跨家 |
| `04-llm-adapter` | 并入 `a3`（请求装配）与 `docs/deep/dsh-llm-adapter.md`（DSH 特有的 SSE 与重试细节） |

`docs/` 保持扁平这条规则放宽成两层（`docs/` 与 `docs/deep/`），`AGENTS.md` 的目录职责表同步改。

### 门禁升级

现有八道保留，新增三道。

**`check:drift`**（P0 上线）。对每个源，比较 lock commit 与 `origin/HEAD`，算出被引文件里有多少变了、多少处锚点落在变化文件上，写成报告。CI 定时跑，超过阈值开 issue。第三节那两张表就是它的输出样例。

**`check:coverage`**（P0 只报告，P1 开始 fail）。对 `docs/a*.md`，统计每个主角各自的锚点数；对 `docs/e*.md`，统计每个 eval 样本的锚点数。任何一个主角低于阈值就算不合格。阈值随篇设定，写在 frontmatter 里，理由也写进去。这是防止「Codex 那一节又写成三段散文」的唯一机器手段。

**`check:matrix`**（P1）。矩阵每一格必须是三者之一：行号锚点、官方文档 URL、正文明写「这是推断」。三者都没有就 CI 失败。

`check:anchors` 本身不改，它的 `repo!path:line` 跨仓语法已经够用。

## 五、GitHub 仓库信息

改名与元数据一起改，一次改完，不反复。

### 名称

`deepseek-harness-internals` → **`harness-internals`**

已确认 `plwslpld-arch/harness-internals` 未被占用，全站也没有同名仓库（只有 `AlexKenbo/codex-harness-internals` 带前缀）。GitHub 会自动重定向旧地址，README 顶部注明原名。

备选 `agent-harness-internals` 也可用，但它把 eval harness 排除在名字外了，和 Part B 不符。

### description

> Agent harness 与 eval harness 的源码级对照（中文）：DeepSeek Harness / OpenAI Codex / Gemini CLI / Claude Code 逐机制并置，配 lm-evaluation-harness、inspect_ai、terminal-bench、SWE-bench。每条结论绑定上游 commit，行号由 CI 校验。

### topics

现有 20 个 topic 全部是 DSH 中心（`cordis`、`deepseek`、`deepseek-harness`、`product-management`、`technical-writing` 等），全部替换为：

```
agent-harness  eval-harness  harness-engineering
deepseek-harness  openai-codex  gemini-cli  claude-code  opencode
inspect-ai  swe-bench  terminal-bench  lm-evaluation-harness
agent-loop  kv-cache  prompt-caching  mcp
source-code-analysis  llm-evaluation  coding-agent  chinese
```

正好 20 个，是 GitHub 的上限。

### README

整篇重写，结构：

1. 一句话定位：两种 harness，一个仓库
2. 「这是什么」：agent harness 与 eval harness 的区别，以及为什么放一起
3. 按角色分流的入口表（保留现有的四条路线，加一条「想搞懂跑分怎么来的」）
4. Part A 与 Part B 的文章表
5. 「结论是怎么来的」：四种依据 + 三道新门禁的说明
6. 「本地跑一遍」：注意 `npm run bootstrap` 现在要拉 11 个源
7. 免责：不是任何一家的官方仓库；Claude Code 只用官方文档与 MIT SDK；不使用泄露转储

同时需要改的还有：`AGENTS.md`（目录职责、证据边界规则）、`THIRD_PARTY.md`（新增 4 个源的许可边界）、`NOTICE.md`、`assets/` 里的 logo（现在是 dsh 的鱼形主标，改名后不适合再用）。

### 执行时机

**元数据（description、topics）可以马上改**，低风险、随时可回退。

**改名与 README 重写建议放在 P0 完成之后。** 现在改名，README 会承诺一套还不存在的内容，且 `sources.lock.yml` 还锁在一个 9 天前、被引文件已经变了三分之一的快照上。先把地基修好再挂新招牌。

## 六、分期

### P0：修地基（约 1 周）

没有可信的基线，加再多 harness 也是沙上盖楼。

1. **环境**。本机 Node 是 v20.19.0，`package.json` 要求 `>=22.19.0`。先升 Node。
2. **全部重锁**。dsh 推到 `b150a55`（`0.1.1-rc.2`），codex、opencode、pi、mini-swe-agent 各自重锁到当日 HEAD，更新 `sources.lock.yml` 与各篇 frontmatter 的 commit 字段。
3. **写 `scripts/check-drift.mjs`**，产出 `research/drift-report/2026-08-23-dsh-47f9438-to-b150a55.md`，内容为第三节那两张表。
4. **逐篇复核 396 处漂移锚点**，按第三节的优先级顺序。原则：**改行号是机器的事，判断结论是否还成立是人的事。** 凡是发现上游语义变了、原结论不再成立的，重写该节，不要只把行号推到新位置。
5. **重数过期数字**：`docs/15` 的设计记录篇数、`docs/13` 的 invariant 数与测试文件数、`docs/00` 的包组数。
6. **写 `scripts/check-coverage.mjs` 骨架**，先只打印不 fail。
7. **改 GitHub 元数据**：description 与 topics 按第五节替换。名称与 README 暂不动。
8. **CHANGELOG 记录**，各篇 frontmatter 的 `last_verified` 更新。

验收标准：

- `npm run bootstrap && npm run check` 全绿
- `research/drift-report/2026-08-23-*.md` 落盘
- 每篇 frontmatter 的 `status` 有明确取值，复核过的升 `reviewed`，来不及复核的明确标 `stale`，不留 `draft` 混着
- 因上游语义变化而重写的段落，在 CHANGELOG 里逐条列出，说明「原来说什么、现在说什么、为什么变」

### P1：Part A 升主角与结构重构（约 3 周）

1. `sources.yml` 加 `gemini-cli`（Apache-2.0）与 `claude-agent-sdk`（`anthropics/claude-agent-sdk-python`，MIT）。更新 `.gitmodules`、`THIRD_PARTY.md`、`verify-licenses` 的哈希表。
2. `docs/` 按第四节的映射重构为 `a1`–`a10` + `docs/deep/`，`14-comparison` 拆解删除。
3. 逐维度补齐 Codex、Gemini CLI、Claude Code 三家的源码剖析与锚点。
4. `check:coverage` 转为 fail，`check:matrix` 上线。
5. `AGENTS.md` 更新：目录职责、多主角的证据边界规则、Claude Code 的契约面与文档面必须分开标注这一条。

### P2：Part B 与交汇篇（约 2 周）

1. `sources.yml` 加 `lm-evaluation-harness`、`inspect_ai`、`terminal-bench`、`swe-bench` 四个源。
2. 写 `e1`–`e4` 四篇。
3. 新增 `a8-code-mode`（dsh 与 Codex 双实现对照）与 `a5` 里的网络围栏一节（dsh 沙箱完全不管网络、Codex 内核级、`openai/fence` 的 egress 三种做法）。

### P3：改名与对外（约 1 周）

1. 仓库改名 `harness-internals`，README 整篇重写，logo 更换。
2. 四张图入库为 SVG：agent harness 维度矩阵、dsh 包组与 codex crate 的子系统映射、harness × model 分数交叉（引公开数据）、agent harness 与 eval harness 的耦合关系图。
3. 补英文 README。上游那十几个 awesome 清单的受众都是英文，纯中文等于自我屏蔽。

## 七、风险

**上游语义变化可能远超行号漂移。** `04-llm-adapter` 有 67% 的锚点落在变化文件上，很可能不是行号推移而是实现换了。P0 的工期要留出「发现结论变了就重写该节」的余量，不能按「批量修行号」估。

**源从 5 个涨到 11 个，bootstrap 成本上升。** codex、gemini-cli、opencode 三个都是大仓。缓解：现有 `bootstrap.mjs` 已经用 `--filter=blob:none --no-checkout`，再加一个「只拉 Part A 的源」的开关，Part B 的源按需拉。

**四主角会稀释深度。** 现在 DSH 部分有 1021 处锚点，四家平摊不可能都到这个密度。缓解：`check:coverage` 的阈值按维度设，把只属于 DSH 的深度内容保留在 `docs/deep/` 而不是删掉。

**Claude Code 的证据边界容易滑坡。** 拿到 SDK 契约面的锚点之后，很容易顺手把内部实现的推断也写得像事实。`check:matrix` 和 `AGENTS.md` 的规则要一起上，缺一个都挡不住。

**交汇篇引用的分数会过期。** SWE-bench Pro 那组数据是 2026-08 的公开结果。正文必须写清数据日期和出处，并说明本仓库不生产分数，只解释分数怎么被 harness 影响。

**改名会丢外链与既有搜索位。** 缓解：GitHub 自动重定向，README 顶部注明原名，P3 一次性完成不反复改。

## 八、待定

- 是否加 `openai/symphony`（Apache-2.0，Elixir，spec-first 的自治任务编排层）为 `a10` 的第五个样本。它和另外四家不是一个层次的东西，加进来要单独说明定位。
- 英文版是全量翻译还是只出 README 与矩阵。
- 是否提供 MCP 查询接口让 agent 直接查矩阵。`RyanAlberts/best-of-Agent-Harnesses` 已经做了清单级的，本仓库如果做就该是机制级的。属于 P4。
- 图的生成方式。本机没有 `codex` CLI，可以装（`npm i -g @openai/codex`），也可以直接手写 SVG 与 Mermaid，仓库已有 `assets/deepseek-harness-atlas.svg` 的先例。
