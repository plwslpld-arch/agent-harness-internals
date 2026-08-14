---
sources: [{"repo":"deepseek-harness","path":"packages/core/session","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence-jsonl","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence-sqlite","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, inference]
---

# 09｜Session、持久化与恢复

## 先讲人话

Session 是 Harness 的事实账本。它记录一次任务中发生过什么：用户说了什么、模型请求是什么、工具调用是什么、工具结果是什么、turn 怎么结束。

它不是 UI 状态，也不是普通日志。

## 系统位置

```mermaid
flowchart TD
  Event["事件追加"] --> Memory["内存 Session"]
  Memory --> Persistence["flush 到持久化"]
  Persistence --> Replay["恢复 / replay"]
  Event --> Surface["deriveMessages"]
  Surface --> Model["下一次模型请求"]
  Event --> UI["Web 投影"]
```

## 关键代码片段

源码入口：

- `packages/core/session/src/types.ts`
- `packages/core/session/src/surface.ts`
- `packages/core/session/src/repair.ts`
- `packages/session/session-persistence/src/coordinator.ts`
- `packages/session/session-persistence-jsonl/src/format.ts`
- `packages/session/session-persistence-sqlite/src/schema.ts`

理解形状：

```ts
session.append({ type: 'turn/start' })
session.append({ type: 'request/header' })
session.append({ type: 'assistant/message' })
session.append({ type: 'tool/result' })
session.append({ type: 'turn/end' })

await sessions.flush(session.id)
```

恢复时的核心不是“继续跑”，而是先判断账本是否完整：

```ts
if (hasOpenToolCall) markToolOutcomeUnknownOrNotStarted()
if (hasOpenStep) appendInterruptedStepEnd()
if (hasOpenTurn) appendInterruptedTurnEnd()
```

## 不变量

- Session event 是 append-only，不能随便改历史。
- UI 和 benchmark trajectory 都应该从同一事件词汇派生。
- 活跃会话和冷日志 repair 的规则不同。
- side-effectful tool 不应在恢复时盲目重试。

## 本讲源码证据卡

| Session 问题 | 证据入口 | 看什么 |
| --- | --- | --- |
| 事件类型在哪里定义 | `packages/core/session/src/known-event-types.ts`、`types.ts` | turn/step/request/tool/assistant 等事件词汇 |
| 模型可见历史如何派生 | `packages/core/session/src/surface.ts` | event log 到 messages 的投影 |
| 不完整会话如何修复 | `packages/core/session/src/repair.ts` | interrupted closure、unknown tool outcome |
| 持久化如何落盘 | `packages/session/session-persistence*/` | coordinator、JSONL、SQLite 后端边界 |

## 最小实验

```text
任务：验证一次任务结束前 Session flush。
步骤：
1. 跑一次 headless 任务。
2. 找到本次 session id 或 persistence 位置。
3. 检查是否出现 turn/start、request/header、assistant/message、turn/end。
4. 人为中断一个实验时，观察 repair 是否把开放 turn/step/tool 关闭为 interrupted/unknown。
过关：能说明为什么恢复时不能盲目重跑副作用工具。
```

## 检查题

- Session event 和 UI state 有什么区别？
- 为什么 `TOOL_OUTCOME_UNKNOWN` 不能自动重跑？
- 为什么 flush 顺序会影响 headless 退出可靠性？

## 延伸阅读

- [../08-session-and-context/event-log-and-recovery.md](../08-session-and-context/event-log-and-recovery.md)
- [../08-session-and-context/context-and-compaction.md](../08-session-and-context/context-and-compaction.md)
- [../13-source-studies/core-runtime-study.md](../13-source-studies/core-runtime-study.md)
