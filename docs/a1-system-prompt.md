---
title: Prompt 装配：谁拥有模型最先看到的资产
sources: [{"repo":"deepseek-harness","path":"packages/core/system-prompt/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/client_common.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/core/prompts.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk-python":1}
---

# Prompt 装配：谁拥有模型最先看到的资产

*写给需要控制 agent 行为与缓存稳定性的研发和产品负责人。读完应能判断：prompt 由谁拼、哪些内容属于每轮变化、Claude 的证据能走到哪里。*

同一句用户输入，换一个 harness 后表现可能完全不同。模型没换，先变化的是它收到的 system、工具 schema、项目指令与运行态快照。

## 四种装配入口

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/core/system-prompt/src/index.ts:169` 负责工具顺序等装配细节。 |
| Codex | `codex!codex-rs/core/src/client_common.rs:30` 把 base instructions 放进请求公共结构。 |
| Gemini CLI | `gemini-cli!packages/core/src/core/prompts.ts:23` 暴露 core system prompt 的生成入口。 |
| Claude | `claude-agent-sdk-python!src/claude_agent_sdk/types.py:1967` 只证明 SDK 允许调用者覆盖或预设 system prompt。 |

DSH 把多插件贡献合成一份稳定前缀，详细逐字重建保留在深读层。Codex 把基础指令建模为请求对象的一部分；Gemini CLI 用 PromptProvider 集中生成。三者都能从源码继续追到装配过程，但资产边界不同。

Claude 这一列只能下契约结论：SDK 有 system_prompt 入口。闭源 Claude Code 内部怎样分层、何时追加运行态文本，不能从这行源码推出；相关说法必须另给官方文档。

## 自检

1. 为什么不能只比较最终模型名？答案：harness 先改变了 prompt、工具和运行态上下文，输入分布已经不同。
2. 哪一列不能从 SDK 继续外推内部装配？答案：Claude；这里证实的是公开契约面。
3. 哪类内容最容易破坏前缀缓存？答案：每轮变化却被放进前缀的运行态信息，参见 [a2 缓存](a2-kv-cache.md)。
