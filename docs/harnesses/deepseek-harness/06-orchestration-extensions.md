# 子 Agent、Workflow 与 Code Mode：三种不同的编排跨度

[返回 DeepSeek Harness 课程地图](README.md)

前五篇都在回答「一个 Agent 如何完成一个 Turn」。任务一大，问题就变了。Harness 还要分辨三种情况：创建另一个 Agent，用一段脚本组织多个 Agent，或者只在一次工具调用里批量使用现有工具。

DeepSeek Harness 分别用 Subagent、Workflow 和 Code Mode 处理这三类问题，它们虽然都可以被归入「编排」，却不能因此互相替换。它们的边界不同。

```text
需要独立上下文和独立 Session？ ── 是 → Subagent
                │
                否
                ↓
需要一段确定性脚本组织多个子运行？ ── 是 → Workflow
                │
                否
                ↓
需要在一次模型可见调用中批量使用现有工具？ → Code Mode
```

## 先分清四个容易混淆的对象

| 对象 | 谁做决策 | 是否创建新 Agent | 模型可见的入口 | 主要边界 |
| --- | --- | --- | --- | --- |
| 普通 Tool | 当前 Agent | 否 | 一个工具 Schema | 单次副作用 |
| Subagent | 父 Agent 或宿主 | 是 | 委派工具或类型化接口 | 父子 Session、深度、取消 |
| Workflow | 脚本作者 | 通常会 | Workflow 工具或服务 | 脚本资源上限、子运行配对 |
| Code Mode | 当前模型编写的小程序 | 否 | `run_code` | 仍受原 ToolRuntime 约束 |

Subagent 的价值在于为一项子任务提供独立的上下文、生命周期和结果通道，但它不会让模型凭空变得「更聪明」。Workflow 改变的则是编排方式，因为它会把并发、流水线和结果聚合从自然语言决策移进可重复的脚本，却不会增加模型本身的能力。Code Mode 仍不创建 Agent。它只是把多次工具调用收进一个模型可见的 `run_code`，从而减少模型与 Harness 之间的往返。

## Subagent：一次委派是一条完整子运行

一次进程内委派会先计算子层级并创建新 Session，然后才把父 Agent 允许继承的项目、Persona、工具过滤和结构化输出约束装入子上下文。`spawn` 不携带历史 Seed，而 `fork` 会带入一段已完成 Turn 的 Seed，不过激活边界之后出现的新事件仍然属于这次子运行。

### 第 1 站：创建子 Agent 之前冻结继承关系

源码：[查看 `startInProcessRun()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/subagent/subagent-in-process-driver/src/index.ts#L67-L147)

```typescript
const childDepth = resolveChildDepth(parent, request.maxDepth)
const activationBoundary = seed?.length ?? 0
const inherited = captureDelegatedPolicyOverrides(parent)

const handle = await parent.ctx.agents.create({
  sessionId: childId,
  meta: childSessionMeta(parent, childDepth, activationBoundary),
  ...seed !== undefined ? { seed } : {},
  setup,
})
```

- **调用者**：Subagent 的 spawn/fork Provider。
- **输入**：父 Agent、Prompt、最大深度、可选 Seed、Persona、Tool Filter 与输出 Schema。
- **状态变化**：检查深度；在第一次异步等待前捕获父端策略；创建并发布独立子 Agent。
- **返回**：拥有子 ID、结果 Promise 和 `dispose()` 的 `SubagentRun`。
- **下一站**：Driver 把 Prompt 投递到子 Agent Inbox，等待它回到 Idle。

「在第一次 await 前捕获」很重要，因为父端可能在子 Agent 创建期间切换权限策略，而已经开始的委派不应偷偷继承未来值。Publication 则是另一道边界：在发布前取消，意味着创建事务尚未交出子 Agent，但在发布后取消，就必须通过已返回的 Run 管理，不能再把已经存在的子 Agent 视为「启动失败」。

### 第 2 站：结果、取消与释放是三件事

源码：[查看已发布子运行的生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/subagent/subagent-in-process-driver/src/index.ts#L150-L232)

```typescript
child.followup(createUserMessage({ content: prompt, source: { kind: 'user' } }))
await child.whenIdle()
return readResult(child, boundary, flags.cancelled, ...)

async dispose() {
  flags.cancelled = true
  const settlements = await Promise.allSettled([handle.dispose(), result])
}
```

- **调用者**：拿到 `SubagentRun` 的委派工具或 Workflow。
- **输入**：已发布的 Agent Handle、取消信号、Prompt 和激活边界。
- **状态变化**：投递一次用户消息；父取消传播到 `child.cancel()`；释放时等待 Agent Handle 与结果通道都收敛。
- **返回**：`output`、可选 `structured` 和 `stopReason`。
- **下一站**：父 Agent 或 Workflow 决定怎样消费子结果。

源码会故意保留取消或截断之前已经提交的最后一段 Assistant 输出，所以 `output` 非空并不等于 `stopReason === 'completed'`。文本完整，不等于成功。如果结构化 Schema 没有捕获到值，就不能把这次结构化委派判为成功。

## Workflow：脚本拥有编排，事件只负责观察

Workflow Service 接收脚本、参数、父 Agent 和取消信号后，会返回一个 live run，脚本里的 `agent()` 可以在这个运行中启动多个子运行。`phase()` 和 `log()` 只负责提供观察信息，不会因此改变脚本的执行语义。

### 第 3 站：每个开始事件都有对应结束事件

源码：[查看 Workflow 生命周期事件](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/workflow/workflow/src/index.ts#L31-L100)

```typescript
'workflow/start'(info)
'workflow/agent-start'(info, agent)
'workflow/agent-end'(info, agent)
'workflow/end'(info, result)
```

- **调用者**：Workflow Runtime；Observer 订阅这些事件。
- **输入**：Run 身份、Phase、日志或带序号的子 Agent 信息。
- **状态变化**：不控制脚本，只向外发出可配对的生命周期事实。
- **返回**：事件回调无业务结果。
- **下一站**：运行结果从 `WorkflowRun.result` 收敛，而不是从 Observer 猜测。

`agent-start` 与 `agent-end` 通过 `agent.seq` 配对，如果子 Agent 在发布之前就启动失败，两个事件都不会发出。一旦子 Agent 已经发布，那么无论它正常结束、失败还是取消，都必须对应一次 `agent-end`，因此「看到一个 start」只能建立待结算项，不能直接计为已完成。

Workflow 还会把致命编排错误与普通子任务失败分开处理，其中脚本解析、参数、资源上限或不可序列化结果等 `WorkflowError` 会终止脚本，而普通子运行失败可以在组合器中映射为该项的 `null`。这条边界防止一个拼写错误被伪装成「某个子任务没有答案」。

### 第 4 站：观察器不能接管运行控制

源码：[查看 `WorkflowEngine`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/workflow/workflow/src/index.ts#L150-L186)

```typescript
abstract start(request: WorkflowStartRequest): WorkflowRun

for (const callback of this.ctx.events.dispatch('emit', [name, ...args])) {
  try {
    void Promise.resolve(callback(...args)).catch(logWarning)
  } catch (error) {
    logWarning(error)
  }
}
```

- **调用者**：Workflow 工具或宿主调用 `start()`；Engine 内部发送事件。
- **输入**：脚本请求或一个生命周期事件。
- **状态变化**：`start()` 建立运行；事件监听器失败被记录并隔离。
- **返回**：live `WorkflowRun`，其 `result` 负责最终结算。
- **下一站**：调用方等待 Result，随后释放 Run 与子资源。

如果遥测监听器一抛错就能终止脚本，观察系统就会意外变成控制系统，而如果监听器还能修改结果，重放结果就会取决于当时加载了哪些插件。观察，不等于控制。这里通过 contain listener failure 保住了两者之间的边界。

## Code Mode：外面只有 `run_code`，里面仍是受控工具调用

Code Mode 会为 TypeScript 或 Python Runtime 生成与语言匹配的 `run_code` Schema，模型写下的是异步函数体，并通过 `tools.name(args)` 调用它原本就能看到的工具。

### 第 5 站：内部调用复用 Registry 的执行与并发规则

源码：[查看 `createRunCodeTool()` 的调度约束](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/code-mode.ts#L296-L380)

```typescript
const runController = new AbortController()
let dispatches = 0

interface PendingDispatch {
  start(): Promise<void>
  classify(): 'parallel' | 'exclusive'
  commit(): Promise<void>
  flight: Promise<void>
}
```

- **调用者**：当前 Agent 的 ToolRuntime 执行 `run_code`。
- **输入**：程序正文、显示用 Description、当前 Agent 和外层取消信号。
- **状态变化**：建立本次运行的取消域；按普通工具相同的 parallel/exclusive 规则排队、执行和提交内部调用。
- **返回**：程序日志与 JSON 可表示的返回值。
- **下一站**：外层 Tool Result 进入模型历史；内部 Dispatch Log 留给追踪与重建。

并发只发生在工具 Body 阶段，Guard、Pre/Post Execute、开始和结算事件仍然要经过单一的有序通道。遇到独占工具时，调度器会先等并发池排空，并且一直持有屏障直到提交完成，所以即使把三次 Bash 包进 `Promise.all`，也无法绕开 Registry 对独占执行的判定。

### 第 6 站：程序只能绑定当前 Agent 真正可见的工具

源码：[查看 Runtime 绑定与清理](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/code-mode.ts#L604-L648)

```typescript
for (const schema of registry.schemas(exec.agent)) {
  if (schema.name === RUN_CODE_NAME) continue
  Object.defineProperty(functions, schema.name, { value: binding(schema.name) })
}

result = await runtime.run({ program: args.code, bindings, signal })
runController.abort('run_code settled')
await drainDispatches()
```

- **调用者**：`run_code.execute()`。
- **输入**：调用 Agent 的 Scoped Tool View 与 Code Runtime。
- **状态变化**：只绑定该 Agent 可见的工具；结束时取消未完成调用并排空已启动 Dispatch。
- **返回**：整理后的日志和 Result；运行错误成为 `CodeRunFailedError`。
- **下一站**：Agent 根据外层 Tool Result 继续 Step。

Code Mode，并不意味着「任意代码拥有宿主全部权限」，因为真正的隔离强度虽然还取决于 Code Runtime，工具能力这一层却仍会按调用 Agent 的可见集重新解析，并经过同一条执行管线。

## 用一个代码审查任务理解三者

假设要检查三个包：

1. 若每个包都需要独立长上下文、独立工具范围和单独结果，创建三个 Subagent。
2. 若三个检查要限制并发、固定输出顺序，并让一个失败不打乱其他项，用 Workflow 组织三个 Subagent。
3. 若只是读取三个小文件并统计共同模式，当前 Agent 可在 `run_code` 内并发调用 Read；无需创建三个 Agent。

无论选择哪种方式，最后都要分别检查运行的停止原因和产物内容，因为父 Agent 写出「子任务完成」只代表它消费了一次结果，不会因此改写子 Session 的原始终态。

下一篇：[产品表面、反馈与评测接入](07-surfaces-feedback-eval.md)。
