# 最小 Agent Harness：确定性教学示例

这个示例不用真实模型，也不修改真实文件。脚本化 Model 依次请求 `read`、`edit` 和 `test`，虚拟工作区执行副作用，Harness 维护消息、权限、Tool Result、Trace 和停止条件，独立 Evaluator 最后判断运费边界任务是否通过。

从仓库根目录运行：

```bash
node --test examples/minimal-harness/harness.test.mjs
```

建议先阅读测试，再阅读 `runHarness()`。测试分别展示完整闭环、Call ID 关联、权限拒绝、独立判定和崩溃恢复。

这个目录只实现教学所需的最小机制，不是生产框架，也不提供真实文件、Shell、网络或 Sandbox。

对应课程：[实践二：运行一个不需要模型的最小 Agent Loop](../../docs/labs/minimal-agent-loop.md)。
