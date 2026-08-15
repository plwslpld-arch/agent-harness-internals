# 第三方来源与许可证边界

机器可读版本在 [`sources/sources.yml`](sources/sources.yml) 与 [`sources/sources.lock.yml`](sources/sources.lock.yml)。本文件不替代上游许可证，也不授予任何新权利。

本仓库只锁定**真正被引用**的来源。历史上曾锁定 15 个仓库，其中大部分从未在正文里被逐行引用，只是在对比表里被数了一下行数——那种「锁了但没用」的来源已经移除。

| 来源 | 在本仓库里的用途 | 许可与处理方式 |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 研究对象本体，全部正文的引用来源 | MIT；按 commit 拉取，不 vendor 源码 |
| [OpenAI Codex](https://github.com/openai/codex) | 横向对照：prompt 装配、缓存 key、压缩、审批沙箱 | Apache-2.0（含 NOTICE）；按 commit 拉取 |
| [OpenCode](https://github.com/anomalyco/opencode) | 横向对照：分模型 prompt、cache_control 断点、权限规则引擎 | MIT；按 commit 拉取 |
| [pi](https://github.com/earendil-works/pi) | 横向对照：极简 prompt、三锚点缓存、JSONL 会话树 | MIT；按 commit 拉取 |
| [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) | 横向对照：最小 harness 基线 | MIT；按 commit 拉取 |

Claude Code 不开源，本仓库对它的描述**只依据公开官方文档**，不使用泄露的 prompt 转储，相关章节逐条给出文档链接。

Cordis 由 dsh 以 `vendor/` 形式内置并做了本地修改，本仓库只分析 dsh 内那一份，不单独锁定 Cordis 上游仓库。Cordis 论文（无明确再发布许可）只做引用与原创释义。

`assets/deepseek-harness-atlas.svg` 中的鱼形图标改编自 dsh 固定 commit 下的 `website/public/favicon.svg`（Copyright (c) 2026 DeepSeek，MIT），右下角罗盘子标为本项目原创。DeepSeek 的名称与图形仅用于标明研究对象，不表示官方认可、赞助或参与。

社交媒体、Issue、Discussion 与论文只保存必要元数据、短引用、链接与原创分析，不镜像受版权保护的完整内容。
