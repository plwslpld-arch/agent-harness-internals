---
title: DSH 编排、委派与运行时扩展
article_type: harness
harness: deepseek-harness
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/subagent/README.md","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/subagent/subagent-in-process-driver/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/workflow/workflow/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/workflow/workflow-worker-thread/src/host.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/workflow/tool-ralph/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/plan/plan-mode/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/todo/tool-todo/tests/integration.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/tools/src/code-mode.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/extensions/tool-cordis/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"examples/acp-agent/tests/snapshots/subagent-depth-two-rejection/session.jsonl","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"}]
---

# DSH 编排、委派与运行时扩展

## 读者会得到什么

本篇不把「编排」当成一个万能模块，而是按控制跨度拆开：Plan 改变当前 Session 的行为指导，Todo 保存当前工作清单，Goal 维持跨 Turn 目标，Subagent 建立子会话，Workflow 批量调用子代理接缝，Ralph 用一轮一个新 Agent 的方式迭代，Skill 与 MCP 提供能力入口，Extension 改变运行时组合，Code Mode 则把多次工具调度包进一次模型可见的代码调用。

这些能力都在 Agent Loop 外层实现，却最终回到共同的 Session、工具注册表、Agent 生命周期和安全边界。Loop 不需要认识 `todo_write` 或 `subagent` 的业务含义；它只执行可见工具、记录结果并继续下一步。理解这点，才能区分「新增策略」「新增状态」「新增 Agent」和「新增可执行代码」。

先按跨度选能力。

![DSH 从当前会话指导、持久目标、子代理与工作流到技能、协议、扩展和代码模式的中文编排架构图](../../../assets/diagrams/deepseek-harness/06-orchestration-extensions.svg)

Claim: deepseek-harness.orchestration.extensions-share-core-loop

图中每一层都可以改变模型下一步看到的输入或可调用能力，但它们没有获得绕过工具安全和 Session 记录的特权。动态扩展的风险最高，因为它可能改变工具表与服务组合；因此它应是显式启用能力，不应从「仓库有这个包」推断成默认产品表面可用。

## 真实输入与输出

### 输入

上游 `subagent-depth-two-rejection` 夹具给根 Agent 的任务是：连续委派两代，第二层子 Agent 再尝试一次委派，并报告深度拒绝。根会话实际发出的第一次工具输入是：

```json
{
  "name": "subagent",
  "arguments": {
    "description": "启动第一层",
    "prompt": "调用一次子代理，让它再尝试一次子代理调用并报告结果。",
    "run_in_background": false
  }
}
```

这个调用是前台等待的一次性委派。进程内 Driver 先解析下一层深度并创建一个真正的子 Agent，然后把 prompt 作为子会话的新用户消息，等待其进入空闲，再读取收尾结果。它不是在父 Loop 内递归调用同一个函数栈。

### 输出

根 Session 最终只记录了第一层返回和根回复：

```jsonl
{"type":"tool/result","data":{"message":{"content":[{"content":[{"type":"text","text":"DEPTH_ONE_DONE"}],"isError":false}]}}}
{"type":"assistant/message","data":{"message":{"content":[{"type":"text","text":"ROOT_DONE"}]}}}
{"type":"turn/end","data":{"reason":{"kind":"completed"}}}
```

这份根快照证明一次父工具调用收到了子结果并继续收敛，却没有把孙代的拒绝错误原文写进根日志。文件名和任务文字不能替代深层子 Session 证据；要验证「第二层再委派被拒绝」，还必须读取子树事件或对应 Provider 测试。

结果边界要守住。

同理，Workflow 返回聚合值只说明脚本与子代理接缝结算；Ralph worker 报告完成也不是独立 Eval；Todo 全部勾完和 Goal 标记完成都只是 Harness 状态。任务是否真的完成，仍需检查产物与外部约束。

## 调用链

1. Plan Mode 把模式状态写进 Session，并在请求组装时增加计划指导；锁定源码明确让退出工具始终注册，因此进入或离开计划模式主要改变 prompt section，而不是偷偷替换整个工具表。指导与强制是两条轴，计划模式本身不是文件写入 Sandbox。
2. `todo_write` 作为普通工具经过真实 Agent Loop。集成测试断言 Session 同时出现 `tool/call`、非错误 `tool/result` 和 `todo/write` 快照；第二次写入替换整张列表。Todo 是工作视图，不是事件级审计或验收结论。
3. Goal 工具把长任务状态保存在会话服务中，并用目标标识与 revision 做并发保护。它适合跨 Turn 的同一 Agent 继续推进；创建、暂停、阻塞和完成是生命周期状态，不会自动启动新 Agent。
4. Subagent Runtime 选择一个具备声明能力的 Provider。进程内 Driver 检查 `maxDepth`，创建子 Agent，应用子组合与工具过滤，再投递 prompt；一次性模式等待结果，可继续模式则保留子会话并通过消息与结算通知继续协作。
5. Workflow Engine 在 Worker 中解释受限脚本，脚本的 `agent()` 最终调用同一个 `ctx.subagents.start()` 接缝。并发上限、结构化 Schema、取消和汇总属于 Workflow；每个子任务仍有自己的 Agent Session 与停止原因。
6. Hook 是挂在生命周期事件上的观察或扩展函数，不是另一种 Agent。Workflow 的开始、阶段、子 Agent 开始与结束、整次结束都形成事件；监听器错误被包含并记录，不能阻止权威运行结算，也不能把观察回调当成任务结果。

钩子不是调度器。

7. Ralph 工具建立在 Workflow 和 Subagent 之上。锁定实现要求 fresh Provider 不能继承父上下文，每轮只跨越有界结构化报告，共享工作区承担长期记忆；只有用户明确要求 Ralph 或新 Agent 迭代时才适用。
8. Skill 负责把按需说明与资源引入当前任务，MCP 将外部工具或资源适配到 Harness。它们扩展「模型知道什么、能请求什么」，不自动扩大文件、网络、审批或凭据权限；来源不可信时，说明文本本身也可能成为提示注入载体。
9. Code Mode 只向模型暴露 `run_code` 传输工具，程序内调用仍通过 Registry 分派原生工具，继承参数校验、Guard、取消和结果记录。一次运行使用隔离 Worker，不应假设跨调用保留变量的 REPL 状态。
10. Cordis Extension 工具可检查、定义、运行、停止和撤销动态包。它会改变活运行时服务与工具表，可能使请求前缀失效，也可能扩大攻击面；动态包代码、宿主半边与浏览器半边必须各自限制，不能把 `node:vm` 名称当安全证明。

fork 子 Agent 的价值之一是复用父会话已经完成的请求前缀，但这个收益有字节级条件：子侧新增 prompt section、报告工具或不同工具 Schema 都会让前缀在继承历史之前发生变化。一次性与可继续模式不能只按交互体验选择，还要核对它们是否改变前缀、权限覆盖、报告通道和恢复生命周期。

## 源码证据

进程内子代理并不是轻量函数回调，而是经 Agent Store 创建子实例并运行独立 Turn：

```source
packages/subagent/subagent-in-process-driver/src/index.ts:106-178
assertSubagentMaxDepth(request.maxDepth)
const childDepth = resolveChildDepth(parent, request.maxDepth)
const handle = await parent.ctx.agents.create({ ... })
child.followup(createUserMessage({ content: prompt, source: { kind: 'user' } }))
await child.whenIdle()
```

Workflow 的 host 侧没有复制 Agent Loop，而是调用同一 Subagent 接缝；Ralph 又调用 Workflow Engine，并在启动前拒绝继承父 Context 的 Provider。这形成「工具 → 编排引擎 → 子代理服务 → 子 Agent Loop」的组合链。

```source
packages/workflow/workflow-worker-thread/src/host.ts:352-365
run = await this.subagents.start(this.provider, { ... })

packages/workflow/tool-ralph/src/index.ts:221-229,447
if (provider.inheritsParentContext) throw new Error(...)
const run: WorkflowRun = ctx.workflowEngine.start({ ... })
```

Todo 的完整集成测试把插件状态落回共同 Session，而不是旁路存储：

```source
packages/todo/tool-todo/tests/integration.spec.ts:49-72
it('model calls todo_write: a tool/call, a non-error tool/result, and a todo/write snapshot land', ...)
expect(findEvent(log, 'tool/call').data.name).toBe('todo_write')
```

Extension 也通过 `ctx.tools.register()` 暴露入口，再调用 `dynamicCordisRunner` 执行定义、运行和撤销。Code Mode 源码则把程序调用描述为 Registry 的 Agent 可见工具。由多个包共同支持「共享核心边界」，所以 Claim 使用 D 级：这是有源码链支撑的跨子系统架构推断，不是单文件直接声明的统一定理。

## 失败与限制

第一，Plan、Todo 与 Goal 解决不同时间尺度。把 Todo 当 Goal 会在列表重写时丢失长期意图；把 Goal 当 Eval 会让 Agent 自己宣布完成；把 Plan 当安全策略会误以为提示文字能阻止副作用。

状态不是证据。

第二，Subagent 共享工作区不等于共享 transcript。新建子 Agent 需要完整独立 prompt；fork 子 Agent 只继承已完成前缀，不应包含父当前未闭合 Turn。可继续子会话还能收后续消息，但消息排队不能改写已经开始的当前 Turn。

第三，递归深度必须在 Provider 能力和实际子树中核对。根 Session 只保存根调用的汇总结果；如果子 Agent 吞掉深层错误并返回成功词，父端 `completed` 不足以证明深度限制按任务要求触发。

第四，Workflow 的并行只是调度能力。共享文件写入、相同分支修改、同一外部记录更新仍会冲突；脚本返回数组也不会自动建立 Trial 身份、去重或发布门禁。子代理基础设施失败与任务答案错误应分开统计。

第五，Ralph 每轮 fresh 并不天然更可靠。工作区里的错误中间产物会成为下一轮事实，短报告可能丢掉关键上下文，worker 自报完成也可能误判。必须为目标、轮次上限、交接 Schema、产物验证和停止条件分别定约。

第六，Skill 和 MCP 是供应链与提示边界。加载说明、连接远端 Server 或暴露资源都可能带入不可信内容；工具名称和描述进入请求前缀，还会影响缓存。权限应按连接、工具和资源最小化，凭据不得通过模型消息回显。

第七，Code Mode 不是权限逃逸。程序能批量编排工具，但每次原生调用仍应走相同安全链；若某个实现直接给 Worker 任意主机 API，便破坏了这个边界。代码成功执行也不代表内部每个业务操作都成功，必须读取结构化结果。

第八，动态 Extension 改变运行时本身，风险高于普通工具调用。热更新、服务冲突、工具表变化、浏览器半边不同步和撤销失败都要独立测试。未启用 Cordis preset 的产品不应展示这些能力，已启用也不等于允许模型安装任意代码。

## 验证方法

先分别运行 Plan、Todo 和 Goal 的集成测试。切换 Plan 前后比较工具 Schema 与提示段；两次写 Todo 验证全量替换；用旧 revision 更新 Goal 应失败。检查 Session 事件，而不是只看界面卡片。

再建立三层子树：根、第一层与第二层分别保存 Session ID、parent、depth、工具调用和停止原因。让最深层尝试超限委派，直接读取其错误结果；根端只接受汇总，不作为深层证据。重复测试一次性与可继续两种模式。

随后运行一个有界 Workflow，混合成功、结构化输出失败、取消和子代理启动失败。确认每次开始都有一次结束、并发不超过上限、结果保持输入身份。Ralph 则检查每轮新 Session、无父 transcript seed、报告长度上限和工作区产物哈希。

最后对 Skill、MCP、Code Mode 与 Extension 做安全验证：注入恶意说明、撤销连接、让代码调用被 Guard 拒绝、动态注册后比较请求头，再停止并撤销插件。任何能力都要经过同一产物 Scorer；内部状态「完成」不得替代独立验收。

## 自检

### 问题 1

Plan Mode 中模型被要求只规划，是否等于写工具已被 Sandbox 禁止？

**答案：** 不等于。锁定实现主要改变提示指导并保持工具 Schema 稳定；安全强制仍由工具策略、审批和平台 Sandbox 承担。

### 问题 2

Workflow 为什么不是另一套 Agent Loop？

**答案：** Workflow Engine 解释编排脚本，host 侧的 `agent()` 最终调用 Subagent Runtime；每个子任务仍由子 Agent 的共享 Loop、Session 和工具链执行。

### 问题 3

根快照里出现 `DEPTH_ONE_DONE`，能否证明孙代超限拒绝已发生？

**答案：** 不能。它只证明第一层返回了该文本。要证明深层拒绝，必须读取对应子 Session 或直接测试 Provider 的深度检查。

### 问题 4

Code Mode 和动态 Extension 的主要差别是什么？

**答案：** Code Mode 在一次工具调用内用程序编排已有 Registry 工具；Extension 可以改变活 Cordis 组合、服务与工具表。后者改变运行时身份与请求前缀，治理风险更高。
