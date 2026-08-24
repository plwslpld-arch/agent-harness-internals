# Telemetry、Eval Harness 与分数分别负责什么

[返回 pi 课程地图](README.md)

pi 同时有通用 Telemetry 接口和 Eval 相关包。Telemetry 记录运行生命周期；Eval Harness 负责在受控目录运行 Coding Agent 并保存 Artifact；Summary 再消费已有 Score。三者不是一个「自动判断任务正确」的模块。

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

Agent Telemetry 可以记录 Provider、Model、StopReason、Token、Cost 和首块延迟，但这些字段没有 Rubric 或 Pass Threshold。

### 可观测性为什么不能顺便充当评分器

Telemetry 的首要职责是忠实记录运行，不应因为某个指标「看起来不好」就改写事实。Eval 则必须依据冻结任务和判定规则，把多个事实解释成通过、失败或无法判断。把两者合并后，观察字段的变化可能无意中改变评分口径，评分逻辑也可能为了报表便利丢失原始事件。

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

关闭 Extensions 是为了减少未锁定变量，不代表真实产品只能这样评测。若目标是评估某个 Extension，必须把它的版本和配置写进 Target。

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

一个可信任务评分还要明确：测试命令、Diff 约束、基础设施失败处理和重复运行规则。Assistant StopReason、工具 Success、TUI Done 或 Telemetry Status 都不能单独替代它。

## 回到运费任务

Telemetry 可以说明模型调用两次、执行 `edit` 和 `bash`、总耗时多少；Eval 必须在独立工作区检查金额 100 的断言、回归测试和测试文件是否被篡改。若模型 API 超时且没有形成可判定补丁，应记录基础设施失败或无法判断，而不是把它重试成一次「通过」后删除早先事实。

## 练习：为一个分数列出最小证据

如果要给运费任务标记为通过，至少需要哪些 Artifact？

<details>
<summary>查看核对要点</summary>

至少需要冻结任务标识、输入源码版本、本次补丁或最终工作区哈希、目标测试与回归测试命令、退出码和输出、测试文件未被修改的检查，以及这些产物与同一 Run ID 的关联。Transcript 有助于解释过程，但不能替代最终环境验证。

</details>

到这里可以回到 [pi 课程地图](README.md)，或进入 [OpenCode 课程](../opencode/README.md) 比较服务化 Session 架构。
