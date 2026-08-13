---
source_repo: deepseek-harness
source_path: packages/core/models
source_commit: 47f943859bef60e4160492346772ded9b24f765a
last_verified: 2026-08-13
status: reviewed
depth: L3
evidence: [code, test, official-doc, inference]
---

# DeepSeek 原生 Adapter 源码研究

## 路径与数据流

- `packages/llm/llm-deepseek/src/serialize.ts`：Harness history/tools/options → Chat Completions request；
- `sse.ts`：SSE frame、activity/完成边界；
- `translate.ts`：provider delta/usage/finish → `StreamChunk`；
- `adapter.ts`：配置/凭据解析、fetch、timeout、错误 taxonomy；
- `tests/{serialize,sse,translate,adapter,dynamic-config,loader-composition}.spec.ts` 与 `adapter.e2e.ts`。

## 协议事实

[code] provider route 是 `deepseek-official`，与 pi-ai catalog 的 `deepseek` 分开。每次请求重新解析 endpoint/settings/credential；进行中的 stream 固定启动快照。API key 通过 credentials seam 或环境引用获取，错误只点入口不回显值。

[code] assistant tool-call turns 回传 `reasoning_content`，无 tool calls 的旧 reasoning 省略；空 content 是 `""`；并行 tool delta 按 wire index 组装；usage 在 `[DONE]` 前结算；cache hit 从 ordinary input 中区分；session-title 强制 thinking off；wire 使用 `max_tokens`，没有映射 `tool_choice`。

[code] auth、quota、rate limit、context overflow、server、transport、abort、idle timeout、malformed、缺 `[DONE]`、empty response 与 unknown finish 都有不同语义。adapter 本身一次 `stream()` 只发一个请求，持久化 step 边界的 retry 由 `llm-retry` 管理。

## 与 DSML 的关系

V4 模型仓库 `encoding_dsv4.py` 是本地模型 prompt/parse 参考；Harness adapter 是 API wire。两者共享 reasoning/tool semantics，但不是同一序列化实现。自托管兼容应以模型 golden cases 加 Harness provider-neutral contract 做双层测试。

## 产品意义

原生 adapter 的价值在正确保留 thinking/tool/cache/error 语义，而不仅是“能请求一个 OpenAI-compatible endpoint”。A/B benchmark 要固定工具/system/history/retry/budget，单独报告 adapter protocol failure，不能算成模型能力。

## 已知边界

图像不受原生路线支持；user/tool 结果被展平为文本；plugin block types 会跳过；`fetch` 不接共享 Cordis HTTP proxy/interceptor；catalog 是建议而非强制 allowlist。部署时还需核对实际 API 版本与数据出境。
