# 运行证据怎样进入独立 Eval，而不是变成宣传结论

[上一篇：编排、协议与产品表面](04-orchestration-protocol-surfaces.md) · [返回课程总目录](../README.md)

Harness 结束、工具返回成功、测试进程退出 0 和任务通过，各自回答不同的问题，也各有自己的证据门槛。这四类结论不能混用。这一篇会把六套课程里的 Event、Telemetry（遥测）、Session、测试和 Eval 串成一条证据链，看系统怎样先记下「发生过什么」，再判断「用户目标是否满足」，也帮你避开一个常见错误：把仓库检查通过写成已经可以投入生产。

![运行证据进入独立评测的流程](../assets/diagrams/comparisons/05-observability-eval-deployment.svg)

## 四层结论

| 层次 | 典型问题 | 证据示例 | 不能证明什么 |
| --- | --- | --- | --- |
| 协议生命周期 | 模型流、工具或 Session 是否正常结束 | Stop Reason、Tool Part、Idle Event | 用户目标是否满足 |
| 环境事实 | 文件和进程实际发生了什么 | Diff、命令、退出码、日志 | 测试是否覆盖任务口径 |
| 任务判定 | 冻结任务是否通过 | 独立测试、Rubric、约束检查 | 其他任务和部署是否可靠 |
| 发布决策 | 一组结果是否达到发布标准 | 隔离数据、统计规则、回归门槛 | 生产环境必然无故障 |

后一层可以读取前一层留下的证据，但中间必须有明确的判定过程，否则你不能直接把结论抬高一级。证据不会自己升级。

## 六条课程提供的观察面

| 课程 | 可观察运行事实 | Eval 位置或边界 | 深入阅读 |
| --- | --- | --- | --- |
| DeepSeek Harness | Session、产品表面、Feedback 与实际 Eval 接缝 | 只对源码中真实存在的适配与数据流下结论 | [产品表面、Feedback 与 Eval 接缝](../harnesses/deepseek-harness/07-surfaces-feedback-eval.md) |
| Codex | Thread/Turn Event、Rollout、Store 与产品表面 | Trace 可供外部任务判定，事件终态不是 Score | [事件、Trace 与 Eval 接缝](../harnesses/codex/08-surfaces-trace-eval-design.md) |
| Gemini CLI | Tool/Session Events、Telemetry 与错误分类 | Telemetry 观察运行，外部 Eval 冻结任务 | [Telemetry、错误与 Eval 接缝](../harnesses/gemini-cli/08-telemetry-errors-eval-design.md) |
| Claude | SDK 消息、Result/Error、Hook 与 Session 契约 | 公开 SDK 能收集边界事件，不能证明产品内部全部 Trace | [产品表面、错误与 Eval 接缝](../harnesses/claude/10-surfaces-errors-eval-design.md) |
| pi | 通用 Telemetry、Eval Harness Artifact 与 Summary | Harness 留证，外部 Scorer 产分，Summary 不创造分数 | [Telemetry、Eval Harness 与分数](../harnesses/pi/07-telemetry-evals-boundaries.md) |
| OpenCode | Message/Part/Event、Diff、Share 与可选 OpenTelemetry | Share/Telemetry 不是评分器，独立 Eval 在外部运行 | [Share、Telemetry 与独立 Eval](../harnesses/opencode/07-share-telemetry-eval.md) |

比较这些系统时，别只数字段有多少。字段多不等于证据强。你真正要看的是：系统能否稳定关联输入版本、运行身份、环境里留下的产物以及最终判定。

## 最小跨 Harness Artifact

要把同一个运费任务交给不同 Harness 再比较结果，每次运行至少得保存下面这些信息：

```yaml
task:
  id: shipping-boundary-100
  source_revision: 固定输入版本
run:
  harness: 项目与锁定版本
  session_id: 本次会话身份
  model: 实际 Provider 与 Model
  config_digest: 有效配置摘要
artifacts:
  trace: 模型、工具和错误事件
  patch: 最终修改或工作区哈希
  commands: 测试命令、目录、退出码和输出
  constraints: 测试文件未修改、路径范围等
evaluation:
  result: pass | fail | blocked | inconclusive
  reasons: 结构化原因
```

这里展示的只是教学用的数据契约，它把不同 Harness 的信息投影到同一组字段，并不对应六套项目里某个现成的同名结构。真正编写 Adapter（适配器）时，要先保留各项目的原始事件，再把它们映射到共同字段，不能为了把表格填整齐就丢掉差异。

## Trace 与 Telemetry 的职责

Trace（执行轨迹）帮你还原事情的前后关系，例如哪次模型请求产生了哪个 Tool Call，工具返回的结果又进入了哪一轮。Telemetry 主要记录延迟、Token、成本、错误率和资源消耗等运行特征。两者不能互相替代。它们可以共用 Session/Span 身份，但某个指标即使超过阈值，也不能反过来改写原始事实。

安全日志还得处理源码、凭据和模型输入里的敏感信息，但脱敏后的展示数据不能覆盖原始的受控 Artifact（产物），否则排查问题的人和执行 Eval 的程序可能在不知情时各用一套数据。

## 独立 Eval 为什么要在 Harness 外再次验证

模型可能改掉测试文件，只运行一部分测试，也可能看错命令输出，所以 Harness 里的 Tool Success 只能说明工具返回了成功。这仍然不够。独立 Eval 还得进入干净环境，用事先冻结的命令重新检查目标断言和回归约束。

运费任务的最小判定可以是：

1. 应用补丁到固定源码；
2. 确认测试文件未被修改；
3. 运行金额 100 的目标测试；
4. 运行约定回归测试；
5. 保存命令、退出码和输出；
6. 把结果关联到同一 Run 与 Patch。

即使模型最后什么也没写，只要环境 Artifact 足够完整，独立 Eval 仍有可能判定结果。反过来，模型就算把结论写得再自信，只要目标测试失败，结果仍应判为失败。

## 失败、阻断与无法判断

评测没有通过时，别急着把所有情况都写成 Fail，因为你至少还得区分下面四类结果：

- **fail**：运行完成且结果不满足任务；
- **blocked**：缺少权限、依赖或平台能力，任务没有进入可判定状态；
- **inconclusive**：Artifact 缺失或矛盾，无法可靠判断；
- **infrastructure error**：评测基础设施自身故障，应与产品失败分开统计。

重试可以让系统从偶发的基础设施错误中恢复，却不能把真实发生过的产品失败从分母里删掉。如果允许模型反复尝试同一任务，就要保留每一次 Attempt（尝试），并且提前规定由哪一次 Attempt 代表整个 Trial（评测试次）。

## 四种常见误判

1. **Session Idle = 任务通过**：Idle 只说明当前控制循环没有继续工作。
2. **Tool Success = 副作用正确**：命令成功可能运行了错误测试，写入成功可能改了错误文件。
3. **Telemetry 无错误 = 质量良好**：没有异常不代表实现符合需求。
4. **上游单元测试通过 = 仓库生产就绪**：测试只覆盖其明确断言和环境。

同样，课程链接能打开、内容检查通过、图示渲染正常，只能证明这个知识库满足了相应的质量要求，不能证明六个上游项目已经适合生产使用，也不能证明学习者已经具备生产能力。

## 训练与发布为什么要隔离

如果要把评测结果送进 DPO、GRPO、RFT 或其他训练流程，就得让版本化的 Reward Adapter 明确怎样接收输入、怎样归一化，以及怎样处理缺失值和失败。训练流程会把结果转成奖励，Checkpoint 选择会比较候选，最终发布 Eval 则要在隔离数据上作判断，因此三者必须提前分清数据用途，否则系统会对同一个判定器过拟合，最后把训练中的提升错当成真实的泛化能力。

这部分属于进阶内容，不会改变本仓库围绕 Agent Harness 源码展开的主线。如果你刚开始学，可以先分清三件事：执行 Trace 留下证据，独立 Scorer 作出判定，发布门槛决定是否发布。

## 练习：给三个结果分别下结论

现在看三个场景：A 中模型正常结束，却没有运行测试。B 中测试命令退出 0，可测试文件已经被修改。C 中模型 API 超时且没有产生补丁，随后评测机又发生磁盘错误。请分别写出它们的协议状态、环境事实和任务判定。

<details>
<summary>查看核对标准</summary>

A 可以正常结束协议，但它留下的任务证据仍然不足。B 虽然有命令成功这一环境事实，却违反了任务约束，所以应该判为失败。C 必须分开记录模型运行故障和评测基础设施故障，当 Artifact 不足时应标记 blocked 或 inconclusive，不能无限重试直到挑出一次通过。

</details>

完成比较课程后，进入[确定性实践](../labs/controlled-task-contract.md)，亲手复原一条源码调用链。
