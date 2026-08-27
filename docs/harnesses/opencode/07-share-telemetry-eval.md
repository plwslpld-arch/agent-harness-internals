# Share、Telemetry、上游测试与独立 Eval 的边界

[返回 OpenCode 课程地图](README.md)

Share 会把 Session 的可见内容复制到外部服务，Telemetry（遥测）记下运行时发生了什么，上游测试守住特定的代码契约，独立 Eval 则按固定任务检查 Artifact（产物）。它们可以沿用同一个 Session 身份，但各自回答的问题不能混在一起。

## 第 1 站：分享策略区分禁用、手动和自动

源码：[查看 Share 入口](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/share/session.ts#L26-L45)

```typescript
if (conf.share === 'disabled') {
  throw new Error('Sharing is disabled in configuration')
}

if (!(flags.autoShare || conf.share === 'auto')) return result
```

- **调用者**：Session 创建或用户显式 Share。
- **输入**：Share Config、Feature Flags 与 Session ID。
- **状态变化**：禁用时拒绝；自动只对符合条件的根 Session 异步创建分享。
- **返回**：本地 Session 与可选 Share Metadata。
- **下一站**：ShareNext 做首次全量同步并监听后续事件。

自动分享会把数据送出本地环境，因此配置必须把开关写清楚，开启之前还得检查子 Session 里有没有敏感的工具输出。

### 分享不是普通 UI 功能

Share Worker 持续复制 Message、Part 和 Diff，而这些内容可能带上源码、命令输出、路径和模型推理片段，因此你要像检查 Provider 调用那样，检查它怎样给数据分类、怎样脱敏、怎样删除，又留下了哪些审计记录。公开链接能打开，只能说明远端已经有一份可见副本，至于内容有没有同步完整、删除流程能不能走完，还得分别核对。

## 第 2 站：Share 是会话投影的持续复制

源码：[查看 Share 事件监听](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/share/share-next.ts#L179-L200)

```typescript
yield* watch(MessageV2.Event.Updated, ...)
yield* watch(MessageV2.Event.PartUpdated, ...)
yield* watch(Session.Event.Diff, ...)
```

- **调用者**：活动 Share Worker。
- **输入**：Session、Message、Part、Diff 与 Delete Events。
- **状态变化**：把本地投影增量同步到远端；失败可能只记录告警。
- **返回**：外部可查看副本。
- **下一站**：取消分享时调用远端 Delete 并清理本地 Share 记录。

分享链接已经生成，不代表远端副本追上了本地内容。你删除本地 Session 之后，也别默认外部副本会跟着消失，最终要看 API 实际返回了什么。

## 第 3 站：OpenTelemetry 是条件性注入

源码：[查看 LLM Telemetry](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/llm.ts#L208-L218)

```typescript
const tracer = cfg.experimental?.openTelemetry
  ? ...
  : undefined

span.setAttribute('session.id', input.sessionID)
```

- **调用者**：Session LLM Stream。
- **输入**：实验配置、Session/Model/Provider 与请求时序。
- **状态变化**：启用时创建 Span 和模型 SDK Telemetry Metadata。
- **返回**：观察数据，不改变 Processor 控制结果。
- **下一站**：Exporter、Trace Backend 或 Eval Collector。

源码里的 Telemetry 没有 Rubric、Score 或 Release Decision 字段，因此 Trace 里没有 Error Span，也证明不了这次修改是对的。

## 独立 Eval 应保存什么

以代码修复为例：

1. 固定 Server/Project/Directory、Config Provenance、Agent、Provider/Model 和 Permission Ruleset。
2. 保存 Session/Message/Part、Tool/Question Events、Child Session IDs 和实际文件 Diff。
3. 记录 Compaction/Revert/Share/Telemetry 是否发生，但不要让它们覆盖原始 Artifact。
4. 在 OpenCode 外部重新运行测试与静态检查。
5. Scorer 根据测试、Diff 范围和任务约束给 Score 与失败原因。

如果要把这些结果变成训练信号，就用 Reward Adapter（把原始信号转换成训练奖励的版本化规则）接进来，选模型和决定是否发布时仍要跑隔离任务。Share View、Session Idle、Tool Success、用户点下 Always Allow，甚至上游单元测试全部通过，都不能单独顶替这一步。

## 回到运费任务

你可以在 Share 页面回看模型说了什么、工具做了什么，也可以从 Telemetry 里查延迟和成本，上游测试则用来守住 Processor 或 Permission 的代码契约。不过，只有外部 Scorer（评分器）在冻结的工作区里跑过目标测试并检查 Diff，才能判断这次修复是否完成任务。这四类证据可以拼在一起看，却不能拿其中一类冒充另一类。

## 练习：同步失败时结果还能否评分

Share Worker 最后一批同步失败，但本地 Session、Diff 和独立测试 Artifact 都完整。Eval 是否必须判为任务失败？

<details>
<summary>查看核对要点</summary>

不一定，因为本地 Session、Diff 和独立测试 Artifact 都还完整，你可以把这次同步记作可观测性或产品功能失败，同时继续根据冻结在本地的 Artifact 判断代码任务有没有完成。只有任务明确要求「成功创建分享」，同步失败才会让产品结果不合格，至于最后怎么评分，必须回到任务定义，不能只看某个辅助系统是不是绿色。

</details>

读完这一站，可以回到 [OpenCode 课程地图](README.md)，也可以进入 [横向比较](../../comparisons/01-runtime-config-model-input.md)，拿同一组问题去对照六套 Harness。
