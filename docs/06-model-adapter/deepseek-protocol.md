---
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# DeepSeek 协议：thinking、tool call 与流式状态

## 请求序列化

内部历史不是原样 JSON 透传。适配器需要把 system/user/assistant/tool 语义转换为 provider 接受的角色与字段，并在发送前拒绝不支持的内容。`evidence: code`

最关键的 thinking 规则是：只有携带 tool call 的历史 assistant turn 才回传其 `reasoning_content`；无 tool call 的 reasoning 会省略。`evidence: code` 这既满足工具往返的协议要求，也避免无效历史膨胀。`evidence: inference`

## SSE 翻译

适配器把 reasoning、text 和多个 tool call 的增量分别维护为有状态 block，并将 `[DONE]` 与 transport 提前结束区分。`evidence: code` SSE comment 只算传输活动，不成为模型 chunk 或 session event。`evidence: official-doc`

## 使用量与成本

缓存读取 token 与未缓存输入分开记录；DeepSeek 的 `prompt_tokens` 包含 cache hit，适配器会扣除后映射到互不重叠的内部字段。reasoning token 已包含在 output token 中，汇总时不能重复相加。`evidence: official-doc`

## 错误与重试

适配器每次 `stream()` 只发一次 provider 请求；retry policy 由独立插件在持久 agent-step 边界执行。`evidence: official-doc` 这让重试不会隐蔽地发生在传输层，但每次 retry 是否重复计费和产生副作用，仍需按运行轨迹验证。`evidence: inference`

建议实验覆盖纯文本、thinking、单/多工具、缓存命中、idle timeout、caller abort、HTTP 错误和 stream 提前关闭，并按 `evidence: runtime` 保存脱敏结果。源码入口见[人工源码研究](../13-source-studies/README.md)。
