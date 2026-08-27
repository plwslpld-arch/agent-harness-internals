# 子 Agent、Workflow 与 Code Mode：三种不同的编排跨度

[返回 DeepSeek Harness 课程地图](README.md)

前五篇一直在回答「一个 Agent 怎样完成一个 Turn」。当任务规模扩大后，Harness 还要区分三种需求：要不要创建另一个 Agent，要不要用确定性脚本组织多个 Agent，以及是否只需在一次工具调用中批量使用现有工具。

三者不能相互替换。DeepSeek Harness 分别用 Subagent、Workflow 和 Code Mode（代码模式）处理这三类需求，它们都涉及「编排」，但各自改变的运行边界不同。

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

Subagent 为一项子任务建立独立的上下文、生命周期和结果通道，但这种机制本身不会自动提高模型能力。Workflow 把并发、流水线和结果聚合交给可重复执行的脚本，不再要求模型每次都用自然语言决定编排步骤。Code Mode 仍然使用当前 Agent，只是把多次工具调用集中到一个模型可见的 `run_code` 中，从而减少模型与 Harness 之间的往返。

## Subagent：一次委派是一条完整子运行

执行一次进程内委派时，系统先计算子层级并创建新 Session，再把父 Agent 允许继承的项目配置、Persona、工具过滤规则和结构化输出约束装入子上下文。`spawn` 不携带历史 Seed，`fork` 则会带入一段已经完成 Turn 的 Seed，不过激活边界之后产生的新事件仍归当前子运行所有。

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

系统必须「在第一次 await 前捕获」继承值，因为创建子 Agent 期间，父端可能已经切换权限策略，而正在启动的委派不应悄悄读到之后才生效的值。发布改变取消路径。Publication 构成另一条边界：发布前取消，说明创建事务尚未交出子 Agent，发布后再取消，就必须通过已经返回的 Run 管理生命周期，不能把确实存在的子 Agent 重新解释成「启动失败」。

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

源码会保留取消或截断前已经提交的最后一段 Assistant 输出，因此 `output` 非空并不能证明 `stopReason === 'completed'`。文本完整不等于成功。即使文本看起来完整，也可能来自未正常完成的子运行。如果结构化 Schema 没有捕获到值，就不能判定这次结构化委派成功。

## Workflow：脚本拥有编排，事件只负责观察

Workflow Service 接收脚本、参数、父 Agent 和取消信号后，会返回一个 live run，脚本可以在该运行中通过 `agent()` 启动多个子运行。`phase()` 和 `log()` 只向外提供观察信息，不会改变脚本的执行语义。

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

系统通过 `agent.seq` 配对 `agent-start` 与 `agent-end`。如果子 Agent 在发布前启动失败，这两个事件都不会发出。一旦子 Agent 已经发布，无论之后正常结束、失败还是取消，都必须发出对应的 `agent-end`，因此观察者看到 start 时只能登记一项待结算运行，不能直接把它计为完成。

Workflow 会区分致命编排错误与普通子任务失败。脚本无法解析、参数非法、超出资源上限或结果不可序列化等 `WorkflowError` 会终止整个脚本，普通子运行失败则可以由组合器把对应项映射为 `null`。这样一来，系统不会把脚本中的拼写错误伪装成「某个子任务没有答案」。

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

如果遥测监听器抛错就能终止脚本，观察系统便会意外取得运行控制权。观察者不能控制运行。如果监听器还能修改结果，那么重放同一次运行时，结果将取决于当时加载了哪些插件。系统会隔离监听器失败，确保监听器只能观察事件，无法接管运行。

## Code Mode：外面只有 `run_code`，里面仍是受控工具调用

Code Mode 会根据 TypeScript 或 Python Runtime 生成对应语言的 `run_code` Schema。模型在其中编写异步函数体，并通过 `tools.name(args)` 调用当前 Agent 原本就能看到的工具。

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

并发只发生在工具 Body 阶段，Guard、Pre/Post Execute、开始事件和结算事件仍要经过同一条有序通道。遇到独占工具时，调度器先等待并发池排空，并持续阻断后续调用，直到独占工具提交完成。因此，即使模型把三次 Bash 调用放进 `Promise.all`，也无法绕过 Registry 对独占执行的判定。

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

Code Mode 不会让任意代码获得宿主的全部权限。权限并未随之扩大。实际隔离强度仍取决于 Code Runtime，但系统会按照当前 Agent 的可见集重新解析每项工具能力，并让内部调用经过同一条执行管线。

## 用一个代码审查任务理解三者

假设要检查三个包：

1. 若每个包都需要独立长上下文、独立工具范围和单独结果，创建三个 Subagent。
2. 若三个检查要限制并发、固定输出顺序，并让一个失败不打乱其他项，用 Workflow 组织三个 Subagent。
3. 若只是读取三个小文件并统计共同模式，当前 Agent 可在 `run_code` 内并发调用 Read；无需创建三个 Agent。

无论选择哪种方式，最后都要分别检查每次运行的停止原因和产物内容。父 Agent 写出「子任务完成」，只说明它消费过一次结果，并不会改变子 Session 记录的原始终态。

下一篇：[产品表面、反馈与评测接入](07-surfaces-feedback-eval.md)。
