---
title: 两种 Harness：这个仓库怎么读
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/core/src/client.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"lm-evaluation-harness","path":"lm_eval/api/task.py","commit":"4e7e0d47f33bc71070c1d38394bafbb52b117163"},{"repo":"inspect-ai","path":"src/inspect_ai/_eval/task/task.py","commit":"5679e7e526c546c86fb8f831033eb0dcfc3dea64"}]
last_verified: 2026-08-23
status: reviewed
---

# 两种 Harness：这个仓库怎么读

*写给想理解 coding agent 或模型评估的人。读完应能区分两种 harness、选择阅读路线，并知道这里的证据能证明什么。*

模型外面至少有两层系统。一层决定它每一步看见什么、能调用什么；另一层决定给它什么任务、怎样运行和记分。只看模型名，会把两层影响都算到模型头上。

## Part A：Agent Harness

Agent harness 包在模型外面，负责 prompt、缓存前缀、循环、工具、权限、状态和编排。本仓库把 DSH、Codex、Gemini CLI 与 Claude Agent SDK 放进十个共同维度：

1. [Prompt 装配](a1-system-prompt.md)
2. [KV-Cache](a2-kv-cache.md)
3. [Agent Loop](a3-agent-loop.md)
4. [上下文压缩](a4-compaction.md)
5. [工具、审批、沙箱与网络](a5-tools-approval-sandbox.md)
6. [会话持久化](a6-session.md)
7. [Plugins、Skills、Hooks 与 MCP](a7-extensions.md)
8. [Code Mode](a8-code-mode.md)
9. [产品表面与协议](a9-surfaces.md)
10. [编排](a10-orchestration.md)

Claude Code 本体闭源。Claude 一列只把官方 SDK 源码当作契约面；内部实现只能使用官方公开文档，不能从 SDK 类型反推。

## Part B：Eval Harness

Eval harness 负责题目、环境、执行、评分与汇总。四篇从定义走到两层耦合：

1. [什么是 eval harness](e1-what-is-eval-harness.md)
2. [任务与环境](e2-tasks-and-envs.md)
3. [运行与记分](e3-run-and-score.md)
4. [Harness 怎样改变分数](e4-harness-decides-score.md)

训练 reward、checkpoint 选择和独立 release gate 分开处理。仓库门禁通过只证明文档与锁定来源一致，不证明任何系统已在生产部署，也不替代真实 benchmark。

## DSH 深读

原有逐包分析完整保留在 [DSH 深读总览](deep/dsh-overview.md)。这些文章回答单一实现的细节；a/e 系列负责横向机制和评估方法。

## 自检

1. Agent harness 改变什么？答案：模型输入、工具能力、权限、循环和状态。
2. Eval harness 改变什么？答案：任务、环境、执行与评分口径。
3. 为什么门禁全绿仍不是生产证明？答案：它验证的是文档证据链，没有运行真实生产负载或独立发布评估。
