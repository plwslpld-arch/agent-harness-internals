---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 00｜从这里开始

DeepSeek Harness 不是模型本身，也不只是聊天界面。它是包在模型外面的执行系统：组装上下文、暴露工具、控制权限、推进循环、记录轨迹，并把同一套能力呈现在 Web、headless 与 SDK 表面。官方把它定义为开源 agent harness，同时明确标注为 developer preview。`evidence: official-doc`

## 先区分四层

| 层 | 在本 Atlas 中的含义 |
| --- | --- |
| 模型 | 产生 reasoning、text 与 tool call 的 DeepSeek 或其他 LLM |
| Agent Harness | 管理模型请求、工具执行、状态、权限与恢复的系统 |
| Evaluation Harness | 运行题集、判分和统计的评测外壳，不等于本仓库 |
| 产品表面 | Web UI、headless 命令、SDK；共享底层能力但体验不同 |

代码中可以看到模型、工具、会话、沙箱、子 Agent 和 Web 等独立能力域。`evidence: code` 这证明它们可被研究，不自动证明都在默认 profile 中启用，也不证明已达到生产成熟度。`evidence: inference`

## 三条路线

- [产品路线](product-path.md)：价值、用户旅程、信任和采用判断。
- [工程路线](engineering-path.md)：从启动配置到模型、工具、会话与 Web 的调用链。
- [核心 runtime 修改路线](core-runtime-contributor-path.md)：学习如何安全修改 boot、Cordis、Agent Loop、工具、模型和 Session 等核心行为。
- [维护者路线](maintainer-path.md)：证据、固定版本、许可、更新和文档质量。
- [完整学习路径与覆盖边界](complete-learning-path.md)：说明资料是否完整、逐文件解析在哪里、哪些目录只是证据落账区。

无论选哪条路线，都先记住：存在源码 ≠ 默认启用；测试通过 ≠ 真实业务闭环；UI 可见 ≠ 副作用已受隔离。

## 完成 00–10 后

你应能画出一次请求的主链路，区分实时控制事件与持久会话事件，解释工具为何必须经过统一策略管道，并指出 Web 展示状态来自哪一层投影。每个结论还应能落到 `code`、`runtime`、`official-doc`、`community` 或 `inference` 之一。

## 证据入口

- [人工源码研究](../13-source-studies/README.md)
- [自动文件参考](../14-file-reference/README.md)
- [研究账本](../../research/evidence-ledger/README.md)
- [版本记录](../../research/version-tracking/README.md)
