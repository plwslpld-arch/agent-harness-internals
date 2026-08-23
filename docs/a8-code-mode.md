---
title: Code Mode：把很多工具收成一个运行时代码入口
sources: [{"repo":"deepseek-harness","path":"packages/core/tools/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/app-server/src/code_mode_host.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/tools/tool-registry.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk":1}
---

# Code Mode：把很多工具收成一个运行时代码入口

*写给关注工具 schema 成本与执行安全的人。读完应能说明 Code Mode 减少了什么，又把哪些风险移到了代码运行时。*

工具越多，请求里的 schema 越长。Code Mode 让模型先写一小段代码，再由宿主解释和调度；它缩小接口面，却没有让权限问题消失。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/core/tools/src/index.ts:651` 定义工具呈现模式配置。 |
| Codex | `codex!codex-rs/app-server/src/code_mode_host.rs:8` 选择进程级 code-mode host。 |
| Gemini CLI | `gemini-cli!packages/core/src/tools/tool-registry.ts:231` 仍公开一般工具注册表；当前锁定源码未证明等价 Code Mode。 |
| Claude | `claude-agent-sdk!src/claude_agent_sdk/types.py:1955` 公开 allowed_tools；当前 SDK 契约未证明等价 Code Mode。 |

DSH 和 Codex 都有明确 Code Mode 路径。Gemini CLI 与 Claude 两列写的是证据边界：找到工具注册/允许列表，不代表存在同类「代码解释器 + 单入口」机制。

运行时代码必须继续经过工具权限和沙箱。若宿主允许代码直接绕过工具层，schema 省下来的 token 会换成更大的执行面。

## 自检

1. Code Mode 为什么可能降低请求成本？答案：模型无需每轮接收大量独立工具 schema。
2. 为什么它没有消除权限系统？答案：代码最终仍会触发文件、进程或网络动作。
3. 「未找到等价实现」应如何表述？答案：限定在锁定源码与公开契约，不写成产品永久不支持。
