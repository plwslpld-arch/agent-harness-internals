# 子 Agent、Workflow 与 Code Mode：三种不同的编排跨度

[返回 DeepSeek Harness 课程地图](README.md)

前五篇都在回答「一个 Agent 如何完成一个 Turn」。当任务变大后，Harness 还要回答三个不同问题：什么时候创建另一个 Agent，什么时候让一段脚本组织多个 Agent，什么时候只想在一次工具调用里批量调用现有工具。

DeepSeek Harness 分别用 Subagent、Workflow 和 Code Mode 处理它们。三者都叫「编排」并不意味着它们可以互换。

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

Subagent 的价值在于给一项子任务独立的上下文、生命周期和结果通道，并不会让模型凭空「更聪明」。Workflow 把并发、流水线和结果聚合从自然语言决策移进可重复脚本；它改变的是编排方式，不会增加模型本身的能力。Code Mode 也不创建 Agent；它把多次工具调用压进一个模型可见的 `run_code`，减少模型与 Harness 的往返。

## Subagent：一次委派是一条完整子运行

一次进程内委派先计算子层级，创建新 Session，再把父 Agent 的允许继承项、Persona、工具过滤和结构化输出约束装到子上下文中。`spawn` 没有历史 Seed；`fork` 带一段已完成 Turn 的 Seed，但激活边界之后的新事件仍属于这次子运行。

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

「在第一次 await 前捕获」很重要。如果父端在子 Agent 创建期间切换了权限策略，已经开始的委派不应偷偷继承未来值。另一个边界是 Publication：发布前取消意味着创建事务没有交出子 Agent；发布后取消则必须通过已返回的 Run 管理，不能把已存在的子 Agent 当成「启动失败」。

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

源码故意保留取消或截断前已经提交的最后一段 Assistant 输出，所以 `output` 非空不等于 `stopReason === 'completed'`。结构化 Schema 没有捕获到值时，即使普通文本看起来完整，也不能把结构化委派判为成功。

## Workflow：脚本拥有编排，事件只负责观察

Workflow Service 接收脚本、参数、父 Agent 和取消信号，返回一个 live run。脚本里的 `agent()` 可以启动多个子运行；`phase()` 与 `log()` 只提供观察信息，不改变执行语义。

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

`agent-start` 与 `agent-end` 用 `agent.seq` 配对。子 Agent 尚未发布便启动失败时，两者都不发；已经发布后，无论正常结束、失败还是取消，都要有一次 `agent-end`。因此「看到一个 start」可以建立待结算项，但不能直接计为已完成。

Workflow 还区分致命编排错误和普通子任务失败。脚本解析、参数、资源上限、不可序列化结果等 `WorkflowError` 会终止脚本；普通子运行失败可以在组合器中映射为该项的 `null`。这防止一个拼写错误被伪装成「某个子任务没有答案」。

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

如果遥测监听器抛错就能终止脚本，观察系统会意外成为控制系统；如果监听器可以修改结果，重放也会依赖当时加载了哪些插件。这里选择 contain listener failure，保留了这条边界。

## Code Mode：外面只有 `run_code`，里面仍是受控工具调用

Code Mode 为 TypeScript 或 Python Runtime 生成匹配语言的 `run_code` Schema。模型写的是异步函数体，通过 `tools.name(args)` 调用它本来可见的工具。

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

并发只发生在工具 Body 阶段。Guard、Pre/Post Execute、开始和结算事件仍走单一有序通道；独占工具会等待并发池排空，并一直持有屏障到提交完成。因此把三次 Bash 包进 `Promise.all` 并不能绕开 Registry 对独占执行的判定。

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

Code Mode 不是「任意代码拥有宿主全部权限」。真正的隔离强度还取决于 Code Runtime，但工具能力这层仍按调用 Agent 的可见集重新解析，并经过同一个执行管线。

## 用一个代码审查任务理解三者

假设要检查三个包：

1. 若每个包都需要独立长上下文、独立工具范围和单独结果，创建三个 Subagent。
2. 若三个检查要限制并发、固定输出顺序，并让一个失败不打乱其他项，用 Workflow 组织三个 Subagent。
3. 若只是读取三个小文件并统计共同模式，当前 Agent 可在 `run_code` 内并发调用 Read；无需创建三个 Agent。

无论选择哪种方式，最后都要分别看运行停止原因和产物内容。父 Agent 写出「子任务完成」只是一次消费结果；它不会改写子 Session 的原始终态。

下一篇：[产品表面、反馈与评测接入](07-surfaces-feedback-eval.md)。
