---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 10｜Web Client：把执行事实变成可操作体验

Web 不是另一套 Agent 内核。`web-app` bundle 在 base 能力上叠加服务端桥接与插件化 React client；浏览器通过连接层消费会话、Agent 状态、设置与交互。`evidence: code`

## 当前产品形态：Web 与 headless

固定快照 `47f943…` 已删除内置 TUI 产品包；`packages/bundle` 当前只有 `base`、`web-app` 和 `headless`。`evidence: code` built-bin E2E 还明确把 `dsh tui` 视为已移除命令。`evidence: code`

仓库里仍可看到 terminal、命令、问题交互或通用 client 能力等“底层 TUI 零件”，但它们不构成一个随发行版交付的完整 TUI 产品。`evidence: inference` 历史 Agent Note 说明了移除决策，只能用来解释演变；当前能力必须以当前 bundle、CLI 与测试为准。`evidence: code` 曾被提及的外部 turtle-ui 示例地址目前返回 repository not found。`evidence: runtime`

## 产品轨

Web 要把 streaming、pending tool call、审批、权限 preset、任务状态、子 Agent 与恢复统一呈现。一个好的界面不是把事件逐条打印，而是让用户知道“现在发生什么、谁在等待谁、下一步会产生什么副作用”。`evidence: inference`

## 工程轨

client modules 以注入和 slot 组合 UI；conversation node definition 与 keyed renderer 允许插件扩展消息树。`evidence: official-doc` Session 投影提供持久事实，`agent/*` 则补充正在运行的队列和状态。`evidence: code`

继续阅读：[Web 数据流](web-dataflow.md)、[运行主链路](../05-agent-runtime/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动文件参考](https://github.com/plwslpld-arch/deepseek-harness-internals/tree/gh-pages)
