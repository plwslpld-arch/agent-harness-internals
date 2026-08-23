---
title: 缓存：前缀稳定性从哪里来
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/serialize.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/client.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/core/client.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk-python":1}
---

# 缓存：前缀稳定性从哪里来

*写给关心延迟和 token 成本的人。读完应能区分显式 cache key、隐式前缀复用，以及「源码没有缓存开关」与「请求不能命中缓存」。*

缓存命中首先是序列化问题：相同信息若换了位置或顺序，provider 看到的前缀就已经不同。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:377` 是请求体序列化入口，DSH 依靠稳定历史获得隐式复用。 |
| Codex | `codex!codex-rs/core/src/client.rs:326` 同时处理前后两次 prompt cache key。 |
| Gemini CLI | `gemini-cli!packages/core/src/core/client.ts:697` 用模型窗口与上次 prompt token 计算剩余空间。 |
| Claude | `claude-agent-sdk-python!src/claude_agent_sdk/types.py:2144` 只暴露 partial message 流选项，没有公开 cache key 契约。 |

Codex 有显式 cache key 路径；DSH 的重点是保持 system、工具 schema 和历史前缀稳定。Gemini CLI 这处证据说明客户端持续跟踪 token 压力，但不等于它在 SDK 层承诺某种 provider 缓存协议。

Claude SDK 没有 cache key 字段。这个「没有」只描述当前公开类型，不足以断言闭源 CLI 不使用 provider 缓存。成本分析应以实际请求和 usage 遥测为准。

## 自检

1. 为什么没有 cache API 仍可能命中？答案：provider 可按相同请求前缀自动复用计算。
2. cache key 相同是否保证命中？答案：不保证；模型、前缀内容和 provider 策略仍会影响结果。
3. SDK 未暴露字段能否证明产品内部没有该能力？答案：不能，只能说明公开契约未提供控制面。
