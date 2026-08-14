---
sources: [{"repo":"deepseek-harness","path":"packages/bundle/web-app","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/headless","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, official-doc, inference]
---

# 10｜Web、Headless 与协议入口

## 先讲人话

Web、headless、SDK、ACP、MCP 不是同一类东西。

| 名称 | 它是什么 |
| --- | --- |
| Web | 给人使用的产品表面 |
| Headless | 一次性命令任务入口 |
| SDK JSON-RPC | 程序控制 Harness 的方式 |
| ACP | 外部 Agent/客户端控制 Harness session 的协议方向 |
| MCP | Harness 连接外部工具服务器的协议方向 |

## 当前 TUI 判断

固定源码基线中，完整内置 TUI 产品层已移除。仓库里存在历史 note、终端通用零件或审批能力，不等于当前有完整 `dsh tui` 产品。

这个判断要看：

- package/profile 是否存在；
- CLI 是否接受命令；
- tests 是否覆盖；
- bundle 是否 shipped；
- 用户路径是否能跑通。

## Web 关键代码片段

源码入口：

- `packages/bundle/web-app/src/index.ts`
- `apps/web/`

理解形状：

```ts
ctx.provide('webRuntime', runtime)
mountFrontendStatic(dist)
registerWebSystemPromptSection()
publishDshWebUrl()
waitForLoaderSettle()
printReadyUrl()
```

Web 的 ready URL 是产品信号，但不是业务 E2E 证明。还要看 Agent 是否创建、Session 是否写入、任务是否完成。

## Headless 关键代码片段

源码入口：

- `packages/bundle/headless/src/index.ts`
- `packages/bundle/headless/src/startup.ts`

理解形状：

```ts
agent = agents.create({ model })
agent.followup(task)
await waitUntilIdle(agent)
await sessions.flush()
printFinalAssistantText()
exit(codeFromTurnEnd)
```

Headless 适合实验，因为它更容易记录命令、退出码和脱敏输出。

## 检查题

- Web 和 headless 共享什么，不共享什么？
- MCP 和 ACP 的方向为什么不同？
- 为什么 `dsh web` 打印 URL 不等于任务完成？

## 延伸阅读

- [../10-web-client/web-dataflow.md](../10-web-client/web-dataflow.md)
- [../11-protocols-and-integrations/protocol-boundaries.md](../11-protocols-and-integrations/protocol-boundaries.md)
- [../13-source-studies/web-bridge-and-product-surface-study.md](../13-source-studies/web-bridge-and-product-surface-study.md)
