# 实践三：增加权限判断与崩溃恢复

[上一项：最小 Agent Loop](minimal-agent-loop.md) · [返回课程总目录](../README.md) · [下一项：独立 Eval](independent-eval-pipeline.md)

这一项不增加更多工具，而是让已有编辑工具在「获准、已执行、已记录」三个阶段可以区分。目标是处理最危险的情况：编辑副作用可能已经发生，进程却在写入完成记录之前崩溃。

## 先观察权限拒绝

最小示例把 `approve()` 作为 Harness 策略入口。测试让 `read` 和 `test` 获准、`edit` 被拒绝，然后断言：

- 记录中出现 `tool_denied`；
- 不出现对应 `tool_started` 和 `tool_completed`；
- 虚拟源码保持原样；
- Model 收到带原 Call ID 的拒绝结果。

这只能证明应用层拒绝没有调用虚拟 Tool Body。它不是 OS Sandbox 证明，因为整个示例仍运行在普通 Node.js 进程中。

## 为副作用写三阶段事件

真实工具至少需要：

```text
tool_requested：模型提出动作，尚未执行
tool_started：权限已经通过，副作用可能开始
tool_completed：结果已保存，可以安全进入下一轮
```

如果最后一条记录是 `tool_requested`，通常可以认为副作用未开始；如果停在 `tool_started`，状态未知，必须检查环境；若已有 `tool_completed`，恢复时不应重复执行同一调用。

## 运行恢复判断

示例中的 `recoverPendingEdit()` 不相信 Session 文本，而是读取虚拟工作区：

- 仍然包含 `total > 100`：返回 `apply_edit`；
- 已经包含 `total >= 100`：返回 `continue_to_test`；
- 两种都不匹配：返回 `manual_review`。

这只是针对单个确定性替换的教学实现。真实 Patch 还应比较文件 Hash、版本、调用参数和并发修改；数据库或网络工具则需要幂等键、事务状态或外部查询。

## 自己扩展一个安全规则

为虚拟 Harness 增加「禁止编辑 `tests/**`」规则，并编写测试证明：

1. 工具即使对模型可见，执行时仍会被拒绝；
2. Pattern 使用规范化路径，不能通过 `tests/../tests/` 绕过；
3. Deny 不会写入工具完成事件；
4. Model 得到结构化拒绝原因；
5. 独立 Evaluator 仍检查测试文件 Hash。

## 什么时候不应自动恢复

- 工作区内容与调用前后版本都不匹配；
- 写入跨越多个文件，只确认了其中一部分；
- 工具启动了后台进程；
- 网络响应丢失，服务端可能已经处理；
- 用户批准只针对已经失效的一次性上下文；
- Session 与环境来自不同 Project 或 Server。

这些情况应进入人工检查、补偿事务或专用恢复器，而不是让模型「再试一次」。

[下一项：让外部 Evaluator 独立判断结果](independent-eval-pipeline.md)
