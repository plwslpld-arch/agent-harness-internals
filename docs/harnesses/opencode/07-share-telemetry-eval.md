# Share、Telemetry、上游测试与独立 Eval 的边界

[返回 OpenCode 课程地图](README.md)

Share 负责把 Session 投影复制到外部查看服务，Telemetry 记录运行观察，上游测试保护特定代码契约，而独立 Eval 才会按固定任务检查 Artifact。四者虽然可以复用同一 Session 身份，回答的却是不同问题。

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

因为自动分享会把数据送出本地环境，所以必须由清晰配置控制，同时还要检查子 Session 是否包含敏感工具输出。

### 分享不是普通 UI 功能

Share Worker 持续复制的 Message、Part 和 Diff 可能包含源码、命令输出、路径和模型推理片段，因此它与 Provider 调用一样，都要接受数据分类、脱敏、删除和审计要求。一个公开链接能打开，只能证明远端存在某种投影——同步是否完整、删除生命周期是否正确，仍要分别核对。

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

即使分享链接已经存在，也不能据此认定远端副本与本地完全同步，而删除本地 Session 之后，更不能想当然地认为外部副本也被自动删除，最终仍要核对 API 结果。

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

由于源码里的 Telemetry 没有 Rubric、Score 或 Release Decision 字段，所以即使没有出现 Error Span，也不能证明修改正确。

## 独立 Eval 应保存什么

以代码修复为例：

1. 固定 Server/Project/Directory、Config Provenance、Agent、Provider/Model 和 Permission Ruleset。
2. 保存 Session/Message/Part、Tool/Question Events、Child Session IDs 和实际文件 Diff。
3. 记录 Compaction/Revert/Share/Telemetry 是否发生，但不要让它们覆盖原始 Artifact。
4. 在 OpenCode 外部重新运行测试与静态检查。
5. Scorer 根据测试、Diff 范围和任务约束给 Score 与失败原因。

如果训练信号来自这些结果，就应通过版本化 Reward Adapter 接入，而模型选择和最终发布仍要使用隔离任务。Share View、Session Idle、Tool Success、用户 Always Allow 或上游单元测试，都不能单独替代这一步。

## 回到运费任务

Share 页面可以帮助人复盘模型和工具过程，Telemetry 可以说明延迟和成本，上游测试可以保护 Processor 或 Permission 的代码契约，而只有外部 Scorer 在冻结工作区运行目标测试并检查 Diff，才能判断这次修复是否满足任务。四种证据彼此补充，却不能互相冒名。

## 练习：同步失败时结果还能否评分

Share Worker 最后一批同步失败，但本地 Session、Diff 和独立测试 Artifact 都完整。Eval 是否必须判为任务失败？

<details>
<summary>查看核对要点</summary>

不一定。因为本地 Session、Diff 和独立测试 Artifact 仍然完整，所以可以把分享同步记为可观测性或产品功能失败，同时继续依据本地冻结 Artifact 判定代码任务结果。只有当任务本身要求「成功创建分享」时，同步失败才属于产品结果失败，而评分口径必须由任务定义，不能看某个辅助系统是否绿色就下结论。

</details>

到这里可以回到 [OpenCode 课程地图](README.md)，然后进入 [横向比较](../../comparisons/01-runtime-config-model-input.md) 用同一问题比较六套 Harness。
