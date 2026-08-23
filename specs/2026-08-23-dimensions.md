---
title: 维度全集：agent harness 41 维 + eval harness 6 维
date: 2026-08-23
status: draft
---

# 维度全集

配套 [2026-08-23-multi-harness-internals-design.md](2026-08-23-multi-harness-internals-design.md)。

维度不是想出来的，是从五个主角的源码目录结构交叉推出来的。下面每一维至少在三个主角里能找到对应的包、crate 或目录，落单的（只有一家有）单独标出来，因为「只有一家做」本身就是结论。

已核实的目录结构来源：

| 主角 | 结构 | 已核实 |
| --- | --- | --- |
| dsh | `packages/` 下 49 个包组 | 是，`b150a55` |
| Codex | `codex-rs/` 下 104 个 crate | 是，`83d1fe0` |
| Gemini CLI | `packages/core/src/` 下 28 个目录 | 是 |
| pi | `packages/` 10 个 + `coding-agent/src/core/` 50 余文件 | 是 |
| Claude Code | `claude_agent_sdk/types.py` 88 KB 契约面 | 仅确认文件规模，逐项未核 |

## Part A：agent harness

### 域 1　上下文装配：模型每一步看到什么

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A1.1 | system prompt 装配与所有权 | `core/system-prompt`，插件按 order 贡献 | `prompts` / `models-manager`，服务端下发 | `core/src/prompts` | `core/system-prompt.ts` + `prompt-templates.ts` |
| A1.2 | 项目指令文件发现与注入 | 目录链 + 65536 字节预算 | `AGENTS.override.md`，32 KiB | 待核 | 全局 + 完整祖先链 |
| A1.3 | 动态运行时快照放哪 | user 消息里的快照 | developer 角色 WorldState，首轮全量后发 diff | 待核 | `<project_context>` 不含易变信息 |
| A1.4 | 上下文片段与资源加载 | `packages/context` | `context-fragments` | `core/src/context` + `resources` | `core/resource-loader.ts` |
| A1.5 | 附件与多模态 | `packages/attachment` | 待核 | `core/src/voice` | 待核 |
| A1.6 | 工作区与 cwd 语义 | `packages/workspace` | `codex-home` / `install-context` | 待核 | `core/session-cwd.ts` |

### 域 2　缓存与成本

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A2.1 | KV-cache 前缀稳定性从哪来 | 无缓存代码，靠前缀不变 | `core` + `responses-api-proxy` | 待核 | 待核 |
| A2.2 | 命中遥测与用量核算 | 遥测链 | `analytics` | `core/src/billing` | `core/cache-stats.ts` + `usage-totals.ts` |
| A2.3 | 请求可重建与重放 | reconstructable-requests 设计记录 | `response-debug-context` / `rollout-trace` | 待核 | 待核 |

### 域 3　上下文生命周期

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A3.1 | 压缩触发与保留策略 | `packages/compaction` | `core/src/compact.rs` | 待核 | `core/compaction/` |
| A3.2 | 溢出与外溢 | `packages/spill` | 待核 | 待核 | 待核（OpenCode 有 `session/overflow.ts`） |
| A3.3 | 跨会话记忆 | 待核 | `memories` | 待核 | 待核 |
| A3.4 | 历史派生与 surface 投影 | session surface 投影 | `history` / `message-history` | 待核 | `core/messages.ts` |

### 域 4　循环与模型层

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A4.1 | agent loop 状态机与终止条件 | `core/agent-loop` | `core` | `core/src/core` | `agent/src/agent-loop.ts` + `agent/src/harness/` |
| A4.2 | 工具并行、取消、超时 | `core/tools` | `tools` / `exec-server` | `core/src/scheduler` | `core/tools/` |
| A4.3 | 请求序列化与流式解析 | `llm-deepseek/src/serialize.ts` | `codex-api` / `protocol` | 待核 | `agent/src/stream-fn.ts` |
| A4.4 | 模型路由、回退、多 provider | `packages/llm` | `model-provider-info` / `models-manager` / `ollama` / `lmstudio` | `core/src/routing` + `fallback` + `availability` | `core/model-registry.ts` / `model-resolver.ts` / `provider-composer.ts` |
| A4.5 | thinking/reasoning 的回传与保留 | adapter e2e 已验证 | 待核 | 待核 | 待核 |
| A4.6 | 重试与退避 | `packages/llm` | `http-client` | 待核 | 待核 |

### 域 5　工具与能力面

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A5.1 | 内置工具集与 schema 设计 | `core/tools` | `tools` | `core/src/tools` | `core/tools/` |
| A5.2 | 文件读写与编辑策略 | `packages/fs` | `apply-patch` / `file-system` / `file-search` / `file-watcher` | 待核 | 待核 |
| A5.3 | 代码智能（LSP / 符号） | `packages/lsp` | `diagnostics` | 待核 | `core/diagnostics.ts` |
| A5.4 | shell 执行与子进程模型 | `packages/shell` + `subprocess` | `shell-command` / `exec-server` / `stdio-to-uds` | 待核 | `core/bash-executor.ts` + `core/exec.ts` |
| A5.5 | Code Mode / run_code | `core/tools/src/code-mode.ts` + `packages/code-runtime` | `code-mode` + `-host` + `-protocol` + `-runtime` | 无 | 无 |
| A5.6 | 远程与云端执行环境 | `packages/e2b` | `cloud-tasks` / `cloud-config` / `backend-client` | 待核 | 无 |

### 域 6　安全边界

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A6.1 | 审批与权限模型 | `packages/guard` | `execpolicy` / `shell-escalation` | `core/src/confirmation-bus` + `policy` | 待核 |
| A6.2 | 沙箱后端与平台差异 | `packages/sandbox`，三平台四后端 | `bwrap` / `linux-sandbox` / `windows-sandbox-rs` / `sandboxing` | `core/src/sandbox` | 待核 |
| A6.3 | 网络出口控制 | 完全不管 | `network-proxy`（另有 `openai/fence`） | 待核 | 待核 |
| A6.4 | 凭据与密钥 | `packages/credentials` + `identity` | `keyring-store` / `secrets` / `login` / `aws-auth` / `workload-identity` | 待核 | `core/auth-storage.ts` + `runtime-credentials.ts` |
| A6.5 | 项目信任与首次运行 | 待核 | `install-context` | 待核 | `core/trust-manager.ts` + `project-trust.ts` |
| A6.6 | 输出防护与注入防御 | 待核 | 待核 | `core/src/safety` | `core/output-guard.ts` |
| A6.7 | 进程加固 | 无 | `process-hardening` | 无 | 无 |

### 域 7　状态与持久化

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A7.1 | 事件日志与不变量 | `packages/session`，模型可见 ⟺ 已记录 | `rollout` / `state` | 待核 | `core/event-bus.ts` |
| A7.2 | 持久化后端 | `session-persistence-sqlite` | `thread-store` / `rollout` | 待核 | `packages/session-backends` |
| A7.3 | 查询、分支、回放 | `packages/session-query` | `rollout-trace` | 待核 | 待核 |
| A7.4 | 恢复与中断续跑 | `packages/session` | `thread-manager-sample` | 待核 | `core/session-manager.ts` |
| A7.5 | 存储抽象 | `packages/storage` | 待核 | 待核 | 待核 |

### 域 8　扩展性

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A8.1 | 插件模型 | Cordis 插件树，`packages/extensions` | `plugin` / `core-plugins` / `ext` | 待核 | `core/extensions/` |
| A8.2 | Skills | `packages/skill` | `skills` | `core/src/skills` | `core/skills.ts` |
| A8.3 | Hooks | `packages/hooks` | `hooks` | `core/src/hooks` | 待核 |
| A8.4 | MCP（client 与 server 双向） | `packages/mcp` | `codex-mcp` / `mcp-server` / `rmcp-client` / `connectors` | `core/src/mcp` | 待核 |
| A8.5 | slash commands 与自定义命令 | 待核 | `docs/slash_commands.md` | `core/src/commands` | `core/slash-commands.ts` |
| A8.6 | SDK 与嵌入 | `packages/sdk` | `sdk/typescript` + `sdk/python` | `packages/sdk` | `core/sdk.ts` |
| A8.7 | 配置与设置分层 | `packages/settings` + `preset` | `config` / `features` | `core/src/config` | `core/settings-manager.ts` + `config.ts` |

### 域 9　编排

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A9.1 | 子代理 | `packages/subagent` | `agent-graph-store` / `agent-identity` | `core/src/agent` + `agents` | 待核 |
| A9.2 | 计划、待办、目标 | `packages/plan` + `todo` + `goal` | plan mode | 待核 | `packages/coding-agent/src/modes` |
| A9.3 | 工作流与调度 | `packages/workflow` + `jobs` + `schedule` | 待核 | 待核 | 待核 |
| A9.4 | 多 agent 协作 | `experimental/agent-team` | `collaboration-mode-templates` / `external-agent-migration` | 待核 | 待核 |
| A9.5 | harness 之上的编排层 | 无 | `openai/symphony`（独立仓库） | `packages/a2a-server` | 待核 |

### 域 10　产品表面与协议

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A10.1 | TUI / Web / headless | `packages/web` + `client` + `terminal` | `tui` / `cli` / `exec` | `packages/cli` | `packages/tui` + `client` |
| A10.2 | 服务端协议面 | `packages/acp` + `api` + `host` | `app-server` ×6 crate + `exec-server-protocol` | `packages/a2a-server` | `packages/protocol` + `server` |
| A10.3 | IDE 集成 | 待核 | `ext` | `packages/vscode-ide-companion` | 待核 |
| A10.4 | 人在环、中断、反馈 | `packages/interaction` + `feedback` | `feedback` | 待核 | 待核 |

### 域 11　工程与可观测

| # | 维度 | dsh | Codex | Gemini CLI | pi |
| --- | --- | --- | --- | --- | --- |
| A11.1 | 遥测与追踪 | `packages/runtime-diagnostics` | `otel` / `analytics` | `core/src/telemetry` | `packages/telemetry` |
| A11.2 | 调试与 replay | 待核 | `response-debug-context` / `diagnostics` | 待核 | `core/diagnostics.ts` |
| A11.3 | 自证：invariant、测试、门禁 | 219 个 `invariant.ts` | `clippy.toml` / `deny.toml` | 待核 | 待核 |
| A11.4 | 启动、装配与 preset | `packages/boot` + `bundle` + `preset` | `arg0` / `cli` | 待核 | `packages/coding-agent/src/main.ts` |

**Part A 合计 41 维，11 个域。**

「待核」表示该主角在这一维上是否有对应实现尚未确认，不等于没有。P1 逐维展开时补齐。

### 只有一家做的维度

这几处「落单」本身就是结论，写作时要专门解释为什么只有它做：

| 维度 | 只有谁做 | 为什么值得单独讲 |
| --- | --- | --- |
| A5.5 Code Mode | dsh 与 Codex | 两家都做了，Gemini CLI 和 pi 没有。这是「工具太多塞不下」的两种独立解法 |
| A6.7 进程加固 | Codex | 别家把安全边界画在沙箱，Codex 还多画了一层在进程属性上 |
| A3.2 溢出外溢 | dsh 与 OpenCode | 压缩之外还留了一条「先挪出去」的路 |
| A9.3 工作流与调度 | dsh | 别家把这层留给外部编排器，dsh 收进了 harness |
| A9.5 harness 之上的编排层 | Codex 生态（symphony）与 Gemini（a2a-server） | 见设计文档第五节 |

## Part B：eval harness

| # | 维度 | lm-evaluation-harness | inspect_ai | terminal-bench | SWE-bench |
| --- | --- | --- | --- | --- | --- |
| E1 | 任务怎么定义与注册 | 任务注册表 + YAML | `Task` / `Dataset` | 容器化终端任务 | 容器化仓库快照 |
| E2 | 执行怎么跑 | 批处理请求 | `solver` + `sandbox` | agent 适配器驱动真实 harness | 打补丁后跑测试 |
| E3 | 分怎么记 | 内置指标 | `scorer`，含 LLM 裁判 | 判据式 | `FAIL_TO_PASS` / `PASS_TO_PASS` |
| E4 | 请求形态 | `log_likelihood` vs `generate_until` | 统一 model API | 由被测 harness 决定 | 由被测 agent 决定 |
| E5 | agent harness 作为被测对象 | 不涉及 | solver 可以是 agent | **可插拔适配器，交汇点** | 由 SWE-agent / mini-swe-agent 承担 |
| E6 | 可复现与披露要求 | seed 与版本 | 日志与 transcript | 容器镜像固定 | 镜像固定 |

**Part B 合计 6 维。**

另外两个横跨 Part A 与 Part B 的样本：

- `SWE-agent/mini-swe-agent`：190 行的 agent harness，同时是 SWE-bench 的基线跑分器
- `pi` 的 `packages/evals`，内含 `pi-harness.ts`：主角自带 eval harness，且 `packages/agent/src/harness/` 把 harness 显式建模成一个模块

这两个是把两条线接起来的实证，不是类比。

## 文章映射

41 + 6 维不等于 47 篇文章。矩阵按维度全覆盖，文章按域聚合。

### Part A：11 篇

| 文章 | 覆盖维度 |
| --- | --- |
| `a1-context-assembly` | A1.1–A1.6 |
| `a2-cache-and-cost` | A2.1–A2.3 |
| `a3-context-lifecycle` | A3.1–A3.4 |
| `a4-loop-and-model` | A4.1–A4.6 |
| `a5-tools` | A5.1–A5.3 |
| `a6-shell-and-code-mode` | A5.4–A5.6 |
| `a7-approval-and-sandbox` | A6.1–A6.3, A6.7 |
| `a8-credentials-and-trust` | A6.4–A6.6 |
| `a9-session-and-state` | A7.1–A7.5 |
| `a10-extensibility` | A8.1–A8.7 |
| `a11-orchestration` | A9.1–A9.5 |
| `a12-surfaces-and-protocols` | A10.1–A10.4 |
| `a13-observability-and-self-proof` | A11.1–A11.4 |

实际是 13 篇。

### Part B：4 篇

| 文章 | 覆盖 |
| --- | --- |
| `e1-two-harnesses` | 词源、两种 harness 同名不同物 |
| `e2-tasks-and-envs` | E1、E6 |
| `e3-run-and-score` | E2、E3、E4 |
| `e4-harness-decides-score` | E5 + 交汇实证 |

### 非研发入口：4 篇

`00-overview`、`concepts`、`for-product`、`for-ops`，内容改成跨五家。

### DSH 深度：5 篇

`docs/deep/dsh-cordis-boot-preset`、`dsh-web-client`、`dsh-self-verification`、`dsh-agent-notes`、`dsh-llm-adapter`。

**合计 26 篇 + 2 附录**，比现在的 21 篇多 5 篇，但覆盖从 1 个主角变成 5 个主角加 4 个 eval harness。

## 深度分级

五家不可能等深，也不该等深。三条是结构性约束而非投入问题：

- **Claude Code 有天花板**。只有 `types.py` 的契约面，永远到不了逐行级。
- **Codex 是 Rust、104 个 crate**。读 Rust 比读 TypeScript 慢，`core` 单个 crate 就极大。
- **pi 刻意极简**。讲透它的 prompt 层可能只要 500 字，讲透 dsh 的要 5000 字。深度天然不对称。

现有 1059 处锚点是单主角的产出。五主角在 41 维上等深约等于现有工作量的四到五倍，做不完，做完也没人读。

### 三级标准

| 级 | 标准 | 锚点下限（每篇每家） |
| --- | --- | --- |
| **T1 逐行级** | 讲到读者能自己复现；必须带真实产物（逐字 prompt、请求 JSON、事件日志行、审批弹窗原文） | ≥ 40 |
| **T2 结构级** | 讲清做法与取舍，锚点到关键文件与函数，不逐行 | ≥ 12 |
| **T3 契约级** | 只讲对外契约与官方文档结论，逐条给链接 | ≥ 3，另加文档链接 |

### T1 在域间轮换

不是永远 dsh 最深。每个域挑「这件事谁做得最有意思」当 T1。

| 域 | T1 | 为什么是它 |
| --- | --- | --- |
| 1 上下文装配 | dsh + pi | 两个极端：插件在运行时拼出来，对上只有一份可整体替换 |
| 2 缓存与成本 | dsh | 没有一行缓存代码却能一直命中，最反直觉，且本仓库有实测数字 |
| 3 上下文生命周期 | Codex | `memories` / `history` / `rollout` 三层分离，别家没分这么细 |
| 4 循环与模型层 | Gemini CLI | `routing` + `fallback` + `availability` 三个目录，多 provider 做得最完整 |
| 5 工具与能力面 | Codex | `apply-patch` / `file-system` / `file-search` / `file-watcher` 四 crate 拆分 |
| 6 shell 与 Code Mode | dsh + Codex | 唯二有 Code Mode 的，必须双深 |
| 7 审批与沙箱 | Codex | 四个沙箱后端 crate 加 `process-hardening`，唯一做到内核级 |
| 8 凭据与信任 | pi | `trust-manager` + `project-trust` + `output-guard`，唯一把信任建模成独立模块 |
| 9 会话与状态 | dsh | 事件日志加「模型可见 ⟺ 已记录」不变量，最干净的模型 |
| 10 扩展性 | dsh | Cordis 插件树，连 agent loop 自己都是插件 |
| 11 编排 | dsh + symphony | dsh 把 `workflow`/`jobs`/`schedule` 收进 harness，symphony 把它推到 harness 外面，正好两极 |
| 12 表面与协议 | Codex | `app-server` 摊了 6 个 crate，唯一把协议面做成一等公民 |
| 13 工程与可观测 | dsh | 219 个 `invariant.ts`、测试多于源码 |

T1 分布：dsh 6 次、Codex 5 次、pi 2 次、Gemini CLI 1 次、symphony 1 次。每家都至少当过一次主角。

### 深度由门禁保证

每篇 frontmatter 写死分级：

```yaml
depth: {dsh: T1, codex: T2, gemini: T2, pi: T2, claude: T3}
```

`check:coverage` 按级校验锚点数下限，T1 家的锚点不够就失败。另加一条：T1 家必须有至少一份真实产物，篇内代码块数不达标也失败。

「深入」因此是机器能验的东西，不是写完自我感觉良好。

### 修正后的工作量

| 项 | 锚点 |
| --- | --- |
| Part A 13 篇 | 约 1170 |
| Part B 4 篇 | 约 200 |
| `docs/deep` 5 篇（沿用现有 dsh 锚点） | 约 400 |
| 合计 | 约 1770 |

现有 1059 处，新增约 710 处，另有 396 处要复核修正。**P1 工期从 3 周修正为 5 到 6 周。** 按分级做是可完成的，不分级就做不完。

## 图：三层体系与 codex 的分工

正文现状是 21 篇、0 张图、0 个 mermaid 块，`assets/` 里唯一的 SVG 是 4 KB 的 logo。最干的是对照篇：80 行表格、零代码块，这直接违反了 `AGENTS.md` 第一条「先给读者看模型或进程真实看到的东西」。

图本身也会漂移，而 `check:anchors` 管不到图。所以按「能不能从源码生成」分三层。

| 层 | 内容 | 谁生成 | 怎么防漂移 |
| --- | --- | --- | --- |
| **L1 结构图** | 包与 crate 落位、协议拓扑 | `scripts/gen-diagrams.mjs` 从 checkout 目录树生成 mermaid 文本 | 新增 `check:diagrams`，重新生成不一致即失败 |
| **L2 机制图** | 时序、状态机、失效链 | 人画，mermaid inline | 讲机制不讲结构，上游改文件名不会让它错 |
| **L3 对照图** | 维度热力图、坐标图、耦合图 | `scripts/gen-matrix-svg.mjs` 从 `dimensions/*.yml` 渲染 | 数据源即矩阵，与正文同源 |

**codex 的分工**：L1 的价值在于确定性，而 LLM 不保证字节一致的重复输出，直接让 codex 生成 L1 会让 `check:diagrams` 永远失败。所以让 codex 写生成器，不让它生成图。

- L1：codex 一次性写出 `gen-diagrams.mjs`，之后图由脚本产出
- L2：codex 直接画，画完冻结入库，本来就不需要可重现
- L3：codex 写 `gen-matrix-svg.mjs` 的渲染逻辑并定美术风格，数据从 yml 来

`codex exec` 在非交互模式下仍会反问确认，提示词里要显式写「不要反问、不要征求确认、不要解释」，并用 `-s read-only` 或 `-s workspace-write`（这两个开关与 `--approve-for-me` 互斥）。

### 按域分配图型

不均摊，按每个域的难点定。

| 域 | 难点 | 主力图型 |
| --- | --- | --- |
| 1 上下文装配 | 顺序和归属 | L2 装配管线 + 五家并排的真实首轮请求 |
| 2 缓存与成本 | 什么时候塌 | L2 时序图，用本仓库实测的 85.7% → 0% → 81% |
| 3 上下文生命周期 | 砍哪段、什么时候 | L2 状态迁移 |
| 4 循环与模型层 | 并发与取消 | L2 状态机 + L1 provider 路由结构 |
| 5 工具与能力面 | 工具太多塞不下 | L1 工具层包结构 |
| 6 shell 与 Code Mode | 两种独立解法 | L1 双实现并置 |
| 7 审批与沙箱 | 边界画在哪 | L1 落位图 + L3 五家边界位置对照 |
| 8 凭据与信任 | 信任从哪来 | L2 首次运行流程 |
| 9 会话与状态 | 事件流形状 | L2 事件日志到 surface 投影 |
| 10 扩展性 | 挂载点在循环哪个位置 | L2 挂载点标注在 loop 上 |
| 11 编排 | 三层纵深 | L1 模型 → harness → 编排器 |
| 12 表面与协议 | 谁驱动谁 | L1 协议拓扑，Codex `app-server` 六 crate |
| 13 工程与可观测 | 怎么证明自己没坏 | L1 五家自证手段落位 + **L2 本仓库自己的门禁链** + L3 dsh 219 个 invariant 里只有 35 个真装了检查的分布 |
| Part B | 两种 harness 的耦合 | L3 耦合关系图 + harness × model 分数交叉 |

域 13 那张「本仓库自己的门禁链」有元层次的用处：讲自证的一篇，自己就是被 11 道门禁校验的，图里标出每道门禁挡住过什么真实错误（伪代码冒充源码、行号漂移、683 这个过期数字）。
