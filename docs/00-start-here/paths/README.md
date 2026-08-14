---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 角色路线

本目录把“从哪里开始”按读者角色拆开。每条路线都只负责一个入口问题，避免所有读者都被迫读完整目录。

| 角色 | 路线 | 重点 |
| --- | --- | --- |
| 非研发同学 | [non-engineer.md](non-engineer.md) | 用产品和组织类比理解 Harness |
| 产品经理 | [product.md](product.md) | 用户价值、能力边界、成熟度和风险 |
| 工程师 | [engineer.md](engineer.md) | 启动、模型、工具、Session、Web 主链路 |
| 核心 runtime 修改者 | [runtime-contributor.md](runtime-contributor.md) | 不变量、测试矩阵、兼容改动和回归证据 |
| 维护者 | [maintainer.md](maintainer.md) | source lock、stale 文档、许可证和发布 |

如果不确定选哪条，先回到 [00 入口](../README.md)，再读 [学习路线](../learning-roadmap.md)。
