# 第三方来源与许可证边界

机器可读版本在 [`sources/sources.yml`](sources/sources.yml) 与 [`sources/sources.lock.yml`](sources/sources.lock.yml)。本文件不替代上游许可证，也不授予任何新权利。

来源分为 `core`、`samples` 与 `eval` 三组：核心组支撑六条 Agent Harness 主线，样本组用于补充设计取舍，评测组只用于解释 Agent Harness 如何接入独立评测。锁定来源不等于复制或再发布上游源码。

| 来源 | 在本仓库里的用途 | 许可与处理方式 |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 研究对象本体，全部正文的引用来源 | MIT；按 commit 拉取，不 vendor 源码 |
| [OpenAI Codex](https://github.com/openai/codex) | 横向对照：prompt 装配、缓存 key、压缩、审批沙箱 | Apache-2.0（含 NOTICE）；按 commit 拉取 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | Agent harness 主角：prompt、循环、工具、策略、安全与编排 | Apache-2.0；按 commit 拉取并保留署名 |
| [Claude Agent SDK for Python](https://github.com/anthropics/claude-agent-sdk-python) | Claude Code 的 Python 契约面：消息、Hook、权限与工具 Schema | MIT；只据 SDK 契约与官方文档，不外推闭源实现 |
| [Claude Agent SDK for TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript) | Claude Code 的 TypeScript 契约面与类型定义 | Anthropic 商业条款；只做元数据、短引用与原创分析，不再发布源码 |
| [OpenCode](https://github.com/anomalyco/opencode) | 横向对照：分模型 prompt、cache_control 断点、权限规则引擎 | MIT；按 commit 拉取 |
| [pi](https://github.com/earendil-works/pi) | 横向对照：极简 prompt、三锚点缓存、JSONL 会话树 | MIT；按 commit 拉取 |
| [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) | 横向对照：最小 harness 基线 | MIT；按 commit 拉取 |
| [lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) | Eval harness 词源与批量请求/任务注册结构 | MIT；按 commit 拉取 |
| [Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai) | Agent 时代 eval harness 的 task / solver / scorer / sandbox 结构 | MIT；按 commit 拉取 |
| [Terminal-Bench 1](https://github.com/harbor-framework/terminal-bench-1) | 终端任务、agent adapter 与执行环境的交汇样本 | Apache-2.0；按 commit 拉取并保留署名 |
| [SWE-bench](https://github.com/SWE-bench/SWE-bench) | 仓库快照任务与 FAIL_TO_PASS / PASS_TO_PASS 判定 | MIT；按 commit 拉取 |

Claude Code 本体不开源。本仓库只把两个官方 Claude Agent SDK 的类型与协议当作可核对的契约面；Python SDK 与 TypeScript SDK 的许可不同，不能混为一谈。契约面之外只依据公开官方文档，不使用泄露的 Prompt 转储，也不把 SDK 行为外推成闭源内部实现。

Cordis 由 DeepSeek Harness 以 `vendor/` 形式内置并做了本地修改，本仓库只分析 DeepSeek Harness 内那一份，不单独锁定 Cordis 上游仓库。Cordis 论文（无明确再发布许可）只做引用与原创释义。

`assets/brand/` 与 `assets/diagrams/` 中登记到图示 Manifest 的 SVG 为本项目原创，只使用几何图形、中文说明和必要的产品或协议标识，不复用上游 Logo。

社交媒体、Issue、Discussion 与论文只保存必要元数据、短引用、链接与原创分析，不镜像受版权保护的完整内容。
