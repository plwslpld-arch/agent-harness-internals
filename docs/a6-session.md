---
title: 会话：持久化、恢复与分叉
sources: [{"repo":"deepseek-harness","path":"packages/core/session/src/types.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/rollout.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/core/agentChatHistory.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk":1}
---

# 会话：持久化、恢复与分叉

*写给设计事件日志、恢复协议与历史分叉的人。读完应能区分模型历史、物理日志和产品列表中的会话对象。*

界面里的一条消息，磁盘上可能是多条事件；磁盘上的一行，也可能投影成多个逻辑事件。可靠恢复依赖语义边界，不依赖 UI 行数。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/core/session/src/types.ts:408-441` 定义 SessionEvent 联合。 |
| Codex | `codex!codex-rs/core/src/rollout.rs:5` 导出 RolloutRecorder。 |
| Gemini CLI | `gemini-cli!packages/core/src/core/agentChatHistory.ts:20-24` 把 chat history 建模为拥有 durable ID 的 turn 集合。 |
| Claude | `claude-agent-sdk!src/claude_agent_sdk/types.py:1493` 定义 SessionKey 契约。 |

DSH 的事件日志强调可投影与版本解释；Codex rollout 记录线程过程；Gemini CLI 的强所有者维护 turn 身份。Claude SDK 还公开 resume 与 fork 选项，但存储实现和闭源产品保留策略需要单独证据。

恢复的一致性不等于外部副作用可逆。命令已经执行但结果尚未记录时，日志只能报告「不知道」，不能虚构成功或失败。

## 自检

1. 为什么 UI 消息不能直接当持久化单位？答案：UI 是投影，隐藏了事件和检查点边界。
2. 分叉需要保留什么血缘？答案：父会话、分叉点和后续独立事件。
3. 恢复后为何要显式表示未知工具结果？答案：外部副作用可能已发生，重复执行会造成二次影响。
