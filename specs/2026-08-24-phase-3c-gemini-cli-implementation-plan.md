# 阶段 3C：Gemini CLI 主线实施计划

> **执行要求：** 当前任务内顺序执行，不调用 NVM，不修改上游 Checkout。每个模块先锁定源码、上游测试与 Claim，再写正文和中文图示；自动化门禁测试先行，每个任务完成后独立提交。

**目标：** 在 `docs/harnesses/gemini-cli/` 发布一条独立、连续、源码级且可核对的 Gemini CLI 课程，从一次真实 Agent Session 贯穿配置与 GEMINI.md、Turn 与 Scheduler、工具生命周期、Confirmation/Policy/Safety/Sandbox、会话压缩、Agent 与扩展、多产品表面以及 Telemetry、错误与独立评测接入。

**架构：** 课程不照搬 Codex 的 Rust crate 划分，而按 Gemini CLI 的 TypeScript 责任边界组织：CLI 与 Core 负责入口和配置，Agent Session/Turn 解释模型流，Scheduler 管理工具状态，Confirmation Bus 与 Policy Engine 决定授权，Sandbox Manager 兑现隔离，记录和压缩服务管理派生状态，扩展系统改变运行时能力。Eval 仍是轨迹出口的横切层，不是内置工具循环的第二主线。

**技术栈：** Markdown、SVG、JSON 兼容 YAML、Node.js 24、仓库既有 Claim/内容/导航/视觉门禁。

**规格：** `specs/2026-08-23-agent-harness-internals-redesign.md`

## 课程结构

| 序号 | 文件 | 核心问题 |
| --- | --- | --- |
| 00 | `README.md` | CLI/Core、Agent Session、Turn、Scheduler 与产品表面怎样完成一次真实任务？ |
| 01 | `01-config-prompt-context.md` | Settings、环境、GEMINI.md、Prompt 与上下文资源怎样形成有效请求？ |
| 02 | `02-turn-scheduler-routing.md` | Agent Session、Turn、模型路由与 Scheduler 怎样决定继续、终止和工具批次？ |
| 03 | `03-tools-lifecycle.md` | Tool Registry、发现、校验、排队、并行执行和 Function Response 怎样闭环？ |
| 04 | `04-confirmation-policy-safety-sandbox.md` | Confirmation Bus、Policy、Safety、审批模式与平台 Sandbox 怎样分层？ |
| 05 | `05-session-history-compression-memory.md` | Session 记录、AgentChatHistory、恢复、压缩、Checkpoint 与 Memory 谁是权威？ |
| 06 | `06-agents-hooks-skills-mcp.md` | Agent/Subagent、Hook、Skill、MCP 与 Extension 怎样改变能力和编排边界？ |
| 07 | `07-surfaces-output-protocol.md` | 交互 CLI、Headless、IDE、A2A 与 JSON/stream-json 输出怎样投影核心事件？ |
| 08 | `08-telemetry-errors-eval-design.md` | Telemetry、错误分类、工具决定和独立 Eval 怎样关联又保持语义分离？ |

## 全局约束

- 九篇均使用 `article_type: harness`、`harness: gemini-cli` 与锁定 Commit `5411f113cafae26161b4969b0237b8e1e024e2c2`。
- 每篇满足真实输入输出、至少三步调用链、源码证据、失败限制、验证方法和 3 至 4 道带答案自检。
- 主入口至少包含中文系统架构图和中文端到端任务图；复杂模块分别补充状态图、时序图、安全边界图或证据流图。
- 目录、类或配置项存在不等于能力默认启用；必须核对加载优先级、信任、发现、注册、Policy、Confirmation 和执行后端。
- Confirmation、Policy、Safety 过滤与 Sandbox 是不同责任面；ASK_USER、ALLOW、DENY、审批模式和操作系统隔离不得合并为一个成功状态。
- Agent Session、Turn、Scheduler Tool Call、模型请求、CLI 交互轮次和 Eval Trial 分开计数；FinishReason 不跨表面自动等价。
- Session 记录、AgentChatHistory、模型可见 Context、Compression、Checkpoint 和 Memory 分开说明权威与有损边界。
- Telemetry、日志、工具接受率和用户交互只是观测输入；没有固定 Trial、Artifact、Scorer、RewardAdapter 与隔离 holdout 时，不称为训练奖励或发布 Eval。
- 图中自然语言使用中文；Gemini CLI、GEMINI.md、MCP、A2A、JSON、类型名、字段名和真实事件值可保留。
- 旧 A 系列只作为待阶段 4 重审的背景材料，不直接搬运，也不因已有 Gemini CLI 行号而继承发布状态。

---

### Task 1：建立 Gemini CLI 课程发布契约与证据地图

- [x] 新建本计划与 `evidence/claims/gemini-cli/evidence-map.yml`，为九篇课登记锁定源码、上游测试和计划 Claim。
- [x] 核对候选路径全部存在；把配置、路由、工具、安全、状态、扩展、表面和评测风险分别登记。
- [x] 运行 `node scripts/verify-sources.mjs --profile core`、Claim、内容与单元测试门禁。
- [x] 提交：`feat(gemini-cli): 建立主线计划与证据地图`。

### Task 2：发布主线入口、系统架构和真实任务

- [x] 扩展内容契约测试，要求 Gemini CLI 一级入口包含两张正式中文核心图、课程状态表和 Claim。
- [x] 新建 `README.md`、系统架构图、端到端任务图与入口 Claim，从 `legacy-agent-session.test.ts`、`turn.test.ts` 和 `scheduler.test.ts` 提取真实模型流、工具请求、结果回送与 Finished 边界。
- [x] 用上游真实字段给出输入输出，明确 Mock、平台、网络和模型不确定性边界；渲染并打开两图。
- [x] 运行内容、Claim、视觉、链接和聚合门禁。
- [x] 提交：`docs(gemini-cli): 发布主线入口与真实任务全景`。

### Task 3：Settings、GEMINI.md、Prompt 与 Context

- [x] 完成 `01-config-prompt-context.md`、中文上下文装配图和配置优先级/上下文 Claim。
- [x] 覆盖系统、用户、工作区与命令行设置，环境隔离、Folder Trust、GEMINI.md 发现、PromptProvider、工具 Schema 和上下文资源。
- [x] 验证缺失、冲突、超大文件、信任变化和动态设置；不把 Settings 文件存在写成有效运行配置。
- [x] 提交：`docs(gemini-cli): 发布配置提示与上下文课程`。

### Task 4：Agent Session、Turn、Routing 与 Scheduler

- [x] 完成 `02-turn-scheduler-routing.md`、中文生命周期图和继续/终止 Claim。
- [x] 覆盖 Agent Session、Turn.run、GeminiEvent、FinishReason、模型路由、Scheduler 队列、取消和中间 Finished 事件。
- [x] 分开模型响应结束、工具批次完成、Agent Session 结束、CLI 退出和 Eval Trial 结算。
- [x] 提交：`docs(gemini-cli): 发布轮次调度与路由课程`。

### Task 5：Tool Registry 与工具生命周期

- [x] 完成 `03-tools-lifecycle.md`、中文工具时序图和 Function Response Claim。
- [x] 覆盖内建/MCP/发现工具、声明与实例、参数校验、排队、确认等待、并行执行、取消、错误与结果回送。
- [x] 用 Scheduler 测试核对有序结果和终止工具，不把注册成功、调用接受或进程退出零写成任务成功。
- [x] 提交：`docs(gemini-cli): 发布工具生命周期课程`。

### Task 6：Confirmation、Policy、Safety 与 Sandbox

- [x] 完成 `04-confirmation-policy-safety-sandbox.md`、中文安全边界图和策略/隔离 Claim。
- [x] 覆盖 Message Bus、ASK_USER/ALLOW/DENY、交互与非交互默认策略、审批模式、受信目录、Safety 结束原因、Linux Bubblewrap、macOS profile 与容器边界。
- [x] 明确确认结果、策略判断、模型 Safety、工具校验和平台隔离不是同一机制；记录未验证平台与降级路径。
- [x] 提交：`docs(gemini-cli): 发布确认策略与沙箱课程`。

### Task 7：Session、History、Compression、Checkpoint 与 Memory

- [ ] 完成 `05-session-history-compression-memory.md`、中文数据权威图和压缩/恢复 Claim。
- [ ] 覆盖 ChatRecordingService、AgentChatHistory、客户端历史、恢复、Checkpoint、ChatCompressionService、GEMINI.md Memory 与工具写入。
- [ ] 分开追加记录、运行时投影、摘要替代、文件快照和持久知识；明确压缩自检仍是有损变换。
- [ ] 提交：`docs(gemini-cli): 发布会话压缩与记忆课程`。

### Task 8：Agent、Hook、Skill、MCP 与 Extension

- [ ] 完成 `06-agents-hooks-skills-mcp.md`、中文扩展与编排图和动态能力 Claim。
- [ ] 覆盖 AgentRegistry/AgentScheduler、远程子代理协议、Hook 计划与执行、Skill 发现/启用、MCP Client Manager 和 Extension 合并。
- [ ] 核对信任、优先级、加载失败、凭据、生命周期、工具表变化和子任务状态；目录存在不得冒充可用能力。
- [ ] 提交：`docs(gemini-cli): 发布智能体编排与扩展课程`。

### Task 9：交互 CLI、Headless、IDE、A2A 与输出协议

- [ ] 完成 `07-surfaces-output-protocol.md`、中文表面映射图和协议投影 Claim。
- [ ] 覆盖交互 UI、NonInteractiveCliAgentSession、IDE Client、A2A Server、text/json/stream-json 与退出码。
- [ ] 建立核心事件到各表面的保留、合并、重命名和丢失映射，不让某一表面的 cancelled/success 互证其他表面。
- [ ] 提交：`docs(gemini-cli): 发布产品表面与输出协议课程`。

### Task 10：Telemetry、错误分类与 Eval 接入

- [ ] 完成 `08-telemetry-errors-eval-design.md`、中文证据流图和遥测/评测边界 Claim。
- [ ] 覆盖请求、响应、Tool Call Decision、Hook、压缩、错误分类、采样、脱敏与导出器。
- [ ] 设计固定 Trial、Target surface、Artifact、Scorer、RewardAdapter 与独立 holdout；不把工具接受率、FinishReason 或 Telemetry 事件当发布门禁。
- [ ] 提交：`docs(gemini-cli): 发布遥测错误与评测设计课程`。

### Task 11：正式导航与批量发布门禁

- [ ] 先增加 Gemini CLI 九篇必需批次和零链接绕过失败测试；验证缺一、降级或不链接时均失败。
- [ ] README、总入口和 Gemini CLI 入口整批改为 `reviewed` 可点击链接，只开放前三条主线，不提前开放 Claude、pi、OpenCode。
- [ ] 修复受影响链接，不创建旧路径兼容页；运行链接、导航、内容、Claim、视觉和聚合检查。
- [ ] 提交：`docs(navigation): 开放 Gemini CLI 一级主线`。

### Task 12：阶段 3C 全量对抗复核

- [ ] 从已提交基线运行 Node 24 聚合检查和全部来源验证。
- [ ] 逐篇审计真实输入输出、调用链、源码锚点、默认条件、失败语义和自检答案。
- [ ] 打开全部 Gemini CLI 正式图，检查中文、截断、箭头、颜色依赖和证据绑定。
- [ ] 主动寻找：Settings 文件冒充有效配置、Finished 冒充任务成功、Confirmation 折叠成 Sandbox、Safety 与 Policy 混同、History/Compression/Memory 混同、Telemetry 或工具接受率等同 Eval、各表面 cancelled/success 互证。
- [ ] 修复全部高严重度发现，记录中低风险后续项；新建阶段复核记录并勾选总路线阶段 3C。
- [ ] 提交：`chore(review): 完成阶段 3C Gemini CLI 主线复核`。

## 阶段完成证据

1. Gemini CLI 主线入口和八篇课程均为 `reviewed`，内容契约与来源绑定通过。
2. 系统架构图、端到端任务图和复杂模块图均为中文说明并经渲染复核。
3. 配置、生命周期、工具、安全、状态、扩展、表面和评测 Claim 均具有锁定证据与限定条件。
4. Confirmation、Policy、Safety 与 Sandbox 没有被合并；Session、Context、Compression 与 Memory 没有被混写。
5. README 与总入口只准确开放 DSH、Codex 和 Gemini CLI。
6. Node 24 聚合检查、全部来源验证和阶段对抗复核通过，没有未解决高严重度发现。
