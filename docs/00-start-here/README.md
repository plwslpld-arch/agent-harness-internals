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

## 先选一条路线

| 目标 | 入口 | 学完后应该能做什么 |
| --- | --- | --- |
| 快速理解 | [非研发导读](paths/non-engineer.md) | 用产品和组织类比解释 Harness、插件系统和成熟度 |
| 产品判断 | [产品路线](paths/product.md) | 判断用户价值、采用风险和平台边界 |
| 工程学习 | [工程路线](paths/engineer.md) | 串起启动、模型、工具、Session 和 Web 主链路 |
| 修改核心 runtime | [核心 runtime 修改路线](paths/runtime-contributor.md) | 定位不变量、测试矩阵和安全改动边界 |
| 维护本仓库 | [维护者路线](paths/maintainer.md) | 处理 source lock、stale 文档、许可证和发布 |
| 系统学习 | [学习路线](learning-roadmap.md) | 按“从粗到精”完成 12 部分、源码精读和实验 |
| 每阶段任务 | [学习清单](workbook.md) | 知道每个阶段读什么、做什么、如何验收 |

无论选哪条路线，都先记住：存在源码 ≠ 默认启用；测试通过 ≠ 真实业务闭环；UI 可见 ≠ 副作用已受隔离。

## 完成 00–10 后

你应能画出一次请求的主链路，区分实时控制事件与持久会话事件，解释工具为何必须经过统一策略管道，并指出 Web 展示状态来自哪一层投影。每个结论还应能落到 `code`、`runtime`、`official-doc`、`community` 或 `inference` 之一。

## 证据入口

- [人工源码研究](../13-source-studies/README.md)
- [自动文件参考](../14-file-reference/README.md)
- [研究账本](../../research/evidence-ledger/README.md)
- [版本记录](../../research/version-tracking/README.md)
