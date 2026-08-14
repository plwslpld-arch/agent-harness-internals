# Changelog

所有重要变化记录在此。版本格式遵循语义化版本，研究基线同时由
`sources/sources.lock.yml` 独立固定。

## [Unreleased]

### Changed — 重构：从百科索引转向深度解读

- 面向读者收敛为一类：想搞懂 agent harness 内部构造的中文工程读者，不再分设产品/维护者等多条路线。
- **21 章百科重构为 12 篇深度长文 + 2 个附录**，扁平结构、ASCII slug 文件名、中文标题。
- **每篇固定五段**：产品现象 → 源码路径（精确到文件行号，绑定锁定 commit）→ 机制 → 约束与失效条件 → 可复核实验。
- **导航七合一**：删除 `QUICKSTART.md`、`LEARNING_PATH.md`、`docs/README.md`、`docs/00-start-here/`，`README.md` 成为唯一入口。
- **生成索引移出主干**：`docs/14-file-reference/generated/`（137,046 行）改为本地 `.generated/`（gitignore），由 CI 发布到 `gh-pages` 孤儿分支；`catalogs:verify` 退出 `npm run check` 链。
- **停用 `inference` 证据标签**（此前 88/88 篇都带它，零区分度）；行内证据标注统一为反引号后缀写法。
- 仓库更名为 `deepseek-harness-internals`。
- 清理 `research/` 下 4 个仅含 README 的空壳目录与空的 `.github/ISSUE_TEMPLATE/`。

### Added

- 12 篇正文，其中 4 篇是上游与其它中文内容都不会有的独家：KV-cache 纪律、压缩的前缀复用、Invariant 与 Agent Note、横向对照。
- 附录 A：实验手册，索引全部 39 个可复核实验（26 个无需凭据）。
- 附录 B：28 条术语表、证据分级、benchmark 设计、上游维护、许可证边界、论文标注方法。

### Fixed

- 更正 `SandboxEnforcement` 的描述：实际是 `'full' | 'partial'` 两态，`'unavailable'` 属于 `EscalationOutcome`。
- 更正 Cordis 插件状态机：实际是 `FiberState` 六态（`PENDING`/`LOADING`/`ACTIVE`/`FAILED`/`UNLOADING`/`DISPOSED`），此前图中的 `Declared`/`Waiting`/`Disposing` 是自造名称。
- 更正事件分发模式数量：实际五种（含 `bail`），此前记为四种。

### Removed（早期条目，已被上述重构取代）

- Added `QUICKSTART.md` and `LEARNING_PATH.md` as clear public entry points.
- Added role-route index under `docs/00-start-here/paths/`.
- Added `docs/00-course/` as the primary 12-part course path.
- Added source evidence cards and minimum experiment prompts to every course lesson.
- Added stage-by-stage course checklists and FAQ for source reading, plugins, prompt/context and TUI boundaries.
- Added a sanitized local evidence draft generator for runtime experiments.
- Added a generated-index navigation page and initial runtime-evidence records.

### Changed

- Expanded the Agent Loop, prompt/context, DeepSeek adapter, tools/approval/sandbox and Session lessons with source-shaped code-block explanations.
- Reorganized the `00-start-here` entry structure around route, roadmap and workbook layers.
- Simplified the root README so GitHub visitors start from the right learning path instead of reading every evidence rule on the homepage.
- Repositioned generated catalogs and research ledgers as reference layers rather than onboarding content.
- Refreshed the pinned ecosystem baseline for ACP SDK, Claude Agent SDK TS, Codex, Pi, OpenCode, Qwen Code, and SWE-bench.
- Regenerated source catalogs and reviewed affected source-bound analysis against the new commits.

## [0.1.0] - 2026-08-13

### Added

- 产品、工程和维护者三条学习路线。
- 文件级源码、测试、设计决策和生态索引框架。
- 上游来源锁定、许可证治理和每 6 小时更新检查设计。
- 可复现实验、安全研究与社区证据框架。
- GitHub 首页 Logo、状态徽章、主题标签、更新状态与发布入口。

[Unreleased]: https://github.com/plwslpld-arch/deepseek-harness-internals/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/plwslpld-arch/deepseek-harness-internals/releases/tag/v0.1.0
