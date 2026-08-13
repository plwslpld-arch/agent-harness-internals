# 事件日志与恢复：保留事实，不重写历史

## 持久事实与实时控制

`turn/*`、`step/*`、`user/message`、`assistant/*` 和 `tool/*` 是可回放会话事件；`agent/*` 主要用于正在运行的 inbox、状态和协调。`evidence: official-doc`

## Flush 语义

事件生产方不会等待每次物理写入；持久化层按会话批量排队。`session/flush` 会取消等待并排空到完全停稳，让下一轮或 dispose 能观察写入错误。`evidence: official-doc` “事件已 append 到内存”因此不等于“磁盘已 durable”。`evidence: inference`

## 崩溃恢复

冷加载遇到未闭合 turn/step/tool 时，系统保留原有事件并添加合成 interrupted 闭合事实；它不会删除长轮次尾部。`evidence: official-doc` 活跃会话则不能被另一条恢复路径擅自修复，避免双写和竞争事实源。`evidence: inference`

## Header 与事件分离

格式版本、cwd、父会话、seed 边界、delegation depth 和 agent preset 等存储元数据位于 session header，不进入模型 transcript。`evidence: code` 当前格式会拒绝无法可靠理解的版本或必需事件，而不是静默跳过。`evidence: official-doc`

恢复实验应分别覆盖正常关闭、进程强退、未完成工具、旧/新格式拒绝与持久化写失败，并按 `evidence: runtime` 保存日志摘要。源码证据见[人工源码研究](../13-source-studies/README.md)。
