---
title: Eval Harness：同名的另一层系统
sources: [{"repo":"lm-evaluation-harness","path":"lm_eval/api/task.py","commit":"4e7e0d47f33bc71070c1d38394bafbb52b117163"},{"repo":"inspect-ai","path":"src/inspect_ai/_eval/task/task.py","commit":"5679e7e526c546c86fb8f831033eb0dcfc3dea64"},{"repo":"terminal-bench","path":"terminal_bench/handlers/trial_handler.py","commit":"d28711d0da2675d0bb1d56de45ae5df6082438a3"},{"repo":"swe-bench","path":"swebench/types.py","commit":"7a21e05772954cc81471ae19d56f436cecf43c54"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"lm-evaluation-harness":1,"inspect-ai":1,"terminal-bench":1,"swe-bench":1}
---

# Eval Harness：同名的另一层系统

*写给第一次同时遇到 agent harness 与 eval harness 的读者。读完应能分清「帮模型做事的外壳」和「给模型/agent 出题记分的外壳」。*

两个圈子都使用 harness，却指向相反方向：agent harness 把能力交给模型，eval harness 把任务交给被测对象并收集结果。

<!-- evidence-matrix -->
| 样本 | 最小抽象 |
| --- | --- |
| lm-evaluation-harness | `lm-evaluation-harness!lm_eval/api/task.py:64` 把一项评测定义成 Task。 |
| Inspect AI | `inspect-ai!src/inspect_ai/_eval/task/task.py:76` 用 Task 聚合 dataset、solver 和 scorer。 |
| Terminal-Bench | `terminal-bench!terminal_bench/handlers/trial_handler.py:29` 定义终端任务配置。 |
| SWE-bench | `swe-bench!swebench/types.py:25` 用 TestSpec 固化仓库实例的执行规格。 |

四个样本都需要任务规格，但被测对象不同。lm-evaluation-harness 主要把文本任务转成模型请求；后三者能把 agent 放进带环境和工具的执行过程。

因此报告 agent 分数时必须披露两层：使用哪个 eval harness，也要写清里面接的是哪个 agent harness、版本、工具与预算。

## 自检

1. agent harness 负责什么？答案：上下文、工具、权限、循环和状态。
2. eval harness 负责什么？答案：任务、环境、执行口径、评分与结果汇总。
3. 为什么只写模型名不够？答案：agent harness 会显著改变模型能采取的动作和可见信息。
