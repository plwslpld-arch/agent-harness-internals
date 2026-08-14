---
sources: [{"repo":"deepseek-harness","path":"packages/AGENTS.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"docs/cookbook/adding-a-package.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"scripts/verify-package-readme-model-experience.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/translate.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm/src/types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/tools/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/guard/repeat-tool-reminder/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/request-header.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 06｜KV-cache 纪律：把缓存写进架构约束

> 本文基线 `47f9438`。所有行号对应该 Commit。
>
> 这是本仓库最值得读的一篇。dsh 在缓存这件事上的做法，据我所知在开源 agent harness 里没有第二家。

## 一、产品现象

**「同样长度的对话，dsh 跑起来比别的工具便宜得多。」**

具体表现：一个跑了几十轮的编码会话，第二轮开始每次请求的计费 input token 远小于实际发出的 token 数。DeepSeek 返回的 `prompt_cache_hit_tokens` 常年很高。

反例更能说明问题：很多聊天客户端每轮重新拼装全量上下文，**前缀每次都不一样，DeepSeek 的缓存基本打不中**，于是长会话越跑越贵。

这个差距不是调参调出来的。它来自一条**仓库级的强制工程约定**——每个包在设计时就必须回答「我会不会打断请求前缀」。

## 二、源码路径

### 契约本体

| 位置 | 是什么 |
| --- | --- |
| `packages/AGENTS.md` | 一句话规定：package README 必须用规范格式记录 model / token / **KV-cache** 影响 |
| `docs/cookbook/adding-a-package.md` §4 | 规范格式的完整定义 |
| `scripts/verify-package-readme-model-experience.ts` | **553 行**的校验器，在 `doc-sync` 里当门禁跑 |

### 覆盖面

| 指标 | 数值 |
| --- | --- |
| workspace 包总数 | 219 |
| README 含 `## Model Experience` | **215** |
| README 含 `#### KV Cache effect` | **215** |
| `KV Cache effect` 段落总数 | **305** |
| 明确豁免的包 | **4** |

**215 / 219。** 剩下 4 个是纯工具包，而且豁免理由被写死在校验器里当审计证据。

### 适配层

| 位置 | 是什么 |
| --- | --- |
| `packages/llm/llm/src/types.ts:131-139` | `TokenUsage` 的 disjoint 计数约定 |
| `packages/llm/llm-deepseek/src/translate.ts:46-62` | `mapUsage()` —— wire usage 到内部计数的换算 |
| `packages/core/session/src/request-header.ts:44` | `headerEquals()` —— 前缀是否变过 |

## 三、机制

### 先说 provider 侧：DeepSeek 是自动前缀缓存

DeepSeek 的上下文缓存是**服务端自动**的，按请求的前导 token 序列命中，**不需要客户端打 breakpoint**（这一点和 Anthropic 的 `cache_control` 不同）。

wire 上返回两个字段，关系是：

```
prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens
```

**客户端唯一能做的事就是：让前缀保持稳定。** 所以 dsh 的缓存工作全在「不要无谓地改动请求前部」这件事上。

### 适配层：把重叠计数拆成不相交计数

`translate.ts:46-62`，注释直接引了 API 文档： `evidence: code`

```ts
/**
 * Map wire usage fields. DeepSeek's `prompt_tokens` INCLUDES cache hits
 * (`prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens`,
 * api/create-chat-completion); the harness TokenUsage convention is
 * DISJOINT counts, so cache reads are subtracted out of `inputTokens`.
 */
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens
  const reasoning = usage.completion_tokens_details?.reasoning_tokens
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}
```

三个细节：

1. **内部约定是不相交计数**，所以要把 cacheRead 从 inputTokens 里减掉。`llm/src/types.ts:131` 的注释说明了口径：`billed input = inputTokens + cacheReadTokens + cacheWriteTokens`。
2. 优先读 `prompt_tokens_details.cached_tokens`，回退 `prompt_cache_hit_tokens`——兼容两种 wire 形状。
3. `reasoningTokens` **已包含在 outputTokens 里**，汇总时不能重复相加。这是统计成本时最容易犯的错。

### 契约层：强制的 Model Experience 格式

`docs/cookbook/adding-a-package.md` §4 定义了每个包 README 结尾必须出现的结构： `evidence: official-doc`

```markdown
## Model Experience

### <每个模型上下文条目>

#### What the model sees
#### Token effect
#### KV Cache effect        ← 强制

## Known Limitations and Deferred Work
```

**`KV Cache effect` 有受控词汇表**，必须归入四类之一，并点名本包哪些改动会让复用失效：

| 分类 | 语义 | 实际使用数 |
| --- | --- | --- |
| `Append-only` | 只在可复用前缀后追加，不打断已有缓存 | **92** |
| `Prefix-stable` | 稳定重复前缀 | **45** |
| `Replacing` | 替换了更早的请求 token | **3** |
| `independent` | 独立的模型请求 | **17** |

文档还把「不会失效」的语义钉死了：

> "Does not invalidate" means the package **preserves an already-reusable prefix**; provider cache availability and eviction remain **outside the package contract**.

这句话很重要：包只负责「不主动破坏」，**provider 端的缓存可用性和驱逐不在任何包的承诺范围内**。所以没有任何一个包可以宣称「我保证命中」。

### 真实样例

`packages/core/tools/README.md`： `evidence: code`

> Prefix-stable while visible definitions and **their order** are unchanged. Registration, disposal, or scoped restriction may invalidate reuse from the first changed schema token.

**「and their order」** —— 工具的**顺序**是缓存契约的一部分。这解释了文章 04 里 `Config.toolOrder` 为什么要存在、为什么不填时要用确定的字典序而不是注册顺序：注册顺序会随插件加载时序抖动，字典序不会。

`packages/guard/repeat-tool-reminder/README.md`：

> Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

`packages/compaction/compaction-basic/README.md` 有两条，因为它有两种模型上下文条目：

> **Replacing rather than append-only.** Each checkpoint invalidates reuse from the first replaced history token; the unchanged request prefix before that range remains reusable.

> The replayed system prompt, tools, and shadowed-region messages match the conversation's last routed request **byte-for-byte**, so the provider's warm prefix cache is reused up to the trailing instruction.

第二条是文章 07 的主题。

### 校验器：连短式都不放过

`verify-package-readme-model-experience.ts` 是 553 行，不是一个关键词检查。三个设计值得看： `evidence: code`

**1. 精确标题匹配**（`:15-17`）：

```ts
const MODEL_VIEW_HEADING = '#### What the model sees'
const TOKEN_EFFECT_HEADING = '#### Token effect'
const KV_CACHE_EFFECT_HEADING = '#### KV Cache effect'
```

**2. 短式也必须有 KV-cache 段落**（`:361-366`）。某些包的模型体验很简单，可以用一句话的短式（`None, as ...` 或 `Indirectly, through ...`），但校验器要求：

> short Model Experience form requires exact `#### KV Cache effect` and **one non-empty paragraph**

**没有任何一条路径可以跳过 KV-cache 说明**，除非整个包被判为模型无关。

**3. 连空行位置都检查**（`:368-373`）：

> short Model Experience sentence, KV-cache H4, and paragraph require **one blank line between each element**

**4. 豁免必须留下审计理由**（`:28-38`）。四个豁免包及其原文理由：

| 包 | 理由 |
| --- | --- |
| `packages/core/scope` | model-agnostic registration and lifecycle primitive |
| `packages/util/brand` | type-only primitive erased at compile time |
| `packages/util/home-paths` | only resolves harness-owned host paths |
| `packages/util/launch-environment` | only resolves host environment values |

注释解释了为什么理由要写在脚本里而不是省略：

> the reason stays here as reviewable audit evidence so **an absent section cannot be mistaken for forgotten documentation**.

**「缺失」和「遗忘」必须能区分开。** 这和文章 05 里 `ignorable` 的默认拒绝是同一种思路。

### 结构层：为什么这套约定能生效

光有文档规定不够。dsh 的架构本身让「前缀稳定」成为默认状态：

| 机制 | 出处 | 对缓存的作用 |
| --- | --- | --- |
| 事件日志 append-only | 文章 05 | 历史只增不改，前缀天然稳定 |
| `deriveMessages()` 是纯函数且带缓存 | `surface.ts:83` | 同样的日志逐字节产出同样的历史 |
| system 与 runtime context 分离 | 文章 04 | 易变内容走 user 角色，不污染 system 槽 |
| `headerEquals()` 判等 | `request-header.ts:44` | header 没变就不重新记录，也就没有无谓变更 |
| `toolOrder` 规范排序 | 文章 04 | 工具顺序不随加载时序抖动 |

**换句话说：缓存友好不是一个优化项，是这套架构的副产品——而 Model Experience 契约保证没有哪个包会不小心把它破坏掉。**

## 四、约束与失效条件

### 没有包能承诺命中

再强调一次那条定义：包只承诺**保住一个已经可复用的前缀**。provider 端的缓存可用性和驱逐**不在包契约内**。

实际含义：命中率会受你的调用间隔、DeepSeek 侧的缓存单元是否已落盘、模型是否切换等因素影响。**只能实测 `prompt_cache_hit_tokens`，不能推算。**

### 会打断前缀的四类改动

| 改动 | 从哪里开始失效 |
| --- | --- |
| system prompt 内容变化 | 第一个 token —— 整个前缀作废 |
| 工具定义或**顺序**变化 | 第一个变化的 schema token |
| 压缩（`Replacing`） | 第一个被替换的历史 token |
| 插件注册 / 卸载 / 作用域限制 | 受影响的第一个 token |

第一行最狠：**system 槽是 provider 缓存的第一个 token 区域，改它等于全丢。** 文章 07 讲的那个压缩 bug 就栽在这里。

### 跨 provider 时 replay state 不转移

适配层的规则：cached prompt state 记在 adapter replay data 里。跨 provider 时只传递 provider-neutral 的内容和元数据；**private replay state 只在同一个 adapter 实例同时持有历史 provider 和目标 provider 时才转移**。

所以「配一个不同的 summarization provider」会放弃缓存复用——这是部署的显式取舍，不是缺陷。

### `reasoningTokens` 不能重复计入

`translate.ts` 的返回结构里，`reasoningTokens` 是从 `completion_tokens_details.reasoning_tokens` 读的，而它**已经包含在 `outputTokens` 里**。做成本汇总时把两者相加会高估输出成本。

### 这套纪律的代价

不是没有成本：

- 每加一个包都要写 Model Experience，写错了 CI 不让过
- 有些自然的写法（在 system prompt 里插入动态时间戳、按注册顺序排工具）被禁掉了
- 压缩这类必然打断前缀的能力，设计复杂度显著上升（文章 07）

**这是一个明确的取舍：用工程约束的成本，换长会话的成本。** 对一个以长时间编码会话为主要场景的 harness，这笔账算得过来；对一次性短问答的产品，这套约束就是纯负担。

## 五、可复核实验

### 实验 1：数清楚覆盖面（无需凭据）

```bash
cd sources/checkouts/deepseek-harness

# 包总数
find packages -mindepth 3 -maxdepth 3 -name package.json | wc -l          # 219
# 有 Model Experience 的 README
grep -rl "## Model Experience" --include=README.md packages/ | wc -l       # 215
# 有 KV Cache effect 的
grep -rl "KV Cache effect" --include=README.md packages/ | wc -l           # 215
# KV Cache effect 段落总数
grep -rh "KV Cache effect" --include=README.md packages/ | wc -l           # 305

# 四分类各自用了多少次
for w in Append-only Prefix-stable Replacing independent; do
  printf "%-16s %s\n" "$w" \
    "$(grep -rhA2 'KV Cache effect' --include=README.md packages/ | grep -ci "$w")"
done
```

期望：92 / 45 / 3 / 17。

**该得出的结论**：`Append-only` 占绝对多数，说明绝大部分包被设计成「只在尾部追加」；`Replacing` 只有 3 个，说明打断前缀是被严格控制的少数派。

### 实验 2：找出没有 Model Experience 的 4 个包，并核对豁免理由（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
for d in $(find packages -mindepth 3 -maxdepth 3 -name package.json | xargs -n1 dirname); do
  grep -q "## Model Experience" "$d/README.md" 2>/dev/null || echo "$d"
done
sed -n '28,40p' scripts/verify-package-readme-model-experience.ts
```

四个包应当**完全对应**脚本里 `NO_MODEL_EXPERIENCE_SECTION` 的四个键。如果对不上，说明有包漏写了文档而门禁没拦住——那是一个真实的 bug，值得报给上游。

### 实验 3：跑缓存的 e2e 测试（需要凭据）

`packages/core/agent-loop/tests/request-cache.e2e.ts` 是这条线的端到端覆盖： `evidence: test`

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/core/agent-loop/tests/request-cache.e2e.ts
```

无 key 时它会自跳过（`test:e2e` 的约定），所以先确认它真的跑了而不是 skip。

### 实验 4：实测命中率（需要凭据）

跑一个**多轮**任务，让上下文长起来：

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile headless "依次读 packages/core 下每个包的 README，然后总结它们的分工"
```

从会话日志里逐 step 取 usage，算三个数：

| 指标 | 怎么算 |
| --- | --- |
| 命中率 | `cacheReadTokens / (inputTokens + cacheReadTokens)` |
| 逐 step 趋势 | 第 1 步应接近 0，之后应显著上升 |
| 是否有塌陷 | 中途突然回到 0 的那一步，去看它前面发生了什么 |

**该记录**：模型、profile、step 数、每步的 `inputTokens` / `cacheReadTokens`。
**该得出**：命中率随 step 上升是正常形态。**如果中途塌陷，最可能的原因是触发了压缩**——那正好是文章 07 的入口。

## 本篇尚未覆盖的源文件

- `scripts/verify-package-readme-model-experience.ts` 的完整校验规则（553 行，本文只讲了 4 处）
- `packages/llm/token-meter/`（`usage-projection.ts`）—— 用量如何投影成会话级统计
- `packages/llm/llm/src/types.ts` 的 `TokenUsage` 完整定义与各字段口径
- `packages/llm/llm-deepseek/src/adapter.ts` —— replay state 如何在同 adapter 实例间转移
- 压缩如何在打断前缀的同时把损失降到最小 → 文章 07
