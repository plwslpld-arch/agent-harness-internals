# Telemetry、Eval Harness 与分数分别负责什么

[返回 pi 课程地图](README.md)

pi 同时提供通用 Telemetry 接口和 Eval 相关包，其中 Telemetry 记录运行生命周期，Eval Harness 在受控目录运行 Coding Agent 并保存 Artifact，而 Summary 只消费已有 Score。它们不会自动判断任务对错。

```text
Agent 运行 ─→ Span / Events / Metrics
    │
    └→ Eval Harness ─→ Transcript + Session JSONL + Source
                              ↓
                       外部 Scorer 产生 Score
                              ↓
                       Summary 聚合 Observation
```

## 第 1 站：Telemetry 接口没有 Score 语义

源码：[查看通用 Telemetry](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/telemetry/src/index.ts#L14-L22)

```typescript
startSpan(options, callback)
addEvent(name, attributes)
setAttributes(attributes)
setStatus(status)
```

- **调用者**：AI、Agent、Coding Agent 和 Protocol 运行点。
- **输入**：名称、时间、关联属性与错误状态。
- **状态变化**：向注入的 Telemetry Context 发送观察数据。
- **返回**：Span 结果或原业务函数返回值。
- **下一站**：Exporter、Trace Viewer 或 Eval Artifact Collector。

Agent Telemetry 虽然可以记录 Provider、Model、StopReason、Token、Cost 和首块延迟，却不会因此给这些字段附加 Rubric 或 Pass Threshold。

### 可观测性为什么不能顺便充当评分器

Telemetry 的首要职责是忠实记录运行——它不能因为某个指标「看起来不好」就改写事实。Eval 做的是另一件事，它必须依据冻结任务和判定规则，把多个事实解释成通过、失败或无法判断。一旦把两者合并，观察字段的变化就可能无意中改变评分口径，评分逻辑也可能为了报表便利而丢失原始事件。

源码：[查看 Agent Harness Telemetry 字段](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/telemetry.ts#L42-L115)

```typescript
'pi.ai.response.stop_reason'
'pi.ai.usage.total_tokens'
'pi.ai.stream.time_to_first_chunk_ms'
```

## 第 2 站：Eval Harness 负责运行和留证

源码：[查看 pi Eval Harness](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/evals/src/pi-harness.ts#L109-L218)

```typescript
setArtifact('runId', sessionManager.getSessionId())
setArtifact(
  PI_SESSION_SNAPSHOT_ARTIFACT,
  await readFile(sessionPath, 'utf8'),
)
```

- **调用者**：Eval Case Runner。
- **输入**：任务、选择的模型与 Source Workspace。
- **状态变化**：创建临时目录和无 Extension Session，运行 Prompt，转换 Transcript Events。
- **返回**：Session JSONL、Source 和 Run ID 等 Artifacts。
- **下一站**：确定性或模型 Scorer 读取产物。

关闭 Extensions 是为了减少未锁定变量，并不意味着真实产品只能用这种方式评测。如果目标就是评估某个 Extension，就必须把它的版本和配置一并写进 Target。

## Summary 不会凭 Transcript 自动创造分数

源码：[查看 Eval Summary](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/evals/src/vitest-evals/summary.ts#L164-L180)

```typescript
// scored Observation 进入比较；
// unscored 被归类为 missing-score。
```

- **调用者**：Eval Suite 结束后的汇总器。
- **输入**：已有 Score 的 Observation 与无分数项。
- **状态变化**：分类、比较和聚合。
- **返回**：报告数据。
- **下一站**：人或发布流程解释结果。

任务评分要想可信，还必须明确测试命令、Diff 约束、基础设施失败处理和重复运行规则，而 Assistant StopReason、工具 Success、TUI Done 或 Telemetry Status 无论哪一项都不能单独替代这些规则。

## 回到运费任务

Telemetry 可以说明模型调用了两次、执行过 `edit` 和 `bash`，以及整个过程耗时多少，而 Eval 必须进入独立工作区，检查金额 100 的断言、回归测试和测试文件是否被篡改。如果模型 API 超时，并且没有形成可判定的补丁，就应把这次运行记录为基础设施失败或无法判断，不能等到某次重试「通过」后再删除早先事实。早先事实仍要保留。

## 练习：为一个分数列出最小证据

如果要给运费任务标记为通过，至少需要哪些 Artifact？

<details>
<summary>查看核对要点</summary>

至少要留下冻结任务标识、输入源码版本、本次补丁或最终工作区哈希、目标测试与回归测试命令、退出码和输出、测试文件未被修改的检查，并把这些产物关联到同一个 Run ID。Transcript 能帮助人理解运行过程，但它不能替代对最终环境的验证。

</details>

到这里可以回到 [pi 课程地图](README.md)，或进入 [OpenCode 课程](../opencode/README.md) 比较服务化 Session 架构。
