---
title: 扩展：Plugins、Skills、Hooks 与 MCP
sources: [{"repo":"deepseek-harness","path":"packages/hooks/hooks-claude-code/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/skills.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/hooks/types.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
last_verified: 2026-08-23
status: reviewed
coverage_min: {"deepseek-harness":1,"codex":1,"gemini-cli":1,"claude-agent-sdk-python":1}
---

# 扩展：Plugins、Skills、Hooks 与 MCP

*写给平台扩展和生态负责人。读完应能判断四种扩展点分别改了配置、提示词、生命周期还是外部工具连接。*

「支持插件」信息量太低。真正的问题是：扩展在哪个阶段加载、能改什么、失败是否阻断、作用域落在进程还是会话。

<!-- evidence-matrix -->
| 主角 | 可核入口 |
| --- | --- |
| DSH | `deepseek-harness!packages/hooks/hooks-claude-code/src/index.ts:242` 展示 hook 可以在工具执行前返回 ask。 |
| Codex | `codex!codex-rs/core/src/skills.rs:27-29` 生成 HostSkillsLoadInput。 |
| Gemini CLI | `gemini-cli!packages/core/src/hooks/types.ts:43` 枚举 hook 事件名。 |
| Claude | `claude-agent-sdk-python!src/claude_agent_sdk/types.py:263` 定义公开 HookEvent 联合。 |

Skill 通常向模型注入可发现的说明；hook 介入运行时事件；MCP 连接外部工具或资源；plugin 可能打包前面几种能力。比较时应按实际生命周期拆开。

Claude SDK 还定义 MCP server 与 plugin config 类型，这些属于公开契约。Claude Code 如何发现本地扩展、内部加载顺序怎样，仍需官方文档支撑。

## 自检

1. 为什么 skill 和 hook 不能视为同一能力？答案：skill 主要改变模型可见指导，hook 能拦截运行时事件。
2. 扩展失败应总是阻断吗？答案：取决于阶段和安全语义；权限检查失败通常应 fail closed。
3. MCP 连接成功能否证明工具调用安全？答案：不能，仍需权限、审批和沙箱策略。
