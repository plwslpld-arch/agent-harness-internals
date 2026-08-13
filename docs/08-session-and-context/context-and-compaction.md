# 上下文派生与压缩：日志不是直接塞进模型

模型历史由事件日志经过派生，而不是把所有事件原样发送。工具调用、工具结果、assistant block 与模型可见用户消息按稳定规则重建。`evidence: official-doc`

## 为什么需要压缩

日志可以持续增长，而模型上下文有边界。Compaction 在请求前的 `agent/pre-step` 处理压力，并可先剪枝工具结果，再生成摘要。`evidence: official-doc`

## 压缩不是删除事实

原始事件仍是事实源；压缩通过 surface replacement 改变后续模型所见投影。`evidence: code` 这允许 UI 或审计保留完整轨迹，同时控制模型请求体积。`evidence: inference`

## 错误恢复边界

上下文溢出被 LLM 层归一为稳定错误码；只有剪枝或摘要真正推进 generation 后，系统才开始新的 retry turn，否则保留原始请求错误。`evidence: official-doc`

评测压缩不能只看 token 下降，还要比较任务成功率、丢失约束、工具引用完整性、成本与额外延迟。`evidence: inference` 运行结论标为 `evidence: runtime`，对应 compaction 与 session 源码从[人工源码研究](../13-source-studies/README.md)进入。
