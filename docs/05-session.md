---
sources: [{"repo":"deepseek-harness","path":"packages/core/session/src/types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/surface.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/repair.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/request-header.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence-jsonl/src/format.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence-sqlite","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 05｜Session：事件溯源、surface 与恢复

> 本文基线 `47f9438`。所有行号对应该 Commit。

## 一、产品现象

「关掉再打开，任务还能接着跑。」 但更重要的是它**没做**的事——崩溃恢复后，一个可能已经删过文件的工具不会被自动重跑一遍。

| 现象 | 背后是什么 |
| --- | --- |
| 断电重启后会话能续上 | append-only 事件日志 + 崩溃修复 |
| 恢复后某个工具显示「结果未知，请先确认」 | `TOOL_OUTCOME_UNKNOWN` 而不是盲目重试 |
| UI 显示的过程和审计导出的记录一致 | 两者从同一份事件词汇投影 |
| 压缩后模型「忘了」早期细节，但导出记录仍完整 | surface 被替换，日志没被删 |

这一层把「模型看到的历史」和「真实发生过什么」拆成了两件事，再用类型系统和运行时不变量保证两者不会悄悄分叉。

## 二、源码路径

```
packages/core/session/src/                 3,156 行
  index.ts            1157   Session 服务主体
  surface.ts           460   模型可见投影
  types.ts             436   事件词汇与 SurfaceOp
  chunk-rows.ts        346   流式 chunk 行
  invariant.ts         250   运行时不变量
  json.ts              190
  repair.ts            133   崩溃修复
  request-header.ts     71   请求头重建
  known-event-types.ts  64
  preparation.ts        49

packages/session/                          13 个包
  session-persistence / -jsonl / -sqlite   持久化三件套
  session-projection / -cache              投影
  session-title / -llm / -first-prompt-llm / -all-prompts-llm
  session-telemetry / -otel
  session-stats
  session-checkpoint-policy
```

**13 个 `session/*` 包**说明一件事：事件日志不是一个存储细节，是一整个能力域。持久化、投影、标题生成、遥测、统计、检查点策略全都是同一份事件的不同 consumer。

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `types.ts:56` | `SESSION_FORMAT_VERSION = 0` |
| `types.ts:357` | `SurfaceEvent = SessionEvent<SurfaceEventType> & { surfaceOp: SurfaceOp }` |
| `types.ts:372` | `export type SurfaceOp` |
| `types.ts:422` | `ignorable?: true` |
| `surface.ts:83` | `deriveEventMessage(event)` |
| `surface.ts:387` | `foldSurface(events)` |
| `surface.ts:398` | `class SurfaceManager` |
| `repair.ts:13` | `TOOL_NOT_STARTED` |
| `repair.ts:16` | `TOOL_OUTCOME_UNKNOWN` |
| `repair.ts:27` | `interruptedTurnClosers(events)` |
| `repair.ts:104-105` | 给模型的两段恢复指示原文 |
| `request-header.ts:21` | `canonicalHeader(header)` |
| `request-header.ts:44` | `headerEquals(a, b)` |

## 三、机制

### 事件的形状

`types.ts:404-436`： `evidence: code`

```ts
{
  type: K
  seq: number        // 会话内单调序号
  time: number       // Unix 毫秒
  data: SessionEventMap[K]
  ignorable?: true
  // 仅 surface 事件：
  sourceEventSeqs?: number[]
  surfaceOp?: SurfaceOp
}
```

`SESSION_FORMAT_VERSION = 0`（`:56`），上游 `AGENTS.md` 明确写着**预览期不作兼容承诺**。

### 两类事件

| 类 | 例子 | 进模型吗 |
| --- | --- | --- |
| **Surface 事件** | `user/message`、`assistant/message`、`tool/result` | 是，且必须带 `surfaceOp` |
| **Log-only 事件** | `turn/start`、`step/end`、`assistant/chunk`、`request/header` | 否，只是证据 |

`SurfaceIntent` 的注释把规则写死了：`surfaceOp` 在产生消息的事件上必填，在 log-only 事件上禁止。

### SurfaceOp 只有两种，replace 必须举证

`types.ts:372`： `evidence: code`

```ts
export type SurfaceOp =
  | 'append'
  | { op: 'replace'; start: number; end: number }
```

`:360-371` 的注释里有一条硬约束：

> The node's `sourceEventSeqs` must include **every** shadowed surface node.

替换一段历史，必须列出被遮蔽的每一个 surface 节点。 这就是「surface replacement 需要证明来源，不能无凭据覆盖模型历史」这条不变量的类型级表达。压缩是它的主要使用者，但任何 surface 替换者都可以用。

`start` 和 `end` 都是闭区间，且都必须是当前 surface 里存在的节点；`start === end` 表示替换单个节点。

### deriveEventMessage：四个分支

`surface.ts:83`，模型可见历史的唯一入口： `evidence: code`

| 事件 | 派生成 |
| --- | --- |
| `user/message` | user 消息 |
| `assistant/message` | assistant 消息，**内容为空则跳过** |
| `tool/result` | 工具结果消息 |
| 其它 | `null` |

`foldSurface(events)`（`:387`）把整条日志折叠成有序 surface，`SurfaceManager`（`:398`）维护增量状态。

关键点：`deriveEventMessage` 是**纯函数并对外暴露**，外部重建器用同一套规则，不会和内部缓存产生分歧。

### `ignorable`：默认拒绝，而不是默认跳过

`types.ts:422` 的注释把这个默认值的理由讲得很清楚： `evidence: code`

> Absent means required: a reader meeting an unrecognized type without this marker **MUST refuse to reconstruct** the session instead of silently dropping the event, because an unrecognized required event may change how the rest of the log is interpreted. A writer sets `true` only on purely informational records whose loss cannot affect reconstruction; **defaulting to required means a forgotten marker over-refuses (an inconvenience) rather than silently resuming a gutted session.**

翻译成一句话：忘记打标记的代价是「过度拒绝」，这是不便；反过来默认跳过的代价是「静默地在残缺会话上继续跑」，这是事故。 两者不对称，所以默认值选拒绝。

这条约束向前兼容：新版本加了事件类型，旧版本读到会明确报错，而不是丢掉一半上下文照常运行。

### 崩溃修复：两种工具状态，两段给模型的话

`repair.ts:27` 的 `interruptedTurnClosers(events)` 扫描 open turn、open step、pending tool call，合成缺失的结尾事件，最后（`:131`）追加：

```ts
{ type: 'turn/end', seq: seq++, time, data: { turn: openTurn, reason: { kind: 'interrupted' } } }
```

工具分两种状态（`:13`、`:16`），而且恢复策略是用自然语言写给模型看的（`:104-105` 原文）： `evidence: code`

`TOOL_OUTCOME_UNKNOWN` —— 工具已记录开始，但结果没落盘：

> The tool call was interrupted after it was recorded, but no result was durably recorded. Its outcome is unknown. Decide whether to retry from the tool semantics: retry only if the operation is read-only or idempotent; if it may have side effects, first verify external state or ask the user. **Do not retry blindly.**

`TOOL_NOT_STARTED` —— 模型要求过，但 Harness 还没记录它开始：

> The tool call was interrupted before the Harness recorded it as started. Retry it if it is still needed.

两者的错误名分别是 `ToolOutcomeUnknownError` 和 `ToolNotStartedError`（`:118-119`）。

注意这里的做法：恢复策略没有做成一个状态码交给上层解释，而是直接把判断依据写成模型能读的指令：「只有只读或幂等才重试；可能有副作用就先核对外部状态或问用户」。模型是这条恢复路径上的决策者之一，所以策略得说给它听。

### 持久化：write-behind，不是每次 append 都落盘

协调器监听事件入队，在 flush / dispose / load 边界保证耐久： `evidence: code`

```ts
ctx.on('session/event', (session, event) => live.writes.enqueue(event))
ctx.on('session/flush', session => this.flush(session))

private async flush(session) {
  await live.init
  await live.writes.flush()
}
```

这就是 headless 退出前必须 flush 的原因：屏幕上出现了模型回答，不代表事件已经持久化完成。

两个后端：

| 后端 | 格式 |
| --- | --- |
| **JSONL** | `.jsonl.zstd`（Zstandard）或 `.jsonl`（明文），`JsonlCompression = 'zstd' \| 'none'`（`format.ts:17`）；单 session 单 active writer；支持撕裂帧前缀恢复（`:326`） |
| **SQLite** | 同步 `node:sqlite`，**无 busy retry** |

SQLite 用同步 API 这一点要注意：它会阻塞事件循环。选后端时这是个真实权衡，不是实现细节。

### 请求头可重建

`request-header.ts`（71 行）三个函数： `evidence: code`

- `canonicalHeader(header)`（`:21`）—— 规范化：空 system prompt 和空工具列表变成缺省字段，与请求构建方式一致
- `headerEquals(a, b)`（`:44`）—— 逐字段比较，工具 schema 按顺序比
- `foldHeader(events)` —— 把日志（或任意前缀）折叠成当时生效的 `EpochHeader`

模块注释说明了用途：任何持有会话日志的人都能重建出某次请求是在什么 header 下构建的；loop 用同一个相等性判断来避免记录未变化的 header。

这条直接服务于文章 06：header 不变，才谈得上请求前缀稳定。

## 四、约束与失效条件

### 不能盲目重跑副作用工具

`TOOL_OUTCOME_UNKNOWN` 意味着**工具可能已经执行了一半**——文件可能已写、请求可能已发、钱可能已扣。自动重试会把一次不确定变成一次确定的重复副作用。

### 活跃会话与冷日志的修复规则不同

- **冷日志**（进程已退出）：可以追加合成的 interrupted / tool / step / turn 结尾
- **活跃会话**：不平衡状态**拒绝静默修复**

HMR / live adoption 尤其危险：不能把一个还活着的 open turn 误修成 interrupted。上游 `AGENTS.md` 提到过 HMR adoption 不把 open turn 当作 interrupted，这是一条专门的防御。

### 持久化要检测 collision

同一个 session id 出现在不同 cwd 或不同前缀下，必须被检测出来，而不是两个进程往同一份账本里写。

### 「模型可见 ⟺ 已记录」是双向的

- 进模型的必须能从日志重建（文章 01）
- 反过来，想让模型看见新东西，必须先扩展 `SessionEventMap` 并从日志渲染，不能只加个内存变量

### 改这层的最小回归

1. `core/session` 的 surface、repair、json、derived-cache 测试
2. `session-persistence` 的 coordinator contract
3. JSONL 和 SQLite 各自的 load / flush / repair 测试
4. headless「退出前 flush」测试
5. **至少一次手工中断恢复实验**，确认 open tool 不会被当成成功

`packages/session/session-checkpoint-policy/tests/crash-recovery.e2e.ts` 是这条线的 e2e。 `evidence: test`

## 五、可复核实验

### 实验 1：读两段恢复指示原文（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '100,122p' packages/core/session/src/repair.ts
sed -n '404,436p' packages/core/session/src/types.ts   # ignorable 的默认拒绝理由
```

回答：为什么恢复策略要写成给模型看的自然语言，而不是只给一个状态码？

### 实验 2：跑 session 与崩溃恢复测试（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/core/session
pnpm vitest run packages/session/session-persistence
```

记录：命令、退出码、用例数。重点看 `surface` 和 `repair` 相关用例。

### 实验 3：制造一次中断并观察修复（需要凭据）

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile headless "逐个读取 packages/core 下每个子目录的 README" &
sleep 6 && kill -9 %1     # 在工具执行中途硬杀
```

然后加载该 session，检查：

1. 是否出现 `turn/end` 且 `reason.kind === 'interrupted'`
2. 中断的工具调用是否有合成 `tool/result`
3. 它的 error code 是 `TOOL_NOT_STARTED` 还是 `TOOL_OUTCOME_UNKNOWN`
4. 结果文本里是否包含「Do not retry blindly」那段

**该记录**：命令、杀进程的时机、事件序列、两个 code 各出现几次。
**该得出**：`kill -9` 的时机决定你看到哪种 code——杀在工具记录开始之前是 `TOOL_NOT_STARTED`，之后是 `TOOL_OUTCOME_UNKNOWN`。这两种状态的区别不是理论，是可以用时机复现出来的。

## 本篇尚未覆盖的源文件

- `packages/core/session/src/index.ts`（1,157 行）—— Session 服务主体、fork、seed 边界
- `packages/core/session/src/invariant.ts`（250 行）—— 本包的运行时不变量，是全仓最大的一个（文章 11）
- `packages/core/session/src/chunk-rows.ts`（346 行）—— 流式 chunk 的行式存储
- `packages/session/session-projection*` —— 投影的纯函数契约（`init`/`apply`/`view`）
- `packages/session/session-title*`（4 个包）—— 标题生成为什么需要四个包
- 压缩如何使用 `surfaceOp: 'replace'` → 文章 07
