---
sources: [{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"},{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"cordis-paper","path":".","commit":"948a07b369c62adb3b12e102458be5c18dfb69b9"},{"repo":"cordis","path":".","commit":"8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4"},{"repo":"acp-typescript-sdk","path":".","commit":"01010146a731212fbbb677d6055e0b7bf183b288"},{"repo":"e2b","path":".","commit":"f5d702a520de52ac0e5d4dda3ca0d5fca01d7993"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"},{"repo":"claude-agent-sdk-typescript","path":".","commit":"8716a39f83dd7506e6421199caface603d4941ab"},{"repo":"codex","path":".","commit":"cbe85e117b1db59cdbe8175c59793c3cf2a4a7b8"},{"repo":"pi","path":".","commit":"9d2ec7ffabe927bfad2214c1cee25b6632a78dcf"},{"repo":"opencode","path":".","commit":"722e717e995b38123b442150ec2c5b149c081e85"},{"repo":"qwen-code","path":".","commit":"53a7f2fd1bd439f16be3269b4945460628d2a39b"},{"repo":"mini-swe-agent","path":".","commit":"a83fcae82d2a08f0ee0c688f9d137b3566c097f8"},{"repo":"swe-bench","path":".","commit":"b3f33bf3f7dc07080486fa2e1c5d3f0de8ab14e2"},{"repo":"terminal-bench","path":".","commit":"d435a67e30ecb41f916716607c30c4646f208ee6"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 版本基线与升级流程

## 2026-08-13 研究快照

| 来源 | commit | 用途 |
| --- | --- | --- |
| deepseek-ai/deepseek-harness | `47f943859bef60e4160492346772ded9b24f765a` | 主研究对象；manifest `0.1.0-rc.5` |
| DeepSeek-V4-Flash-0731 | `7872f01b1d1f…` | 模型卡、DSML 编码与协议背景 |
| cordis upstream | `8cc9e33fab69…` | 上游框架对照 |
| Cordis paper mirror | `948a07b369c6…` | 理论阅读，只做注释不再分发正文 |
| MCP TypeScript SDK | `cc4b41617ce3…` | MCP transport/schema 对照 |
| ACP TypeScript SDK | `01010146a731…` | ACP wire/client 对照 |
| E2B | `f5d702a520de…` | 远程 sandbox provider 背景 |
| Pi | `9d2ec7ffabe9…` | provider/agent 参考 |
| Codex | `cbe85e117b1d…` | 可选子 agent/provider 边界参考 |
| Claude Agent SDK TS | `8716a39f83dd…` | 公共 API/条款边界参考，不复制源码 |
| OpenCode | `722e717e995b…` | 生产型开源 Agent 对照 |
| Qwen Code | `53a7f2fd1bd4…` | 终端编码 Agent 产品对照 |
| mini-swe-agent | `a83fcae82d2a…` | 最小 Agent Loop 基线 |
| SWE-bench | `b3f33bf3f7dc…` | 软件工程任务与评测工具 |
| Terminal-Bench | `d435a67e30ec…` | 终端任务和执行评测层 |

同期研究笔记记录 npm `@deepseek-ai/dsh` 已到 `0.1.0-rc.6`，说明发布包可领先本地源码 manifest。正式以仓库 `sources/sources.lock.yml` 为权威；上表是人工研究锚点，不替代 lock。

## 2026-08-14 上游更新复核

DeepSeek Harness、DeepSeek V4、Cordis、MCP SDK、E2B、mini-swe-agent 与 Terminal-Bench 未提升基线；本次提升的是周边协议/参考 Agent/评测层。ACP SDK 增强 v2 内置响应校验、batch mapper 前校验和扩展/未知方法类型区分。Claude Agent SDK changelog 增加 subagent `tool_result._meta`、结构化 `context_usage` 与 `vcs_state_changed.branch`。Codex 更新面较广，涉及 app-server thread queue/revert、plugin app 搜索、Bedrock provider、Guardian/Node REPL evidence、MCP OAuth、telemetry、sandbox 与大量测试。Pi 只有 Kimi Coding user-agent 修正。OpenCode 更新依赖、Nix hash、Gemini provider 排序/支持和 v1 database compatibility。Qwen Code 变化集中在 daemon active work/background shell、main-agent telemetry、conversation runtime、review workflow、安全 CI 与 web-shell 细节。SWE-bench 增加基础设施失败只读分类和 usage/cache token 保留。

复核结论：上述变化不改变 Atlas 对 DeepSeek Harness 当前核心架构、插件主线、协议边界和 benchmark 归因的结论，但要求版本表、来源索引、ACP 说明和 benchmark 指标同步更新到新锁定 Commit。

## 升级流水线

1. **发现**：抓取 upstream commit/tag、npm dist-tag、模型/API 文档、许可证和安全公告。
2. **候选锁**：生成旧/新 SHA、提交范围、变更文件与 package diff，不直接提升基线。
3. **语义分类**：架构、协议、配置、持久化、安全、许可证、文档、测试、仅重构。
4. **重点审查**：service seam、event vocabulary、profile 默认值、SDK wire、DeepSeek serializer、MCP/ACP 能力、sandbox runner、vendored 补丁。
5. **门禁**：官方仓库自身测试；Atlas 链接/格式/锁一致性；选定的 keyless smoke 与真实组合 E2E。
6. **文档影响**：列出必须更新、可能过期和不受影响的页面，逐条关闭。
7. **人工接受**：评审许可证/安全/产品语义后才更新 lock 与 `current` 标签。

## Cordis fork 的特殊维护

不能用“复制上游最新目录”升级。先读取 Harness `vendor/README.md` 的 upstream commit 与本地修改清单，逐项决定：继续重放、改写、上游已吸收后退役，或因冲突拒绝升级。验证至少覆盖 disposal、config reconciliation、HMR watcher、持久化、lazy resolution 和 package closure。

## 兼容矩阵字段

每条组合记录：Harness SHA/npm、Node/pnpm、OS/arch、模型/API 版本、MCP/ACP SDK、profile、storage format、sandbox backend/enforcement、验证用例、结果与日期。协议“能连上”和“所有能力兼容”分两列。

## 版本异常处理

- npm 领先源码：不要猜映射；查 tag/provenance/changelog，无法确认则标 `unverified-package-source`。
- API 行为漂移：保存 sanitized request/response shape 和 request id；区分 provider 变化与 adapter 回归。
- session format 变化：先复制真实 fixture 做只读迁移演练；未知版本必须失败关闭。
- 许可证变化：停止自动提升，进入维护者和法务审查，重新生成 notices 与 distribution closure。
