# 阶段 3A：DeepSeek Harness 主线实施计划

> **执行要求：** 当前会话内顺序执行。现有 `docs/deep/dsh-*.md` 只能作为待复核材料，不能因篇幅长或旧状态为 `reviewed` 就直接进入新导航。每个新模块先锁定证据与 Claim，再写正文和中文图示；自动化变更测试先行；每个任务完成后执行反向检查并独立提交。

**目标：** 在 `docs/harnesses/deepseek-harness/` 发布一条独立、连续、源码级且可核对的 DSH 课程，从一次真实任务贯穿启动装配、Prompt 与缓存、Agent Loop、工具安全、Session 与压缩、编排扩展、多产品表面、反馈评测和自验证，不用横向矩阵替代项目实现。

**课程结构：**

| 序号 | 文件 | 核心问题 |
| --- | --- | --- |
| 00 | `README.md` | 锁定版本、证据边界、系统架构和一次端到端任务怎样连接？ |
| 01 | `01-boot-preset.md` | Cordis、bundle、profile、preset 与 Agent 组合怎样启动？ |
| 02 | `02-prompt-context-cache.md` | System Prompt、运行时 Context 和请求前缀怎样装配并影响 KV Cache？ |
| 03 | `03-loop-model-tool.md` | Agent Loop、LLM Adapter、流式事件、工具调用和终止怎样形成闭环？ |
| 04 | `04-tools-security.md` | Tool、Guard、审批、策略和多平台 Sandbox 怎样分层？ |
| 05 | `05-session-compaction.md` | Session 事件、surface、持久化、Compaction 与 Spill 怎样协作？ |
| 06 | `06-orchestration-extensions.md` | Plan、Goal、Todo、Subagent、Workflow、Skill、Extension 和 Code Runtime 怎样接入？ |
| 07 | `07-surfaces-feedback-eval.md` | Web、Host、ACP、SDK、无人值守、Feedback 和评测表面怎样共享核心？ |
| 08 | `08-verification-design-limits.md` | 自验证制度、设计记录、已知限制和可复现实验怎样约束结论？ |

## 全局约束

- 九篇均使用 `article_type: harness`、`harness: deepseek-harness` 和锁定 Commit。
- 每篇达到 Harness 内容契约：真实输入与输出、至少三步调用链、源码证据、失败与限制、验证方法、三至四道带答案自检。
- 主线入口至少包含一张中文系统架构图和一张中文端到端任务流程图；其余复杂模块按真实关系配图。
- 关键默认行为、安全边界、状态提交、终止、恢复与评测语义进入 Claim 注册表；跨模块推断使用 D。
- DSH 内置 Benchmark 或 Feedback 只描述锁定实现，不扩大成训练奖励、独立发布 Eval 或生产授权。
- 现有十五篇 DSH 长文逐项映射后吸收；新课覆盖前不得删除，覆盖完成后从公开树退出，不维护旧路径兼容。
- 图中自然语言使用中文，代码标识符、协议名和项目名可以保留；图必须渲染目视复核。
- 全部验证使用 Node 24，不调用 NVM。

---

### Task 1：强化一级主线发布契约并建立迁移证据清单

**文件：**

- 修改：`scripts/check-content-contract.mjs`
- 修改：`scripts/tests/content-contract.test.mjs`
- 新建：`evidence/claims/deepseek-harness/evidence-map.yml`
- 修改：本计划

- [x] 先写失败测试：一级主线入口缺少系统架构图、端到端流程图、课程状态表或 Claim 时必须失败。
- [x] 为九篇课程建立锁定源码、上游测试、旧长文覆盖和计划 Claim 清单，所有路径必须真实存在。
- [x] 明确现有十五篇长文到九篇新课的逐项映射，任何旧页不得无去向删除。
- [x] 反向检查：目录名、设计记录数量和旧 `reviewed` 状态都不能冒充行为证据。
- [x] 运行单元测试与局部门禁。
- [x] 提交：`feat(dsh): 建立主线发布契约与迁移证据清单`。

### Task 2：发布 DSH 主线入口、系统架构和端到端任务

**文件：**

- 新建：`docs/harnesses/deepseek-harness/README.md`
- 新建：`assets/diagrams/deepseek-harness/system-architecture.svg`
- 新建：`assets/diagrams/deepseek-harness/end-to-end-task.svg`
- 新建：至少两条入口 Claim
- 修改：`assets/diagrams/manifest.yml`

- [x] 解释锁定版本、许可证、公开源码边界、课程状态和阅读顺序。
- [x] 用真实输入、事件、工具结果和最终产物走完一次任务，不用伪 API 冒充上游格式。
- [x] 架构图覆盖 bundle、Cordis、Agent、LLM、工具、Session、产品表面与评测接入。
- [x] 流程图区分模型触发、Harness 决策、真实副作用与终止。
- [x] 渲染两图并检查中文、窄屏、箭头和边界。
- [x] 提交：`docs(dsh): 发布主线入口与真实任务全景`。

### Task 3：启动、Cordis、bundle、profile 与 preset

- [x] 完成 `01-boot-preset.md`、中文装配图和限定 Claim。
- [x] 覆盖 CLI 输入、配置合并、插件依赖、bundle/profile/preset 和 Agent 组合输出。
- [x] 解释缺失注入、配置求值时序、帮助命令误启动和默认组合漂移。
- [x] 运行局部门禁、渲染复核和反向检查。
- [x] 提交：`docs(dsh): 发布启动与 preset 课程`。

### Task 4：System Prompt、Context 与 KV Cache

- [x] 完成 `02-prompt-context-cache.md`、中文数据流图和限定 Claim。
- [x] 展示真实 section 排序、稳定前缀、运行时消息和导致缓存断裂的变化。
- [x] 分开 Provider Cache、Session Memory 和 Compaction，不从命中推断质量。
- [x] 提交：`docs(dsh): 发布提示上下文与缓存课程`。

### Task 5：Agent Loop、LLM Adapter 与工具闭环

- [x] 完成 `03-loop-model-tool.md`、中文时序图和终止 Claim。
- [x] 覆盖消息序列化、SSE、重试、工具并行、有序结算、取消与最终原因。
- [x] 区分 Provider 重试、工具恢复、Turn 结束和 Eval Attempt。
- [x] 提交：`docs(dsh): 发布循环模型与工具闭环课程`。

### Task 6：工具、Guard、审批与多平台 Sandbox

- [x] 完成 `04-tools-security.md`、中文安全边界图和平台限定 Claim。
- [x] 覆盖工具定义、参数校验、Guard、审批瀑布、策略、实际执行和平台降级。
- [x] 不把弹窗、Hook、容器或某个平台测试写成完整安全保证。
- [x] 提交：`docs(dsh): 发布工具安全课程`。

### Task 7：Session、持久化、Compaction 与 Spill

- [x] 完成 `05-session-compaction.md`、中文状态图和恢复 Claim。
- [x] 覆盖事件日志、surface 投影、持久化、冷恢复、半截工具调用、摘要和 Spill。
- [x] 明确原始记录、派生 Context、摘要和外部文件之间的权威关系。
- [x] 提交：`docs(dsh): 发布会话压缩与恢复课程`。

### Task 8：编排、Subagent、Skill、Extension 与 Code Runtime

- [x] 完成 `06-orchestration-extensions.md`、中文编排图和扩展边界 Claim。
- [x] 覆盖 Plan、Goal、Todo、Ralph、Workflow、Hook、Subagent、Skill、MCP、Extension 与 Code Mode。
- [x] 解释 one-shot、前缀复用、递归委派、运行时代码和权限继承风险。
- [x] 提交：`docs(dsh): 发布编排扩展与代码运行时课程`。

### Task 9：产品表面、反馈与评测接入

- [x] 完成 `07-surfaces-feedback-eval.md`、中文多表面图和反馈边界 Claim。
- [x] 覆盖 Web/Host、headless、ACP、MCP、SDK、Python 和无人值守入口的驱动关系。
- [x] 分开消息反馈、Session 反馈事件、遥测、内置 Benchmark、训练适配和独立发布 Eval。
- [x] 提交：`docs(dsh): 发布产品表面反馈与评测课程`。

### Task 10：自验证、设计取舍与限制

- [x] 完成 `08-verification-design-limits.md`、中文证据闭环图和验证 Claim。
- [x] 覆盖 invariant、测试层、文档同步、设计记录、未验证表面和已知限制。
- [x] 不把上游自验证或本仓库门禁扩大成生产就绪。
- [x] 提交：`docs(dsh): 发布自验证与设计限制课程`。

### Task 11：旧 DSH 长文退场与正式导航

- [x] 对照迁移清单确认十五篇旧文每项内容已有新去向。
- [x] 删除 `docs/deep/dsh-*.md`，修复旧 A 系列、附录和研究记录中的相对链接。
- [x] README 和总入口把 DSH 状态更新为 `reviewed`，整批加入 DSH 主线入口，不提前开放其他五条主线。
- [x] 增加失败测试：DSH 九篇未全部发布时，主线入口不得宣称完整；扩展样本不得进入正式导航。
- [x] 运行链接、导航、项目文件、内容、Claim、视觉和聚合检查。
- [x] 提交：`docs(navigation): 开放 DSH 一级主线`。

### Task 12：阶段 3A 全量对抗复核

- [ ] 从已提交基线运行 Node 24 聚合检查和全部来源验证。
- [ ] 逐篇审计真实输入输出、调用链、源码锚点、默认条件、失败语义和自检答案。
- [ ] 打开全部 DSH 正式图，检查中文、截断、箭头、颜色依赖和证据绑定。
- [ ] 主动寻找：旧文直接搬运、设计记录数量崇拜、单个平台外推、安全边界折叠、反馈等同奖励、Benchmark 等同发布评测。
- [ ] 修复全部高严重度发现，记录中低风险后续项。
- [ ] 新建阶段复核记录，勾选总路线阶段 3A，提交后再跑聚合检查。
- [ ] 提交：`chore(review): 完成阶段 3A DSH 主线复核`。

## 阶段完成证据

阶段 3A 只有同时满足以下条件才算完成：

1. DSH 主线入口和八篇课程均为 `reviewed`，内容契约与来源绑定通过。
2. 至少一张系统架构图和一张端到端任务流程图，复杂模块具有必要中文图示且均经渲染复核。
3. 关键默认、安全、状态、终止、恢复、反馈和 Eval Claim 具有锁定证据与限定条件。
4. 旧十五篇长文完成逐项吸收后退出公开树，没有悬空链接或重复入口。
5. README 与总入口只准确开放 DSH，不夸大其他主线状态。
6. Node 24 聚合检查、全部来源验证和阶段对抗复核通过，没有未解决高严重度发现。
