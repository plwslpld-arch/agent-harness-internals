---
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 06｜模型适配：统一语义与 DeepSeek 协议

Harness 的 LLM seam 把内部 message、block、usage、finish 与 error 词汇映射到不同 provider。DeepSeek 官方适配器使用 `fetch + SSE`，把 Chat Completions wire format 转为统一 `StreamChunk`。`evidence: code`

## 产品轨

“兼容 OpenAI 格式”不等于行为完全相同。thinking passback、工具调用历史、缓存计费、流终止、超时与内容模态都会影响任务体验和成本。`evidence: inference`

## 工程轨

`packages/llm/llm-deepseek` 负责请求序列化、SSE framing、增量翻译、usage 映射和错误归一。`evidence: code` 仓库还提供基于 Pi 的适配路线，两者实现不同但满足同一 LLM seam。`evidence: official-doc`

原生 DeepSeek 路线当前有几个明确边界：

- prior assistant turn 含 tool call 时，reasoning 会以 `reasoning_content` 回传。`evidence: code`
- image block 会被显式拒绝，不会静默压成文本。`evidence: code`
- 输出上限映射为 `max_tokens`；`tool_choice` 未进入共享核心词汇。`evidence: code`
- 上下文溢出被归一为稳定错误码，消费方不应解析 provider 文案。`evidence: official-doc`

继续阅读：[DeepSeek 协议边界](deepseek-protocol.md)、[上下文与压缩](../08-session-and-context/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动文件参考](../14-file-reference/README.md)
