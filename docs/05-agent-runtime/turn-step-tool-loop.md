---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 从输入到完成：逐段读一次 Agent 轮次

## 1. 输入先进入 inbox

steering、follow-up 和注入上下文有各自的唤醒与领取语义。`evidence: official-doc` 因此，UI 的“已发送”不等于模型已经看见。`evidence: inference`

## 2. pre-step 是权威入口

`agent/pre-step` 是 waterfall；监听器可以改写、拒绝或委托。忽略 `next()` 语义会意外截断下游策略。`evidence: official-doc` 首次领取被拒绝时，仍会留下没有 step 的闭合 turn。`evidence: official-doc`

## 3. 请求与流式记录

系统从日志派生历史，组装 system prompt 和工具 schema。适配器输出的 reasoning、text 与 tool-call 增量映射成统一 block；流式事件先保存，最终 message 再闭合响应。`evidence: code`

## 4. 工具形成下一步债务

模型发出工具调用后，本 step 只有在权威 `tool/result` 按序记录后才完整。工具结果通常触发下一次模型请求，让模型消费结果并继续。`evidence: official-doc`

## 5. 完成不是“没有新 token”

自然停止前还有 `agent/turn-stopping` 检查点；错误、取消、最大 token 和中断有不同闭合原因。`evidence: official-doc` 产品应结合持久 turn 边界与实时 agent 状态显示完成，而不是只看流连接是否结束。`evidence: inference`

关键验证包括：多 tool call 的并发分类、body 完成顺序与结果记录顺序、请求 retry 的 turn 边界、取消后的迟到 chunk。运行结果按 `evidence: runtime` 记录，并回链到[源码研究](../13-source-studies/README.md)。
