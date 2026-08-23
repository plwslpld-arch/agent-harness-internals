# 阶段 3B：Codex 主线实施计划

> **执行要求：** 当前任务内顺序执行，不调用 NVM。Codex 锁定仓库只作为源码证据，不修改上游 Checkout；当前应用中可见的能力不能反向覆盖锁定 Commit。每个模块先锁定源码、上游测试与 Claim，再写正文和中文图示；自动化门禁测试先行，每个任务完成后独立提交。

**目标：** 在 `docs/harnesses/codex/` 发布一条独立、连续、源码级且可核对的 Codex 课程，从一次真实 Turn 贯穿配置与上下文、Thread/Task/Turn、模型与工具循环、审批与多平台沙箱、Rollout 与恢复、扩展与 Code Mode、多智能体编排、多产品表面以及 Trace、Feedback 和独立评测接入。

**课程结构：**

| 序号 | 文件 | 核心问题 |
| --- | --- | --- |
| 00 | `README.md` | Rust 多 crate 运行时、一次真实 Turn 和各产品表面怎样连接？ |
| 01 | `01-config-prompt-context.md` | 配置、模型、Prompt、AGENTS 与 Context Fragment 怎样形成请求上下文？ |
| 02 | `02-thread-task-turn.md` | Thread、Task、Turn、Session 与内部状态分别承担什么生命周期？ |
| 03 | `03-model-tool-loop.md` | Responses 流、工具注册、并行执行、结果回传、重试和终止怎样闭环？ |
| 04 | `04-exec-policy-sandbox.md` | Exec Policy、审批、升级、文件、网络与进程沙箱怎样分层？ |
| 05 | `05-rollout-history-memory.md` | Rollout、History、Thread Store、恢复、Compaction 与 Memory 怎样协作？ |
| 06 | `06-extensions-code-mode.md` | Skill、Hook、Plugin、MCP、Connector 与 Code Mode 怎样扩展工具表面？ |
| 07 | `07-subagents-orchestration.md` | Subagent、协作模式、消息、等待、取消和线程图怎样形成编排？ |
| 08 | `08-surfaces-trace-eval-design.md` | CLI、TUI、App Server、Cloud、SDK、Trace、Telemetry、Feedback 和 Eval 怎样共享核心又保持语义边界？ |

## 全局约束

- 九篇均使用 `article_type: harness`、`harness: codex` 与锁定 Commit `c9b19deb09c1841ce7acc33ddb96276030936a29`。
- 每篇满足真实输入输出、至少三步调用链、源码证据、失败限制、验证方法和带答案自检。
- 主入口至少包含一张中文系统架构图和一张中文端到端 Turn 流程图；复杂模块按真实关系补充数据流图、状态图、时序图或安全边界图。
- 当前 Codex 应用、官方文档与锁定开源仓库是不同证据面。正文只对锁定源码作确定性实现结论；应用观察与官方文档另行标注。
- `Tool Registry`、MCP、Connector、Plugin、Skill 与 Code Mode 不因目录存在就视为默认启用；入口、Feature、配置、动态发现和授权分别核对。
- Exec Policy、审批、权限升级、文件系统策略、网络策略与平台执行后端分别描述；不把提示框或 policy 决策写成沙箱兑现。
- Rollout、Thread Store、History、模型 Context、Compaction 结果与长期 Memory 分开，不把可恢复等同于无损重放。
- Feedback、Telemetry 和 Rollout Trace 只作为观测或数据入口；没有 RewardAdapter、固定 Trial 和独立 Scorer 时，不称为训练奖励或发布 Eval。
- 图中自然语言使用中文；Codex、MCP、JSON-RPC、类型名、字段名和真实事件值可保留。
- 旧 A 系列和角色文章只作为待阶段 4 重审的背景材料，不直接搬入 Codex 主线，也不因已有 Codex 行号而继承发布状态。

---

### Task 1：建立 Codex 课程发布契约与证据地图

- [x] 新建本计划与 `evidence/claims/codex/evidence-map.yml`，为九篇课登记锁定源码、上游测试和计划 Claim。
- [x] 核对所有候选路径真实存在，并把配置、状态、执行、安全、扩展、编排、表面和评测风险分别登记。
- [x] 明确当前应用行为、官方文档与锁定开源实现不能互相替代。
- [x] 运行来源、元数据、内容与单元测试门禁。
- [x] 提交：`feat(codex): 建立主线计划与证据地图`。

### Task 2：发布 Codex 主线入口、系统架构和真实 Turn

- [ ] 新建 `docs/harnesses/codex/README.md`、系统架构图、端到端 Turn 图与入口 Claim。
- [ ] 从真实上游集成测试提取用户输入、Responses 流、工具调用、工具结果和最终事件，不用伪 API 冒充源码格式。
- [ ] 架构图覆盖配置、Thread、Session、模型客户端、工具路由、安全层、持久化和产品表面。
- [ ] 渲染两图，检查中文、窄屏、箭头、颜色和 Claim 绑定。
- [ ] 提交：`docs(codex): 发布主线入口与真实 Turn 全景`。

### Task 3：配置、Prompt、AGENTS 与 Context Fragment

- [ ] 完成 `01-config-prompt-context.md`、中文上下文装配图和配置/片段 Claim。
- [ ] 覆盖配置来源、模型选择、基础指令、AGENTS、线程级环境与有界 Context Fragment。
- [ ] 解释稳定前缀、缓存键、运行时更新、优先级冲突和超大上下文限制。
- [ ] 提交：`docs(codex): 发布配置提示与上下文课程`。

### Task 4：Thread、Task、Turn、Session 与内部状态

- [ ] 完成 `02-thread-task-turn.md`、中文生命周期图和状态边界 Claim。
- [ ] 覆盖 ThreadConfigSnapshot、Session、TurnContext、Task、Op/Event、暂停、取消和空闲。
- [ ] 分开持久身份、活动执行、单轮输入与界面任务状态，不从同名字段猜等价关系。
- [ ] 提交：`docs(codex): 发布线程任务与轮次课程`。

### Task 5：Responses、模型流与工具闭环

- [ ] 完成 `03-model-tool-loop.md`、中文时序图和工具结算 Claim。
- [ ] 覆盖请求构造、流事件、Tool Registry、Router、并行调用、有序结果、重试、取消和终止。
- [ ] 区分供应商重试、工具恢复、Turn 结算和 Eval Attempt。
- [ ] 提交：`docs(codex): 发布模型与工具闭环课程`。

### Task 6：Exec Policy、审批、升级与多平台 Sandbox

- [ ] 完成 `04-exec-policy-sandbox.md`、中文安全边界图和平台限定 Claim。
- [ ] 覆盖命令解析、Exec Policy、审批、升级、Linux、macOS、Windows、网络代理与进程边界。
- [ ] 记录 fail-closed、降级和未验证平台，不把 policy 允许写成实际隔离。
- [ ] 提交：`docs(codex): 发布执行策略与沙箱课程`。

### Task 7：Rollout、History、Thread Store、恢复、Compaction 与 Memory

- [ ] 完成 `05-rollout-history-memory.md`、中文状态与数据权威图和恢复 Claim。
- [ ] 覆盖 Rollout Item、历史视图、Thread Store、SQLite、resume/fork、Compaction 和长期 Memory。
- [ ] 明确原始记录、派生模型 Context、压缩摘要、线程元数据和记忆文件的权威关系。
- [ ] 提交：`docs(codex): 发布记录恢复与记忆课程`。

### Task 8：Skill、Hook、Plugin、MCP、Connector 与 Code Mode

- [ ] 完成 `06-extensions-code-mode.md`、中文扩展架构图和动态能力 Claim。
- [ ] 覆盖发现、加载、注入、工具目录变化、授权、生命周期与 Code Mode 生成表面。
- [ ] 解释扩展失败、Schema 限制、动态工具缓存、外部连接和代码运行权限继承。
- [ ] 提交：`docs(codex): 发布扩展与代码模式课程`。

### Task 9：Subagent、协作模式与多智能体编排

- [ ] 完成 `07-subagents-orchestration.md`、中文线程图与消息时序图和编排 Claim。
- [ ] 覆盖 spawn、send、follow-up、wait、interrupt、resume、通知、深度、身份和线程图持久关系。
- [ ] 分开应用任务、根 Thread、子 Thread、活动 Agent 与跨线程通信，不把并发数量当任务成功率。
- [ ] 提交：`docs(codex): 发布多智能体编排课程`。

### Task 10：产品表面、Trace、Telemetry、Feedback、Eval 与 crate 取舍

- [ ] 完成 `08-surfaces-trace-eval-design.md`、中文多表面与证据流图和表面/反馈 Claim。
- [ ] 覆盖 CLI、TUI、App Server、Cloud、SDK、协议映射、Rollout Trace、OTel 和 Feedback。
- [ ] 说明多 crate 边界的收益与成本，并给出固定 Trial、Artifact、Scorer 与独立发布门禁接法。
- [ ] 提交：`docs(codex): 发布产品表面与评测设计课程`。

### Task 11：正式导航与批量发布门禁

- [ ] README 与总入口把 Codex 更新为 `reviewed`，只新增 Codex 主线，不提前开放其余四条主线。
- [ ] 扩展导航门禁：Codex 九篇缺一或任一篇降级时，主线不得宣称完整。
- [ ] 修复受影响的附录、角色和研究记录链接；不创建旧路径兼容页。
- [ ] 运行链接、导航、内容、Claim、视觉和聚合检查。
- [ ] 提交：`docs(navigation): 开放 Codex 一级主线`。

### Task 12：阶段 3B 全量对抗复核

- [ ] 从已提交基线运行 Node 24 聚合检查和全部来源验证。
- [ ] 逐篇审计真实输入输出、调用链、源码锚点、默认条件、失败语义和自检答案。
- [ ] 打开全部 Codex 正式图，检查中文、截断、箭头、颜色依赖和证据绑定。
- [ ] 主动寻找：把当前应用外推到锁定源码、crate 目录冒充默认能力、审批折叠成沙箱、Context/Rollout/Memory 混同、Feedback 等同 Eval、协议 stop 状态互证。
- [ ] 修复全部高严重度发现，记录中低风险后续项。
- [ ] 新建阶段复核记录，勾选总路线阶段 3B，提交后再跑聚合检查。
- [ ] 提交：`chore(review): 完成阶段 3B Codex 主线复核`。

## 阶段完成证据

阶段 3B 只有同时满足以下条件才算完成：

1. Codex 主线入口和八篇课程均为 `reviewed`，内容契约与来源绑定通过。
2. 系统架构图、端到端 Turn 图和复杂模块图均为中文说明并经渲染复核。
3. 关键配置、状态、安全、恢复、扩展、编排、表面和评测 Claim 具有锁定证据与限定条件。
4. 当前应用、官方文档和锁定源码的证据边界没有被跨越。
5. README 与总入口只准确开放 DSH 和 Codex，不夸大其余主线状态。
6. Node 24 聚合检查、全部来源验证和阶段对抗复核通过，没有未解决高严重度发现。
