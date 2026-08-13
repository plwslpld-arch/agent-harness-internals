---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 17｜版本追踪入口

DeepSeek Harness 处于预览期，版本维护必须同时追踪**源码提交、发布包、协议 SDK、模型/API 和 vendored 上游**。只写“最新版”不可复现。

当前研究基线与升级流程见 [版本基线与升级](version-baseline.md)。自动化只能发现变化并生成候选 diff；架构、安全、许可证和语义结论必须人工评审。

过期标签建议：

- `current`：与 `sources/sources.lock.yml` 一致且验证通过；
- `stale-candidate`：上游已变化但尚未判断影响；
- `stale`：相关接口/行为已改变；
- `historical`：保留用于解释旧版本，不再代表当前；
- `unverified`：来源或运行证据不足。
