---
title: 编排：子代理、计划、任务与工作流
sources: [{"repo":"deepseek-harness","path":"packages/subagent/subagent/src/types.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/agent/control/spawn.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/agents/registry.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk-python":1}
---

# 编排：子代理、计划、任务与工作流

*写给实现多代理与长任务控制面的人。读完应能区分并行委派、后台驻留、计划状态和可恢复工作流。*

「支持子代理」仍然不够。要问的是上下文继承、深度限制、身份、回传方式、取消和父任务恢复。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/subagent/subagent/src/types.ts:314` 定义 provider 的 start 契约。 |
| Codex | `codex!codex-rs/core/src/agent/control/spawn.rs:20-24` 说明 spawn 后的初始输入与 V2 通信上下文必须成对。 |
| Gemini CLI | `gemini-cli!packages/core/src/agents/registry.ts:50-54` 用 AgentRegistry 维护定义集合。 |
| Claude | `claude-agent-sdk-python!src/claude_agent_sdk/types.py:87` 定义 AgentDefinition。 |

编排层要把子代理当有身份、有生命周期的执行者，而不是一次匿名函数调用。父任务应知道谁在运行、输出属于哪次委派、取消是否已送达。

计划和待办是控制状态；工作流还需要持久化检查点与幂等恢复。后台任务完成通知若唤醒父代理，也应有配额，避免多个完成事件造成重复推进。

## 自检

1. 为什么输出文本不足以表示子代理完成？答案：还需要身份、状态、错误和对应委派关系。
2. 并行委派何时安全？答案：子任务互不依赖共享可变状态，合并点清楚。
3. 可恢复工作流为什么要求幂等？答案：崩溃重放不能重复提交同一外部副作用。
