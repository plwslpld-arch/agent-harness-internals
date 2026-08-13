# 09｜编排：子 Agent、Goal、Job、Schedule 与 Workflow

Harness 把“多步任务”拆成多种不同语义的原语，而不是用一个万能任务队列覆盖所有场景。`evidence: code`

| 原语 | 适合解决 | 不应误解为 |
| --- | --- | --- |
| Subagent | 委派有独立上下文的工作 | 自动更可靠或自动隔离 |
| Goal / Plan / Todo | 表达任务意图、阶段和当前进度 | 持久工作执行器 |
| Job | 后台执行、收集或停止 | 完整调度系统 |
| Schedule | 按时间触发工作 | exactly-once 业务事务 |
| Workflow | 显式多步编排与 worker 执行 | 不可信代码沙箱 |

## 产品轨

用户需要看见所有权、状态、成本、取消、失败和结果回传。把多个 Agent 图标画在界面上不等于形成可控编排。`evidence: inference`

## 工程轨

Subagent seam 允许 in-process child、session fork、ACP、Codex 或 Claude 等 provider 采用不同执行方式。`evidence: code` “provider 实现存在”仍不等于默认挂载；必须回到 profile 配置验证。`evidence: inference`

继续阅读：[编排原语](orchestration-primitives.md)、[Session 恢复](../08-session-and-context/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动文件参考](../14-file-reference/README.md)
