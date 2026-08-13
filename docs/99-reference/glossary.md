---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 术语表

| 术语 | 在本研究中的含义 |
| --- | --- |
| Harness | 包住模型的执行系统：上下文、工具循环、权限、状态、恢复、终止和轨迹，不等于模型或 benchmark |
| Agent harness | 驱动任务执行的运行时与工具系统 |
| Evaluation harness | 分发任务、隔离环境、评分和汇总指标的评测系统 |
| Cordis | Harness 使用并 vendored/修改的插件与依赖注入元框架 |
| Plugin | 在 Cordis context 上注册 service、event、effect、配置或 UI contribution 的生命周期单元；不是隔离边界 |
| Service seam | 能力的抽象契约，通常由 definition、provider、consumer 组成 |
| Effect | 与 plugin/fiber 生命周期绑定、可清理的副作用注册 |
| Session event | append-only 会话事实；projection、UI、回放和 telemetry 从其派生 |
| Turn / step | turn 是一轮用户活动；step 通常是一轮模型请求及后续工具结算，工具后可进入下一 step |
| Provider route | Harness 选择模型或执行能力 provider 的稳定路由名 |
| DSML | DeepSeek 模型级工具调用标记格式；不是网络 RPC |
| MCP | Model Context Protocol；Harness 当前作为 client 桥接外部 tools |
| ACP | Agent Client Protocol；Harness 当前以 stdio JSON-RPC server 暴露窄自动化面 |
| SDK JSON-RPC | Harness 自有换行分帧 JSON-RPC wire，服务 Python/TS SDK，不等于 ACP |
| Scoped registration | 只对指定 agent/session 生效的能力注册，避免全局变更 |
| Waterfall | 可短路/委托的顺序拦截链；listener 需显式调用 next 才继续 |
| Permission preset | sandbox mode 与 approval policy 的部署/交互组合；不是完整安全边界 |
| Enforcement | sandbox runner 实际返回的 full/partial/unavailable 等事实，而非请求的模式名 |
| Compaction | 在保留完整证据日志时，用 summary/checkpoint 替换模型可见旧历史表面 |
| Spill | 将过大工具输出转存，模型侧只保留有界引用/投影 |
| Profile | 由 bundle patch、用户配置和 overlay 解析出的插件组合 |
| Snapshot test | 固定可观察输出的回归工具；刷新 snapshot 不证明新输出语义正确 |
| Provenance | 发布物从源码、构建、签名到分发的可验证来源链 |
