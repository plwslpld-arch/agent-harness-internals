---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, runtime, official-doc, community, inference]
---

# 完整学习路径与覆盖边界

本仓库按“先理解产品，再进入架构，再追源码证据”的顺序组织 DeepSeek Harness。读者可以从产品问题进入，也可以从某个源码文件反查它属于哪条运行链路、有哪些测试和设计决策。

## 当前内容是否完整

按 `v0.1.0` 基线，当前内容是完整可学习版：

| 范围 | 当前覆盖 | 入口 |
| --- | --- | --- |
| 产品与成熟度 | 用户问题、能力边界、developer preview 风险、采用判断 | [`../01-product/`](../01-product/README.md) |
| 系统架构 | Cordis、profile、agent loop、模型、工具、权限、session、Web、编排 | [`../02-system-architecture/`](../02-system-architecture/README.md) |
| 插件系统 | Cordis 理论、fork 差异、插件生命周期、host/client、供应链 | [`../03-cordis-foundation/`](../03-cordis-foundation/README.md) |
| 人工源码研究 | 7 条核心源码研究线，解释“为什么这样实现” | [`../13-source-studies/`](../13-source-studies/README.md) |
| 逐文件源码入口 | 7,412 个 Harness 文件职责卡片；符号、依赖、测试、Agent notes 索引；附阅读方法 | [`../14-file-reference/source-reading-guide.md`](../14-file-reference/source-reading-guide.md) |
| 协议与生态 | DSML、MCP、ACP、SDK JSON-RPC、E2B、参考 Agent、评测层 | [`../11-protocols-and-integrations/`](../11-protocols-and-integrations/README.md) |
| 实验与评测 | 实验设计、benchmark 变量、失败分类、证据要求 | [`../19-benchmarks-and-evaluation/`](../19-benchmarks-and-evaluation/README.md) |
| 维护与更新 | 15 个固定来源、每 6 小时检查、stale 文档机制、许可证边界 | [`../18-maintainer-guide/`](../18-maintainer-guide/README.md) |

验证口径：`npm run check` 会确认 15 个 source definition、生成索引可复现、63 篇人工文档 source binding 有效、本地链接、许可证、secret scan 和脚本测试均通过。

## 为什么有些目录只有 README

这是设计边界，不是所有目录都应该堆满文件：

- `research/benchmarks/`、`research/runtime-evidence/`、`research/evidence-ledger/`、`research/version-tracking/`、`research/working-notes/` 当前是证据落账区。它们只有 README，表示已有记录规范，但还没有新的真实 benchmark run、带密钥 E2E、脱敏轨迹或外部证据条目被接受进仓库。
- `docs/14-file-reference/` 顶层只有 README，但真正的逐文件导航在 `generated/` 下；这是为了明确区分“人工解释”和“机器生成索引”。
- `docs/*/README.md` 作为每章入口是正常的；有些章节只需要入口 + 一篇专题文档，有些章节需要多篇。

当前真正缺口不是“目录为空”，而是尚未沉淀新的真实运行证据：例如使用 `DEEPSEEK_API_KEY` 的真实 API E2E、公开 benchmark 复现实验、长期社区采样和第三方插件安装实测。这些必须有命令、环境、结果、脱敏日志和 artifact hash 后才能进入 `research/`。

## 逐文件源码解析在哪里

有两层：

1. **全量逐文件导航**：[`../14-file-reference/generated/harness-file-cards.md`](../14-file-reference/generated/harness-file-cards.md) 覆盖 7,412 个 DeepSeek Harness 文件。每个文件都有分类、行数、职责摘要、公开符号、直接依赖、反向依赖和直接测试数量。
2. **人工深度源码研究**：[`../13-source-studies/`](../13-source-studies/README.md) 覆盖核心路径，包括 Cordis fork、插件系统、核心 runtime、DeepSeek adapter、协议实现、安全/编排、Web bridge 与产品表面。
3. **逐文件阅读方法**：[`../14-file-reference/source-reading-guide.md`](../14-file-reference/source-reading-guide.md) 说明如何从“我要学插件/模型/工具/Session/Web”进入具体文件，如何读文件卡片，如何回到测试和设计决策。

没有提供“每一行源码的逐行中文注释”。这是有意保留的边界：全仓逐行解释会非常巨大且低信号，也容易在上游更新后快速过期。需要追某个文件时，先用文件卡片定位，再进入对应人工源码研究和上游源码。

## 推荐学习顺序

### 第 0 阶段：建立判断框架

1. [`README.md`](../../README.md)：看项目定位、证据等级、当前结论。
2. [`README.md`](README.md)：理解 Agent Harness、Evaluation Harness、模型和产品表面的区别。
3. [`product-path.md`](product-path.md) 或 [`engineering-path.md`](engineering-path.md)：按你的角色选路线。

目标：不要把源码存在、默认启用、产品可用、实验通过混成一个结论。

### 第 1 阶段：产品和架构全景

1. [`../01-product/README.md`](../01-product/README.md)
2. [`../01-product/product-maturity.md`](../01-product/product-maturity.md)
3. [`../02-system-architecture/README.md`](../02-system-architecture/README.md)
4. [`../02-system-architecture/runtime-topology.md`](../02-system-architecture/runtime-topology.md)

目标：能说清楚 Harness 为谁服务、解决什么问题、当前成熟度如何，以及一次任务从用户输入到结果落账经过哪些层。

### 第 2 阶段：插件系统主线

1. [`../03-cordis-foundation/README.md`](../03-cordis-foundation/README.md)
2. [`../03-cordis-foundation/plugin-lifecycle.md`](../03-cordis-foundation/plugin-lifecycle.md)
3. [`../03-cordis-foundation/plugin-system-mainline.md`](../03-cordis-foundation/plugin-system-mainline.md)
4. [`../13-source-studies/cordis-fork-and-plugin-system.md`](../13-source-studies/cordis-fork-and-plugin-system.md)
5. [`../16-ecosystem-and-community/plugin-ecosystem.md`](../16-ecosystem-and-community/plugin-ecosystem.md)

目标：理解 Cordis 不是简单插件 API，而是 context/service/event/effect 生命周期与 profile 组合机制；同时知道“219 packages 不等于 219 社区插件”。

### 第 3 阶段：核心运行链路

1. [`../04-boot-and-configuration/config-composition.md`](../04-boot-and-configuration/config-composition.md)
2. [`../05-agent-runtime/turn-step-tool-loop.md`](../05-agent-runtime/turn-step-tool-loop.md)
3. [`../06-model-adapter/deepseek-protocol.md`](../06-model-adapter/deepseek-protocol.md)
4. [`../07-tools-permissions-sandbox/tool-policy-pipeline.md`](../07-tools-permissions-sandbox/tool-policy-pipeline.md)
5. [`../08-session-and-context/event-log-and-recovery.md`](../08-session-and-context/event-log-and-recovery.md)

目标：能画出 boot/profile → Cordis services → agent loop → model adapter → tool policy → session log → Web/SDK projection。

### 第 4 阶段：源码深读

1. [`../13-source-studies/README.md`](../13-source-studies/README.md)
2. [`../13-source-studies/core-runtime-study.md`](../13-source-studies/core-runtime-study.md)
3. [`../13-source-studies/deepseek-adapter-study.md`](../13-source-studies/deepseek-adapter-study.md)
4. [`../13-source-studies/protocol-implementation-study.md`](../13-source-studies/protocol-implementation-study.md)
5. [`../13-source-studies/security-and-orchestration-study.md`](../13-source-studies/security-and-orchestration-study.md)
6. [`../13-source-studies/web-bridge-and-product-surface-study.md`](../13-source-studies/web-bridge-and-product-surface-study.md)
7. [`../14-file-reference/generated/harness-file-cards.md`](../14-file-reference/generated/harness-file-cards.md)

目标：先理解关键子系统，再用文件卡片追到具体文件和测试。不要从 7,412 个文件卡片第一页开始硬读。

### 第 5 阶段：协议、生态和竞品

1. [`../11-protocols-and-integrations/protocol-boundaries.md`](../11-protocols-and-integrations/protocol-boundaries.md)
2. [`../16-ecosystem-and-community/README.md`](../16-ecosystem-and-community/README.md)
3. [`../16-ecosystem-and-community/2026-08-13-community-snapshot.md`](../16-ecosystem-and-community/2026-08-13-community-snapshot.md)
4. [`../17-version-tracking/version-baseline.md`](../17-version-tracking/version-baseline.md)
5. [`../99-reference/source-index.md`](../99-reference/source-index.md)

目标：区分 Harness 依赖、比较对象、协议参考、评测框架和社区反馈；不要把 star、帖子或上游路线图当成采用证据。

### 第 6 阶段：实验与维护

1. [`../15-labs-and-tutorials/minimal-plugin-lab.md`](../15-labs-and-tutorials/minimal-plugin-lab.md)
2. [`../15-labs-and-tutorials/experiment-protocol.md`](../15-labs-and-tutorials/experiment-protocol.md)
3. [`../19-benchmarks-and-evaluation/benchmark-design.md`](../19-benchmarks-and-evaluation/benchmark-design.md)
4. [`../18-maintainer-guide/upstream-and-license.md`](../18-maintainer-guide/upstream-and-license.md)

目标：能自己新增一个插件/实验/版本更新，并知道需要哪些证据才能把结论写入 docs。

## 学习时的查找方法

- 想看“整体”：从 `docs/README.md` 和本文件进入。
- 想看“为什么”：读 `docs/13-source-studies/`。
- 想找“哪个文件”：查 `docs/14-file-reference/generated/harness-file-cards.md`。
- 想找“符号/测试”：查 `generated/symbols.md`、`generated/tests.md`、`generated/harness-source-test-map.md`。
- 想看“这是不是最新”：查 `sources/sources.lock.yml`、`sources/upstream-update.md`、`sources/stale-documents.md`。
- 想记录“我跑过了”：把脱敏证据放进 `research/runtime-evidence/` 或 `research/benchmarks/`，再从 docs 链接过去。
