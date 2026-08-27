# 实践四：给任一 Harness 接一条独立 Eval 管线

[上一项：权限与崩溃恢复](permissions-and-recovery.md) · [返回课程总目录](../README.md)

前三项分别建立了源码证据、确定性 Loop 和恢复语义，而最后一项会把「Harness 正常结束」与「任务结果正确」彻底分开。Harness 负责执行任务并留下证据——外部 Evaluator 则在干净进程中重新检查产物。

## 任务夹具

先创建一个只含单个运费边界错误的小项目，并在运行前冻结以下内容：

- 初始源码版本或 Hash；
- 用户目标；
- 允许修改的文件；
- 禁止修改的测试；
- 目标测试与回归测试命令；
- 超时和基础设施失败口径。

任务一旦开始运行，Harness 就不能再改写这些定义。

## 三个组件

### Target Adapter

Target Adapter 启动选定的 Harness 并传入任务与工作区，同时保存 Harness 版本、产品表面、Provider/Model、有效配置摘要、Session/Run ID、退出分类和原生 Trace。它只负责翻译接口，不参与结果评分。

### Artifact Collector

等 Harness 结束后，Artifact Collector 会保存最终 Diff、文件 Hash、命令输出、Tool Calls、Permission Decisions、错误、成本和时长。Assistant 的最终文本只是其中一个 Artifact，即使它声称任务成功，也不能覆盖其他环境事实。

### Independent Evaluator

Independent Evaluator 会在新进程或干净工作区中应用补丁，重新运行已经冻结的测试，然后检查测试文件是否保持不变、Diff 是否越界以及目标行为是否通过。它不会读取 Harness 的 `completed`、`idle` 或 Tool Success 来决定结果。

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

如果 Provider 不可达或者评测机磁盘已满，记录中还要标明具体的基础设施来源。基础设施错误可以通过重试恢复，但原始运行必须保留，否则反复重跑产品失败并只留下某次通过，会掩盖系统的真实表现。

## 与仓库里的确定性示例连接

`evaluateShippingTask()` 会重新执行虚拟目标测试，并检查 Trace 中是否存在成功的测试结果。配套测试还证明，即使 `finalText` 声称全部通过，只要源码里的边界错误仍然存在，最终结果就依然是 Failed。

这个 Evaluator 很小，却把关键接口表达得很清楚：评分器消费环境状态和 Trace Artifact，模型表现得多么自信并不会改变判定。

## 可选真实模型阶段

只有当确定性管线已经能够稳定保存血缘时，才适合加入真实模型，并额外锁定或记录 Sampling 参数、Tool Schemas、网络、Sandbox、超时、预算和线上模型版本。即便运行成功，结论也只覆盖该任务、该配置和该时间点。

如果还要设计训练奖励、Checkpoint 选择和发布门槛，就应继续隔离数据职责，不过这些内容并非完成本实践的前置条件。

参考：[可观测性与独立 Eval 比较](../comparisons/05-observability-eval-deployment.md)。
