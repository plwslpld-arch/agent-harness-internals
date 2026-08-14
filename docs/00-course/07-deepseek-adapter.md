---
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 07｜DeepSeek Adapter

## 先讲人话

Agent Loop 只知道“我要请求一个模型”。DeepSeek Adapter 负责把 Harness 内部请求翻译成 DeepSeek API 接受的格式，再把 DeepSeek 的流式响应翻译回 Harness 内部事件。

它不是 Agent Loop，也不应该偷偷改变任务语义。

## 关键源码

- `packages/llm/llm-deepseek/src/index.ts`
- `packages/llm/llm-deepseek/src/adapter.ts`
- `packages/llm/llm-deepseek/src/serialize.ts`
- `packages/llm/llm-deepseek/src/sse.ts`
- `packages/llm/llm-deepseek/src/translate.ts`

## 关键代码片段

理解形状：

```ts
config = resolveDeepSeekConfig(env, modelSettings)
requestBody = serializeHarnessRequestToDeepSeek(request)

stream = fetch(baseUrl, {
  headers: { Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify(requestBody),
})

for await (const event of parseSse(stream)) {
  yield translateDeepSeekDelta(event)
}
```

## API Key

默认从环境变量读取：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

仓库里只能写变量名，不能写真实 key。

## thinking 和 tool call

DeepSeek thinking/tool 协议有自己的约束。当前适配器的关键点是：

- session title 等场景会关闭 thinking。
- `reasoningEffort: off` 会关闭 thinking。
- 高 reasoning effort 会启用对应 thinking 行为。
- 带 tool call 的历史 assistant turn 需要按协议回传 reasoning 内容。
- 普通 reasoning 不应无意义膨胀历史。

## 失败路径

- HTTP 错误不能被伪装成普通文本。
- SSE `[DONE]` 和连接提前结束要区分。
- malformed event、idle timeout、abort 都要形成可解释错误。
- Adapter 一次 `stream()` 只代表一次 provider 请求；retry 应由 Agent/request-error 边界处理。

## 检查题

- Adapter 为什么不应该自己偷偷重试？
- DeepSeek 的 usage 字段为什么不能直接粗暴相加？
- text-only 限制和 image block 拒绝在哪里影响产品能力？

## 延伸阅读

- [../06-model-adapter/deepseek-protocol.md](../06-model-adapter/deepseek-protocol.md)
- [../13-source-studies/deepseek-adapter-study.md](../13-source-studies/deepseek-adapter-study.md)
