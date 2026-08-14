---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"swe-bench","path":".","commit":"c7fd5abffe0b2086a8bb9389d23c47d930ef571f"},{"repo":"terminal-bench","path":".","commit":"d435a67e30ecb41f916716607c30c4646f208ee6"}]
last_verified: 2026-08-13
status: stale
depth: L2
evidence: [code, official-doc, inference]
---

# 19｜Benchmark 与评测入口

一个 agent benchmark 测量的是完整系统配置，不是裸模型：提示词、工具、上下文压缩、权限、sandbox、重试、终止、provider 协议和评分器都会改变结果。

官方 V4 模型卡中的代码 agent 分数注明使用 minimal DeepSeek Harness、`max` reasoning effort、`temperature=1.0`、`top_p=0.95`；其中 DSBench 还是内部集。它们是重要官方结果，但不能替代独立复现，也不能直接归因于模型单体。

新实验按 [benchmark 设计](benchmark-design.md) 执行，并把 manifest、脱敏轨迹、失败分类和结果放在 `research/benchmarks/`。仅报成功率而不报成本、超时、重试、人工介入和系统失败，信息是不完整的。
