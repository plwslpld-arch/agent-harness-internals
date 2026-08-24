# 阶段 4：横向比较、角色路径与独立评测实施计划

**目标：** 在六条一级主线全部完成后，发布五篇基于同口径问题的横向比较、四条角色工作流、两项可复核实验，并移除旧 A 系列和旧角色短页。比较只总结已经登记的独立证据，不计算脱离场景的总分。

**方法：** 先建立跨 Harness 矩阵 Schema、失败测试与 Claim 引用完整性，再按任务生命周期写正文。每篇比较都分开事实、推断与建议；每条角色建议必须回链已复核课程或比较；实验明确区分已执行结果与规范设计。

**来源基线：** DSH、Codex、Gemini CLI、Claude、pi、OpenCode 六条主线已锁定的 107 条 Claim、源码锚点、上游测试与阶段复核记录。Claude 继续遵守闭源产品、Python SDK 源码和 TypeScript SDK 公开材料的不对称边界。

## 发布结构

### 五篇横向比较

1. `docs/comparisons/01-runtime-config-model-input.md`：产品与运行边界、配置和模型输入。
2. `docs/comparisons/02-loop-tools-execution.md`：Agent Loop、工具目录、执行与终止。
3. `docs/comparisons/03-permissions-state-recovery.md`：权限、安全、Session、Context、Memory 与恢复。
4. `docs/comparisons/04-orchestration-protocol-surfaces.md`：编排、扩展、协议与产品表面。
5. `docs/comparisons/05-observability-eval-deployment.md`：Trace、Feedback、评测集成、部署与维护。

### 四条角色路径

1. `docs/roles/engineering.md`：扩展、集成、调试和维护。
2. `docs/roles/product.md`：用户可观察行为与产品边界。
3. `docs/roles/quality-and-evaluation.md`：可重复运行、Artifact、Scorer 与发布口径。
4. `docs/roles/operations-and-security.md`：权限、隔离、凭据、成本和恢复。

### 两项实验

1. `docs/labs/01-controlled-task-contract.md`：固定输入、环境、Target Surface 和失败分类的控制变量实验。
2. `docs/labs/02-independent-eval-pipeline.md`：Trial/Attempt、Artifact、外部 Scorer、RewardAdapter、Checkpoint 与 Holdout 的最小闭环。

## Task 1：失败契约与跨 Harness 数据模型

- [x] 新增比较矩阵失败测试；矩阵每个非空单元必须引用存在的 Claim，禁止总分字段。角色导航和实验记录测试在对应发布任务补入。
- [x] 建立五个生命周期矩阵数据文件，六条主线每个单元明确能力状态、证据等级、条件、Claim 和不可比较项。
- [x] 聚合门禁纳入新检查并提交：`test(comparison): 锁定跨主线证据契约`。

## Task 2：运行边界、配置与模型输入

- [x] 覆盖入口/服务边界、配置合并、项目指令、系统提示、模型目录与真实可用条件。
- [x] 新增中文数据流图，避免把同名配置资产写成等价实现。
- [x] 提交：`docs(comparison): 发布运行配置与模型输入比较`。

## Task 3：循环、工具与执行

- [x] 比较一次 Turn 的控制对象、工具可见性、参数校验、批处理、结果回送、停止与任务成功边界。
- [x] 新增中文状态图，明确自然停止、工具继续、压缩和失败分支。
- [x] 提交：`docs(comparison): 发布循环工具与执行比较`。

## Task 4：权限、状态与恢复

- [x] 比较审批/确认、应用策略、操作系统隔离、持久 Session、模型 Context、有损摘要、快照与外部副作用。
- [x] 新增中文分层图，禁止把权限询问、历史或回退写成统一安全事务。
- [x] 提交：`docs(comparison): 发布权限状态与恢复比较`。

## Task 5：编排、协议与表面

- [x] 比较子任务/子代理、Skill、Plugin、Hook、MCP、服务协议、终端、网页、桌面与编辑器投影。
- [x] 新增中文边界图，区分发现、启用、连接、模型可见、执行和客户端呈现。
- [x] 提交：`docs(comparison): 发布编排协议与表面比较`。

## Task 6：可观测性、评测与部署

- [x] 比较 Trace、Telemetry、Feedback、Artifact、Scorer 接口、部署信任边界、凭据和维护成本。
- [x] 重申训练 Reward、Checkpoint 选择与独立 Release Eval 隔离，不能用总分替代场景决策。
- [x] 新增中文评测责任链图并登记 Manifest。
- [x] 提交：`docs(comparison): 发布可观测评测与部署比较`。

## Task 7：四条角色路径

- [x] 四篇角色文章分别建立决策问题、至少三步工作流、风险边界和可执行验收清单。
- [x] 每项建议至少链接一个已复核机制页、比较页或实验页，不重复制造浅层事实。
- [x] 提交：`docs(roles): 发布四条决策工作流`。

## Task 8：控制变量与独立评测实验

- [x] 创建不需要付费模型的本地控制实验：以机器可读夹具验证 Trial 分母、Attempt 恢复、产品失败不重试成通过和 Artifact 血缘。
- [x] 创建最小独立评分管线实验：固定 Scorer 版本，输出分数、理由、不可判定与证据引用；RewardAdapter 只在语义完整时启用。
- [x] 保存输入、命令、环境、结果和失败记录，实验页面只声明实际执行范围。
- [x] 提交：`test(labs): 发布控制变量与独立评测实验`。

## Task 9：原子导航与旧页退出

- [x] 根 README 和总入口一次性开放五篇比较、四条角色路径和两项实验；新增缺篇、降级与零链接失败测试。
- [x] 删除旧 `a1` 至 `a10`、`for-product.md` 和 `for-ops.md`，更新所有站内链接；不保留旧版本比较或兼容入口。
- [x] 旧附录暂不删除，在阶段 6 迁入正式 `docs/appendix/` 并复核。
- [x] 提交：`docs(navigation): 开放比较角色与实验`。

## Task 10：阶段 4 全量对抗复核

- [ ] 运行 Node 24 聚合检查、全部来源验证、敏感信息、链接、矩阵、实验和复核记录门禁。
- [ ] 逐篇寻找：同名即等价、目录即能力、测试即生产、遥测即评分、单次结果即统计结论、训练分数即发布门槛、客户端成功即任务成功。
- [ ] 集中渲染五张比较图并目检中文、截断、箭头、色彩和证据绑定。
- [ ] 修复全部高优先级发现，记录中低风险，勾选总路线阶段 4 并提交：`chore(review): 完成阶段 4 比较角色与评测复核`。

## 完成定义

阶段 4 仅在以下条件同时满足时完成：

1. 五篇比较、四篇角色和两篇实验均为 `reviewed` 或 `verified`，达到对应内容深度契约。
2. 比较矩阵每个公开结论可回到六条主线 Claim，不含总分、赢家或无条件推荐。
3. 两项实验具有实际运行记录；未调用真实模型的边界明确，不冒充生产结果。
4. 旧短页退出公开树且站内链接无断裂。
5. 五张中文比较图通过渲染目检，Manifest 与 Claim 绑定完整。
6. 阶段复核记录为 `pass`，Node 24 全部聚合门禁通过。
