---
sources: [{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"},{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"cordis-paper","path":".","commit":"948a07b369c62adb3b12e102458be5c18dfb69b9"},{"repo":"cordis","path":".","commit":"8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4"},{"repo":"acp-typescript-sdk","path":".","commit":"e1054d0122e844cca9f1016a598a1da06f78ccef"},{"repo":"e2b","path":".","commit":"f5d702a520de52ac0e5d4dda3ca0d5fca01d7993"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"},{"repo":"claude-agent-sdk-typescript","path":".","commit":"b5321a4b65ec1b034fea19f684e2d8db728875da"},{"repo":"codex","path":".","commit":"42bb50d5027fbad3431bdd56667bbee30700aad5"},{"repo":"pi","path":".","commit":"6f707eb36064e82af9c1320a7634f4dfad21049b"},{"repo":"opencode","path":".","commit":"d0c2b41adf90c5300fa2c754c1c66c211a36af20"},{"repo":"qwen-code","path":".","commit":"8e0033d64de83c7c212f9806ea9d39e7aea2cd51"},{"repo":"mini-swe-agent","path":".","commit":"a83fcae82d2a08f0ee0c688f9d137b3566c097f8"},{"repo":"swe-bench","path":".","commit":"c7fd5abffe0b2086a8bb9389d23c47d930ef571f"},{"repo":"terminal-bench","path":".","commit":"d435a67e30ecb41f916716607c30c4646f208ee6"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 来源与证据索引

## 证据标签

- `[code]`：固定 commit 的源码；证明实现存在，不自动证明默认启用或生产可用。
- `[test]`：测试意图和覆盖路径；skipped、mock 与真实组合分开。
- `[runtime]`：锁定环境的真实运行；只对该组合有效。
- `[official-doc]`：官方声明、模型卡、协议文档；路线图不等于实现。
- `[community]`：独立/社交反馈；用于发现问题，不证明普遍性。
- `[inference]`：基于以上来源的分析，必须写假设与反例。

## 主研究对象

基线 commit：`47f943859bef60e4160492346772ded9b24f765a`。

| 主题 | 权威入口 |
| --- | --- |
| 产品与状态 | `README.zh.md`、`PROJECT_STATUS` 类声明、package manifest |
| 架构与 Cordis | `docs/architecture.zh.md`、`docs/cordis-primer.zh.md`、`vendor/README.md` |
| agent loop | `packages/core/agent-loop/src/agent.ts`、`tool-calls.ts` |
| 工具策略 | `packages/core/tools/src/`、`docs/tool-execution-pipeline.zh.md` |
| DeepSeek adapter | `packages/llm/llm-deepseek/src/{serialize,sse,translate,adapter}.ts` |
| MCP | `packages/mcp/mcp-client/src/` 与其 README/tests |
| ACP | `packages/acp/acp/src/`、`examples/acp-agent/` |
| SDK JSON-RPC | `packages/sdk/protocol|server|client`、`python/`、`examples/jsonrpc-agent/` |
| sandbox | `packages/sandbox/`、各 shell/fs consumer 与平台 e2e |
| persistence | `packages/session/`、`packages/storage/`、persistence docs |
| telemetry | `packages/session/session-telemetry/` |
| benchmark | `BENCHMARK.md`、Python SDK 指南与 task-specific manifests |
| 决策/事故 | `docs/postmortem/`、源码中的 ADR/RFC/decision material |
| 依赖与许可 | `LICENSE`、`THIRD_PARTY_NOTICES.md`、lockfiles、`vendor/README.md` |

## 模型与协议来源

- V4 模型仓库 `DeepSeek-V4-Flash-0731`，commit `7872f01b1d1f…`：模型卡、`encoding/README.md`、`encoding_dsv4.py`、golden tests、LICENSE。
- MCP TS SDK，commit `cc4b41617ce3…`：协议 SDK、transport 与迁移中的许可证文本。
- ACP TS SDK，commit `e1054d0122e8…`：ACP client/server types 与 changelog。

模型卡 benchmark 与 Harness benchmark 必须同时记录其任务版本、Harness 组合、reasoning/sampling 与是否内部集合。

## 框架与参考 Agent

- Cordis upstream `8cc9e33fab69…` 与论文 mirror `948a07b369c6…`：理念和上游对照；Harness vendored fork 以自身 `vendor/README.md` 为差异真源。
- Pi `6f707eb36064…`：多 provider 与最小 agent 结构参考。
- Codex `d167a3604c40…`：公开 Apache-2.0 代码与子 agent/provider 对照。
- Claude Agent SDK TS `b5321a4b65ec…`：仅研究公开 API、README 与许可边界，不复制源码或平台 payload。
- E2B `f5d702a520de…`：远程 sandbox SDK/运行时背景，不等于 Harness 整体隔离证据。

## 直接竞品、最小基线与评测层

- OpenCode `d0c2b41adf90…`：生产型开源编码 Agent，用于比较权限、Session、插件和多表面工程化。
- Qwen Code `8e0033d64de8…`：终端编码 Agent 产品，用于比较 TUI/CLI、扩展和模型接入体验。
- mini-swe-agent `a83fcae82d2a…`：最小 Agent Loop 基线，用于识别复杂 Harness 中哪些层真正必要。
- SWE-bench `c7fd5abffe0b…`：软件工程任务与评测工具，不属于 Agent Harness 本身。
- Terminal-Bench `d435a67e30ec…`：终端任务集与执行评测 Harness；结果必须绑定 Agent、模型、工具、沙箱和预算。

这些仓库是比较或评测来源，不是 DeepSeek Harness 的运行依赖。`sources/sources.yml`
中的 `category` 是关系真源，目录相邻不表示依赖关系。

## 时间敏感来源

GitHub star/fork、npm dist-tag、仓库治理开关、API 限制、价格和社区反应必须附 capture time。旧快照可用于趋势，不可表述为当前事实。
