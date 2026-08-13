---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 16｜生态、社区与采用证据入口

本章观察 DeepSeek Harness 的外部采用、争议和生态增长，但不会把热度当成产品成熟度。

2026-08-13 的本地研究基线是发布首日快照：官方仓库处于 v0.1 developer preview；源码 manifest 为 `0.1.0-rc.5`，同期 npm 已到 `0.1.0-rc.6`；仓库 star/fork 增长很快，Issues/PR 关闭而 Discussions 开启。社区讨论集中在 Cordis、permissions 是否真是安全边界、为什么还需要新的 harness、DeepSeek 协议/缓存与 API 成本。这些只能证明“关注与问题方向”，不能证明留存、生产采用或 PMF。

使用 [社区证据账本方法](evidence-ledger.md) 采集后续信号。稳定结论应同时具备官方代码/文档、可复现实测和独立使用者证据；单条帖子、star 或官方路线图都不足以证明能力。

插件生态是首要观察对象，见 [第三方插件生态与兼容矩阵](plugin-ecosystem.md)。必须明确：仓库约 219 个 package workspace 是第一方模块，不等于 219 个社区插件。当前公开证据还不足以宣布形成成熟 marketplace。

首发日的官方发布、Reddit/中文社区讨论、冲突传闻和第三方桌面包装已整理到
[2026-08-13 社区与社交媒体快照](2026-08-13-community-snapshot.md)。该快照记录
“社区在问什么”，不把单个体验帖当成采用率或稳定性证明。

持续跟踪五类指标：

- 第三方而非仓库内置插件数量、维护活跃度和兼容版本；
- 外部团队的真实任务轨迹、失败率、成本与升级经验；
- Discussions/issue/PR 治理是否开放及响应周期；
- 安全披露、供应链、沙箱和协议兼容事故；
- npm、源码 tag/SHA、changelog、provenance/SBOM 的一致性。
