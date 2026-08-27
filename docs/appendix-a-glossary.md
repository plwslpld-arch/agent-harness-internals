# 术语表：同一个词在六套 Harness 中可能不是同一对象

[返回学习入口](00-start-here.md)

这份词表先说明一个术语在不同项目间共享的大致含义，再提醒你各项目可能怎样使用它。它只是入口。遇到具体行为时，仍要回到对应课程和锁定源码逐项核对。

## 运行与身份

| 术语 | 本仓库中的含义 | 容易混淆之处 |
| --- | --- | --- |
| Harness | 位于模型外部，负责输入装配、工具、权限、状态和产品表面的程序 | 不是模型本身，也不等于 Eval Runner |
| Session | 一段可继续的运行状态与历史身份 | OpenCode、Gemini CLI、Claude SDK 等字段范围不同 |
| Thread | 可持久引用或并行分支的会话身份 | Codex 把 Thread 与活动 Session/Turn 分开 |
| Turn | 一次逻辑用户交互，可包含多次模型请求 | 不能按 HTTP 请求数量计 Turn |
| Step | 一次模型采样及其工具结算附近的较小单位 | 不同项目是否公开 Step 类型并不一致 |
| Task | 驱动某类工作流或用户目标的对象 | Codex Task、A2A Task、普通「任务」不是同一类型 |
| Run | 一次可结算执行实例 | Subagent Run、Workflow Run、Eval Run 作用域不同 |

## 模型与工具

| 术语 | 含义 | 核对点 |
| --- | --- | --- |
| Provider | 把共同请求协议适配到某个模型服务 | 目录发现、实现加载、认证和真实请求分开看 |
| Model | Provider 下的模型标识与能力配置 | 保存实际路由结果，不只保存首选项 |
| Tool Schema | 模型可见的工具名、描述和参数约束 | 仓库中有实现不代表 Schema 已进入本轮请求 |
| Tool Call | 模型提出的一次带 Call ID 的工具请求 | 参数必须完整、规范化并与 Result 配对 |
| Tool Result | 工具协议结算后回给模型的观察 | Success 不等于用户目标完成 |
| Scheduler/Router | 查找、排序和执行 Tool Calls 的控制层 | 可见性、Permission、Sandbox 通常在不同层 |

## 安全

| 术语 | 含义 | 不代表什么 |
| --- | --- | --- |
| Permission/Policy | 应用是否允许、拒绝或询问一次动作 | 不自动提供 OS 隔离 |
| Approval/Confirmation | 用户或宿主对一次请求的决定 | 不证明用户理解全部副作用 |
| Sandbox | 操作系统、容器或远端环境对进程能力的强制约束 | 配置开启不等于后端成功执行 |
| Trust | 是否加载工作区提供的配置、指令或扩展 | 不是文件、网络和子进程 Sandbox |
| Escalation | 经策略允许后，以更宽权限重新尝试 | 不应被理解为永久授权 |

## 历史与恢复

| 术语 | 含义 | 边界 |
| --- | --- | --- |
| Event Log/Rollout | 追加式运行记录 | 比模型 Context 包含更多事实 |
| Context/Surface | 下一次模型实际可见的有界历史投影 | 不是完整审计记录 |
| Compaction | 用摘要替换一段模型可见历史 | 摘要有损，旧事实是否保留取决于记录层 |
| Pruning | 删除或缩短某个大结果/片段 | 不一定重写整段历史 |
| Resume | 继续原会话身份 | 不恢复外部世界到过去时刻 |
| Fork | 从已有历史建立新分支身份 | 后续写入不应污染原会话 |
| Snapshot/Patch | 可用于恢复工作树的一组文件事实 | 无法撤销网络和数据库副作用 |
| Memory | 跨 Session 提炼的长期信息 | 可能过时，不覆盖当前文件和新指令 |

## 扩展与产品表面

| 术语 | 含义 | 主要风险 |
| --- | --- | --- |
| Subagent | 拥有独立上下文/Session 的子运行 | 父端摘要会丢子轨迹细节 |
| Workflow | 用脚本或控制器编排多个调用/子运行 | 资源上限、结果身份和取消传播 |
| Skill | 按需加载的任务说明与资源 | 发现不等于正文已注入 |
| Hook | 生命周期事件上的附加处理 | 是否能阻断取决于事件契约 |
| Plugin/Extension | 可贡献工具、Provider、Hook 等的能力容器 | 通常是高信任宿主代码 |
| MCP | 连接外部 Tools/Resources/Prompts 的协议 | 连接成功不代表每项能力存在或获准 |
| ACP/A2A/RPC | 外部客户端或 Agent 间协议 | 协议投影不等于完整内部事件 |

## Eval 与训练

| 术语 | 含义 | 规则 |
| --- | --- | --- |
| Artifact | 一次运行留下的大对象与环境事实 | 应带 Hash、版本和血缘 |
| Trace | 带顺序和关联身份的运行事件 | 没有 Error 不等于任务正确 |
| Scorer/Evaluator | 按固定规则读取 Artifact 并给判断 | 应位于 Harness 自述之外 |
| Reward Adapter | 把原始信号转换成训练奖励的版本化规则 | 必须定义缺失、方向、范围和聚合 |
| Holdout | 未用于训练和候选选择的隔离任务集 | 用于最终发布判断，防信息泄漏 |

进一步阅读：[五篇基础导读](foundations/01-model-harness-environment.md) 与 [横向比较](comparisons/01-runtime-config-model-input.md)。
