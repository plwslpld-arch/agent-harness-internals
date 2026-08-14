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

理解形状：

```ts
for (const call of modelToolCalls) {
  session.append(toolCall)

  parsed = parseAndValidate(call)
  policy = await emitWaterfall('tools/pre-execute', parsed)
  approval = await requestApprovalIfNeeded(policy)
  result = await runWithWrappersAndSandbox(approval, parsed)
  final = await emitWaterfall('tools/post-execute', result)

  session.append(toolResult(final))
}
```

## 不变量

- 被拒绝的工具也要产生 model-visible result。
- 工具报错要结构化，不应该静默丢失。
- 工具输出展示和工具 program value 要分开。
- 插件不能绕过 ToolRuntime 自己执行危险副作用。

## 本地实验

最小验证应该包括：

1. 一个只读工具成功。
2. 一个需要审批的工具。
3. 一个被拒绝的工具。
4. 一个工具内部抛错。
5. 一个并发工具场景。

观察点不是“有没有输出”，而是 Session 里是否有对应 `tool/call` 和 `tool/result`。

## 检查题

- 为什么 denial 也要成为模型可见结果？
- 如果工具绕过 ToolRuntime，会破坏哪些能力？
- permission preset 为什么不能被当成完整安全证明？

## 延伸阅读

- [../07-tools-permissions-sandbox/tool-policy-pipeline.md](../07-tools-permissions-sandbox/tool-policy-pipeline.md)
- [../07-tools-permissions-sandbox/trust-boundaries.md](../07-tools-permissions-sandbox/trust-boundaries.md)
- [../13-source-studies/security-and-orchestration-study.md](../13-source-studies/security-and-orchestration-study.md)
