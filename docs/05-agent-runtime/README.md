# 05｜Agent Runtime：turn、step、工具与完成

一个 **step** 是一次模型请求及其工具调用；一个 **turn** 可以包含多个 step，直到工具不再欠下模型工作、没有下一步输入，或被错误/取消终止。`evidence: official-doc`

## 产品轨

用户看到“一次回复”，系统内部却要处理排队输入、流式输出、多个工具、审批、取消和重试。turn/step 边界把过程变成可解释、可恢复状态，而不是不可见的 while 循环。`evidence: inference`

## 工程轨

1. inbox 领取输入并追加 `turn/start`。
2. `agent/pre-step` 决定进入或拒绝消息。
3. 追加 `step/start` 与 `user/message`，组装提示词和工具 schema。
4. 经 `agent/request`、`llm/stream` 获得流式 block。
5. 记录 `assistant/chunk` 与最终 `assistant/message`。
6. 工具按执行模式调度并按模型顺序提交结果。
7. 追加 `step/end`；有欠下工作则下一 step，否则 `turn/end`。

这一路径由官方生命周期图直接给出。`evidence: official-doc` 默认驱动器和调度器位于 `packages/core/agent-loop`。`evidence: code`

并发执行不等于乱序提交；策略阶段和持久结果仍保持模型顺序。`evidence: code`

继续阅读：[生命周期详解](turn-step-tool-loop.md)、[模型适配](../06-model-adapter/README.md)和[工具执行](../07-tools-permissions-sandbox/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动文件参考](../14-file-reference/README.md)
