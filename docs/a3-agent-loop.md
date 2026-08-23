---
title: Agent Loop：一个 turn 里发生什么
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/client.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/scheduler/scheduler.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk-python":1}
---

# Agent Loop：一个 turn 里发生什么

*写给实现工具循环、取消和错误恢复的研发。读完应能画出模型响应、工具调度、结果回灌和下一步请求的边界。*

一次「回答」可能包含多轮模型请求。真正决定可靠性的，是每个工具调用在哪一步落盘、何时并行、失败怎样回到历史。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/core/agent-loop/src/agent.ts:38-46` 定义循环驱动器的状态联合。 |
| Codex | `codex!codex-rs/core/src/client.rs:966` 在发请求前整理 ResponseItem 序列。 |
| Gemini CLI | `gemini-cli!packages/core/src/scheduler/scheduler.ts:195` 是工具调用调度入口。 |
| Claude | `claude-agent-sdk-python!src/claude_agent_sdk/types.py:950` 与 `claude-agent-sdk-python!src/claude_agent_sdk/types.py:959` 定义工具调用和工具结果消息块。 |

DSH 把循环状态显式化，Codex 先把历史转成 Responses 输入项，Gemini CLI 由 scheduler 管理工具队列。Claude SDK 能证明消息协议含 tool use/result，却不能证明闭源循环内部使用同一种状态机。

产品失败不应通过无限重试被「重试成成功」。Attempt 可以恢复基础设施问题，Trial 的判定口径仍要保持不变；这条边界在 [e3 运行与记分](e3-run-and-score.md) 里展开。

## 自检

1. 为什么工具结果必须进入下一次模型可见历史？答案：否则模型不知道外部动作是否完成，也无法基于结果继续推理。
2. 调度器与模型适配器的职责有何区别？答案：调度器决定调用顺序和并发，适配器负责请求与响应格式。
3. 工具体已执行但结果未落盘时为什么危险？答案：恢复后无法可靠判断副作用是否发生。
