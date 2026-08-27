# Agent Loop：Turn、Step、模型流与工具结果怎样闭环

[返回 DeepSeek Harness 课程地图](README.md)

DeepSeek Harness 的 Agent Loop（智能体循环）比一个简单的 `while (toolCall)` 多了几层边界，它会先把用户输入放进 Inbox（收件箱）。

系统再用 Turn（回合）表示一次外部任务的推进过程，并用 Step（步骤）标记其中的每次模型请求，同时把关键变化追加为 Session Event，为插入输入、取消、并行工具和恢复留下可核对的边界。

## 先理解 Turn 与 Step

```text
Turn 1
  Step 1：用户消息 → 模型 → ToolCall
  工具执行 → ToolResult 放入 next-step Inbox
  Step 2：ToolResult → 模型 → 最终文本
Turn 1 结束
```

- **Turn** 从一批需要唤醒 Agent 的输入开始，到完成、阻塞、错误或取消结束。
- **Step** 对应一次模型请求和它产生的 Assistant Message；有工具调用时，工具结果推动下一 Step。
- **Inbox** 区分 `next-turn` 与 `next-step`，所以 follow-up 和 steer 不会被混入错误边界。
- **Session Event** 保存 `turn/start`、`step/start`、消息、工具调用、结果和结束原因。

### 第 1 站：外部输入先进入 Inbox

源码：[查看 `send()` 与三种输入语义](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L108-L137)

```typescript
followup(input: UserMessage): void {
  this.send(input, 'next-turn', true)
}

steer(input: UserMessage): void {
  this.send(input, 'next-step', true)
}

inject(input: UserMessage): void {
  this.send(input, 'next-step', false)
}
```

- **调用者**：CLI、ACP、子任务或扩展表面向 Agent 提交新消息。
- **输入**：`UserMessage`、目标边界和是否唤醒 Driver。
- **状态变化**：消息被插入 Inbox；需要唤醒时启动或通知运行 Driver。
- **返回**：这些方法没有业务返回值。
- **下一站**：Driver 调用 `turn()`，在合适边界 claim Inbox 消息。

`followup` 会把消息明确排到下一 Turn，`steer` 会把消息送往下一 Step，并唤醒 Driver（驱动器），`inject` 则只把消息放进队列，不主动启动运行。三种入口不能混用。如果带唤醒语义的输入在取消后才到达，系统还会把它重新归入下一 Turn，避免它混入已经中止的活动。

## Driver 只负责把 Turn 推进到收敛

`kick()` 的主体很短：只要 `turn()` 返回「还要继续」，它就开启下一 Turn。Driver 只负责推进，代码把复杂逻辑分别放在 Turn 和 Step 的边界上，因此 Driver 无需自己承担一个难以追踪的巨型循环。

源码：[查看 Driver 循环](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L195-L220)

```typescript
private async kick(): Promise<void> {
  try {
    while (await this.turn()) {}
  } catch (_error) {
    // failure is contained at the driver boundary
  } finally {
    ...
  }
}
```

更内层的代码会先把异常写成结构化事件，Driver 再在自己的边界上收束活动状态。失败不会卡在 running，因此 UI 既能看到具体错误，也能看到状态转为 idle。

### 第 2 站：Turn 追加边界事件并逐 Step 推进

源码：[查看 `turn()` 主体](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L246-L323)

```typescript
this.session.append('turn/start', { turn })

while (true) {
  const step = phase.step + 1
  const decision = await this.preStep(target, { turn, step })
  ...
  this.session.append('step/start', { turn, step })
  const stepEnd = await this.step(decision.assembly)
  this.session.append('step/end', { turn, step })
  ...
}

this.session.append('turn/end', { turn, reason: turnEnds! })
```

- **调用者**：`kick()` 在 Driver 已占有 running phase 后调用。
- **输入**：Inbox 中的消息、Session 派生历史、AbortSignal 和 Prompt Assembly 服务。
- **状态变化**：追加 Turn/Step 边界与用户消息；更新 phase 的 turn、step 和结束原因。
- **返回**：布尔值表示 Inbox 是否还有输入，需要继续下一 Turn。
- **下一站**：每个 Step 调用模型流，随后可能调度工具。

`preStep()` 除了取出消息，还会组装 System Prompt、投影运行时 Context，并发出 waterfall 事件，让扩展有机会修改或拒绝当前 Step。当扩展返回 reject 时，Turn 会以 blocked 结束，如果初始消息在处理后已经为空，系统也不会再发起一次无意义的模型调用。

## Step 从 Session 重新派生完整请求

每次请求都重新派生。系统会从 Session 历史出发，不会只沿用上一次模型返回的局部内容。构造新请求时，它需要把 System Prompt Assembly、Tools、模型路由和历史消息放在一起，然后冻结成本次请求。

### 第 3 站：流式 Chunk 先落事件，再合成 Assistant Message

源码：[查看 `step()` 的模型流](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L332-L409)

```typescript
const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
for await (const chunk of stream) {
  chunkSeqs.push(
    this.session.append('assistant/chunk', { turn, step, chunk }).seq,
  )
  assembler.push(chunk)
}

const message = createAssistantMessage({
  content: assembler.blocks(),
  source: { provider: request.provider, model: request.model },
})
this.session.append('assistant/message', { turn, step, message, ... })
```

- **调用者**：`turn()` 为本 Step 准备好 Prompt Assembly 后调用 `step()`。
- **输入**：System Prompt、Session 派生消息、工具 Schema、Provider/Model 与 AbortSignal。
- **状态变化**：每个 Chunk 先追加到 Session；Assembler 构造完整内容与 Usage；完成消息引用来源 Chunk 序号。
- **返回**：Step 结束原因，或工具执行后返回 `null` 表示还需下一 Step。
- **下一站**：若 Assistant Message 含 ToolCall，调用 `executeToolCalls()`。

如果模型流在中途取消，Assembler 会尽量用已收到的内容生成 `interruptedBlocks()`，并把这条不完整的 Assistant Message 标记为 interrupted。部分消息仍不算完成，保留它只是为了观察取消前发生了什么，评分时不能把它当成正常完成的消息。

模型流报告 error 或 aborted 后，`agent/request-error` waterfall 可以返回 retry，系统会留在同一个 Step 重新构建请求。只有没有获得 retry 决策时，它才抛出 `LlmError`，所以统计 Attempt（尝试）时不能根据 Step 数直接推算模型调用次数。

## 没有 ToolCall 才完成当前 Step 链

```typescript
const toolCalls = message.content.filter(block => block.type === 'tool-call')
if (toolCalls.length === 0) return { kind: 'completed' }

const { concluded } = await executeToolCalls(...)
return concluded ? { kind: 'completed' } : null
```

源码：[查看 Step 收敛判断](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L410-L418)

这段逻辑表明，模型输出文本并非当前 Step 链唯一的完成信号。工具结果可以直接声明 `concluded`，否则它们会进入新的上下文，Turn 随后再开启一个 Step，让模型读取工具的执行结果。

### 第 4 站：工具调用先解析，再按执行模式分组

源码：[查看 `executeToolCalls()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/tool-calls.ts#L59-L100)

```typescript
const planned = toolCalls.map(block => ({
  block,
  exec: {
    callId: block.id,
    name: block.name,
    arguments: parseArguments(block.arguments),
    agent,
    signal,
  },
}))

const mode = ctx.tools.executionMode(first.exec).kind
const group = mode === 'parallel' ? planned.slice(next) : [first]
```

- **调用者**：Step 检测到一个或多个 ToolCall 后调用。
- **输入**：模型顺序中的 ToolCall 列表、Turn/Step、发起 Agent 和共享取消信号。
- **状态变化**：参数被解析为对象或保留原始文本；工具根据实时 execution mode 形成并行组或独占屏障。
- **返回**：是否有工具要求直接结束，以及已启动调用的上下文结果。
- **下一站**：Scheduler 依次 prepare、dispatch、finish/finalize，并按模型顺序提交结果。

工具可以并行运行，但 Scheduler 仍会按模型给出的顺序提交 Policy、Result 和送往模型的 Context。提交不能跟着完成速度走，因此运行顺序和提交顺序要分开看，稳定的提交顺序既方便重放和解释，也能避免第二个工具因为先跑完就抢先改变后续语义。

### 第 5 站：Call 与 Result 用事件序号建立因果关系

源码：[查看工具事件提交](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/tool-calls.ts#L261-L288)

```typescript
const event = session.append('tool/call', {
  turn, step, callId: block.id, name: block.name, arguments: block.arguments,
})

session.append('tool/result', {
  turn, step, message, ...
}, { sourceEventSeqs: [callSeq] })
```

- **调用者**：Scheduler 在调用开始和结果可提交时调用辅助函数。
- **输入**：ToolCall、执行结果、Turn/Step 和对应 Call Event 序号。
- **状态变化**：Session 先记录意图，再记录引用该意图的结果；UI 私有展示信息也可随 Result 保存。
- **返回**：Call 辅助函数返回事件序号，Result 追加没有业务返回值。
- **下一站**：Result Context 被放入 `next-step` Inbox，下一模型请求从 Session 派生它。

取消发生后，Scheduler 会 drain 已经开始的调用，并按既定顺序提交结果，尚未开始的调用则会收到「调度前已取消」的合成错误。如果是 Scheduler 内部失败，它会停止分派新调用，并排空已启动的调用，却不会为未启动的调用伪造结果。两条路径留下的事件不同，统计时也要分开。

## 用失败测试任务走一遍

用户要求修复运费边界：

1. `followup()` 把任务放入下一 Turn 并唤醒 Driver。
2. `preStep()` claim 消息，组装 Prompt、工具和运行时 Context。
3. Step 1 请求模型，Assistant Message 产生 Read 与测试工具调用。
4. Scheduler 可以并行执行只读调用，但按模型顺序追加 Result。
5. Result Context 进入下一 Step，模型再产生 Edit 和测试调用。
6. 没有新 ToolCall 时，Step 返回 completed，Turn 写入结束事件。
7. 独立 Eval 读取 Session 轨迹、工作区 Diff 和测试输出，不以 completed 代替正确性。

## 阅读这一循环时保留三个边界

- `turn/end completed` 是 Harness 收敛，不是测试通过。
- ToolResult 是执行报告，不保证副作用完整或可信，仍需环境核验。
- Session Event 能重放已记录事实，但不等于自动恢复所有外部进程状态。

上一层配置怎样把 Prompt 和 Tools 送进循环，见[Prompt、Context 与 Cache](02-prompt-context-cache.md)，而下一篇会继续追踪执行边界：[工具、审批与 Sandbox](04-tools-security.md)。
