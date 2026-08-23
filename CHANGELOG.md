# Changelog

所有重要变化记录在此。研究基线由 `sources/sources.lock.yml` 独立固定。

## [Unreleased] — 2026-08-16 重构：从「索引 + 制度」转向「机制 + 对照」

### Changed — 2026-08-23 上游重锁复核

- 21 篇正文全部复核到新的五仓 lock，frontmatter 恢复为 `reviewed`；`check:anchors` 当前校验 1,572 处引用，失效引用为 0。
- 重写上游语义真变的段落：DeepSeek reasoning 回传、SQLite 物理事件行、Claude/Codex 子代理启动、Web boot graph 注入；同步修正重试次数、包结构与规模数字。
- 新增只报告的 `check:coverage` P0 骨架，为后续 `docs/aN-*.md` 与 `docs/eN-*.md` 的跨仓证据阈值留出门禁入口。
- 加固 `review-anchors`：能跨多个中间提交找到旧 lock，重复源码行不再误迁移，已经人工更新的引用不会被二次改写。

### 为什么重构

上一版有三个结构性问题：文章只给行号锚点、不给模型真实看到的东西；强制五段式导致大量凑段（每篇的"实验"段有 13 个需要凭据的实验从未跑过，"预期结果"全是预测）；根目录治理文件比正文还多，其中 `PROJECT_STATUS.md` 整份是更早一版的残留。

### Changed

- **12 篇 + 2 附录 → 16 篇 + 2 附录**，每篇先给「模型/进程真实看到的东西」，再讲机制、设计取舍、失效点，并就地给出与其它 harness 的对照。
- **横向对照从「数行数」改成「比机制」**：新的 [14 篇](docs/14-comparison.md) 按 prompt 装配、缓存策略、压缩、循环、审批沙箱、会话、扩展七个维度对比 dsh / Claude Code / Codex / OpenCode / pi / mini-swe-agent，每格带文件行号。
- **frontmatter 简化**为 `title` / `sources` / `last_verified` / `status`；去掉 `depth`、`audience`、`evidence` 三个无信息量的字段，以及全部行内证据标签（推断改为正文明写）。
- **上游来源从 15 个收敛到 5 个**：只保留真正被逐行引用的 dsh 与四个对照实现。

### Added

- **`check:anchors` 门禁**：抽查正文里每一处 `路径:行号` 是否指向真实存在的行，越界或指向空行即失败。此前 CI 只校验「文件存在」，行号写错也能过。
  引用后面跟「原文片段」时还会做子串匹配，把「行号对、但指到了相邻的另一个声明」这类错也挡在 CI 里。
- 全新覆盖此前完全空白的部分：[Web 客户端与 host](docs/11-web-client-and-host.md)（39 个包、7.2 万行，全仓最大）、[Extensions 与 Code Mode](docs/09-extensions-and-code-mode.md)、[自证与工程化](docs/13-self-verification.md)、[设计记录导读](docs/15-agent-notes-guide.md)。
- [01 System Prompt](docs/01-system-prompt.md) 给出逐字重建的默认首轮请求：完整 system 字符串、工具清单、以及注入到历史里的每一条消息。
- [02 KV-Cache](docs/02-kv-cache.md) 补齐运行时机制：wire 请求怎么拼、`request/header` 的三种 reason、什么会打断前缀、命中率遥测链。

### Fixed

- 旧 `docs/10` 有一段**伪代码冒充源码**（`mountFrontendStatic`、`printReadyUrl` 等函数上游根本不存在）；ACP 包路径也写错了。
- 旧 `docs/03` 说「工具结果塞进下一 step 的 inbox」——实际 `tool/result` 直接写入日志并进入派生历史。
- 旧 `docs/08` 开篇「改文件前弹窗问你」是错的——默认组合下写文件和跑命令不弹窗。
- 旧 `docs/06` 把 pi-ai 的 `replayState` 与 KV-cache 混为一谈，二者无关。
- 旧 `docs/10`、`docs/12` 把 DSML 列为 dsh 的协议面——上游源码 `grep -ri dsml` 零命中，它属于模型侧。
- `AGENTS.md` 禁用 `inference` 标签而校验脚本仍允许——两边已对齐（标签体系整体取消）。

### Verified — 带凭据的端到端验证（2026-08-16）

- 上游 `packages/core/agent-loop/tests/request-cache.e2e.ts` 用真实 key 跑通并通过；去掉 key 同一条命令是 `1 skipped`，排除了「门控放行但没测」的假通过。
- 上游 `packages/llm/llm-deepseek/tests/adapter.e2e.ts` 6 条全过（thinking 开关切换、tool call 轮次的 reasoning 回传、SSE 顺序、凭据只从 credentials 文档读）。
- 新增 `scripts/experiments/cache-probe.mjs`：零依赖探针，直接测四条缓存论断。实测数字——前缀稳定时命中 81–96%；只改 system 一句话掉到 0；权限策略进 system 每次切换只剩 256 token 命中，改成尾部 user 快照保持 81%；摘要请求复用前缀 93.4%，另起 summarizer system prompt 0%。全部非零命中值都是 64 的整数倍，独立佐证了 64-token 块粒度。
- 据此改写 README、01、02、附录 B 里「尚未跑过」的说法，并删掉那份已经过时的 pending 记录。

### Changed — 文风（2026-08-16）

- 全部 18 篇正文 + README 用「说人话」skill（[MrGeDiao/shuorenhua](https://github.com/MrGeDiao/shuorenhua) v2.3.0）按 `docs` 场景改写：档位 `minimal`、scope `bounded`、无源引用 `audit-only`。
- 破折号 `——` 从 478 处降到 44 处（剩下的都承担真插入或转折）；「值得注意的是 / 换句话说 / 至关重要 / 本质上 / 一句话总结」清零；引号统一成「」。
- 改写全程不动 protected spans：1033 处 `路径:行号` 引用一处未少，frontmatter、代码块、上游英文原文引文逐字节未变；三批改写的删除清单都是空的，没有删句或并句。
- `AGENTS.md` 记下这套文风标准与 skill 的安装方式，后续改文档照此执行。
- `.claude/` 加入 `.gitignore` 与门禁忽略目录：本地 agent 配置不属于仓库内容，也不参与文件扫描。

### Changed — 教学化改造与三篇非研发入口（2026-08-16）

- **新增 3 篇不需要读代码的入口**：[概念入门](docs/concepts.md)（模型与 harness 各管什么、为什么长对话贵、为什么会忘事）、[产品视角](docs/for-product.md)（14 个用户可观察的现象各自对应哪条机制）、[成本、部署与风险](docs/for-ops.md)（账单杠杆、部署形态、风险边界、上线前验证清单）。**18 篇 → 21 篇**，README 顶部改成按角色分流的入口表。
- **18 篇正文按四条教学标准返工**：顶部读者提示、开篇钩子、结尾 `## 自检`（考理解不考记忆）、英文引文一律就地给中文翻译。标准写进 [AGENTS.md](AGENTS.md)，后续新文照此执行。
- `check:anchors` 覆盖从 18 篇扩到 21 篇，锚点 1033 → **1059** 处。

### Fixed — 全仓一致性复核（2026-08-16）

- 三篇新入口在转述正文时丢掉的限定词补回：dsh 沙箱在 Windows 上只兑现一部分、`write`/`edit` 走的是进程内路径围栏而非内核沙箱、沙箱完全不管网络、Claude Code 一列依据官方公开文档无法从源码核实、hook 桥只覆盖 Claude Code 30 多个事件里的 7 个。
- 数字与单位订正：术语表 54 条 → **60 条**；测试文件数 950 → **854**（与附录 B 的命令输出对齐）；`bash` 工具描述 1,600 多字符 → **1,836**；Codex / pi 的压缩保留量「2 万字」→ **2 万 token**；策略进 system 后残余命中的「256 个字符」→ **256 个 token**。
- 「四个平台」的口误统一成「**三个平台、四个沙箱后端**」（Linux 有 bwrap 与 Landlock 两条路），涉及 `07` 与 `for-ops`。
- 说反或无出处的对照订正：OpenCode 会话「能分叉」→ 实为只能撤销到某条消息；pi「不做插件市场」→ 实为不接 MCP（pi 有 33 个事件的扩展 API）；Claude Code「改 CLAUDE.md 要等 `/clear` 或重启」正文无出处，改写为有据的部分；`for-product` 的会话存储表补回漏掉的 OpenCode 一行。
- 过度放大的说法收回：plan 模式改的是 system 中段，作废的是那一段往后的内容，不是「整段缓存作废」；缓存一折是 provider 公开定价而非本仓库实测；`request/header{change}` 会被采样参数触发，不能单独当缓存断裂的判据。
- `for-ops` 的命令行入口表按 `12` 的权威表订正（`dsh --profile headless "job"` 带位置参数、`dsh plugin --profile <名字> <pnpm 参数>`、profile 名没有白名单）。
- 补 `07` 工具表里 5 条只有英文没有中文的描述（`pwsh`、`read_image`、`str_replace_editor`、`skill`、`workflow`）；`appendix-a` 补上缺失的 `## 自检`；`concepts` / `for-product` / `for-ops` 补上缺失的钩子；`10` 开篇那句 `run_in_background` 在正文里无对应，改掉。
- `00` 的目录表把 `14` 写成「六个维度」，与 `14` 自述的七维不一致，已改。

### Removed

- `PROJECT_STATUS.md`（内容属更早一版）、`ROADMAP.md`（打勾项对应产物已删）、`GOVERNANCE.md` / `MAINTAINERS.md` / `SUPPORT.md` / `CODE_OF_CONDUCT.md` / `CITATION.cff`（单人研究仓库的仪式性文件）。
- `templates/`、`schemas/`（"file study 时代"的孤儿，已无任何文件使用）。
- gh-pages 生成索引链路（正则级符号表，读者直接 grep 上游更准）与每 6 小时的上游检查工作流（对锁定单 commit 的深读只会制造 stale 噪音）。
- `sources/upstream-update.*`、`sources/stale-documents.md`（机器输出，且内容互相矛盾）。
- 两份把「仓库自身一致」写成运行证据的记录；只保留如实标注「未跑」的那一份。
