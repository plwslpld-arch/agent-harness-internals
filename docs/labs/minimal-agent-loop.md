# 实践二：运行一个不需要模型的最小 Agent Loop

[上一项：复原源码调用链](controlled-task-contract.md) · [返回课程总目录](../README.md) · [下一项：权限与崩溃恢复](permissions-and-recovery.md)

这一项把基础导读中的伪代码变成可以运行的确定性程序。脚本化 Model 依次请求读取、编辑和测试；虚拟工作区承担环境副作用；Harness 负责循环、权限、Tool Result 和 Trace。它不会访问网络，也不会修改真实仓库文件。

## 先运行测试

从仓库根目录运行：

```powershell
node --test examples/minimal-harness/harness.test.mjs
```

测试覆盖五件事：完整闭环、Call ID 对齐、权限拒绝不产生副作用、独立判定不相信模型文本，以及恢复时先观察环境。

## 先看四个对象

打开 [`examples/minimal-harness/harness.mjs`](../../examples/minimal-harness/harness.mjs)：

| 对象 | 扮演什么角色 |
| --- | --- |
| `createScriptedModel()` | 用固定决定替代真实模型，消除随机性和凭据依赖 |
| `createShippingWorkspace()` | 保存虚拟源码并执行确定性目标测试 |
| `runHarness()` | 维护消息、审批、工具执行、Trace 和停止条件 |
| `evaluateShippingTask()` | 在运行结束后独立检查任务结果 |

脚本化 Model 不是智能系统，但它保留了真实 Harness 最关键的协议边界：Model 只能提出 Tool Call，Environment 才能改变状态。

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

注意：`completed` 描述循环生命周期，`passed` 描述任务判定。示例故意使用两个字段，防止把它们混成一个绿色勾。

## 修改一处，观察行为

依次尝试：

1. 把编辑批准改成 Deny，确认源码没有变化；
2. 让 Model 调用未知工具，观察 `tool_failed` 怎样进入消息；
3. 把 `maxSteps` 设为 2，观察 Step Limit 与任务失败的区别；
4. 让测试工具退出 1，确认 Model 文本不能覆盖环境结果；
5. 复制一个 Call ID，思考真实 Harness 为什么需要拒绝重复身份。

完成每项后先写预期，再运行测试。重点不是改出更多功能，而是观察哪个状态属于 Model、Harness 或 Environment。

## 这个示例刻意没有实现什么

- 没有流式 Token 和 Provider Adapter；
- 没有并发工具批次；
- 没有真实文件、Shell 或 OS Sandbox；
- 没有 Session 持久化和 Compaction；
- 没有真实模型不确定性。

这些缺失让最小循环容易核对。下一项只增加权限与恢复，不会一步跳到大型框架。

[下一项：给最小 Harness 增加权限和崩溃恢复](permissions-and-recovery.md)
