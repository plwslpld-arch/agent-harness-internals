# Changelog

所有重要变化记录在此。研究基线由 `sources/sources.lock.yml` 独立固定。

## [Unreleased] — 2026-08-16 重构：从「索引 + 制度」转向「机制 + 对照」

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
- 全新覆盖此前完全空白的部分：[Web 客户端与 host](docs/11-web-client-and-host.md)（39 个包、72k 行，全仓最大）、[Extensions 与 Code Mode](docs/09-extensions-and-code-mode.md)、[自证与工程化](docs/13-self-verification.md)、[设计记录导读](docs/15-agent-notes-guide.md)。
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

### Removed

- `PROJECT_STATUS.md`（内容属更早一版）、`ROADMAP.md`（打勾项对应产物已删）、`GOVERNANCE.md` / `MAINTAINERS.md` / `SUPPORT.md` / `CODE_OF_CONDUCT.md` / `CITATION.cff`（单人研究仓库的仪式性文件）。
- `templates/`、`schemas/`（"file study 时代"的孤儿，已无任何文件使用）。
- gh-pages 生成索引链路（正则级符号表，读者直接 grep 上游更准）与每 6 小时的上游检查工作流（对锁定单 commit 的深读只会制造 stale 噪音）。
- `sources/upstream-update.*`、`sources/stale-documents.md`（机器输出，且内容互相矛盾）。
- 两份把「仓库自身一致」写成运行证据的记录；只保留如实标注「未跑」的那一份。
