---
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/tool-calls.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/constants.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/runtime-context.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent/src/inbox.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/tests/tool-order.spec.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/workflow","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 03｜Agent Loop：turn、step 与工具调度

> 本文基线 `47f9438`。所有行号对应该 Commit。

## 一、产品现象

三个现象，全都来自这一层：

**「它说完了，但任务没做完。」** 模型输出的最后一个 token 出现，不代表这一轮结束——可能还有工具要跑、还有下一次模型请求要发。

**「几个工具明明同时在跑，但结果顺序总是对的。」** 并行执行降低了延迟，模型看到的结果顺序却和它请求的顺序一致。

**「中途取消，已经开始的操作没有留下半截状态。」** 取消不是简单地断流。

这三件事对应 `ReactLoopAgent` 的三个设计决定：**turn/step 两层结构**、**执行并发但提交有序**、**取消要产生可解释的结算**。

## 二、源码路径

```
packages/core/agent-loop/src/       1,643 行
  agent.ts          496   ReactLoopAgent：turn / step 驱动
  index.ts          713   服务注册、createAgent、config
  tool-calls.ts     289   工具调度与有序结算
  runtime-context.ts 76   本 step 的运行时上下文
  invariant.ts       63
  constants.ts        6

packages/core/agent/src/            抽象工作入口
  inbox.ts  dispatch.ts  consumed-work.ts  model-selection.ts
  index.ts  runtime-types.ts  types.ts  invariant.ts

packages/core/agent-loop/tests/     20 个测试文件
```

**20 个测试文件**值得单列，它们就是这一层的行为契约： `evidence: test`

```
loop.spec.ts              tool-calls.spec.ts     tool-order.spec.ts
cancel.spec.ts            request-error.spec.ts  resume.spec.ts
request-reconstruction.spec.ts   contract-regressions.spec.ts
properties.spec.ts        interception.spec.ts   scope-lifecycle.spec.ts
invariant.spec.ts         agent-initiator.spec.ts  runtime-context.spec.ts
settings.spec.ts          coverage-edges.spec.ts   config-session-id.spec.ts
agent.spec.ts             mock-adapter.ts        request-cache.e2e.ts
```

注意 `request-cache.e2e.ts`——缓存行为是有 e2e 覆盖的，这条线在文章 06 展开。

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `agent.ts:48` | `type StepEndReason = Extract<TurnEndReason, { kind: 'completed' \| 'max-tokens' }>` |
| `agent.ts:64` | `export class ReactLoopAgent implements Agent` |
| `agent.ts:92` | 从日志倒查 `lastTurn` |
| `agent.ts:246` | `private async turn()` |
| `agent.ts:285-290` | max-tokens 粘性规则 |
| `agent.ts:332` | `private async step(assembly)` |
| `agent.ts:407` | `private async buildRequest(turn, step, ...)` |
| `tool-calls.ts:59` | `export async function executeToolCalls` |
| `tool-calls.ts:84-93` | 外层规划循环 |
| `tool-calls.ts:147` | 有序提交循环 |
| `tool-calls.ts:199-204` | 有界滚动池与中途重分类 |
| `constants.ts:6` | `DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10` |

## 三、机制

### turn 与 step

| 概念 | 含义 |
| --- | --- |
| **turn** | 一次用户任务周期 |
| **step** | 一次模型请求与它引出的处理 |
| tool call | 模型要求执行的动作 |
| tool result | 工具执行后的模型可见结果 |

一个 turn 可以有多个 step。只要模型继续请求工具，就进入下一 step。

事件写入顺序（`agent.ts`）： `evidence: code`

| 行号 | 事件 |
| --- | --- |
| `:255` | `session.append('turn/start', { turn })` |
| `:279` | `session.append('step/start', { turn, step })` |
| `:292` | `session.append('step/end', { turn, step })` |
| `:296` | `dispatch.serial('agent/turn-stopping', { turn, signal })` |
| `:319` | `session.append('turn/end', { turn, reason: turnEnds })` |

`turn/end` 写在 `finally` 里——**失败、取消、被阻塞都必须变成结构化的结束原因**，不允许一个 turn 悬空。

### 一次 step 的七步

1. `preStep()` 从 inbox 领取本轮输入，并调用 `systemPrompt.assemble()`
2. runtime context 渲染成一条附加的 **user-role snapshot**，放进本 step 的消息
3. `buildRequest()`（`:407`）解析 provider/model，调用 `llm.prepareCall()`，写入 `request/header` 和 `request/context`
4. `llm.stream()` 或 `preparedCall.stream()` 返回流式 chunk
5. `BlockAssembler` 把 chunk 聚合成 assistant message，保留 usage、finish reason、replay state
6. 没有 tool-call → step 返回 `completed`
7. 有 tool-call → `executeToolCalls()` 执行工具，把结果塞进**下一 step 的 inbox**

第 7 步是关键：**工具结果不是「返回值」，是下一步的输入债务。** 这就是为什么 turn 会继续。

`agent.ts:341` 那行也值得看：

```ts
turn, step, assembly.tools, system, this.session.deriveMessages(), signal,
```

历史是 `deriveMessages()` 从**会话日志**派生出来的，不是从内存里的对话数组。这是文章 01 那条「模型可见 ⟺ 已记录」不变量的执行点。

### 工具调度：有界滚动池 + 屏障

`tool-calls.ts:2-3` 的模块注释一句话说清了设计： `evidence: code`

> Schedules one assistant step's tool calls. Exclusive calls form barriers; parallel calls use a bounded rolling pool and are **reclassified before start**.

外层规划循环（`:84-93`）：

```ts
while (next < planned.length) {
  const mode = ctx.tools.executionMode(first.exec).kind
  const group = mode === 'parallel' ? planned.slice(next) : [first]
  const outcome = await runGroup(...)
  next += outcome.consumed
}
```

**这不是 `Promise.all(toolCalls)`。** 它按模型给出的顺序规划，再根据每个工具声明的执行模式决定能否并发；遇到 exclusive 工具就形成 barrier，只跑它一个。

内层是有界滚动池（`:199`）：

```ts
while (!aborted && nextToStart < group.length && inFlight.size < maxParallelToolCalls) {
```

默认上限 `DEFAULT_MAX_PARALLEL_TOOL_CALLS = 10`（`constants.ts:6`），可通过 `ctx.agentLoop.config` 配置。

### 一个容易被忽略的细节：中途重分类

`tool-calls.ts:200-204` 的注释和代码： `evidence: code`

```ts
// Re-read later modes after ordered commits so registry changes can create a barrier.
if (nextToStart > 0 && mode === 'parallel'
  && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel') break
```

**在池子跑的过程中，工具注册表可能变化。** 比如某个工具执行时挂载了新插件、改变了另一个工具的执行模式。调度器在每次有序提交之后**重新读取后续调用的模式**，一旦发现后面的调用不再是 parallel，就立刻中断当前池子，让它成为下一个 barrier。

这是「一切皆插件 + 运行时可变」带来的真实复杂度：调度器不能在开头做一次分类就一直用到底。

### 执行重叠，提交有序

`:147` 是有序提交循环：

```ts
while (committed < group.length) {
```

结果和上下文按**模型给出的顺序**提交，而不是按完成顺序。`:220` 的 `while (inFlight.size > 0)` 负责 drain。

产品含义：**并行提升延迟，但不牺牲模型可见顺序和审计顺序。** 这也是 `tool-order.spec.ts` 单独存在的原因。

### 错误分层

`agent.ts` 里 turn 结束原因分四类： `evidence: code`

| 类别 | 行号 | 行为 |
| --- | --- | --- |
| provider 返回错误 finish | — | 进入 `agent/request-error` waterfall，**只有明确返回 retry 才重试** |
| 非 LLM 错误 | `:308-313` | 展平成 `errorChain(error)` 文本，包在 `UNKNOWN` code 下 |
| 取消 | `:303-304` | `turnEnds = { kind: 'aborted', reason: signal.reason }` |
| 被阻塞 | `:268` | `turnEnds = { kind: 'blocked' }` |

工具调度器自身失败时**不伪造成功的工具结果**——不能把不可信状态喂回模型。

### max-tokens 是粘性的

`agent.ts:285-290`，一个很容易写错的细节： `evidence: code`

```ts
// max-tokens is sticky: once any step hits the ceiling, later steps
// max-tokens stays sticky: a later completed step must not
if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd
```

**一旦某个 step 撞到 token 上限，后续 step 即使正常完成，也不能把 turn 的结束原因改回 `completed`。** 否则用户会以为任务正常结束，实际上中间被截断过。

`:48` 的类型定义把这件事写进了类型系统：`StepEndReason` 只能是 `completed` 或 `max-tokens` 两种。

### 编排原语：优先最小语义

turn/step 之上还有四种编排原语。选择原则是**优先用最小语义**：

| 原语 | 什么时候用 | 不要误解为 |
| --- | --- | --- |
| **Subagent** | 需要上下文隔离 | descriptor 有 parent/seed/depth 元数据，但不证明远程 provider 一定可恢复 |
| **Job** | 需要后台生命周期 | 要区分「已接受 / 运行中 / 完成 / 结果已收集 / 已停止」五态 |
| **Schedule** | 需要时间触发 | 是 agent 作用域的 durable 队列，**不是宿主 cron**；要考虑重启、重复执行、错过窗口 |
| **Workflow** | 需要确定的步骤图 | worker thread 与 `node:vm` **不构成不可信代码的安全隔离** |

每增加一层编排，都要补齐：取消传播、预算、错误归因、结果汇合、观测。

## 四、约束与失效条件

### 「回答完成」不是最后一个文本 chunk

自然停止之前还有 `agent/turn-stopping` 检查点（`:296`，`serial` 分发）。错误、取消、max-tokens、中断各有不同的闭合原因。

产品侧要**结合持久 turn 边界与实时 agent 状态**判断完成，而不是只看流连接是否结束。

### `agent/pre-step` 是 waterfall，忘了 `next()` 就截断下游

监听器可以改写、拒绝或委托。**忽略 `next()` 会意外截断下游策略。** 这是 compaction、审批注入等能力的挂载点，短路它等于关掉它们。

一个边界情况：**首次领取被拒绝时，仍然会留下一个没有 step 的闭合 turn。** 日志里出现 `turn/start` 紧跟 `turn/end` 而中间无 `step/*`，是正常形态，不是数据损坏。

### 「UI 显示已发送」不等于模型已看见

steering、follow-up 和注入上下文各有自己的唤醒与领取语义。消息进了 inbox，要等下一次 `preStep()` 领取才会进入模型请求。

### 取消的两种状态必须分开

- **已开始的工具** → drain，等它收束
- **未开始的工具** → 生成可解释的合成结算

不能笼统地「全部标记失败」，因为已开始的可能已经产生了副作用。这条在文章 05 的 `TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN` 二态里有对应的持久化表达。

### 改这一层，最小回归集

不要只跑一个成功样例。至少覆盖五条：

1. 正常纯文本完成
2. 模型先请求工具 → 工具成功 → 下一 step 完成
3. provider 错误进入 `request-error`
4. 工具被拒绝或失败，**仍产生 `tool/result`**
5. cancel 后未开始的工具有合成结果，已开始的完成 drain

对应测试文件：`loop.spec.ts`、`tool-calls.spec.ts`、`tool-order.spec.ts`、`request-error.spec.ts`、`cancel.spec.ts`。 `evidence: test`

## 五、可复核实验

### 实验 1：读调度器的三层循环（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '84,95p'   packages/core/agent-loop/src/tool-calls.ts   # 外层规划
sed -n '147,152p' packages/core/agent-loop/src/tool-calls.ts   # 有序提交
sed -n '196,210p' packages/core/agent-loop/src/tool-calls.ts   # 有界池 + 重分类
```

回答：**为什么 `:200` 要在每次有序提交后重读后续调用的执行模式？** 提示——工具注册表在池子运行期间可能被改。

### 实验 2：跑工具顺序的契约测试（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/core/agent-loop/tests/tool-order.spec.ts
pnpm vitest run packages/core/agent-loop/tests/cancel.spec.ts
```

记录：命令、退出码、用例数。这些测试用 mock adapter，**不需要真实 API key**。

### 实验 3：观察一次真实 turn 的事件序列（需要凭据）

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile headless "读一下 README.md 的前 10 行"
```

这个任务会触发工具调用，所以能看到完整形态。在会话日志里核对：

```
turn/start → step/start → request/header → assistant/chunk*
  → tool/call → tool/result → step/end
  → step/start → ... → step/end → turn/end
```

**该得出的结论**：至少两个 step。如果只有一个 step，说明模型没调工具，换个更需要工具的任务重试。

再跑一个负向用例：任务进行中 `Ctrl-C`，检查 `turn/end` 的 `reason.kind` 是否为 `aborted`，以及未开始的工具是否有合成结算。

## 本篇尚未覆盖的源文件

- `packages/core/agent-loop/src/index.ts`（713 行）—— `createAgent()`、服务注册与 config 解析
- `packages/core/agent/src/{inbox,dispatch,consumed-work,model-selection}.ts` —— 抽象工作入口的完整语义
- `packages/core/agent-loop/src/runtime-context.ts` —— runtime context 如何渲染成 user-role snapshot
- `packages/subagent/`、`packages/jobs/`、`packages/schedule/`、`packages/workflow/`、`packages/goal/`、`packages/plan/` —— 五种编排原语的实现
