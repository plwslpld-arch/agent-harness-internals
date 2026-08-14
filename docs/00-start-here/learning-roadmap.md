---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, runtime, official-doc, community, inference]
---

# 学习路线与覆盖边界

主学习线已经收敛到 [../00-course/README.md](../00-course/README.md)。本文件只说明“哪些目录负责什么”，避免课程正文、源码索引和证据落账区混在一起。

## 当前内容是否完整

按 `v0.1.0` 基线，当前是完整可学习版，但不是“全仓逐行中文注释版”。

| 范围 | 当前覆盖 | 入口 |
| --- | --- | --- |
| 主课程 | 12 讲，从产品定位到源码、实验、生态和维护 | [../00-course/README.md](../00-course/README.md) |
| 角色路线 | 非研发、产品、工程、runtime 贡献者、维护者 | [paths/README.md](paths/README.md) |
| 人工源码研究 | 核心 runtime、DeepSeek adapter、插件、协议、安全、Web | [../13-source-studies/README.md](../13-source-studies/README.md) |
| 源码索引 | 文件卡片、符号、依赖、测试、Agent notes | [../14-file-reference/README.md](../14-file-reference/README.md) |
| 本地实验 | headless、插件、实验协议、benchmark 设计 | [../15-labs-and-tutorials/README.md](../15-labs-and-tutorials/README.md) |
| 维护更新 | source lock、stale 文档、许可证、发布流程 | [../18-maintainer-guide/README.md](../18-maintainer-guide/README.md) |

## 为什么有些目录只有 README

`research/` 是证据落账区，不是教程目录。没有真实 benchmark、脱敏运行轨迹或外部证据时，目录只保留 README 是正常状态。

`docs/14-file-reference/generated/` 是机器索引。它用于搜索和追踪源码，不适合从头阅读。

## 查找方法

| 你要做什么 | 入口 |
| --- | --- |
| 从头学习 | [../00-course/README.md](../00-course/README.md) |
| 选择角色路线 | [paths/README.md](paths/README.md) |
| 查某个源码文件 | [../14-file-reference/generated-index.md](../14-file-reference/generated-index.md) |
| 看代码片段级解释 | [../14-file-reference/key-function-walkthroughs.md](../14-file-reference/key-function-walkthroughs.md) |
| 做本地实验 | [../15-labs-and-tutorials/experiment-protocol.md](../15-labs-and-tutorials/experiment-protocol.md) |
| 判断是否最新 | [../../sources/stale-documents.md](../../sources/stale-documents.md) |

## 边界

- 存在源码不等于默认启用。
- 通过测试不等于真实业务闭环。
- 社区内容不等于官方事实。
- 自动生成索引不替代人工语义分析。
- 上游更新后，绑定旧 Commit 的人工结论需要重新审核。
