---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 编排原语：选择语义，而不是追求层数

## Subagent

Subagent descriptor 应说明 provider、会话、状态与可继续性。子会话可以持久化 parent、seed boundary 与 delegation depth。`evidence: code` 这些元数据支持导航和递归预算，但不证明远程 provider 一定可恢复。`evidence: inference`

## Goal、Plan 与 Todo

它们用于让用户和 Agent 共享任务结构。是否自动续跑、怎样闭合、是否跨会话恢复，取决于对应 consumer 和事件设计，不能仅从数据类型推断。`evidence: inference`

## Job 与 Schedule

后台任务需要区分“已接受”“正在运行”“完成”“结果已收集”和“已停止”。定时触发还要考虑重启、重复执行和错过窗口。相关包提供基础能力。`evidence: code` 生产级投递保证仍需运行和部署证据。`evidence: runtime`

## Workflow

Workflow 适合显式步骤和并行分支，但 worker thread 与 `node:vm` 不构成不可信代码的安全隔离。`evidence: official-doc` 有危险副作用的步骤仍应落在受约束的工具/provider 中。`evidence: inference`

## 选择原则

优先使用最小语义：需要上下文隔离才用 subagent，需要后台生命周期才用 job，需要时间触发才用 schedule，需要确定步骤图才用 workflow。每增加一层编排，都要补充取消传播、预算、错误归因、结果汇合和观测。`evidence: inference`

对应实现与测试从[人工源码研究](../13-source-studies/README.md)和[自动文件参考](../14-file-reference/README.md)定位。
