# 第三方来源与许可证边界

机器可读版本位于 `sources/sources.lock.yml`。本文件不替代上游许可证，也不
向任何第三方内容授予新的权利。

| 来源 | 用途 | 公开仓库处理方式 |
| --- | --- | --- |
| DeepSeek Harness | 核心研究对象 | MIT；只记录 URL、SHA 和原创分析，源码按需拉取 |
| DeepSeek V4 Flash materials | 模型协议与编码背景 | 按上游条款拉取；不下载或再分发模型权重 |
| Cordis | 插件运行时上游 | MIT；按 SHA 拉取 |
| Cordis Paper | 理论研究 | 未见明确再发布许可证；默认不拉取，只保存引用与原创释义 |
| ACP TypeScript SDK | Agent 客户端协议 | Apache-2.0；按 SHA 拉取 |
| MCP TypeScript SDK | 工具协议 | 处于 MIT/Apache-2.0/CC BY 4.0 分范围迁移；逐项处理 |
| E2B | 远程沙箱 | Apache-2.0；按 SHA 拉取 |
| Pi | Agent Loop 与模型适配参照 | MIT；按 SHA 拉取 |
| OpenAI Codex | 成熟工程 Agent 参照 | Apache-2.0 且含 NOTICE；按 SHA 拉取 |
| Claude Agent SDK TS | 商业 SDK 参照 | All rights reserved/Commercial Terms；默认不自动拉取或再分发 |
| OpenCode | 生产型开源编码 Agent 对照 | MIT；作为参考实现按 SHA 拉取，不是 Harness 依赖 |
| Qwen Code | 终端编码 Agent 产品对照 | Apache-2.0；作为参考实现按 SHA 拉取 |
| mini-swe-agent | 最小 Agent Loop 基线 | MIT；用于理解最小控制流与复杂 Harness 的取舍 |
| SWE-bench | 软件工程 Agent 评测层 | MIT；任务、评测与 Agent Harness 分开分析 |
| Terminal-Bench | 终端任务与执行评测层 | Apache-2.0；结果必须绑定完整模型与 Harness 配置 |

社交媒体、Issue、Discussion 和论文只保存必要元数据、短引用、链接、快照哈希
和原创分析，不镜像整篇受版权保护的内容。
