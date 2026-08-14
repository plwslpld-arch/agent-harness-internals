---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 08｜Session 与上下文：事实源、投影和恢复

Session 的仅追加事件日志是会话事实源。模型历史、Web 回放、fork、transcript、遥测和持久化都从同一事件流派生。`evidence: official-doc`

## 产品轨

这使“用户看见的历史”“模型实际看见的上下文”和“恢复后继续的状态”可以追溯到共同事实，但三者仍是不同投影。`evidence: inference` 产品不能把 UI 卡片顺序直接当模型 prompt，也不能把实时 agent 状态当长期存储。`evidence: inference`

## 工程轨

`packages/core/session` 定义内存事件日志；`packages/session/session-persistence*` 提供 JSONL 与 SQLite 等后端；projection、query、telemetry 和 title 等 consumer 从日志派生。`evidence: code`

持久化插件异步批量写入，`session/flush` 是排空至停稳的显式检查点。`evidence: official-doc` 冷恢复不会截断已写入的中断轮次，而是追加合成 interrupted 结束事件。`evidence: official-doc`

继续阅读：[事件日志与恢复](event-log-and-recovery.md)、[上下文与压缩](context-and-compaction.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动事件/文件参考](https://github.com/plwslpld-arch/deepseek-harness-internals/tree/gh-pages)
