---
title: 产品表面与协议：谁驱动谁
sources: [{"repo":"deepseek-harness","path":"packages/boot/app-boot/src/profile.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/app-server/src/command_exec.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/agents/remote-subagent-protocol.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk":1}
---

# 产品表面与协议：谁驱动谁

*写给接 CLI、IDE、Web、SDK 和远程服务的人。读完应能区分用户界面、宿主协议与核心运行时。*

同一个会话可以被 TUI、Web 或 SDK 驱动。表面不同不代表核心循环不同，但协议是否保留事件顺序、审批和取消语义会直接影响能力。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/boot/app-boot/src/profile.ts:114-117` 列出自动初始化的 web/headless profile。 |
| Codex | `codex!codex-rs/app-server/src/command_exec.rs:9-18` 引入 app-server 的命令执行通知与响应类型。 |
| Gemini CLI | `gemini-cli!packages/core/src/agents/remote-subagent-protocol.ts:412` 构造远程子代理协议。 |
| Claude | `claude-agent-sdk!src/claude_agent_sdk/types.py:1360` 定义流事件消息。 |

协议层需要传递结构化工具事件、增量输出、审批请求和终止信号。若表面只保留最终文本，它无法完整重放，也无法独立审计工具过程。

Claude SDK 的 StreamEvent 证明调用者能接到公开流事件；这仍不是闭源 CLI 内部 transport 的实现说明。

## 自检

1. 为什么「有 SDK」不等于「核心用 SDK 实现」？答案：SDK 是对外契约，内部可能走不同进程和协议。
2. 哪些事件不能只压成文本？答案：工具调用/结果、审批、取消和结构化 usage。
3. 多表面共用会话时最重要的性质是什么？答案：事件身份、顺序与恢复语义一致。
