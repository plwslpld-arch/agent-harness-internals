---
title: 任务与环境：到底把什么交给被测对象
sources: [{"repo":"lm-evaluation-harness","path":"lm_eval/api/task.py","commit":"4e7e0d47f33bc71070c1d38394bafbb52b117163"},{"repo":"inspect-ai","path":"src/inspect_ai/_eval/task/sandbox.py","commit":"5679e7e526c546c86fb8f831033eb0dcfc3dea64"},{"repo":"terminal-bench","path":"terminal_bench/handlers/trial_handler.py","commit":"d28711d0da2675d0bb1d56de45ae5df6082438a3"},{"repo":"swe-bench","path":"swebench/harness/utils.py","commit":"7a21e05772954cc81471ae19d56f436cecf43c54"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"lm-evaluation-harness":1,"inspect-ai":1,"terminal-bench":1,"swe-bench":1}
---

# 任务与环境：到底把什么交给被测对象

*写给设计评测集和运行环境的人。读完应能区分题目文本、初始状态、可用工具、时间预算与判定资产。*

同一句任务若初始仓库、依赖版本或网络不同，就不再是同一个 Trial。环境不是测试夹具的附注，它属于任务定义。

<!-- evidence-matrix -->
| 样本 | 任务/环境入口 |
| --- | --- |
| lm-evaluation-harness | `lm-evaluation-harness!lm_eval/api/task.py:382` 把文档和上下文构造成模型请求。 |
| Inspect AI | `inspect-ai!src/inspect_ai/_eval/task/sandbox.py:51-63` 在任务启动前解析并限制 sandbox 并发。 |
| Terminal-Bench | `terminal-bench!terminal_bench/handlers/trial_handler.py:57-71` 把 agent/test 超时和容器记录写入 Task。 |
| SWE-bench | `swe-bench!swebench/harness/utils.py:251-269` 从实例生成包含 FAIL_TO_PASS 与 PASS_TO_PASS 的 TestSpec。 |

任务至少应固定输入、环境镜像、允许的外部资源、预算和判定资产。只保存自然语言题面，无法重放一次 agent 运行。

Trial 是统计单位；Attempt 是同一 Trial 的基础设施恢复。环境启动失败可以重试，agent 已经给出错误补丁则不能靠重复尝试从分母里消失。

## 自检

1. 为什么依赖版本属于任务？答案：它会改变可执行代码与测试结果。
2. Attempt 可以改变题目或预算吗？答案：不可以，否则已变成新的 Trial。
3. 网络策略为何要写进结果？答案：联网会改变可获得的信息和外部工具能力。
