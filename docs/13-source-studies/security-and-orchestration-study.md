---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 安全、审批与编排源码研究

## Sandbox 与 approval

**路径。** `packages/sandbox/sandbox/src/{index,escalation,roots}.ts` 定义词汇；`sandbox-policy/src/{index,session-mode}.ts` 决定会话模式；`sandbox-local/src/{index,profiles}.ts` 选择平台 runner；shell/fs consumer 才真正包 argv 或检查文件效果。`packages/interaction/user-approval/src/{index,types}.ts` 管请求生命周期，`permission-presets/src/{index,client,types}.ts` 组合 UI preset 与 sandbox/approval 状态。

**测试。** sandbox roots/escalation vocabulary；local `landlock/bwrap/seatbelt.e2e.ts`、Windows ACL 单测；policy specs；user approval 与 permission preset/projection specs。Postmortem 0004 的 partial-Landlock regression 证明 native 条件测试会 skip 时，还需确定性 fake runner 加 assembled path。

**结论。** permission preset 是策略组合，不是隔离。Sandbox 主要覆盖 filesystem effects，报告 full/partial/unavailable；网络、宿主 plugin、同进程 provider 不在同一边界。批准必须绑定具体 tool-call ownership 并失败关闭。

## Subagent

**路径。** 抽象与 ownership 在 `packages/subagent/subagent/`；in-process fork/spawn、child DSH、ACP、Codex、Claude provider 分包。ACP `run.ts` 管 child protocol；Codex `wire.ts/run.ts`、Claude `process.ts/run.ts` 处理各自进程面。

**测试。** 每个外部 provider 的 `loader-composition.e2e.ts`、protocol specs；真实 DeepSeek/产品 tests 需要凭据时必须报告 skip。取消外部进程不是副作用事务回滚。

## Workflow、Job、Goal、Schedule

**Workflow。** `workflow-worker-thread/src/{host,worker,realm,runtime,session,protocol}.ts` 在 worker/vm 中执行 model-authored JavaScript，JSON-only boundary，限制 children/concurrency/items。`parallel/pipeline` 的 fatal infrastructure/schema error 会逃逸；vm 不是安全边界。

**Jobs。** `jobs-local/src/index.ts` 保存 run snapshot/stream/kill；`tool-jobs` 暴露模型工具。增量 read 可能消费输出，必须保存 job id 且避免 busy polling。

**Goal。** `goal/src/{domain,fold,runtime}.ts` 保存会话当前唯一目标并从 events fold；`goal-round-driver` 是外层 Round 策略，不是每 turn 必有层级。

**Schedule。** `schedule/src/{domain,runtime,persistence,transaction,tools}.ts` 是 Agent-scoped durable queue；`session-local` delivery，不是 host cron。delay/absolute/interval 三选一，id 不复用。

**产品意义。** 这些是不同 ownership/生命周期工具，不应合并成“多 Agent”。选择依据是上下文隔离、后台输出、持久触发或单一目标；每种都要独立定义权限继承、成本和取消证据。
