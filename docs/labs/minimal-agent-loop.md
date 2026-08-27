# 实践二：运行一个不需要模型的最小 Agent Loop

[上一项：复原源码调用链](controlled-task-contract.md) · [返回课程总目录](../README.md) · [下一项：权限与崩溃恢复](permissions-and-recovery.md)

这一项会把基础导读里的伪代码变成一段可以运行的确定性程序，让你从一次次重复执行中看清循环在哪里开始，又在哪里结束。脚本化 Model 会依次请求读取、编辑和测试，每一步怎么选都已经固定，因此观察结果不会混入模型采样的随机性。虚拟工作区负责承受副作用，Harness 则控制循环、检查权限、回填 Tool Result 并记录 Trace（执行轨迹），这三个角色仍按真实系统里的方式各管一段。整个程序既不访问网络，也不修改真实仓库文件，所以你可以反复重跑并比较 Trace。这样不会弄脏当前 checkout。

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

第 3 条和第 4 条要放在一起看：权限被拒绝以后，虚拟源码仍保持原样，这说明 Harness 在调用工具体之前就拦住了动作。但单看日志还不够。测试同时核对审批记录和环境状态，才能说明工具到底有没有执行。独立 Evaluator 即使拿到模型声称「全部通过」的文本，只要源码里的边界错误还在，仍会判成 failed。它会重新读取环境产物，所以模型怎么措辞不会左右任务能否通过。这两条分别回答了「谁能改变状态」和「谁说了算」，测试也因此没有把执行成功和任务成功混成一件事。

## 先看四个对象

打开 [`examples/minimal-harness/harness.mjs`](https://github.com/plwslpld-arch/agent-harness-internals/blob/main/examples/minimal-harness/harness.mjs)：

| 对象 | 扮演什么角色 |
| --- | --- |
| `createScriptedModel()` | 用固定决定替代真实模型，消除随机性和凭据依赖 |
| `createShippingWorkspace()` | 保存虚拟源码并执行确定性目标测试 |
| `runHarness()` | 维护消息、审批、工具执行、Trace 和停止条件 |
| `evaluateShippingTask()` | 在运行结束后独立检查任务结果 |

脚本化 Model 虽然算不上智能系统，却保留了真实 Harness 最关键的一条协议边界：Model 只能提出 Tool Call，Environment 才能真的动手改变状态。由于 Model 会按固定顺序作出决定，你看到失败时可以直接去查权限、工具或循环怎样控制流程，不必先怀疑模型这次是不是采样出了不同结果。

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

`completed` 说明循环已经走到哪里，`passed` 则说明任务有没有通过。两个字段不能混着看。前者只表示 Harness 碰到了某个停止条件，无法证明工作区里的运费边界错误真的消失。后者由独立检查给出，只有环境产物满足事先冻结的任务条件时才会成立。示例特意把两者分开，免得一个绿色勾同时吞掉两种含义。

## 修改一处，观察行为

依次尝试：

1. 把编辑批准改成 Deny，确认源码没有变化；
2. 让 Model 调用未知工具，观察 `tool_failed` 怎样进入消息；
3. 把 `maxSteps` 设为 2，观察 Step Limit 与任务失败的区别；
4. 让测试工具退出 1，确认 Model 文本不能覆盖环境结果；
5. 复制一个 Call ID，思考真实 Harness 为什么需要拒绝重复身份。

每完成一项修改，先写预测，再跑测试。这样更容易看清哪些状态归 Model、哪些归 Harness、哪些又归 Environment。如果实际 Trace 和预测不同，就从第一个走岔的事件往回查，别只盯着最终文本。这个练习要看的是你能否观察并解释这些边界，功能多几个或少几个不会改变结论。

## 这个示例刻意没有实现什么

- 没有流式 Token 和 Provider Adapter；
- 没有并发工具批次；
- 没有真实文件、Shell 或 OS Sandbox；
- 没有 Session 持久化和 Compaction；
- 没有真实模型不确定性。

正因为省掉了这些机制，你才能逐行核对这个最小循环，并把每条 Trace 对回那几处具体的状态变化。等你读顺这条确定性路径以后，再引入真实模型或并发工具，才有一条基线可以判断新增的不确定性来自哪里。下一项只增加权限与恢复，而且继续使用同一个虚拟工作区，所以你仍然可以守住当前范围，不会突然跳进大型框架。

[下一项：给最小 Harness 增加权限和崩溃恢复](permissions-and-recovery.md)
