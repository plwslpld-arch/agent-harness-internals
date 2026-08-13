---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 14｜自动文件参考入口

本目录回答“有什么、在哪里、与什么连接”，不负责解释“为什么、运行时怎样、产品意义是什么”。

- `generated/` 只存脚本从 `sources/sources.lock.yml` 固定源码生成的文件、符号、测试、依赖和决策索引。
- 生成文件绑定 source commit，并保持确定性（不写入每次运行时间）；可删除后重建，不接受手工修补。
- [`generated/harness-file-cards.md`](generated/harness-file-cards.md) 为 7,412 个 Harness 文件提供分类、职责、符号、依赖和测试摘要。
- [`generated/coverage-report.md`](generated/coverage-report.md) 公开自动覆盖、直接测试映射和人工研究边界。
- 人工源码分析属于 [`../13-source-studies/`](../13-source-studies/README.md)；生成任务绝不能覆盖它。
- 索引命中只证明文本/符号存在，不证明默认挂载、运行成功、受支持产品面或当前有效决策。

当生成索引与人工研究冲突时，先检查 source lock 和生成 freshness；仍冲突则保留两者并开调查，不自动用机器输出改写语义结论。
