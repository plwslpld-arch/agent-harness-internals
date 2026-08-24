# 阶段 3D：Claude 主线实施计划

> **给智能体执行者：** 必须使用 `superpowers:executing-plans` 在当前任务中逐项执行；本仓库明确采用内联执行，不分派子代理。每个步骤完成后更新复选框，并在阶段末进行独立对抗复核。

**目标：** 发布一条以 Agent Harness 为主、严格区分 Claude Code 官方公开契约、Python Agent SDK 可见源码和 TypeScript Agent SDK 公开分发边界的九篇中文课程。

**架构：** 课程不假装 Claude Code 已开源，也不把 Python SDK 的控制协议实现外推为 Claude Code 内部实现。Python SDK 负责可直接核对的 Transport、Control Protocol、Message、Session Store、MCP、Hook 与权限回调；TypeScript 仓库只按锁定版本中真实存在的 README、CHANGELOG、Session Store 示例和官方 API 文档描述公开契约。Eval 是横切验证链，独立于产品成功、SDK Result 与反馈数据。

**技术栈：** Markdown、SVG、JSON 兼容 YAML、Node.js 24 标准库、Sharp 渲染、Git submodule 锁定源码、Anthropic 官方公开文档。

**规格：** `specs/2026-08-23-agent-harness-internals-redesign.md`

## 全局约束

- 全部正文与图中自然语言使用中文；Claude Code、Agent SDK、Python、TypeScript、MCP、JSON、API、类名、字段名和真实协议值可保留。
- Claude Code 闭源实现只使用官方公开文档描述外部契约，不从 SDK、行为经验或当前应用反推内部类、存储和调度机制。
- Python SDK 锁定 `542fefb3b94be87760b2513fff889b91bb5b6672`；TypeScript SDK 锁定 `48275071e804139579fabada9bb8d90cfe02b062`。
- TypeScript 锁定仓库没有 SDK 主体源码；不得把 README、CHANGELOG 或 Session Store 示例伪装成完整 TypeScript Runtime 源码。
- 不运行 NVM；仓库门禁使用 Node 24。Python 上游测试只在锁定依赖可用且不会修改公共环境时运行，不能运行就维持 B/C/D 级边界。
- 公开正文不出现本机绝对路径、私有会话、凭据或未经授权材料。
- 九篇课程全部达到 `reviewed` 后才整批进入正式导航；pi、OpenCode 与扩展样本不得提前开放。

---

## 文件结构

| 文件 | 单一责任 |
| --- | --- |
| `docs/harnesses/claude/README.md` | 双 SDK 与闭源产品边界、系统架构、入口任务和九篇课程导航。 |
| `docs/harnesses/claude/01-evidence-product-sdk-boundaries.md` | 官方产品契约、SDK 可见实现、分发与许可证证据边界。 |
| `docs/harnesses/claude/02-python-entry-transport-control.md` | Python query/client、CLI 子进程 Transport、双向控制协议与清理。 |
| `docs/harnesses/claude/03-messages-stream-lifecycle.md` | 消息类型、初始化、输入流、Result、取消与错误生命周期。 |
| `docs/harnesses/claude/04-tools-permissions-hooks.md` | 工具可用性、allowed/disallowed、permission mode、can_use_tool 与 Hook。 |
| `docs/harnesses/claude/05-sessions-resume-store.md` | Session ID、continue/resume/fork、Transcript Mirror、Session Store 与并发语义。 |
| `docs/harnesses/claude/06-mcp-agents-skills.md` | 进程内/外部 MCP、子智能体定义、Skill 与能力装配。 |
| `docs/harnesses/claude/07-typescript-contract-parity.md` | TypeScript 公开 API、CHANGELOG、Session Store 示例与 Python 对齐边界。 |
| `docs/harnesses/claude/08-surfaces-errors-eval-design.md` | 单次 query、交互 Client、SDK Result、错误、遥测/反馈与独立 Eval。 |
| `assets/diagrams/claude/*.svg` | 系统架构、端到端任务及每篇复杂关系的中文图。 |
| `evidence/claims/claude.*.yml` | 公开结论、锁定版本、证据等级、限制与反例。 |
| `evidence/claims/claude/evidence-map.yml` | 九篇证据清单、官方文档来源和高风险误读。 |
| `evidence/reviews/2026-08-24-phase-3d-claude.yml` | 阶段承诺、证据、发现、修复和最终命令。 |

### Task 1：先锁定双 SDK 真实可见范围

**文件：**
- 创建：`evidence/claims/claude/evidence-map.yml`
- 修改：`sources/sources.yml`
- 修改：`scripts/tests/content-contract.test.mjs`

**接口：**
- 消费：双 SDK Lock、许可证和 Anthropic 官方文档。
- 产出：九篇课程的源码/测试/官方文档证据表与 Claude 一级入口内容契约。

- [x] 写失败测试：Claude 一级入口必须有双边界声明、两张核心中文图、课程状态表和至少两条 Claim。
- [x] 运行测试并确认现有契约未阻止 Claude 入口丢失边界而失败。
- [x] 登记 Python SDK 主体源码、测试、TypeScript 仓库可见文件和官方文档；明确 TypeScript 主体源码 unavailable。
- [x] 运行来源、许可证、内容和敏感信息门禁。
- [x] 提交：`test(claude): 锁定双 SDK 证据边界`。

### Task 2：发布 Claude 主线入口

**文件：**
- 创建：`docs/harnesses/claude/README.md`
- 创建：`assets/diagrams/claude/system-architecture.svg`
- 创建：`assets/diagrams/claude/end-to-end-task.svg`
- 创建：`evidence/claims/claude.architecture.product-sdk-boundaries.yml`
- 创建：`evidence/claims/claude.task.transport-control-loop.yml`
- 修改：`assets/diagrams/manifest.yml`

- [x] 用官方产品契约、Python SDK query/client 和 TypeScript 公开包入口解释真实调用链。
- [x] 图示分开应用进程、SDK、捆绑或指定 Claude Code CLI、模型服务、工具/文件系统、Session Store 与 Eval 出口。
- [x] 渲染两图，检查中文、箭头、截断、专名和闭源边界。
- [x] 运行内容、Claim、视觉、链接和聚合检查。
- [x] 提交：`docs(claude): 发布双边界源码主线入口`。

### Task 3：产品、SDK 与许可证证据边界

**文件：**
- 创建：`docs/harnesses/claude/01-evidence-product-sdk-boundaries.md`
- 创建：`assets/diagrams/claude/01-evidence-product-sdk-boundaries.svg`
- 创建：`evidence/claims/claude.evidence.closed-product-not-inferred-from-sdk.yml`
- 创建：`evidence/claims/claude.evidence.typescript-runtime-source-unavailable.yml`

- [x] 分开官方文档事实、Python 实现事实、TypeScript 公开契约、Session Store 示例和未知内部机制。
- [x] 解释两仓许可证条款不同，不用任一仓库许可证覆盖另一个仓库或 Claude Code 产品。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布产品与 SDK 证据边界课程`。

### Task 4：Python 入口、Transport 与控制协议

**文件：**
- 创建：`docs/harnesses/claude/02-python-entry-transport-control.md`
- 创建：`assets/diagrams/claude/02-python-entry-transport-control.svg`
- 创建：`evidence/claims/claude.python.transport-owns-cli-process.yml`
- 创建：`evidence/claims/claude.python.control-protocol-is-bidirectional.yml`

- [x] 覆盖 query、ClaudeSDKClient、InternalClient、SubprocessCLITransport、NDJSON、initialize、Control Request/Response 和关闭清理。
- [x] 核对 CLI 发现、捆绑版本、custom cli_path、环境、stderr、缓冲、超时与取消。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布 Python 传输与控制协议课程`。

### Task 5：消息流与生命周期

**文件：**
- 创建：`docs/harnesses/claude/03-messages-stream-lifecycle.md`
- 创建：`assets/diagrams/claude/03-messages-stream-lifecycle.svg`
- 创建：`evidence/claims/claude.messages.result-is-protocol-terminal.yml`
- 创建：`evidence/claims/claude.lifecycle.close-and-cancel-are-distinct.yml`

- [x] 覆盖 SystemMessage、UserMessage、AssistantMessage、StreamEvent、ResultMessage、RateLimitEvent 和未知消息过滤。
- [x] 分开一条响应、输入流结束、Result、SDK 迭代器结束、进程退出、取消和 Eval 通过。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布消息流与生命周期课程`。

### Task 6：工具、权限与 Hook

**文件：**
- 创建：`docs/harnesses/claude/04-tools-permissions-hooks.md`
- 创建：`assets/diagrams/claude/04-tools-permissions-hooks.svg`
- 创建：`evidence/claims/claude.permissions.allowed-tools-are-not-availability.yml`
- 创建：`evidence/claims/claude.hooks.can-modify-or-deny.yml`

- [x] 建立工具可用性、allowed/disallowed、permission mode、can_use_tool、PermissionUpdate、Hook 和最终执行的分层图。
- [x] 覆盖 bypassPermissions 安全前提、回调互斥条件、updated_input、interrupt 与 PreToolUse 决定。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布工具权限与钩子课程`。

### Task 7：Session、恢复与外部 Store

**文件：**
- 创建：`docs/harnesses/claude/05-sessions-resume-store.md`
- 创建：`assets/diagrams/claude/05-sessions-resume-store.svg`
- 创建：`evidence/claims/claude.sessions.resume-materializes-external-state.yml`
- 创建：`evidence/claims/claude.sessions.mirror-is-not-runtime-history.yml`

- [x] 覆盖 session_id、continue_conversation、resume、fork_session、resume_session_at、Session Store 协议、临时配置目录和凭据清理。
- [x] 核对 Transcript Mirror 批次、flush 模式、CAS/版本、并发、失败回报和不同 Store 示例边界。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布会话恢复与存储课程`。

### Task 8：MCP、Agent 与 Skill 装配

**文件：**
- 创建：`docs/harnesses/claude/06-mcp-agents-skills.md`
- 创建：`assets/diagrams/claude/06-mcp-agents-skills.svg`
- 创建：`evidence/claims/claude.mcp.sdk-tools-run-in-process.yml`
- 创建：`evidence/claims/claude.extensions.configuration-is-not-execution.yml`

- [x] 覆盖进程内 SDK MCP Bridge、外部 stdio/SSE/HTTP Server、工具命名、AgentDefinition、skills、memory、maxTurns 和权限模式。
- [x] 明确 Agent、Skill 和 MCP 配置只证明初始化输入，不能证明 Claude Code 内部注册算法或真实执行成功。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布 MCP 与智能体装配课程`。

### Task 9：TypeScript 公开契约与双 SDK 对齐

**文件：**
- 创建：`docs/harnesses/claude/07-typescript-contract-parity.md`
- 创建：`assets/diagrams/claude/07-typescript-contract-parity.svg`
- 创建：`evidence/claims/claude.typescript.public-contract-is-not-runtime-source.yml`
- 创建：`evidence/claims/claude.sdks.parity-must-be-versioned.yml`

- [x] 从官方 API、README、CHANGELOG 和 Session Store 示例提取 TypeScript 公开契约；禁止写不存在的本地源码行号。
- [x] 建立 Python/TypeScript 对齐表：query/client、消息、权限、Hook、MCP、Session Store、版本与未知项；相似命名不作为实现同构证明。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布 TypeScript 契约与双 SDK 对齐课程`。

### Task 10：产品表面、错误与独立 Eval

**文件：**
- 创建：`docs/harnesses/claude/08-surfaces-errors-eval-design.md`
- 创建：`assets/diagrams/claude/08-surfaces-errors-eval-design.svg`
- 创建：`evidence/claims/claude.surfaces.query-client-cli-are-not-equivalent.yml`
- 创建：`evidence/claims/claude.eval.requires-artifact-scorer.yml`
- 创建：`evidence/claims/claude.feedback.is-not-training-or-release-reward.yml`

- [x] 覆盖单次 query、双向 Client、CLI 子进程、消息投影、CLIConnection/Process/JSONDecode 错误、stderr、Result subtype 和取消。
- [x] 设计 Dataset、固定 Trial、Target surface、Artifact、Scorer、RewardAdapter、Checkpoint 与隔离 holdout；反馈和 code acceptance 只作原始信号。
- [x] 渲染复核，运行门禁并提交：`docs(claude): 发布表面错误与评测设计课程`。

### Task 11：原子导航发布

**文件：**
- 修改：`scripts/check-navigation.mjs`
- 修改：`scripts/tests/navigation.test.mjs`
- 修改：`README.md`
- 修改：`docs/00-start-here.md`
- 修改：`docs/harnesses/claude/README.md`

- [ ] 先增加 Claude 九篇缺失、降级和零链接绕过失败测试。
- [ ] 一次性把 Claude 九篇改为已复核链接；根入口和总入口只新增第四条主线，pi 与 OpenCode 保持提纲无链接。
- [ ] 运行导航、链接、内容、Claim、视觉和聚合检查。
- [ ] 提交：`docs(navigation): 开放 Claude 一级主线`。

### Task 12：阶段 3D 全量对抗复核

**文件：**
- 创建：`evidence/reviews/2026-08-24-phase-3d-claude.yml`
- 创建：`evidence/reviews/phase-3d-claude-contact-sheet.png`
- 修改：`specs/2026-08-23-agent-harness-internals-program-plan.md`
- 修改：本计划复选框

- [ ] 从已提交基线运行 Node 24 聚合检查和 `--profile all` 来源验证。
- [ ] 逐篇审计真实输入输出、调用链、源码或官方文档锚点、能力条件、失败语义和自检答案。
- [ ] 打开十张正式图，检查中文、截断、箭头、颜色依赖、闭源边界和证据绑定。
- [ ] 主动寻找：SDK 反推 Claude Code、TypeScript 文档冒充源码、allowed_tools 冒充工具可用性、Result 冒充任务成功、Session Mirror 冒充运行历史、反馈冒充 Reward/Eval、双 SDK 同名冒充实现一致。
- [ ] 修复全部高优先级发现，记录中低风险；创建阶段复核记录并勾选总路线 3D。
- [ ] 提交：`chore(review): 完成阶段 3D Claude 主线复核`。

## 阶段完成证据

1. Claude 入口与八篇课程均为 reviewed，并且每篇明示 Claude Code、Python SDK、TypeScript SDK 中哪一层提供证据。
2. 十张中文图均标出闭源边界，不画出没有公开证据的 Claude Code 内部模块。
3. Python 源码结论绑定锁定行号与上游测试；TypeScript 只使用真实可见仓库文件和官方 API 文档。
4. 工具配置、权限决定、Hook、MCP、Session、Result、反馈和 Eval 没有被合并。
5. 根入口与总入口只开放 DSH、Codex、Gemini CLI、Claude，pi 与 OpenCode 仍无正式链接。
6. Node 24 聚合检查、全部来源验证和阶段对抗复核通过，无未解决高优先级发现。
