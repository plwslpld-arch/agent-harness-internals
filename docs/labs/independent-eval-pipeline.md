# 实践四：给任一 Harness 接一条独立 Eval 管线

[上一项：权限与崩溃恢复](permissions-and-recovery.md) · [返回课程总目录](../README.md)

前三项分别教你怎样拿到源码证据、跑通确定性 Loop，以及判断恢复到底恢复了什么。最后再单独判断结果。Harness 执行任务并留下证据，外部 Evaluator（评估器）再到干净进程里检查产物，因此你不能把「Harness 正常结束」当成「任务结果正确」。

## 任务夹具

先创建一个小项目，只放入一个运费边界错误，并在开始运行前冻结下面这些内容：

- 初始源码版本或 Hash；
- 用户目标；
- 允许修改的文件；
- 禁止修改的测试；
- 目标测试与回归测试命令；
- 超时和基础设施失败口径。

任务一旦开始运行，Harness 就不能再改这些定义，否则同一次评测的目标和判定标准会跟着执行过程漂移。

## 三个组件

### Target Adapter

Target Adapter（适配器）会启动选定的 Harness，并把任务和工作区交给它。

它还会保存 Harness 版本、产品表面、Provider（模型提供商）/Model、有效配置摘要、Session/Run ID、退出分类和原生 Trace（执行轨迹），但只负责在接口之间转换，不参与评分。

### Artifact Collector

Harness 结束后，Artifact Collector 会收集最终 Diff、文件 Hash、命令输出、Tool Calls、Permission Decisions、错误、成本和时长。Assistant 的最终文本只是其中一份 Artifact（产物），就算它声称任务成功，也不能推翻其他环境事实。

### Independent Evaluator

Independent Evaluator 会在新进程或干净工作区里应用补丁，重新运行事先冻结的测试，再检查测试文件有没有变化、Diff 是否越界，以及目标行为是否通过。模型自述不算分。它不会拿 Harness 的 `completed`、`idle` 或 Tool Success 来决定结果。

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

如果 Provider 不可达，或者评测机磁盘已满，记录里还要写清楚故障来自哪项基础设施。你可以通过重试从基础设施错误中恢复，但必须保留原始运行，否则产品失败后反复重跑、最后只留下某次通过，会掩盖系统的真实表现。

## 与仓库里的确定性示例连接

`evaluateShippingTask()` 会重新执行虚拟目标测试，再检查 Trace 里有没有成功的测试结果。配套测试还会制造一种情况：`finalText` 声称全部通过，但源码里的边界错误仍然存在，而 Evaluator 最后依然给出 Failed。

这个 Evaluator 虽然很小，却把关键接口讲得很清楚：评分器读取环境状态和 Trace Artifact，模型说得再自信也改不了判定。

## 可选真实模型阶段

只有确定性管线已经能稳定记录每份数据从哪里来、经过了什么步骤，才适合接入真实模型。接入以后，还要额外锁定或记录 Sampling 参数、Tool Schemas、网络、Sandbox、超时、预算和线上模型版本。即便运行成功，结论也只适用于这项任务、这份配置和这个时间点。

如果还要设计训练奖励、挑选 Checkpoint（检查点）并设置发布门槛，就得继续分开各类数据的用途，但做完这项实践并不要求你先掌握这些内容。

参考：[可观测性与独立 Eval 比较](../comparisons/05-observability-eval-deployment.md)。
