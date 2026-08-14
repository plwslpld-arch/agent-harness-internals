---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 学习与研究导航

本目录是正式学习文档。建议先按路线读，再按目录查。

## 推荐入口

| 需求 | 入口 |
| --- | --- |
| 第一次打开 | [`00-start-here/README.md`](00-start-here/README.md) |
| 从粗到精系统学习 | [`../LEARNING_PATH.md`](../LEARNING_PATH.md) |
| 每阶段学习任务 | [`00-start-here/workbook.md`](00-start-here/workbook.md) |
| 查具体源码文件 | [`14-file-reference/source-reading-guide.md`](14-file-reference/source-reading-guide.md) |
| 做本地实验 | [`15-labs-and-tutorials/README.md`](15-labs-and-tutorials/README.md) |

## 按角色阅读

- 非研发同学：[`00-start-here/paths/non-engineer.md`](00-start-here/paths/non-engineer.md)
- 产品经理：[`00-start-here/paths/product.md`](00-start-here/paths/product.md)
- 工程师：[`00-start-here/paths/engineer.md`](00-start-here/paths/engineer.md)
- 核心 runtime 修改者：[`00-start-here/paths/runtime-contributor.md`](00-start-here/paths/runtime-contributor.md)
- 维护者：[`00-start-here/paths/maintainer.md`](00-start-here/paths/maintainer.md)

## 按问题查找

| 问题 | 看哪里 |
| --- | --- |
| Harness 是什么，成熟度如何 | [`01-product/`](01-product/README.md) |
| 整体架构怎么分层 | [`02-system-architecture/`](02-system-architecture/README.md) |
| Cordis 和插件系统如何工作 | [`03-cordis-foundation/`](03-cordis-foundation/README.md) |
| 启动、profile、配置如何组合 | [`04-boot-and-configuration/`](04-boot-and-configuration/README.md) |
| 一次任务如何进入 Agent Loop | [`05-agent-runtime/`](05-agent-runtime/README.md) |
| DeepSeek API 如何适配 | [`06-model-adapter/`](06-model-adapter/README.md) |
| 工具、审批、沙箱怎么治理 | [`07-tools-permissions-sandbox/`](07-tools-permissions-sandbox/README.md) |
| Session、上下文、恢复怎么做 | [`08-session-and-context/`](08-session-and-context/README.md) |
| 子 Agent、Goal、Job 怎么看 | [`09-orchestration/`](09-orchestration/README.md) |
| Web/headless/SDK 是什么关系 | [`10-web-client/`](10-web-client/README.md) |
| MCP、ACP、DSML、E2B 在哪层 | [`11-protocols-and-integrations/`](11-protocols-and-integrations/README.md) |
| 安全和信任边界 | [`12-security-and-trust/`](12-security-and-trust/README.md) |
| 人工源码深度分析 | [`13-source-studies/`](13-source-studies/README.md) |
| 全量文件、符号、测试索引 | [`14-file-reference/`](14-file-reference/README.md) |
| 本地实验和插件教程 | [`15-labs-and-tutorials/`](15-labs-and-tutorials/README.md) |
| 生态、社区、插件成熟度 | [`16-ecosystem-and-community/`](16-ecosystem-and-community/README.md) |
| 上游版本和 stale 判断 | [`17-version-tracking/`](17-version-tracking/README.md) |
| 维护、许可证、发布 | [`18-maintainer-guide/`](18-maintainer-guide/README.md) |
| benchmark 和评测设计 | [`19-benchmarks-and-evaluation/`](19-benchmarks-and-evaluation/README.md) |
| 设计决策与复盘 | [`20-decisions-and-postmortems/`](20-decisions-and-postmortems/README.md) |
| 术语和索引 | [`99-reference/`](99-reference/README.md) |

自动生成导航只描述“有什么、在哪里、与什么相连”；人工分析负责解释“为什么、如何运行、失败时怎样、产品含义是什么”。
