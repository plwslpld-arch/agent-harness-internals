# Telemetry 怎样解释失败，但不能替代独立 Eval

[返回 Gemini CLI 课程地图](README.md)

上一节先看 stream-json 公开哪些事件、非交互消费者忽略哪些事件，再追踪消息怎样走向三种输出格式，以及 IDE Diff 和 A2A Task 分别如何结束，由此把各个表面的事件与停止方式分开。做评测时还得锁定表面和版本。在这个前提下，Gemini CLI 会用 Telemetry（遥测）记录模型请求、API 错误、Tool Call、Confirmation、Hook、Compression、Retry、路由回退和运行指标，不过这些数据只能告诉你「发生了什么」，里面没有任务答案、评分准则和发布阈值。运行观测与任务评分必须分开。

```text
执行链：Prompt → Model → Tool → Artifact
                  │       │
                  └→ Telemetry Events / Metrics
                              │
Artifact + Trace + 固定任务 ──┴→ 独立 Evaluator → Score
```

## 用户确认决定与工具执行结果是两个字段

### 第 1 站：Decision 只描述授权动作

源码：[查看 Confirmation Telemetry 映射](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/telemetry/tool-call-decision.ts#L9-L30)

```typescript
enum ToolCallDecision {
  ACCEPT,
  REJECT,
  MODIFY,
  AUTO_ACCEPT,
}

// ToolConfirmationOutcome.Cancel -> REJECT
```

- **调用者**：Confirmation 结算后的 Telemetry Logger。
- **输入**：用户或 Policy 对一次 Tool Call 的决定。
- **状态变化**：不改变业务执行，只生成标准化观察字段。
- **返回**：Tool Call Decision。
- **下一站**：与执行时长、Success、工具类型一起记录。

源码：[查看 Tool Call 指标](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/telemetry/loggers.ts#L139-L161)

```typescript
recordToolCallMetrics(config, event.duration_ms, {
  function_name,
  success,
  decision,
  tool_type,
})
```

Decision=ACCEPT 与 success=false 完全可以同时出现，因为用户虽然放行了这次调用，工具执行时仍可能失败。Decision=AUTO_ACCEPT 与 success=true 也只说明系统自动放行，而且工具按协议顺利结束，不能据此断定整个任务已经完成。

## 批量编辑的聚合会丢掉单项细节

源码：[查看 Code Assist 聚合](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/code_assist/telemetry.ts#L117-L192)

```typescript
// 任一 cancelled -> ACTION_STATUS_CANCELLED
// 任一 error -> ACTION_STATUS_ERROR_UNKNOWN
// 全部 accepted 且至少一个 edit -> ACCEPT_FILE
```

- **调用者**：Code Assist 完成一批工具动作后。
- **输入**：多个 Tool Call 的状态与编辑结果。
- **状态变化**：按优先级折叠成一个交互状态。
- **返回**：面向指标系统的聚合 Event。
- **下一站**：Dashboard 或产品分析。

把一批动作折成一个状态很适合统计，却无法告诉你究竟哪个文件出了问题，所以 Eval 还要保留每个 Call 及其实际 Diff。

## 模型错误分类只覆盖响应层

源码：[查看响应错误映射](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/code_assist/telemetry.ts#L232-L274)

```typescript
// signal.aborted -> CANCELLED
// no candidates -> EMPTY
// STOP / MAX_TOKENS 之外的 FinishReason -> error
```

这段映射能分清传输何时取消、模型何时返回空响应或拒绝继续，却看不到目标仓库的测试有没有通过，所以给任务错误分类时，还得核对 Tool、Policy、Sandbox、Hook 和表面序列化，并验证 Artifact（产物）。

## Telemetry 本身受配置和脱敏影响

### 第 2 站：启用、目标与 Prompt 记录都由有效配置决定

源码：[查看 Telemetry Config](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/telemetry/config.ts#L47-L127)

```typescript
// argv -> env -> settings
// enabled, traces, target, otlpEndpoint,
// otlpProtocol, logPrompts, outfile
```

- **调用者**：Telemetry SDK 初始化。
- **输入**：命令行、环境变量和 Settings。
- **状态变化**：选择 Exporter、协议、目的地与敏感正文策略。
- **返回**：Logger/Meter/Tracer 使用的有效配置。
- **下一站**：各运行点按配置发 Event 和 Metric。

关掉 Prompt 记录以后，Trace（执行轨迹）里仍会留下时长和错误码，却无法据此还原输入。如果 Exporter 自己出了故障，记录还会断档。没有事件，不等于没有执行。

## 一个可复核的 Eval Artifact

针对「修复失败测试」，建议保存：

- 固定仓库基线、用户 Prompt、Settings、信任状态和实际路由模型；
- Agent/Turn 标识、模型 FinishReasons、Tool Call 状态与 Confirmation；
- Sandbox 类型与执行规格、文件 Diff、完整测试输出；
- 表面输出、进程 Exit Code、Token、时长和 Telemetry 可用性。

Evaluator（评估器）要在 Agent 之外重新跑测试，再检查 Diff 改了多大范围、有没有违反任务约束，确认以后才能给出 Score。如果这些 Score 还要拿去训练，就得用 Reward Adapter（把原始信号转换成训练奖励的版本化规则）写清楚如何处理拒绝、基础设施失败和部分通过，选择 Checkpoint 与决定最终发布时则继续使用隔离任务集。

课程从 Config、Prompt 和 Context 起步，顺着 Turn、Tool、Policy、Session 与 Extension 组成的运行链，已经追到了表面协议、Telemetry 和独立 Eval 之间的边界。这一篇又把几个容易混淆的结果逐一拆开：Confirmation Decision 只说是否放行，工具 Success 说明调用怎样结束。批量编辑可以聚合统计，单项 Diff 才能指出哪个文件出了问题。响应错误来自模型调用，任务错误还要结合仓库里的实际结果来判。你还得保存实际 Diff、完整测试输出、表面输出、进程 Exit Code 和任务约束，最后把这些 Artifact 交给 Agent 之外的 Evaluator。回到课程地图后，就可以沿同一条调用链重新核对每一层收到什么、改了什么状态，又留下了什么证据。

到这里可以回到 [Gemini CLI 课程地图](README.md)，或进入 [Claude 课程](../claude/README.md) 比较公开 SDK 中 Tool Permission 与 Hook 的契约边界。
