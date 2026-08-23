---
title: Harness 会改变分数：两层系统如何耦合
sources: [{"repo":"lm-evaluation-harness","path":"lm_eval/api/instance.py","commit":"4e7e0d47f33bc71070c1d38394bafbb52b117163"},{"repo":"inspect-ai","path":"src/inspect_ai/_eval/evalset.py","commit":"5679e7e526c546c86fb8f831033eb0dcfc3dea64"},{"repo":"terminal-bench","path":"terminal_bench/agents/agent_factory.py","commit":"d28711d0da2675d0bb1d56de45ae5df6082438a3"},{"repo":"swe-bench","path":"swebench/harness/run_evaluation.py","commit":"7a21e05772954cc81471ae19d56f436cecf43c54"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"lm-evaluation-harness":1,"inspect-ai":1,"terminal-bench":1,"swe-bench":1}
---

# Harness 会改变分数：两层系统如何耦合

*写给比较模型、选 agent harness 或解释 benchmark 的人。读完应知道报告中必须披露哪些 harness 参数，以及哪些证据本仓库没有自行复跑。*

模型产生 token，agent harness 决定它看见什么、能做什么；eval harness 决定任务、预算和怎样判定。最终分数是两层共同产物。

<!-- evidence-matrix -->
| 样本 | 耦合位置 |
| --- | --- |
| lm-evaluation-harness | `lm-evaluation-harness!lm_eval/api/instance.py:11` 把一次模型请求封装为 Instance。 |
| Inspect AI | `inspect-ai!src/inspect_ai/_eval/evalset.py:147-210` 让 eval set 固定 sandbox、并发与运行参数。 |
| Terminal-Bench | `terminal-bench!terminal_bench/agents/agent_factory.py:105` 根据配置实例化具体 agent。 |
| SWE-bench | `swe-bench!swebench/harness/run_evaluation.py:229` 在固定 TestSpec 和容器中运行一个实例。 |

Terminal-Bench 的 AgentFactory 是最直观的交汇点：同一任务环境可以插入不同 agent。SWE-bench 的判定器随后只看到补丁与测试结果，不会自动解释 agent 使用了多少上下文或怎样压缩。

公开研究报告过「换 harness 带来的分差可超过换模型」。本仓库不自行复跑该 benchmark，因此只把它当外部结果；可核源码只支持方法论结论：披露模型还不够。

最低披露项包括 agent harness 名称与 commit、工具和权限、迭代/时间预算、上下文与压缩策略、失败重试口径，以及 eval harness、数据集版本和 scorer。

## 自检

1. 为什么同模型跨 harness 分数不可直接归因于模型？答案：工具、上下文和预算已经改变。
2. eval harness 能否自动补全 agent 配置披露？答案：不能，运行方必须把配置写入结果血缘。
3. 本仓库对公开分差提供了什么证据？答案：只引用外部结果，不声称已自行复跑；源码用于解释耦合接口。
