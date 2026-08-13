---
sources: [{"repo":"deepseek-harness","path":".agents/notes/implemented/simplification/2026-08-04-remove-tui-package.md","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# TUI 删除：当前事实、历史记录与陈旧文档案例

基线：DeepSeek Harness `47f943859bef60e4160492346772ded9b24f765a`。

## 第一层：当前实现事实

[code] `packages/ui/tui`、`apps/cli/config/tui.cordis.yml`、TUI CLI entry、fixtures/snapshots 与 `pi-tui` patch 已不在 HEAD。删除提交 `10bb9cbf4a22…`（2026-08-04）题为 `cleanup: remove TUI package and legacy dsh entrypoints`。

[official decision] `.agents/notes/implemented/simplification/2026-08-04-remove-tui-package.zh.md` 的状态是 `implemented`：不提供兼容包/别名；Web 是已交付交互面，ACP、JSON-RPC 与一次性 CLI 是非 Web 入口；通用 commands/questions/approval/presentation/PTY/session projection seams 可被未来宿主复用。

结论：当前 Harness 不提供受支持的 TUI package 或产品组合。“terminal tools/PTY 存在”不等于“TUI 产品存在”。

## 第二层：历史记录

[history] Git 历史和 archived Agent Notes 保留 TUI 的 welcome、resume、cards、timing、Windows 支持、长会话性能等设计与测试。这些记录解释曾经的取舍，但删除决策明确 supersede 它们对当前 package/application inventory 的权威性。

历史文档不是垃圾：它们可解释为什么通用 seams 仍带有 TUI 时代命名/比较，也为未来新终端前端提供反例。但未来实现必须从新的具名产品、交互 provider 和 assembled lifecycle/transcript acceptance 开始，不能把旧包直接复活。

## 第三层：陈旧/残余文字

[stale-doc evidence] 当前 SHA 仍能搜到 TUI 字样，例如翻译 prompt 的 protected example、postmortem 历史叙述、代码注释中的 UI 对比。多数属于历史/比较语境，不是支持声明。

更危险的是 `apps/cli/reference/README*` 和 plugin publish guide 仍给出外部 `https://github.com/deepseek-harness/turtle-ui`。2026-08-13 的 `git ls-remote` 返回 `Repository not found`。这只能证明该 URL 当时不可获取，不能证明项目从未存在；但足以判定它不能作为当前可运行教程或生态成熟度证据。

## 三层判定规则

1. 先看 HEAD package/profile/entrypoint 和 assembled tests，得到当前事实。
2. 再看 implemented/rejected/archived decision 的状态与 supersedes，解释时间线。
3. 最后给文字引用分类：current contract、historical narrative、comparison comment、stale actionable instruction。

只有第四类需要立即修正文档；不能为“搜索零命中”而删除合法历史。相反，actionable URL/命令不可运行时必须标 stale，并阻止它进入新手教程和 marketplace 统计。

## 成熟度教训

- package 数和历史功能量不等于受支持产品面；维护者愿意删除无真实 consumer/acceptance 的前端，是边界收敛信号。
- 决策记录的状态比文件存在更重要；implemented 与 proposed/archived 不应并列计数。
- docs freshness 要检查命令/URL/包，而不只是相对链接格式。
- 外部插件只有在可获取、可安装、可验证、有人维护且有兼容元数据时，才计入生态。
