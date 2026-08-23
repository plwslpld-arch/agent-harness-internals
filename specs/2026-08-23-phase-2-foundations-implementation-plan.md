# 阶段 2：共同基础课程实施计划

> **执行要求：** 当前会话内按任务顺序执行。每篇文章先锁定证据与 Claim，再写正文和图示；自动化变更测试先行，正式图示必须渲染复核，每篇独立提交并完成局部反向检查。

**目标：** 发布六篇可独立理解、能够支撑六条项目主线的共同基础课程，让读者先掌握边界、一次任务、模型与工具数据、执行安全、会话上下文以及 Eval 接入，而不把共同概念写成项目名词表或两套并列百科。

**架构：** 六篇文章位于 `docs/foundations/`，状态均达到 `reviewed`。每篇至少绑定两类锁定证据、引用一条正式 Claim、包含一张中文 SVG，并使用共同结构：读者会得到什么、核心概念、最小例子、常见误区、验证方法和自检。关键结论进入 `evidence/claims/`；图示登记到统一 Manifest；README 和总入口只在全部验收后一次开放导航。

**技术栈：** Markdown、零依赖 SVG、JSON 兼容 YAML、Node.js 24、ES Modules、`node:test`、锁定 Git Checkout。

**规格：** `specs/2026-08-23-agent-harness-internals-redesign.md`

## 六篇课程

| 序号 | 文件 | 课程题目 | 核心产物 |
| --- | --- | --- | --- |
| 1 | `docs/foundations/01-boundaries.md` | Agent Harness 的职责与边界 | 四层归因图：模型、Harness、环境、Eval |
| 2 | `docs/foundations/02-agent-turn.md` | 一次真实 Agent Turn | 从用户目标到终止或继续循环的时序图 |
| 3 | `docs/foundations/03-model-tool-io.md` | 模型输入、输出与工具结果 | 内容块、工具调用和结果回送的数据流图 |
| 4 | `docs/foundations/04-tools-permissions-sandbox.md` | 工具、执行环境、权限与沙箱 | 能力、决策、隔离和副作用的安全边界图 |
| 5 | `docs/foundations/05-session-context-memory.md` | Session、Context、Compaction 与 Memory | 持久状态和临时上下文的生命周期图 |
| 6 | `docs/foundations/06-trace-feedback-eval.md` | Trace、Feedback 与评测接入 | Trial、Attempt、Artifact、Scorer 与反馈闭环图 |

## 全局约束

- 全部可见自然语言和图中文字使用中文；产品、协议、代码标识符可保留原文。
- 六篇共同基础只解释共同抽象，不用浅层矩阵替代六条项目主线。
- 不把某个项目的术语强行定义为通用标准；出现项目例子时写清锁定版本和适用范围。
- 每篇至少 2600 个解释性字符、10 个有效段落、一个真实最小例子、3 至 4 道带答案自检题。
- 每篇至少一张正式中文 SVG；箭头、边界和图例必须表达语义，颜色不是唯一编码。
- 每篇至少引用一个 `Claim:`；安全、终止、失败、默认行为和评测语义必须进入 Claim 注册表。
- C/B/A 级结论的源码证据必须锁定 Commit、路径、行号和摘录；D 级必须写出推断链；未知保持 U。
- 同一执行流程的反向检查只能称为对抗复核，不能冒充独立外部评审或多模型共识。
- 不调用 NVM；所有验证使用当前 Node 24。

---

### Task 1：强化共同基础内容契约并建立证据清单

**文件：**

- 修改：`scripts/check-content-contract.mjs`
- 修改：`scripts/tests/content-contract.test.mjs`
- 新建：`evidence/claims/foundations/evidence-map.yml`
- 修改：`specs/2026-08-23-phase-2-foundations-implementation-plan.md`

- [ ] 先写失败测试：`reviewed` 基础课少于 2600 字、10 段、正式中文 SVG 或 `Claim:` 引用时必须失败。
- [ ] 运行测试并确认现有契约不足以阻断这些反例。
- [ ] 最小升级 foundation 内容契约，不影响 Harness、角色、实验和附录规则。
- [ ] 从 12 个锁定来源中建立六篇文章的候选源码、上游测试、官方文档和实验清单；只记录真实存在的路径。
- [ ] 对每篇至少准备两个不同证据面，并标注哪些只能支持项目例子、哪些可以支撑共同抽象。
- [ ] 反向检查证据清单是否把单个实现扩大成行业通则，或把文件名当成行为证明。
- [ ] 提交：`feat(foundations): 建立共同基础内容与证据契约`。

### Task 2：职责与边界

**文件：**

- 新建：`docs/foundations/01-boundaries.md`
- 新建：`assets/diagrams/foundations/01-boundaries.svg`
- 新建：`evidence/claims/foundation.boundaries.four-layers.yml`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`evidence/claims/foundations/evidence-map.yml`

- [ ] 锁定模型、Harness、环境和 Eval 四层边界的直接证据与明确推断。
- [ ] 写失败反例：只换模型、只换 Harness、只换环境或只换 Scorer 时，哪些结论不能归因。
- [ ] 完成四层归因图并渲染检查窄屏、深浅背景和箭头方向。
- [ ] 正文解释非目标：Harness 不是模型、Eval 不是第二个 Agent、环境不是 Sandbox 的同义词。
- [ ] 注册关键 Claim；若四层联合归因属于跨证据推断，使用 D 而不是伪装成 C。
- [ ] 运行元数据、Claim、内容、视觉、链接和文风检查。
- [ ] 提交：`docs(foundations): 发布 Agent Harness 职责与边界`。

### Task 3：一次真实 Agent Turn

**文件：**

- 新建：`docs/foundations/02-agent-turn.md`
- 新建：`assets/diagrams/foundations/02-agent-turn.svg`
- 新建：`evidence/claims/foundation.turn.continue-or-stop.yml`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`evidence/claims/foundations/evidence-map.yml`

- [ ] 选择至少两个主线实现的真实循环入口和终止路径，分别核对源码与测试。
- [ ] 用一个真实最小输入展示内容回复、工具调用、结果回送、继续循环和最终终止。
- [ ] 区分模型响应、Harness Turn、工具执行 Attempt 和完整任务 Run，不混用统计单位。
- [ ] 绘制时序图，明确哪些箭头由模型触发、哪些由 Harness 决策、哪些是外部副作用。
- [ ] 注册继续或终止语义 Claim，并把平台或模式条件写入限定字段。
- [ ] 运行全部局部门禁和渲染复核。
- [ ] 提交：`docs(foundations): 发布一次真实 Agent Turn`。

### Task 4：模型输入、输出与工具结果

**文件：**

- 新建：`docs/foundations/03-model-tool-io.md`
- 新建：`assets/diagrams/foundations/03-model-tool-io.svg`
- 新建：`evidence/claims/foundation.io.tool-result-reentry.yml`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`evidence/claims/foundations/evidence-map.yml`

- [ ] 核对至少两种实现中 System/Developer/User 内容、工具 Schema、工具调用和工具结果的真实数据结构。
- [ ] 给出一组可读 JSON 输入、工具调用和工具结果，解释身份、调用 ID、顺序和错误字段。
- [ ] 说明流式增量、最终消息、结构化内容块和协议适配的边界，避免把某个 Provider 格式当成通用格式。
- [ ] 绘制数据流图，显示序列化、Provider 适配、工具执行和结果重新进入上下文的位置。
- [ ] 注册工具结果必须关联并重新进入模型上下文的限定 Claim。
- [ ] 运行全部局部门禁和渲染复核。
- [ ] 提交：`docs(foundations): 发布模型与工具数据契约`。

### Task 5：工具、执行环境、权限与沙箱

**文件：**

- 新建：`docs/foundations/04-tools-permissions-sandbox.md`
- 新建：`assets/diagrams/foundations/04-tools-permissions-sandbox.svg`
- 新建：`evidence/claims/foundation.security.permission-is-not-sandbox.yml`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`evidence/claims/foundations/evidence-map.yml`

- [ ] 分别锁定工具暴露、参数校验、策略决策、用户审批、OS/容器隔离和真实副作用的证据。
- [ ] 用一个危险命令例子展示“工具存在”“策略允许”“用户批准”“Sandbox 可执行”四个条件如何组合。
- [ ] 明确权限提示不是隔离，Sandbox 不是授权，Hook 也不能自动等于安全边界。
- [ ] 绘制四层安全边界图，并对默认、可选、扩展、外部和未知能力使用文字标签。
- [ ] 注册“权限决策不等于沙箱隔离”Claim；如果是跨实现抽象，使用 D 并列出证据链。
- [ ] 运行全部局部门禁和渲染复核。
- [ ] 提交：`docs(foundations): 发布工具权限与沙箱基础`。

### Task 6：Session、Context、Compaction 与 Memory

**文件：**

- 新建：`docs/foundations/05-session-context-memory.md`
- 新建：`assets/diagrams/foundations/05-session-context-memory.svg`
- 新建：`evidence/claims/foundation.state.session-context-separation.yml`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`evidence/claims/foundations/evidence-map.yml`

- [ ] 为 Session 身份、持久事件、单次请求 Context、压缩摘要、外部 Memory 和恢复点分别寻找直接证据。
- [ ] 用一次长会话例子展示原始事件仍存在、请求上下文被重建或压缩、恢复后副作用不能重复的条件。
- [ ] 说明 Compaction 的信息损失、Cache 前缀变化和 Memory 检索不确定性，不把三者混成同一个“记忆”。
- [ ] 绘制状态生命周期图，区分持久存储、派生上下文和外部记忆。
- [ ] 注册 Session 与 Context 分离的限定 Claim，并保留无法跨项目统一的字段。
- [ ] 运行全部局部门禁和渲染复核。
- [ ] 提交：`docs(foundations): 发布会话上下文与记忆基础`。

### Task 7：Trace、Feedback 与评测接入

**文件：**

- 新建：`docs/foundations/06-trace-feedback-eval.md`
- 新建：`assets/diagrams/foundations/06-trace-feedback-eval.svg`
- 新建：`evidence/claims/foundation.eval.trial-attempt-separation.yml`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`evidence/claims/foundations/evidence-map.yml`

- [ ] 从 Agent Harness 和至少两个 Eval 参照分别锁定 Trace、Artifact、Trial、Attempt、Scorer 与 Feedback 的证据。
- [ ] 用一个包含基础设施失败和产品失败的例子固定 Trial 分母，说明哪些 Attempt 可以恢复、哪些结果不能重试成通过。
- [ ] 分开训练奖励、Checkpoint 选择和独立发布评测；Feedback Adapter 语义未实现或证据不足时，使用 `external`、`absent` 或 `unknown` 并写清条件，不能暗示已经接入。
- [ ] 绘制评测接入图：任务与环境 → Trial/Attempt → Trace/Artifact → Scorer → 反馈或发布门槛。
- [ ] 注册 Trial 与 Attempt 分离 Claim，并明确它是本仓库采用的统计契约还是某个上游的默认行为。
- [ ] 运行全部局部门禁和渲染复核。
- [ ] 提交：`docs(foundations): 发布 Trace 与评测接入基础`。

### Task 8：正式导航与旧共同入口退场

**文件：**

- 修改：`README.md`
- 修改：`docs/00-start-here.md`
- 修改或删除：`docs/00-overview.md`
- 修改或删除：`docs/concepts.md`
- 修改或删除：`docs/e1-what-is-eval-harness.md`
- 修改或删除：`docs/e2-tasks-and-envs.md`
- 修改或删除：`docs/e3-run-and-score.md`
- 修改或删除：`docs/e4-harness-decides-score.md`
- 修改：受影响的旧正文链接和旧覆盖率门禁
- 修改：`scripts/tests/project-files.test.mjs`
- 修改：`scripts/tests/navigation.test.mjs`

- [ ] 先写失败测试：六篇基础课未全部 `reviewed` 时不得批量进入正式导航；旧双主线入口不得继续作为公开概念入口。
- [ ] README 和总入口加入六篇课程链接，并把共同基础状态更新为 6/6 `reviewed`。
- [ ] 删除或收口已被新基础课完整替代的旧概念和 Eval 入口，修复所有相对链接与旧覆盖率假设。
- [ ] 保留仍将在六条项目主线中重审的旧源码文章，但继续排除在正式导航之外。
- [ ] 搜索旧“双 Harness 并列课程”承诺、旧文件名和过期入口零公开残留。
- [ ] 运行导航、链接、项目文件、覆盖率、文风和聚合检查。
- [ ] 提交：`docs(navigation): 开放共同基础课程`。

### Task 9：阶段 2 全量对抗复核

**文件：**

- 新建：`evidence/reviews/2026-08-23-phase-2-foundations.yml`
- 修改：`specs/2026-08-23-agent-harness-internals-program-plan.md`

- [ ] 从已提交基线运行 Node 24 聚合检查和全部来源验证。
- [ ] 逐篇审计解释深度、最小例子、Claim、限定条件、自检答案、链接和中文图示。
- [ ] 打开六张正式图，检查窄屏、深浅背景、文字截断、箭头、字体和颜色依赖。
- [ ] 主动寻找：把单个项目外推成通则、模型与 Harness 混淆、权限与隔离混淆、Session 与 Context 混淆、Trial 分母漂移、Feedback 与发布评测混淆。
- [ ] 修复全部高严重度发现；中低风险明确记录后续去向。
- [ ] 复核通过后勾选总路线阶段 2，并在提交后重跑聚合检查。
- [ ] 提交：`chore(review): 完成阶段 2 共同基础复核`。

## 阶段完成证据

阶段 2 只有同时满足以下条件才算完成：

1. 六篇基础课均为 `reviewed`，且每篇达到结构、字数、段落、例子和自检门槛。
2. 六篇至少各有一张已登记、已渲染复核的中文 SVG。
3. 六个关键 Claim 的来源、Commit、路径、行号、摘录、等级和限定条件通过门禁。
4. README 与总入口只开放六篇已复核课程，不链接旧草稿和旧双主线入口。
5. 旧概念与 Eval 入口已删除或明确收口，所有链接和覆盖率假设同步修复。
6. Node 24 聚合检查和全部来源验证通过，阶段复核没有未解决高严重度发现。
