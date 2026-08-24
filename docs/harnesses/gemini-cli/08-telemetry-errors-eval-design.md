# Telemetry 怎样解释失败，但不能替代独立 Eval

[返回 Gemini CLI 课程地图](README.md)

Gemini CLI 可以记录模型请求、API 错误、Tool Call、Confirmation、Hook、Compression、Retry、路由回退和运行指标。这些数据回答「发生了什么」，却没有任务答案、评分准则和发布阈值。

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

Decision=ACCEPT 且 success=false 是完全合法的组合：用户允许执行，但工具失败。Decision=AUTO_ACCEPT 且 success=true 也只说明工具协议成功，不说明任务完成。

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

聚合适合统计，不适合重建哪个文件失败。Eval 应保留单个 Call 与实际 Diff。

## 模型错误分类只覆盖响应层

源码：[查看响应错误映射](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/code_assist/telemetry.ts#L232-L274)

```typescript
// signal.aborted -> CANCELLED
// no candidates -> EMPTY
// STOP / MAX_TOKENS 之外的 FinishReason -> error
```

这能区分传输取消、空响应和模型拒绝，却看不到目标仓库测试是否通过。任务错误分类还要加入 Tool、Policy、Sandbox、Hook、表面序列化和 Artifact 验证。

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

关闭 Prompt 记录时，Trace 仍可有时长和错误码，但不能用于复原输入；Exporter 故障也会造成缺口。没有事件不是没有执行。

## 一个可复核的 Eval Artifact

针对「修复失败测试」，建议保存：

- 固定仓库基线、用户 Prompt、Settings、信任状态和实际路由模型；
- Agent/Turn 标识、模型 FinishReasons、Tool Call 状态与 Confirmation；
- Sandbox 类型与执行规格、文件 Diff、完整测试输出；
- 表面输出、进程 Exit Code、Token、时长和 Telemetry 可用性。

Evaluator 在 Agent 之外重新运行测试、检查 Diff 范围和任务约束，然后给出 Score。若把 Score 用于训练，应通过版本化 Reward Adapter 明确如何处理拒绝、基础设施失败和部分通过；Checkpoint 选择与最终发布仍使用隔离任务集。

到这里可以回到 [Gemini CLI 课程地图](README.md)，或进入 [Claude 课程](../claude/README.md) 比较公开 SDK 中 Tool Permission 与 Hook 的契约边界。
