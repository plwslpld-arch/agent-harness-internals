---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 20｜决策与事故复盘入口

设计决策解释“当时为什么这样做”；事故复盘解释“真实系统为何偏离预期、证据如何修正认知”。两者都应绑定版本、可反驳并有验证门禁。

DeepSeek Harness 当前官方仓库已有四个有代表性的复盘主题：

1. ACP namespace/default export 与 shadow service lookup 导致真实 Loader 路径崩溃；
2. `disabled` 位置的 JS expression 未被求值，刷新 snapshot 反而接受了 `UNKNOWN_TOOL`；
3. Web agent 验收了替代端口的 HTTP 200，没有验证用户正在看的 GUI；
4. Landlock 部分强制提示与子命令非零被错误合并成 runner failure。

本仓库不复制原文，只提炼共同规律：**手工挂载不等于真实入口、覆盖率不等于组合行为、snapshot 更新不等于语义正确、HTTP 200 不等于用户任务完成、共享错误前缀不等于因果归属、平台边界需要确定性模拟加真实组合测试。**

另一个成熟度案例是 [TUI 删除、历史记录与陈旧文档](tui-removal-evidence-case.md)：当前产品清单、历史设计记录和残余文字必须分成三层证据，不能因搜到 `TUI` 一词就宣布仍支持。

模板和流程见 [决策与复盘方法](decision-and-postmortem-method.md)。
