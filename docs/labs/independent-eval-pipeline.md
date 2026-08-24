# 实践四：给任一 Harness 接一条独立 Eval 管线

[上一项：权限与崩溃恢复](permissions-and-recovery.md) · [返回课程总目录](../README.md)

前三项分别建立了源码证据、确定性 Loop 和恢复语义。最后一项把「Harness 正常结束」与「任务结果正确」彻底分开：Harness 负责执行和留证，外部 Evaluator 在干净进程中重新检查产物。

## 任务夹具

创建一个含单个运费边界错误的小项目。冻结：

- 初始源码版本或 Hash；
- 用户目标；
- 允许修改的文件；
- 禁止修改的测试；
- 目标测试与回归测试命令；
- 超时和基础设施失败口径。

任务定义一旦开始运行就不能由 Harness 改写。

## 三个组件

### Target Adapter

启动选定 Harness，传入任务与工作区，保存 Harness 版本、产品表面、Provider/Model、有效配置摘要、Session/Run ID、退出分类和原生 Trace。Adapter 只翻译接口，不给结果打分。

### Artifact Collector

在 Harness 结束后保存最终 Diff、文件 Hash、命令输出、Tool Calls、Permission Decisions、错误、成本和时长。Assistant 最终文本只是一个 Artifact，不能覆盖其他环境事实。

### Independent Evaluator

在新的进程或干净工作区中应用补丁，重新运行冻结测试，并检查测试文件未改、Diff 未越界、目标行为通过。Evaluator 不读取 Harness 的 `completed`、`idle` 或 Tool Success 来决定结果。

```json
{
  "task_id": "shipping-boundary-100",
  "target": { "harness": "codex", "commit": "固定版本", "surface": "exec" },
  "artifact": { "diff_sha256": "固定哈希", "test_exit": 0 },
  "evaluation": { "status": "passed", "reason": "目标测试和回归测试通过，测试文件未修改" }
}
```

## 四种结果要分开

- **passed**：环境产物满足全部任务约束；
- **failed**：运行完成，但修改、测试或约束不满足；
- **blocked**：缺少权限、依赖或平台能力，无法进入正常判定；
- **inconclusive**：Artifact 缺失或互相矛盾，无法可靠解释。

Provider 不可达和评测机磁盘满还应标记具体基础设施来源。重试可以恢复基础设施错误，但必须保留原运行；产品失败不能反复运行直到一次通过后覆盖。

## 与仓库里的确定性示例连接

`evaluateShippingTask()` 会重新执行虚拟目标测试，并检查 Trace 中是否存在成功测试结果。测试还证明：即使 `finalText` 声称全部通过，只要源码仍有边界错误，结果仍然是 Failed。

这个 Evaluator 很小，却体现了最重要的接口：评分器消费环境和 Trace Artifact，不消费模型自信程度。

## 可选真实模型阶段

只有确定性管线能稳定保存血缘后，再加入真实模型。额外锁定或记录：Sampling 参数、Tool Schemas、网络、Sandbox、超时、预算和线上模型版本。一次成功运行只证明该任务、该配置和该时间点的结果。

进一步的训练奖励、Checkpoint 选择和发布门槛应继续使用隔离数据职责；它们不是完成本实践的前置条件。

参考：[可观测性与独立 Eval 比较](../comparisons/05-observability-eval-deployment.md)。
