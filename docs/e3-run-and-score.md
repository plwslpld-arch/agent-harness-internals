---
title: 运行与记分：从请求到可发布结论
sources: [{"repo":"lm-evaluation-harness","path":"lm_eval/evaluator.py","commit":"4e7e0d47f33bc71070c1d38394bafbb52b117163"},{"repo":"inspect-ai","path":"src/inspect_ai/solver/_solver.py","commit":"5679e7e526c546c86fb8f831033eb0dcfc3dea64"},{"repo":"terminal-bench","path":"terminal_bench/handlers/trial_handler.py","commit":"d28711d0da2675d0bb1d56de45ae5df6082438a3"},{"repo":"swe-bench","path":"swebench/harness/grading.py","commit":"7a21e05772954cc81471ae19d56f436cecf43c54"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"lm-evaluation-harness":1,"inspect-ai":1,"terminal-bench":1,"swe-bench":1}
---

# 运行与记分：从请求到可发布结论

*写给构建评估流水线和发布门禁的人。读完应能把执行、恢复、单样本评分、聚合和发布判定拆开。*

「平均分 0.72」隐藏了大量决定：哪些样本没跑、失败是否重试、分数怎样聚合、阈值是否在看结果后调整。

<!-- evidence-matrix -->
| 样本 | 运行/评分入口 |
| --- | --- |
| lm-evaluation-harness | `lm-evaluation-harness!lm_eval/evaluator.py:309` 按 output_type 分派 generate_until。 |
| Inspect AI | `inspect-ai!src/inspect_ai/solver/_solver.py:79` 把 solver 定义为改变 TaskState 的协议。 |
| Terminal-Bench | `terminal-bench!terminal_bench/handlers/trial_handler.py:238` 由 TrialHandler 组织一次终端 trial。 |
| SWE-bench | `swe-bench!swebench/harness/grading.py:329` 生成单实例 eval report。 |

训练 reward、checkpoint 选择与独立发布评估应分开。RewardAdapter 可以把 evaluator 输出送给 DPO、GRPO 或 RFT，但训练时反复看过的信号不能充当最终 release gate。

基础设施失败应标成 blocked 或 inconclusive，产品失败保持失败。这样 Trial 分母不随重试次数漂移，Attempt 只解释恢复过程。

## 自检

1. 为什么训练 reward 不能直接当发布门禁？答案：模型或选择过程已经针对该信号优化，存在泄漏与过拟合。
2. 什么时候允许重试？答案：可归因于基础设施且没有改变任务语义时。
3. 聚合前应保留什么？答案：每个 Trial 的原始判定、Attempt 血缘、环境和 evaluator 版本。
