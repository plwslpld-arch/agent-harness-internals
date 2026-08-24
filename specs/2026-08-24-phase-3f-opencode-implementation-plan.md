# 阶段 3F：OpenCode 主线实施计划

> **给智能体执行者：** 使用 `superpowers:executing-plans` 在当前任务内逐项执行；不分派子代理。每个步骤完成后更新复选框，并在阶段末进行独立对抗复核。

**目标：** 发布一条以 Agent Harness 为主、覆盖 OpenCode 的入口装配、Provider、Session Loop、工具权限、历史恢复、扩展编排、Server/Protocol/SDK、多客户端表面、分享与评测边界的九篇中文课程。

**架构：** 课程以 `Project/Config -> Provider -> Session Prompt -> LLM Stream -> Processor -> Tool/Permission -> Message/Artifact` 为任务主链，再把存储、Compaction、Plugin/MCP/LSP、Server/Protocol/SDK、TUI/Desktop/Web/ACP 和 Share/Telemetry 作为横切表面展开。工作区包名、API 路由、客户端成功或遥测 Span 都不能直接升级为任务正确或发布通过。

**技术栈：** Markdown、SVG、JSON 兼容 YAML、Node.js 24 标准库、Sharp 渲染、Git submodule 锁定源码。

**锁定来源：** OpenCode `3a31c4ea801915c0b050df4b3842997ea62b6e93`。

## 全局约束

- 全部正文与图中自然语言使用中文；OpenCode、Provider、Session、LLM、Tool、MCP、LSP、ACP、SDK、TUI、API、SSE、JSON 和代码标识符可保留。
- 现行 Effect 服务、兼容桥接、旧版命名空间、未来迁移标记和外部客户端分别核对；包或类型存在不证明默认路径已经调用。
- 默认权限规则、Agent 规则、一次性批准、拒绝、外部目录与操作系统隔离分开；权限询问不等于沙箱。
- Session 数据库、模型可见消息、Compaction 摘要、Snapshot/Revert 与 Share 副本保持不同权威边界。
- `test`、Telemetry 与 Share 是质量证据输入，不是仓库内建独立 Scorer、训练 RewardAdapter 或发布门禁。
- 不运行 NVM，不调用真实 Provider，不使用密钥或付费模型；未执行的外部表面和生产部署不写成成功。
- 九篇课程全部达到 `reviewed` 后才整批进入正式导航；扩展样本不得提前开放。

## 文件结构

| 文件 | 单一责任 |
| --- | --- |
| `docs/harnesses/opencode/README.md` | 系统分层、一次真实任务、证据边界和九篇导航。 |
| `01-runtime-project-config-provider.md` | CLI/Project/Instance、配置合并、Provider 与模型可用条件。 |
| `02-session-prompt-llm-processor.md` | Prompt 装配、LLM Stream、Processor、工具回合和终止。 |
| `03-tools-permission-question-patch.md` | Tool Registry、Permission、Question、Patch、外部目录与副作用。 |
| `04-storage-history-compaction-revert.md` | 数据库消息、分页、Context 转换、Compaction、Snapshot/Revert。 |
| `05-agents-skills-plugins-mcp-lsp.md` | Agent/Subagent、Skill、Command、Plugin、MCP 与 LSP 编排。 |
| `06-server-protocol-sdk-events.md` | Protocol Group、Server Handler、中间件、SSE Event 与 SDK。 |
| `07-tui-desktop-web-acp-surfaces.md` | CLI Run/TUI、Desktop/Web、ACP 与其他客户端投影。 |
| `08-share-telemetry-eval-boundaries.md` | Share、Telemetry、测试证据、Artifact、外部 Scorer 与发布链。 |
| `assets/diagrams/opencode/*.svg` | 两张核心图与八篇复杂机制中文图。 |
| `evidence/claims/opencode*.yml` | 可核对结论与限定条件。 |
| `evidence/claims/opencode/evidence-map.yml` | 九篇证据清单和高风险误读。 |
| `evidence/reviews/2026-08-24-phase-3f-opencode.yml` | 阶段复核记录。 |

### Task 1：锁定模块与证据边界

- [x] 新增 OpenCode 一级入口失败契约：必须声明服务化主链、权限不等于沙箱、测试/遥测/分享不等于独立评测，并引用两张图和至少两个 Claim。
- [x] 创建九篇证据地图，登记源码、上游测试、表面边界和高风险误读。
- [x] 运行目标测试、来源、许可证、敏感信息和聚合门禁并提交：`test(opencode): 锁定模块与证据边界`。

### Task 2：发布主线入口

- [x] 创建入口、系统架构图、端到端任务图及两条架构 Claim。
- [x] 明确服务化核心、多表面投影、默认权限与 Eval 出口。
- [x] 渲染复核并提交：`docs(opencode): 发布服务化源码主线入口`。

### Task 3：入口、项目、配置与 Provider

- [x] 创建课程、图和 Claim；覆盖 CLI、Project/Instance、配置合并、认证、Provider、模型目录与运行可用条件。
- [x] 提交：`docs(opencode): 发布入口配置与模型服务课程`。

### Task 4：Session Prompt、LLM 与 Processor

- [x] 创建课程、状态图和 Claim；覆盖消息装配、流事件、工具状态、循环、重试、压缩与终止。
- [x] 提交：`docs(opencode): 发布会话循环与流处理课程`。

### Task 5：工具、权限、询问与补丁

- [x] 创建课程、决策图和 Claim；区分工具注册、模型可见、规则匹配、用户答复、执行、外部目录和 OS 隔离。
- [x] 提交：`docs(opencode): 发布工具权限与副作用课程`。

### Task 6：存储、历史、压缩与恢复

- [x] 创建课程、数据流图和 Claim；区分数据库历史、模型消息、摘要、裁剪、Snapshot、Revert 与 Artifact。
- [x] 提交：`docs(opencode): 发布历史压缩与恢复课程`。

### Task 7：Agent、Skill、Plugin、MCP 与 LSP

- [x] 创建课程、架构图和 Claim；覆盖 Agent 权限、Task/Subagent、Skill/Command、Plugin Hook、MCP Tool/Resource 与 LSP。
- [x] 提交：`docs(opencode): 发布扩展编排课程`。

### Task 8：Server、Protocol、SDK 与 Event

- [x] 创建课程、时序图和 Claim；覆盖 Protocol Group、Middleware、Server Handler、SSE、SDK 与错误分层。
- [x] 提交：`docs(opencode): 发布服务协议与事件课程`。

### Task 9：TUI、Desktop、Web 与 ACP 表面

- [x] 创建课程、表面图和 Claim；区分共享核心、各客户端状态投影、进程/网络边界和任务结果。
- [x] 提交：`docs(opencode): 发布多客户端表面课程`。

### Task 10：Share、Telemetry 与 Eval 边界

- [x] 创建课程、数据契约图和 Claim；覆盖 Share、OpenTelemetry、测试证据、Trial/Attempt、Artifact、外部 Scorer、RewardAdapter、Checkpoint 与独立 Holdout。
- [x] 提交：`docs(opencode): 发布分享遥测与评测边界课程`。

### Task 11：原子导航发布

- [x] 新增 OpenCode 九篇缺失、降级和零链接失败测试。
- [x] 一次性更新根入口、总入口和 OpenCode 入口为第六条正式主线，扩展样本保持无链接。
- [x] 完整门禁通过并提交：`docs(navigation): 开放 OpenCode 一级主线`。

### Task 12：阶段 3F 全量对抗复核

- [x] 从已提交基线运行 Node 24 聚合检查与全部来源验证。
- [x] 逐篇审计真实输入输出、调用链、源码锚点、能力条件、失败语义和自检答案。
- [x] 打开十张正式图，检查中文、截断、箭头、颜色依赖、包边界和证据绑定。
- [x] 主动寻找：包名冒充调用、模型目录冒充可用、权限询问冒充沙箱、消息投影冒充原始历史、摘要冒充无损历史、连接或 SSE 冒充任务成功、客户端表面冒充核心能力、Share/Telemetry/Test 冒充独立 Eval。
- [x] 修复高优先级发现，记录剩余风险，勾选总路线 3F 并提交：`chore(review): 完成阶段 3F OpenCode 主线复核`。
