---
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/serialize.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/sse.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/translate.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/adapter.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm/src/types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 09｜DeepSeek Adapter：序列化、SSE、thinking 与 usage

> 本文基线 `47f9438`。所有行号对应该 Commit。

## 一、产品现象

**「兼容 OpenAI 格式」不等于行为相同。**

| 现象 | 背后是什么 |
| --- | --- |
| 换个「OpenAI 兼容」端点，工具调用开始出错 | 内部 tool result 与 wire 的 `{role:'tool'}` 结构不同 |
| thinking 模型在多轮工具往返中表现不稳 | `reasoning_content` 的回传规则很具体 |
| 网络抖动后模型给了个「看起来完整」的回答 | 流被截断但没有 `[DONE]` —— 这次调用不可信 |
| 成本统计比账单高 | reasoning token 被重复计入了 |

这一层的价值不在「能请求一个 OpenAI 兼容端点」，而在**正确保留 thinking / tool / cache / error 四类语义**。

## 二、源码路径

```
packages/llm/llm-deepseek/src/     1,216 行
  adapter.ts   346   配置/凭据解析、fetch、timeout、错误分类
  index.ts     276   provider 注册、config schema
  translate.ts 185   provider delta/usage/finish → StreamChunk
  serialize.ts 187   Harness history/tools/options → Chat Completions request
  types.ts     152   wire 类型
  sse.ts        40   SSE 帧与完成边界
  invariant.ts  30

tests/  serialize / sse / translate / adapter / dynamic-config /
        loader-composition .spec.ts + adapter.e2e.ts + mock-server.ts
```

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `index.ts:45` | `DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'` |
| `index.ts:47` | `PROVIDER = 'deepseek-official'` |
| `index.ts:256` | `ctx.llm.registerAdapter([PROVIDER], adapter)` |
| `serialize.ts:96-99` | `reasoning_content` 回传规则 |
| `serialize.ts:133` | `role: 'tool'` |
| `serialize.ts:184` | `max_tokens` |
| `sse.ts:18` | `export const DONE = '[DONE]'` |
| `sse.ts:38` | 缺 `[DONE]` → `STREAM_CLOSED` |
| `translate.ts:53` | `mapUsage(usage)` |
| `translate.ts:86` | `translate(payloads)` |
| `adapter.ts:139-147` | HTTP 错误分类 |

## 三、机制

### provider route 是独立的

`index.ts:47`： `evidence: code`

```ts
const PROVIDER = 'deepseek-official'
```

**它与 pi-ai catalog 里的 `deepseek` 是两条不同的 route。** 换句话说，同一个模型可以经由两条路径访问，而它们的协议保真度不同。做 A/B 对照时如果没固定 route，比较的就不是同一件事。

凭据默认从 `DEEPSEEK_API_KEY` 读（`:45`），走 credentials seam；**错误信息只点出入口名，不回显值**（`:242` 的报错文本是「no API key for provider route ... store `<ref>` through the credentials」）。

每次请求**重新解析** endpoint / settings / credential，但进行中的 stream 固定使用启动时的快照——改配置不会把一个跑到一半的流切到别的端点。

### 序列化：两处与 OpenAI 形状的实质差异

**差异一：tool result 的位置。**

Harness 内部把工具结果放在 user 消息里的 `tool-result` block；DeepSeek wire 要求转成独立的 `{ role: 'tool' }` 消息（`serialize.ts:106-133`）。 `evidence: code`

这不是格式细节。它意味着**内部表示和 wire 表示是两套结构**，任何「直接把内部历史 JSON 透传给兼容端点」的做法都会错。

**差异二：`reasoning_content` 的回传规则。**

`serialize.ts:96-99`，注释直接引了官方指南： `evidence: code`

```ts
// Official passback rule (guides/thinking_mode.mdx): reasoning_content
...toolCalls.length > 0 && reasoning.length > 0 ? { reasoning_content: reasoning } : {},
```

**只有带 tool call 的历史 assistant turn 才回传它的 `reasoning_content`；没有 tool call 的旧 reasoning 一律省略。**

两个作用：满足工具往返的协议要求；避免无效历史膨胀——而历史膨胀直接影响文章 06 的缓存与成本。

**其它协议事实**（`evidence: code`）：

- 空 content 是 `""` 而不是 `null`
- 并行 tool delta 按 **wire index** 组装
- wire 用 `max_tokens`（`:184`）
- **没有映射 `tool_choice`** —— 这个字段在共享核心词汇里不存在

### SSE：严格到「未终止的尾巴是截断」

`sse.ts` 全文只有 40 行，但模块注释信息密度很高： `evidence: code`

> Framing is **spec-strict**: an event dispatches only on its blank-line terminator, so **an unterminated tail at EOF is truncation, not a flushable payload**.

三条契约：

1. **`[DONE]` 被原样 yield 出来**，由调用方负责最终 flush——协议边界不藏在解析器里
2. **EOF 前没有 `[DONE]` → 抛 `LlmError('STREAM_CLOSED')`**，注释写明理由：*truncated response — the model call cannot be trusted*
3. **SSE comment 只走 transport-activity 回调**，永远不进入 payload 流

第 2 条是这一层最重要的安全性质：**网络中断产生的半截回答不会被当成一个短回答接受。** 很多客户端在这里会静默返回已收到的部分。

第 3 条对应文章 04 提到的空闲超时：comment 算传输活动（说明连接还活着），但不算模型产出。

### translate：状态化 block 与延迟结算

`translate.ts:86` 的生成器维护三类 open block：text、reasoning、tool-call（按 wire index 存 Map）。 `evidence: code`

模块注释里两条设计：

> An empty initial reasoning delta does not open a block. **Finish reason and the latest usage are deferred until `[DONE]`**, covering both finish-attached and trailing usage-only shapes while ensuring **no chunk follows `finish`**.

| 设计 | 为什么 |
| --- | --- |
| 空的首个 reasoning delta 不开 block | thinking 模式会先发一个空串，开了会产生一个空 reasoning block |
| finish 与 usage 都延迟到 `[DONE]` | usage 可能挂在 finish chunk 上，也可能是尾随的 usage-only chunk，两种形状都要兼容 |
| 保证 `finish` 之后没有任何 chunk | 下游 `BlockAssembler` 可以把 finish 当作终止信号 |

还有一个降级处理（`:110-115`）：**`stop` 结束但一个 block 都没开过**，映射成 `EMPTY_RESPONSE` 错误 finish，而不是一个成功的空消息。

### usage：重叠计数换成不相交计数

`translate.ts:53`，文章 06 详细讲过，这里只列要点： `evidence: code`

```ts
inputTokens: usage.prompt_tokens - (cacheRead ?? 0)
```

- DeepSeek 的 `prompt_tokens` **包含** cache hit
- 内部 `TokenUsage` 约定是**不相交**计数
- 优先读 `prompt_tokens_details.cached_tokens`，回退 `prompt_cache_hit_tokens`
- **`reasoningTokens` 已含在 `outputTokens` 里，汇总不能重复相加**

### 错误分类

`adapter.ts:139-147`： `evidence: code`

| HTTP 状态 | 归一为 |
| --- | --- |
| 401 / 403 | `AUTH` |
| 429 | `RATE_LIMIT` |
| 400 + 内容判定为上下文溢出 | `CONTEXT_WINDOW_EXCEEDED` |
| 400（其它） | `INVALID_REQUEST` |
| ≥ 500 | `SERVER` |

400 那一行的双层判断值得注意：**上下文溢出在 HTTP 层和普通参数错误长得一样**，必须看响应内容才能区分。归一成稳定错误码之后，上层（压缩、重试）就不用去解析 provider 的文案了——这是文章 07 里「溢出触发更激进压缩」的前提。

完整的错误语义还包括：quota、transport、abort、idle timeout、malformed、缺 `[DONE]`、empty response、unknown finish，各自不同。

### 重试不在传输层

**adapter 一次 `stream()` 只发一个 provider 请求。** retry policy 由独立的 `llm-retry` 插件在**持久 agent-step 边界**执行。

这条边界的意义：重试不会隐蔽地发生在传输层。每一次重试都是日志里可见的一个新 step，可以被计费、被审计、被观察。代价是每次 retry 是否重复计费和产生副作用，需要按运行轨迹验证。

## 四、约束与失效条件

### 已知不支持

| 项 | 状态 |
| --- | --- |
| 图像 | **原生路线不支持** |
| user / tool 结果 | 被展平为文本 |
| plugin block types | 跳过 |
| `fetch` | **不接共享的 Cordis HTTP proxy / interceptor** |
| model catalog | 是**建议**而非强制 allowlist |

第四条容易踩：想给所有出站请求加统一代理或抓包，adapter 的 `fetch` 不走那条路。

### 与 DSML 的关系

V4 模型仓库里的 `encoding_dsv4.py` 是**本地模型**的 prompt / parse 参考；Harness adapter 是 **API wire**。

两者共享 reasoning / tool 语义，但**不是同一份序列化实现**。自托管兼容性要做双层测试：模型侧的 golden cases + Harness 侧的 provider-neutral contract。

### A/B benchmark 的固定项

比较两个 adapter 或两个模型时，必须固定：工具集、system prompt、历史、retry 策略、预算。

并且**单独报告 adapter 协议失败**，不能算进模型能力——`STREAM_CLOSED` 是网络问题，不是模型不会做。

### 通用 OpenAI 兼容 ≠ 语义等价

四个会让行为分叉的点：thinking 回传、工具调用历史结构、缓存计费、流终止语义。

优先用原生 `deepseek-official` route 验证这四项，再用 pi-ai provider 做多模型对照。

## 五、可复核实验

### 实验 1：读三条协议规则（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '90,105p' packages/llm/llm-deepseek/src/serialize.ts   # reasoning_content 回传
sed -n '104,140p' packages/llm/llm-deepseek/src/serialize.ts  # tool result → role:'tool'
cat packages/llm/llm-deepseek/src/sse.ts                       # 全文 40 行
```

回答：**为什么「EOF 前没有 `[DONE]`」必须抛错，而不是把已收到的内容当作一个短回答返回？**

### 实验 2：跑 adapter 的无凭据测试（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/llm/llm-deepseek/tests/serialize.spec.ts
pnpm vitest run packages/llm/llm-deepseek/tests/sse.spec.ts
pnpm vitest run packages/llm/llm-deepseek/tests/translate.spec.ts
```

这三个用 `mock-server.ts`，不需要真实 key。重点看 translate 里关于「usage 延迟到 `[DONE]`」和「空 reasoning delta 不开 block」的用例。 `evidence: test`

### 实验 3：错误分类对照表（无需凭据，用 mock）

```bash
cd sources/checkouts/deepseek-harness
sed -n '135,150p' packages/llm/llm-deepseek/src/adapter.ts
pnpm vitest run packages/llm/llm-deepseek/tests/adapter.spec.ts
```

核对五类归一是否与测试断言一致。

### 实验 4：真实协议行为矩阵（需要凭据）

按上游建议的覆盖面各跑一次，记录 `evidence: runtime`：

| 场景 | 怎么触发 | 观察什么 |
| --- | --- | --- |
| 纯文本 | 一句话问答 | 只有 text block |
| thinking | 用 reasoning 模型 | reasoning block 与 text block 的先后 |
| 单工具 | 「读一下 README」 | tool-call delta 的组装 |
| 多工具并行 | 「同时读 A 和 B」 | 按 wire index 分别组装 |
| 缓存命中 | 连续多轮 | `cacheReadTokens` 上升 |
| idle timeout | 配一个极小的 `streamIdleTimeoutMs` | 是否正确超时而非挂死 |
| caller abort | 中途 Ctrl-C | finish 变成 `aborted` |
| HTTP 错误 | 用错误的 key | 归一为 `AUTH` |
| 流提前关闭 | 断网 | **`STREAM_CLOSED`，不是一个短回答** |

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm vitest run packages/llm/llm-deepseek/tests/adapter.e2e.ts
```

**该记录**：每个场景的命令、退出码、finish reason、错误码、usage 四项。
**该得出**：错误码是稳定的内部码（`AUTH` / `RATE_LIMIT` / `SERVER` / …），不是 provider 的原始文案——上层不该去解析文案。

## 本篇尚未覆盖的源文件

- `packages/llm/llm-deepseek/src/adapter.ts`（346 行）—— 配置解析、fetch、timeout 的完整实现
- `packages/llm/llm-deepseek/src/index.ts`（276 行）—— provider 注册与动态配置
- `packages/llm/llm-retry/` —— 重试策略如何在 step 边界执行
- `packages/llm/llm-pi-ai/` —— 多模型对照用的另一条 route
- `packages/llm/token-meter/` —— usage 如何投影成会话级统计
- `deepseek-v4-flash-0731` 仓库的 `encoding_dsv4.py` —— 本地模型侧的 DSML 参考实现
