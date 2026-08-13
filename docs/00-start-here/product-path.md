# 产品路线：从用户价值到采用边界

## 目标

这条路线不要求先读 TypeScript。你最终要得到的是“用户问题—产品能力—默认配置—证据—风险”的对应关系，而不是一张功能清单。

1. [产品定位](../01-product/README.md)：Harness 解决什么问题，不解决什么。
2. [系统架构](../02-system-architecture/README.md)：执行、控制与证据如何分层。
3. [启动与配置](../04-boot-and-configuration/README.md)：仓库能力怎样变成用户实际获得的 profile。
4. [工具、权限与沙箱](../07-tools-permissions-sandbox/README.md)：模型意图与真实副作用之间谁把关。
5. [会话与上下文](../08-session-and-context/README.md)：连续性、恢复和审计来自哪里。
6. [编排](../09-orchestration/README.md)：何时使用子 Agent、Job 或 Workflow。
7. [Web 产品](../10-web-client/README.md)：如何让复杂状态对用户可理解。

## 每章固定追问

- 用户是否能在默认表面发现并使用这项能力？
- 失败、取消、人工介入和恢复是否有产品语义？
- 权限选择是否与实际隔离强度一致？
- 当前结论是官方承诺、运行证据还是我们的推断？

官方将项目标为 developer preview。`evidence: official-doc` 因此，采用决策应显式评估兼容、迁移和运维成本，而不能从功能数量推导成熟度。`evidence: inference`

源码证据从[人工源码研究](../13-source-studies/README.md)进入；需要全量定位时再用[自动文件参考](../14-file-reference/README.md)。
