---
sources: [{"repo":"deepseek-harness","path":"packages/core/tools","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/interaction/user-approval","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/interaction/permission-presets","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, inference]
---

# 08｜工具、审批与沙箱

## 先讲人话

模型可以“提出要做某个动作”，但不能直接做。Harness 的工具系统就是模型意图和真实副作用之间的治理层。

比如模型想运行命令、读文件、写文件、访问外部工具，都要经过统一流程。

## 三个概念不能混

| 概念 | 解决什么 |
| --- | --- |
| Approval | 人是否允许这次动作 |
| Sandbox | 技术上把动作限制在哪里 |
| Permission preset | 一组审批和沙箱策略组合 |

审批不是沙箱。沙箱也不是用户同意。两者都需要。

## 关键代码片段

源码入口：

- `packages/core/tools/src/index.ts`
- `packages/core/agent-loop/src/tool-calls.ts`
- `packages/interaction/user-approval/src/index.ts`
- `packages/interaction/permission-presets/src/index.ts`

工具系统的真实入口是 `ToolRuntime`。它不是一张函数表，而是一条治理流水线。

```ts
toolRuntime.prepare(exec)
toolRuntime.dispatch(exec)
toolRuntime.finalize(exec, result)
toolRuntime.finish(exec, result)
```

结合 Agent Loop 的 `executeToolCalls()`，一次工具调用的形状是：

```ts
appendToolCall(session, turn, step, block)
prepared = await ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(exec)
outcome = await ctx.tools[TOOL_RUNTIME_SCHEDULER].dispatch(prepared.exec)
result = await ctx.tools[TOOL_RUNTIME_SCHEDULER].finalize(exec, outcome.result)
appendToolResult(session, turn, step, block, result, callSeq)
```

这里的重点是：工具不是“模型一喊就跑”。模型只是生成一个 tool-call block；Harness 会把它变成 `ToolExecutionInput`，经过 schema、policy、approval、wrapper、body、post-execute、materialization，最后才变成 `tool/result`。

审批是独立 seam：

```ts
approval/request -> allowed-once | rejected | cancelled | unavailable
```

如果没有 answerer，`ask` 会 fail closed；`never` 会确定性拒绝。它不是“弹窗 UI 的实现细节”，而是工具副作用进入真实世界前的语义边界。

permission preset 是另一层：

```ts
preset -> sandbox mode + approval policy
```

例如默认表里有 `workspace-write + ask`，也有 `danger-full-access + never`。这说明 preset 是“用户意图包”，不是单独的安全机制。真正的约束还要看 shell/sandbox 插件是否挂载、工具是否走 ToolRuntime、审批策略是否生效。

## 为什么这层重要

非研发可以把工具系统理解成“模型动作的风控系统”。模型说“我要改文件”，只是提出申请；Harness 要判断：

1. 工具名是否存在。
2. 参数是否符合 schema。
3. 当前 agent 是否允许看到这个工具。
4. 这次动作是否需要人审批。
5. 运行时能否在 sandbox 中限制副作用。
6. 执行结果如何脱敏、裁剪、展示、回传给模型。

研发改这层时，要保证每个失败都能落到 `tool/result` 或结构化错误，而不是让模型下一步看到一个缺口。

## 不变量

- 被拒绝的工具也要产生 model-visible result。
- 工具报错要结构化，不应该静默丢失。
- 工具输出展示和工具 program value 要分开。
- 插件不能绕过 ToolRuntime 自己执行危险副作用。
- 并发工具只允许在工具声明 concurrency-safe 时进入 parallel group。
- wrapper 可以替换执行 signal，但不能切断调用者取消语义。
- `presentCall/presentResult` 是 UI 投影，不应影响工具真实返回值。

## 本地实验

最小验证应该包括：

1. 一个只读工具成功。
2. 一个需要审批的工具。
3. 一个被拒绝的工具。
4. 一个工具内部抛错。
5. 一个并发工具场景。

观察点不是“有没有输出”，而是 Session 里是否有对应 `tool/call` 和 `tool/result`。

建议实验记录多写一列“副作用状态”：

| 场景 | 期望 Session | 期望副作用 |
| --- | --- | --- |
| 只读成功 | `tool/call` + success `tool/result` | 无写入 |
| 审批拒绝 | `tool/call` + rejected/error `tool/result` | 无写入 |
| sandbox 阻止 | `tool/call` + sandbox error result | 越界写入失败 |
| 工具抛错 | `tool/call` + structured error result | 只保留已声明副作用 |
| 并发工具 | 多个 call/result 按模型顺序写入 | 并发不破坏共享状态 |

## 本讲源码证据卡

| 工具治理问题 | 证据入口 | 看什么 |
| --- | --- | --- |
| 工具在哪里注册 | `packages/core/tools/src/index.ts` | tool schema、execute、result materialization |
| 模型 tool call 如何进入工具 | `packages/core/agent-loop/src/tool-calls.ts` | 调度、并发、安全结算 |
| 审批在哪里处理 | `packages/interaction/user-approval/src/index.ts` | approval request/result 的事件和状态 |
| preset 如何组合策略 | `packages/interaction/permission-presets/src/index.ts` | approval 和 sandbox 的组合，不是安全证明 |

## 最小实验补充

```text
任务：验证工具失败也能回到模型。
步骤：
1. 触发一个 schema 不合法或权限被拒绝的工具调用。
2. 确认 Session 里存在 tool/call。
3. 确认最终有 tool/result，且 result 标识错误或拒绝。
4. 确认没有未审计副作用。
过关：能说明“失败被结构化记录”和“进程崩溃”的区别。
```

## 检查题

- 为什么 denial 也要成为模型可见结果？
- 如果工具绕过 ToolRuntime，会破坏哪些能力？
- permission preset 为什么不能被当成完整安全证明？
- 为什么审批通过不等于 sandbox 已经生效？

## 延伸阅读

- [../07-tools-permissions-sandbox/tool-policy-pipeline.md](../07-tools-permissions-sandbox/tool-policy-pipeline.md)
- [../07-tools-permissions-sandbox/trust-boundaries.md](../07-tools-permissions-sandbox/trust-boundaries.md)
- [../13-source-studies/security-and-orchestration-study.md](../13-source-studies/security-and-orchestration-study.md)
