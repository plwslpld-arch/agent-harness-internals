# 实践二：运行一个不需要模型的最小 Agent Loop

[上一项：复原源码调用链](controlled-task-contract.md) · [返回课程总目录](../README.md) · [下一项：权限与崩溃恢复](permissions-and-recovery.md)

这一项会把基础导读中的伪代码变成可以运行的确定性程序，让抽象的循环边界落到一次可重复的执行中。脚本化 Model 依次请求读取、编辑和测试，因此每一步决定都已经固定，不会把随机性带进观察结果。虚拟工作区承担环境副作用，而 Harness 负责循环、权限、Tool Result 和 Trace，三个角色之间仍然保持真实系统里的权力边界。整个程序既不会访问网络，也不会修改真实仓库文件，所以你可以反复重跑并比较 Trace，而不必担心练习污染当前 checkout。

## 先运行测试

从仓库根目录执行下面的命令。

```bash
node --test examples/minimal-harness/harness.test.mjs
```

下面五个测试名直接对应这一课要建立的五条边界。

```text
ok 1 - 最小 Harness 完成读取、编辑、测试和最终回复闭环
ok 2 - 工具结果与原 Call ID 一一对应
ok 3 - 权限拒绝不会产生编辑副作用
ok 4 - 独立判定不相信模型最终文本
ok 5 - 恢复未结算编辑时先观察环境，不盲目重放
# pass 5
# fail 0
```

第 3 条和第 4 条可以放在一起看，因为权限拒绝后虚拟源码保持原样，说明拒绝发生在工具体被调用之前。这个断言把审批记录和环境状态连在一起——它比单独检查某条日志更能说明工具是否真正执行。独立 Evaluator 即便拿到「全部通过」的模型文本，只要源码仍有边界错误，判定就依然是 failed。它重新读取环境产物，因此模型的措辞不会进入任务是否通过的判断依据。这两条分别回答「谁能改变状态」和「谁说了算」，也把执行成功与任务成功之间的边界留在了测试里。

## 先看四个对象

打开 [`examples/minimal-harness/harness.mjs`](https://github.com/plwslpld-arch/agent-harness-internals/blob/main/examples/minimal-harness/harness.mjs)：

| 对象 | 扮演什么角色 |
| --- | --- |
| `createScriptedModel()` | 用固定决定替代真实模型，消除随机性和凭据依赖 |
| `createShippingWorkspace()` | 保存虚拟源码并执行确定性目标测试 |
| `runHarness()` | 维护消息、审批、工具执行、Trace 和停止条件 |
| `evaluateShippingTask()` | 在运行结束后独立检查任务结果 |

脚本化 Model 虽然不是智能系统，却保留了真实 Harness 最关键的协议边界：Model 只能提出 Tool Call，真正改变状态的动作仍由 Environment 执行。正因为决定序列已经固定，你看到的失败就能直接追到权限、工具或循环控制，而不必先排除模型采样差异。

## 沿一次运行读代码

1. `runHarness()` 把用户目标写成第一条消息；
2. Model 返回 `call-read`；
3. Harness 记录 `tool_requested`，等待 `approve()`；
4. 虚拟工具读取源码，结果带着同一 Call ID 回填；
5. Model 看到结果后请求 `edit`；
6. 编辑获准并改变虚拟工作区；
7. Model 请求 `test`，退出码和输出成为新观察；
8. Model 最后生成文本，Harness 以 `completed` 结束；
9. Evaluator 仍可独立运行目标测试，不依赖最终文本。

`completed` 描述循环生命周期，而 `passed` 描述任务判定，两个字段需要始终分开理解。前者只说明 Harness 已经抵达某个停止条件，无法证明工作区里的运费边界错误真的消失。后者来自独立检查，只有环境产物满足冻结的任务条件时才会成立。示例特意保留这层差异，避免两种含义被压成同一个绿色勾。

## 修改一处，观察行为

依次尝试：

1. 把编辑批准改成 Deny，确认源码没有变化；
2. 让 Model 调用未知工具，观察 `tool_failed` 怎样进入消息；
3. 把 `maxSteps` 设为 2，观察 Step Limit 与任务失败的区别；
4. 让测试工具退出 1，确认 Model 文本不能覆盖环境结果；
5. 复制一个 Call ID，思考真实 Harness 为什么需要拒绝重复身份。

每完成一项修改，都先写下预期再运行测试，这样更容易看清哪些状态属于 Model、Harness 或 Environment。预测与实际 Trace 如果不同，就从第一个分叉事件向前检查，而不要只盯着最终文本。这个练习关心的是边界能否被观察和解释，功能数量多少并不会改变结论。

## 这个示例刻意没有实现什么

- 没有流式 Token 和 Provider Adapter；
- 没有并发工具批次；
- 没有真实文件、Shell 或 OS Sandbox；
- 没有 Session 持久化和 Compaction；
- 没有真实模型不确定性。

正因为省去了这些机制，最小循环才容易逐行核对，而且每条 Trace 都能对应到少量状态变化。等这条确定性路径已经读顺，再引入真实模型或并发工具，新增的不确定性才有可比较的基线。下一项只会增加权限与恢复，并继续沿用同一个虚拟工作区，因此学习范围不会突然跳到大型框架。

[下一项：给最小 Harness 增加权限和崩溃恢复](permissions-and-recovery.md)
