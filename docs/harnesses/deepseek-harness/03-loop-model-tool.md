# Agent Loop：Turn、Step、模型流与工具结果怎样闭环

[返回 DeepSeek Harness 课程地图](README.md)

DeepSeek Harness 的主循环不是简单的 `while (toolCall)`。它把用户输入放进 Inbox，把一次外部任务推进划成 Turn，再把每次模型请求划成 Step；所有关键变化都追加为 Session Event。这个结构让插入输入、取消、并行工具和恢复有明确边界。

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

`followup` 明确排到下一 Turn；`steer` 希望在下一 Step 进入，并唤醒 Driver；`inject` 只排队，不主动启动。取消后的唤醒输入还会被重新分类到下一 Turn，避免加入已经中止的活动。

## Driver 只负责把 Turn 推进到收敛

`kick()` 的主体很短：只要 `turn()` 返回还要继续，就开启下一 Turn。复杂性留在 Turn 和 Step 边界，而不是塞进一个巨型循环。

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

异常在更内层先写入结构化事件，再由 Driver 边界收敛活动状态。这样 UI 可以看到错误和 idle 转换，而不是留下一个永远 running 的 Agent。

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

`preStep()` 不只是取消息，还组装 System Prompt、投影运行时 Context，并通过 waterfall 事件允许扩展修改或拒绝本 Step。若决策为 reject，Turn 以 blocked 结束；如果初始消息被移除为空，则不浪费模型调用。

## Step 从 Session 重新派生完整请求

每个请求都由 Session 历史派生，而不是只拿上一次局部返回。System Prompt Assembly、Tools、模型路由和历史消息共同形成冻结请求。

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

中途取消时，Assembler 会尽量产出 `interruptedBlocks()`，并把部分 Assistant Message 标为 interrupted。这比直接丢掉所有已收到内容更可观察，但部分内容不能当成正常完成消息参与最终评分。

模型流报告 error 或 aborted 时，`agent/request-error` waterfall 可以返回 retry。重试发生在同一 Step 内，并重新构建请求；没有 retry 决策时才抛 `LlmError`。因此 Attempt 统计不能仅按 Step 数推算模型调用次数。

## 没有 ToolCall 才完成当前 Step 链

```typescript
const toolCalls = message.content.filter(block => block.type === 'tool-call')
if (toolCalls.length === 0) return { kind: 'completed' }

const { concluded } = await executeToolCalls(...)
return concluded ? { kind: 'completed' } : null
```

源码：[查看 Step 收敛判断](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L410-L418)

这段逻辑说明模型文本不是唯一完成信号。工具结果可能声明 `concluded`，否则它们形成新的上下文，Turn 再进入一个 Step，让模型观察执行结果。

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

并行执行不等于乱序提交。工具可以同时运行，但 Policy、Result 和送给模型的 Context 保持模型顺序。这让重放与解释更稳定，也避免较快的第二个工具抢先改变后续语义。

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

取消时，已开始调用会被 drain 并有序提交；未开始调用会得到「调度前已取消」的合成错误结果。内部 Scheduler 自身失败则停止新分派并排空已启动调用，但不会伪造未启动结果。这两个路径必须分开统计。

## 用失败测试任务走一遍

用户要求修复运费边界：

1. `followup()` 把任务放入下一 Turn 并唤醒 Driver。
2. `preStep()` claim 消息，组装 Prompt、工具和运行时 Context。
3. Step 1 请求模型；Assistant Message 产生 Read 与测试工具调用。
4. Scheduler 可以并行执行只读调用，但按模型顺序追加 Result。
5. Result Context 进入下一 Step，模型再产生 Edit 和测试调用。
6. 没有新 ToolCall 时，Step 返回 completed，Turn 写入结束事件。
7. 独立 Eval 读取 Session 轨迹、工作区 Diff 和测试输出，不以 completed 代替正确性。

## 阅读这一循环时保留三个边界

- `turn/end completed` 是 Harness 收敛，不是测试通过。
- ToolResult 是执行报告，不保证副作用完整或可信，仍需环境核验。
- Session Event 能重放已记录事实，但不等于自动恢复所有外部进程状态。

上一层配置怎样把 Prompt 和 Tools 送进循环，见[Prompt、Context 与 Cache](02-prompt-context-cache.md)；下一篇继续追踪执行边界：[工具、审批与 Sandbox](04-tools-security.md)。
