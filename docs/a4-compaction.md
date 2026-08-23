---
title: 上下文压缩：什么时候摘要，保留什么
sources: [{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/compact.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/core/client.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk":1}
---

# 上下文压缩：什么时候摘要，保留什么

*写给处理长会话与记忆退化的人。读完应能区分触发阈值、摘要生成、历史替换和会话标题摘要。*

压缩节省窗口，却会把原始证据变成模型生成的二手文本。触发点越晚，越可能撞上窗口；摘要越短，越可能丢掉约束。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/compaction/compaction-basic/src/index.ts:147-164` 在 pre-step 阶段尝试压缩。 |
| Codex | `codex!codex-rs/core/src/compact.rs:111` 是内联自动压缩入口。 |
| Gemini CLI | `gemini-cli!packages/core/src/core/client.ts:1206` 调用 compression service 生成新历史。 |
| Claude | `claude-agent-sdk!src/claude_agent_sdk/types.py:366` 暴露 PreCompact hook 契约。 |

前三家都能从源码追到「旧历史如何变成新历史」。Claude SDK 只证明压缩前存在 hook 事件，摘要算法、保留区和阈值仍属于未公开实现。

会话标题摘要不等于上下文压缩。前者服务检索和列表展示，后者会改变后续模型输入；评估时要分别记录。

## 自检

1. 为什么摘要成功不等于语义无损？答案：摘要是有损表示，可能省略细节和约束。
2. PreCompact hook 能证明什么？答案：公开契约允许在压缩前观察或处理事件，不能证明具体算法。
3. 发布评估为何要记录压缩策略？答案：它会改变同一任务后半程的模型可见信息。
