---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 工具流水线：策略、执行和结果的职责

| 阶段 | 责任 | 典型失败 |
| --- | --- | --- |
| 展示/解析 | 校验工具名与参数 schema | 未知工具、无效参数 |
| pre-execute | 权限、沙箱、策略改写 | deny、审批拒绝 |
| guards | 追加不可逆的拒绝约束 | 身份或作用域不满足 |
| execute wrapper | 超时、指标、重试等环绕行为 | wrapper 或 body 抛错 |
| tool body | 产生实际效果 | 进程、文件或网络错误 |
| post-execute | 接受、阻断、替换、追加上下文 | 输出策略失败 |
| finalize/result | 内容不变量与权威通知 | 物化或序列化失败 |

这套次序来自官方工具流水线。`evidence: official-doc`

执行前先持久化 `tool/call`，才能在崩溃后区分“从未提出”“提出但未开始”和“开始后未产生结果”。恢复逻辑可以补充中断结果，而不删除已发生事实。`evidence: official-doc`

只有声明为 concurrency-safe 的工具 body 才适合进入并发池；barrier 会切断并发窗口。即使 body 并发，pre/post 与持久结果仍保持模型顺序。`evidence: code`

设计新工具时应明确 schema、执行世界和策略归属，并测试 allow、deny、审批取消、超时、取消、输出过大与恢复。`evidence: inference` 对应文件和测试从[人工源码研究](../13-source-studies/README.md)进入。
