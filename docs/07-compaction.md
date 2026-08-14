---
sources: [{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/summarizer.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/src/region.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction/src/types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction-tool-result-pruner/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":".agents/notes/implemented/bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction-basic/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 07｜压缩：为什么摘要请求不新开一个

> 本文基线 `47f9438`。所有行号对应该 Commit。
>
> 这篇讲一个真实的 bug 和它的修复。它是理解「缓存纪律如何落到具体设计」的最好案例。

## 一、产品现象

长会话跑到一定长度，上下文会被压缩。用户能观察到的：

| 现象 | 背后是什么 |
| --- | --- |
| 对话中途出现一次明显停顿 | 压缩要发一次额外的模型请求 |
| 压缩之后模型「忘了」早期细节，但记得结论 | surface 被摘要节点替换 |
| 导出的完整记录仍然完整 | 日志没被删，只是投影变了 |
| **压缩那一刻缓存命中率塌陷** | 前缀被替换，这是不可避免的 |
| 但压缩本身的那次请求**不该**再塌一次 | ← 本文的主题 |

最后两行是关键。压缩必然打断主对话的前缀（文章 06 说的 `Replacing`），这没办法。但**压缩自己发出的那次辅助请求**，如果设计不当，会额外再付一次全量 prompt 处理费。

## 二、源码路径

```
packages/compaction/                       2,880 行，4 个包
  compaction/            service 定义
    types.ts       119   三个事件的类型
    index.ts       172   CompactionTrigger、服务接口
    invariant.ts   306   ← 运行时不变量，比实现还大
    tool-pairing.ts 131  工具配对边界
    checkpoint.ts   51
  compaction-basic/      默认 provider
    region.ts      550   区间选择与前缀重放
    index.ts       431
    config.ts      310
    summarizer.ts  224   ← 本文主角
    types.ts        76
  compaction-tool-result-pruner/   确定性剪枝
  command-compact/       /compact 命令
```

`compaction/src/invariant.ts` **306 行，比服务实现本身（172 行）还大**。这是文章 11 的一个预告：在这个仓库里，「证明自己没坏」的代码可以比功能代码更多。

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `compaction/src/index.ts:25` | `CompactionTrigger = 'pressure' \| 'context-overflow'` |
| `compaction/src/types.ts:23` | `compaction/start` 事件 |
| `compaction/src/types.ts:33` | `compaction/summary` 事件 |
| `compaction/src/types.ts:71` | `compaction/end` 事件 |
| `compaction-basic/src/summarizer.ts:31` | `COMPACTION_INSTRUCTION` |
| `compaction-basic/src/summarizer.ts:69` | `CHECKPOINT_PREAMBLE` |
| `compaction-basic/src/summarizer.ts:145` | 辅助请求的 messages 组装 |
| `compaction-basic/src/region.ts:98` | `selectCompactableRange()` |
| `compaction-basic/src/region.ts:305` | `assertNoActiveCompaction()` |
| `compaction-basic/src/region.ts:498` | `buildSummarizationInput()` |

## 三、机制

### 那个 bug

`.agents/notes/implemented/bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md` 的 Problem 一节，原文大意： `evidence: official-doc`

自动压缩在对话中途触发，**此时 provider 的 KV cache 刚被上一次 routed request 预热**（`system` + `tools` + 派生历史）。

而原来的 summarizer 发的是一个**独立**的辅助请求：

- 一个专用的 summarizer `system` prompt
- 把旧历史**拍平成一个渲染好的 transcript 字符串**

> A provider caches on the request's leading token sequence, so **a first token that differs — a different system prompt — invalidates the entire cached prefix.**

结果：同一段历史付了两次全量 prompt 处理费——一次是触发压力的那个对话请求，一次是摘要请求。**而且恰好发生在对话最长的时候。**

### 修复：把指令从请求头挪到对话尾

决策一句话：

> The summarization directive moves from the **front** of the request (a fresh `system` prompt) to the **end** of the conversation (the final `user` message).

辅助请求变成上一次 routed request 的**真前缀扩展**。

看 `summarizer.ts:145-160` 的实际代码： `evidence: code`

```ts
const messages: Message[] = [
  ...input.messages,
  createUserMessage({
    content: [{ type: 'text', text: COMPACTION_INSTRUCTION }],
    source: { kind: 'plugin', plugin: 'dsh-compaction-basic' },
  }),
]
const options: GenerateOptions = {
  provider: target.provider,
  model: target.model,
  messages,
  ...input.system === undefined ? {} : { system: input.system },
  ...input.tools === undefined ? {} : { tools: [...input.tools] },
  maxTokens: config.maxTokens,
  sessionId: agent.session.id,
  purpose: 'compaction',
}
```

三件事：**`system` 原样转发**、**`tools` 原样转发**、**指令作为最后一条 user 消息追加**。

### 字节相同不是形容词

`region.ts:498` 的 `buildSummarizationInput()`：

```ts
const header = session.requestHeader()        // :502  durable 的 system 与 tools
  ...
  .map(seq => session.deriveEventMessage(events[seq]!))   // :507
```

前缀不是「重新拼一个差不多的」，而是：

- `system` 和 `tools` 来自 `session.requestHeader()`——文章 05 讲的那个可重建请求头
- 被影区间的消息过 `session.deriveEventMessage`——**和 `deriveMessages()` 折进 routed request 的是同一个纯函数**

Agent Note 的原话是 **byte-identical**。这就是为什么文章 05 要强调 `deriveEventMessage` 是「对外暴露的纯函数，外部重建器用同一套规则」——压缩就是那个外部重建器。

### 被否决的三个方案

Agent Note 的 Alternatives considered 一节比决策本身更有教学价值： `evidence: official-doc`

| 否决方案 | 理由 |
| --- | --- |
| 保留 summarizer system prompt，只复用其余部分 | **system 槽是 provider 缓存的第一个 token 区域**，换掉它，后面复用什么都没用 |
| 只发被影区间，不带 `system`/`tools` 头 | 头不同就在第一个 token 分叉，缓存一样打不中，还丢了摘要需要的框架 |
| **省掉 `tools`**（summarizer 根本不调工具） | **工具 schema 是缓存 token 序列的一部分**，省掉会让后面每个 token 错位 |

第三条最反直觉：明明这次请求不需要工具，却必须把工具 schema 带上，**因为少了它，token 序列就对不齐了**。

### 指令本身：一份结构化 checkpoint 模板

`COMPACTION_INSTRUCTION`（`summarizer.ts:31`）开头是：

> You are now acting as a compaction engine for this AI coding assistant. Condense the conversation **ABOVE** into a structured checkpoint...

注意 **ABOVE** —— 因为指令在末尾，「上面」才是要压缩的内容。这是位置变更带来的措辞变更。

它要求输出八个固定小节，**空的写 `(none)` 也不许省略**：

```
## Primary Request and Intent    用户原始与演进中的目标，措辞重要处逐字引用
## Key Technical Concepts        涉及的技术、框架、模式、约定
## Files and Code                精确路径：为什么重要、关键改动或片段
## Errors and Fixes              错误：如何解决，以及相关用户反馈
## Pending Jobs                  明确要求但尚未完成的工作
## Current Work                  此检查点时正在进行的事
## Next Step                     下一个动作，或 "(none)"
## Critical Context              决策与理由、约束、用户偏好、开放问题
```

Rules 里有四条（`:60-65`）：

- 保留**精确的**文件路径、命令、错误串、标识符、数值、函数签名、语法片段
- 忠实捕捉用户反馈和明确指令，**尤其是纠正**
- **不要提及这次摘要请求，也不要说上下文被压缩过**
- 只输出 checkpoint 文本，**不要调用任何工具**

后两条是位置变更后新增的——原来放在 system prompt 里不需要说，挪到对话末尾后模型会把它当成一轮正常对话，所以必须显式禁止。

还有一条处理**重复压缩**（`:65`）：如果对话里已经有一个 checkpoint 块，那是先前的检查点，**不要原样抄过来**，而要保留仍然成立的事实、丢掉过时的、把新信息合并进同一结构。

### 摘要落地：一条带 preamble 的 user 消息

`CHECKPOINT_PREAMBLE`（`:69`）是包在摘要外面的框架：

> This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as **established background** and build on it without restating it. Continue the task directly from the messages that follow, **without acknowledging this checkpoint**.

摘要以一条 `user/message` 落地，带 `surfaceOp: 'replace'`——**这是用户唯一能观察到的 surface 变化**，也是文章 05 里那个 `replace` 必须列出全部被影节点的使用场景。

### 三个事件与锁协议

`compaction/src/types.ts` 定义三个 log-only 事件，都带 `compactionId`： `evidence: code`

| 事件 | 行号 | 作用 |
| --- | --- | --- |
| `compaction/start` | `:23` | 拿锁。`turn: number \| null`——数字表示自动周期，null 表示手动 |
| `compaction/summary` | `:33` | 记录安全摘要投影、被影边界、seq 区间、token 估算、LLM 调用元数据 |
| `compaction/end` | `:71` | 放锁，带 `error?: string` 记录失败尝试 |

**崩溃会留下不配对的 `start`**，这是可检测的证据，而不是假装成功。`region.ts:305` 的 `assertNoActiveCompaction()` 就是在检查这个。

### 两个触发器

`compaction/src/index.ts:25`：

```ts
export type CompactionTrigger = 'pressure' | 'context-overflow'
```

| 触发器 | 语义 |
| --- | --- |
| `pressure` | 常规压力，用**最新的 durable routed request** |
| `context-overflow` | provider 确认溢出，**可以采取更激进的削减策略** |

### 剪枝先于摘要

`compaction-tool-result-pruner` 是独立的一个包，做**确定性文本截断**：

- 按 **Unicode code point** 而不是 token 计量和切分
- 保持块顺序
- 在 `pressure` 场景下**先于区间选择**运行

先便宜地砍工具输出，实在不够再花钱发摘要请求。

### 区间边界的两条规则

`selectCompactableRange()`（`region.ts:98`）：

- 边界**必须保持 tool call / result 配对**（`compaction/src/tool-pairing.ts` 131 行专门管这个）
- 但**不必保住整个 turn**——超大 turn 的早期 step 可以被压掉

## 四、约束与失效条件

### 缓存复用是尽力而为，正确性不是

Agent Note 有一节标题就叫 **"Cache reuse is best-effort, correctness is not"**： `evidence: official-doc`

| 场景 | 缓存复用 | 正确性 |
| --- | --- | --- |
| 自动压缩（锚在 surface head） | **保证命中**——被影区间就是请求头部，重放前缀精确匹配 | ✅ |
| 手动 `compactRegion` 压中段 | **放弃复用**——被影区间不是请求头 | ✅ 仍然正确 |
| 配了不同的 summarization provider/model | **放弃复用** | ✅ 「这是部署的显式取舍，不是缺陷」 |

这个区分很重要：**性能优化可以有条件地失效，正确性不行。**

### surface-boundary 是位置，不是数值区间

一个反直觉的点：被影边界是**首尾事件的 seq 位置**，不是数值区间。

> after a prior replace lands a fresh high-seq summary node at an older range's position, **`start` can be GREATER than `end`**

第二次压缩时，前一个摘要节点的 seq 很高但位置很靠前，于是 `start > end`。写遍历逻辑时按数值大小假设会直接出错。

### 压缩必然打断主对话的前缀

`compaction-basic/README.md` 写得很清楚：

> **Replacing rather than append-only.** Each checkpoint invalidates reuse from the first replaced history token; the unchanged request prefix before that range remains reusable.

**这没有办法绕过。** 能做的只有两件事：让它尽量晚发生（先剪枝）、让它自己那次请求不要额外再付一遍（本文主题）。

### 评测压缩不能只看 token 下降

至少要同时比较：任务成功率、丢失的约束、工具引用完整性、成本、额外延迟。

一个把上下文砍掉 90% 但让任务失败率翻倍的压缩策略，token 曲线会非常好看。

### 溢出重试的边界

上下文溢出被 LLM 层归一为稳定错误码（`CONTEXT_WINDOW_EXCEEDED`）。**只有剪枝或摘要真正推进了 generation，系统才开始新的 retry turn**，否则保留原始请求错误——避免在没有任何进展的情况下无限重试。

## 五、可复核实验

### 实验 1：读那三个被否决的方案（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '/## Alternatives considered/,/## Consequences/p' \
  .agents/notes/implemented/bug-fix/2026-07-21-compaction-summary-prefix-cache-reuse.md
```

回答：**为什么「省掉 tools」这个看起来最合理的优化是错的？**

### 实验 2：核对指令确实在末尾（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '143,162p' packages/compaction/compaction-basic/src/summarizer.ts
```

确认三件事：`input.messages` 在前、指令 user 消息在后、`system` 与 `tools` 从 input 原样转发。

再看指令全文，注意 "conversation **ABOVE**" 这个词：

```bash
sed -n '31,66p' packages/compaction/compaction-basic/src/summarizer.ts
```

### 实验 3：跑压缩相关测试（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/compaction
```

重点看 `compaction-basic.spec.ts` 里断言「辅助调用转发了 `system`/`tools`/前置消息，并把压缩指令作为最后一条消息追加」的用例。

### 实验 4：观察一次真实压缩（需要凭据，耗时较长）

需要把上下文顶到压力阈值。用一个会读很多文件的任务：

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile headless "逐个读取 packages/core 与 packages/llm 下所有 README 和 src/index.ts，然后写一份分工报告"
```

在会话日志里找：

1. 是否出现 `compaction/start` → `compaction/summary` → `compaction/end` 三件套，且 `compactionId` 一致
2. `compaction/summary` 里记录的被影 seq 区间
3. 落地的那条 `user/message` 是否带 `surfaceOp: { op: 'replace', ... }`，且 `sourceEventSeqs` 覆盖全部被影节点
4. **压缩前后两步请求的 `cacheReadTokens`**

**该得出的结论**：主对话在压缩后的第一步命中率会下降（`Replacing` 的必然代价），但摘要请求自己应当有可观的 `cacheReadTokens`——它复用了预热的前缀。

如果摘要请求的 `cacheReadTokens` 接近 0，说明触发的是手动中段压缩、或配了不同的 summarization provider——回到本文第四节的三行表核对。

## 本篇尚未覆盖的源文件

- `packages/compaction/compaction/src/invariant.ts`（306 行）—— 压缩的运行时不变量，文章 11 的主要素材
- `packages/compaction/compaction-basic/src/region.ts`（550 行）—— 区间选择的完整算法
- `packages/compaction/compaction-basic/src/config.ts`（310 行）—— 保留策略与溢出上限
- `packages/compaction/compaction/src/tool-pairing.ts`（131 行）—— 工具配对边界的判定
- `packages/compaction/compaction-tool-result-pruner/`（304 行）—— 确定性剪枝的完整规则
