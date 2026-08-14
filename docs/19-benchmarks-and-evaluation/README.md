---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"swe-bench","path":".","commit":"b3f33bf3f7dc07080486fa2e1c5d3f0de8ab14e2"},{"repo":"terminal-bench","path":".","commit":"d435a67e30ecb41f916716607c30c4646f208ee6"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 19｜Benchmark 与评测入口

一个 agent benchmark 测量的是完整系统配置，不是裸模型：提示词、工具、上下文压缩、权限、sandbox、重试、终止、provider 协议和评分器都会改变结果。

官方 V4 模型卡中的代码 agent 分数注明使用 minimal DeepSeek Harness、`max` reasoning effort、`temperature=1.0`、`top_p=0.95`；其中 DSBench 还是内部集。它们是重要官方结果，但不能替代独立复现，也不能直接归因于模型单体。

新实验按 [benchmark 设计](benchmark-design.md) 执行，并把 manifest、脱敏轨迹、失败分类和结果放在 `research/benchmarks/`。仅报成功率而不报成本、超时、重试、人工介入和系统失败，信息是不完整的。

2026-08-14 复核 SWE-bench `b3f33bf3f7d...`：上游新增基础设施失败的只读后验分类和 provider usage/cache token 保留。这进一步支持本章判断：评测结果必须同时记录失败 taxonomy、基础设施故障、token/cache 与成本，且 infra 标记不能从分母中静默剔除。
