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

DeepSeek provider 的注册点：

```ts
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'
const PROVIDER = 'deepseek-official'

ctx.llm.registerConfigurableProviders([
  { provider: PROVIDER, displayName: 'DeepSeek', settingsNs: NS }
])
ctx.llm.registerAdapter([PROVIDER], adapter)
```

这里有两个结论：

- `deepseek-official` 是 Harness 内部的 provider route，不是随便写的展示名。
- API key 默认不是硬编码，而是通过 credential ref / 环境变量按请求解析。

配置解析的真实形状：

```ts
resolveAdapterOptions(config, environment) {
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'),
    baseURL: config.baseURL ?? environment?.get('DEEPSEEK_BASE_URL') ?? PUBLIC_BASE_URL,
    defaults: { thinking, reasoningEffort },
    maxTokens,
    defaultContextWindow,
    streamIdleTimeoutMs,
  }
}
```

注意这里解析的是“连接事实”，不是一次模型响应。它会把 endpoint、key 引用、thinking 默认值、上下文窗口和超时组合成同一个快照。这样可以避免“新 endpoint 配旧 key”这种难排查问题。

真正发请求时：

```ts
const body = serializeRequest(options, connection.defaults)
const response = await fetch(`${connection.baseURL}/chat/completions`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    accept: 'text/event-stream',
  },
  body: JSON.stringify(body),
  signal,
})
yield* translate(parseSse(response.body, onComment))
```

这段说明 adapter 只做 provider 通信和协议翻译，不负责 Agent 的多 step 策略。

请求序列化的关键规则：

```ts
serializeRequest(options, defaults) {
  messages = [system?, ...serializeMessages(options.messages)]
  tools = options.tools?.map(tool => function schema)
  return { model, messages, stream: true, stream_options: { include_usage: true }, ...thinking }
}
```

`serializeMessages()` 里有一个非常重要的转换：Harness 内部的 tool result 是 user-role message 中的 `tool-result` block，但 DeepSeek wire protocol 要求变成单独的 `{ role: 'tool' }` message。这个地方如果改错，工具调用链路会直接断。

SSE 处理分两层：

- `parseSse()` 只保证事件流完整，必须看到 `[DONE]`；EOF 但没有 `[DONE]` 会报 `STREAM_CLOSED`。
- `translate()` 才把 provider delta 变成 Harness 的 `text-delta`、`reasoning-delta`、`tool-call-delta`、`usage` 和 `finish`。

## API Key

默认从环境变量读取：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

仓库里只能写变量名，不能写真实 key。

如果 Web 模型页写入了 credential service，则优先从 credential seam 解析；没有 seam 时才从启动环境读取。对学习者来说，最稳的本地方式仍然是：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

不要把它写进 `.env` 再提交，也不要把真实值贴进 runtime evidence。

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

HTTP 错误会被归类，例如 401/403 是 `AUTH`，429 是 `RATE_LIMIT`，400 可能是 `INVALID_REQUEST` 或 context window exceeded，5xx 是 `SERVER`。这对产品同学也重要：同样是“失败”，配额、鉴权、上下文太长、服务端错误，对用户提示和自动重试策略完全不同。

Usage 也不是简单读一个总数。DeepSeek 的 prompt token 可能包含 cache hit，Harness 需要把 cache read 从输入 token 中拆出来，避免成本和能力评估被混淆。

## 本讲源码证据卡

| Adapter 问题 | 证据入口 | 看什么 |
| --- | --- | --- |
| provider 如何注册 | `packages/llm/llm-deepseek/src/index.ts` | provider id、config、env key |
| 请求如何序列化 | `packages/llm/llm-deepseek/src/serialize.ts` | system/messages/tools/thinking 如何映射 |
| SSE 如何解析 | `packages/llm/llm-deepseek/src/sse.ts` | `[DONE]`、comment、malformed、timeout |
| provider 输出如何翻译 | `packages/llm/llm-deepseek/src/translate.ts` | reasoning、text、tool call、usage |

## 最小实验

```text
任务：验证 DeepSeek provider 的成功和失败路径。
前提：本机设置 DEEPSEEK_API_KEY。
步骤：
1. 先在无 key shell 中启动一次，记录受控失败。
2. 再设置 DEEPSEEK_API_KEY，跑一次纯文本 headless 任务。
3. 观察 request/header 中 provider/model 是否为 DeepSeek 路径。
4. 如果出现 streaming 错误，记录是 HTTP、SSE、abort 还是 idle timeout。
过关：不能只记录最终回答，必须记录 credential_ref、provider、exit_code 和 known_gaps。
```

## 检查题

- Adapter 为什么不应该自己偷偷重试？
- DeepSeek 的 usage 字段为什么不能直接粗暴相加？
- text-only 限制和 image block 拒绝在哪里影响产品能力？

## 延伸阅读

- [../06-model-adapter/deepseek-protocol.md](../06-model-adapter/deepseek-protocol.md)
- [../13-source-studies/deepseek-adapter-study.md](../13-source-studies/deepseek-adapter-study.md)
