---
title: 工具、审批、沙箱与网络边界
sources: [{"repo":"deepseek-harness","path":"packages/sandbox/sandbox-policy/src/session-mode.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/sandboxing/mod.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/services/sandboxManager.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk":1}
---

# 工具、审批、沙箱与网络边界

*写给安全评审和工具运行时实现者。读完应能把「模型看得见」「需要审批」「进程能碰到」与「能否联网」拆成四个问题。*

弹窗不是沙箱。审批允许一次动作，沙箱限制动作效果，网络围栏又是另一条边界；把它们合成一个「安全模式」会漏掉真实风险。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/sandbox/sandbox-policy/src/session-mode.ts:69-71` 写入会话沙箱模式；该策略不自动构成网络围栏。 |
| Codex | `codex!codex-rs/core/src/sandboxing/mod.rs:18` 明确引入 managed network sandbox context。 |
| Gemini CLI | `gemini-cli!packages/core/src/services/sandboxManager.ts:162` 定义 SandboxManager 接口。 |
| Claude | `claude-agent-sdk!src/claude_agent_sdk/types.py:849` 公开 sandbox network 配置契约。 |

Codex 把文件系统与受管网络上下文放在同一内核运行路径；DSH 的沙箱模式主要约束文件/进程效果，不能据此声称网络已封闭。Gemini CLI 的 sandbox manager 负责把请求变成受限命令。

Claude 仍然只谈契约面：SDK 有网络配置类型，不等于所有 Claude Code 运行方式默认启用同一策略。

## 自检

1. 为什么「需要审批」不能替代沙箱？答案：用户允许后，动作仍需效果边界和最小权限。
2. 文件只读是否意味着不能泄露数据？答案：不意味着；若网络开放，读取到的数据仍可能被发送。
3. 比较 harness 安全性时至少要披露什么？答案：工具可见性、审批策略、文件/进程沙箱和网络策略。
