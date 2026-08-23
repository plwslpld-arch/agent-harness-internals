# 运行记录：带凭据的 DeepSeek 端到端验证

| 字段 | 值 |
| --- | --- |
| 记录 ID | `2026-08-16-deepseek-cache-probe` |
| 日期 | 2026-08-16 |
| 上游 commit | `47f943859bef60e4160492346772ded9b24f765a` |
| 模型 | `deepseek-v4-flash`（适配器 e2e 另用 `deepseek-v4-pro`） |
| Node | v22.20.0（便携版；上游 `.nvmrc` 要求 24，本机默认的 v20 缺 `Promise.withResolvers`，跑不起来） |
| 凭据 | `DEEPSEEK_API_KEY`，只从环境变量读；**值未记录、未入库** |
| 退出码 | 全部 0 |

这份记录取代了此前那条「带凭据的验证尚未执行」的待办。现在有两类证据：**上游自己的 e2e 测试真的跑过并通过**，以及**我们自己写的探针脚本量到的缓存数字**。

---

## 一、上游 e2e 测试（最强的一类证据）

### 1. 缓存端到端

```
node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts \
  --reporter=verbose packages/core/agent-loop/tests/request-cache.e2e.ts
```

```
✓ log-derived request cache hits (real API) > every request after the first
  hits the provider prefix cache   2027ms
Test Files  1 passed (1)
     Tests  1 passed (1)
```

这个测试断言的是：一个含工具调用的 turn 加一个后续 turn，**除第一次外每次请求的 `cacheReadTokens > 0`**（`packages/core/agent-loop/tests/request-cache.e2e.ts:92`）。它通过，意味着 dsh 进程按事件日志重建出来的请求，在真实 provider 上确实命中了前缀缓存——不是「模仿 dsh 形状的请求会命中」，是 dsh 自己跑出来的。

**对照组**：把 `DEEPSEEK_API_KEY` 从环境里去掉再跑同一条命令，结果是 `Tests 1 skipped (1)`。这证明上面那次是真跑，不是门控放行后的空转。

### 2. DeepSeek 适配器端到端

```
node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts \
  --reporter=verbose packages/llm/llm-deepseek/tests/adapter.e2e.ts
```

```
✓ serves a real request with the key held only by a credentials-local document   604ms
✓ flash dynamically switches from off to high                                   1650ms
✓ pro + thinking enabled (effort high): tool-call round trip with reasoning passback   3117ms
✓ pro + thinking enabled (effort max): tool-call round trip with reasoning passback    2854ms
✓ pro + thinking disabled: plain generation without reasoning blocks             612ms
✓ streams raw chunks in protocol order                                           521ms
Test Files  1 passed (1)
     Tests  6 passed (6)
```

这 6 条覆盖了 [DSH LLM 层](../../docs/deep/dsh-llm-adapter.md) 里几个关键说法：凭据只从 credentials 文档读、`thinking` 开关可以在会话中途切换、带 tool call 的轮次会回传 `reasoning_content`、SSE 分片按协议顺序到达。

---

## 二、自己写的缓存探针

上游那个 e2e 只断言「命中 > 0」，不告诉你命中多少、什么情况下会掉。所以另写了一个零依赖脚本，直接对 API 测四件事：

| 字段 | 值 |
| --- | --- |
| 脚本 | `scripts/experiments/cache-probe.mjs` |
| 命令 | `node scripts/experiments/cache-probe.mjs --json <out>` |
| 请求次数 | 20（含 4 次 warmup） |
| 用量 | prompt 16,940 tokens，completion 800 tokens |

**边界**：这个脚本用的是手写的、模仿 dsh 请求形状的请求，测的是 **DeepSeek 服务端的行为**。它回答「这套构造方式值不值」，不回答「dsh 的实现有没有 bug」——后者由上面第一节的 e2e 回答。

### A：前缀稳定、历史只追加

每轮把新的 user/assistant 消息追加到尾部，system 与 tools 一字节不动。

| 轮次 | prompt_tokens | 命中 | 未命中 | 命中率 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 718 | 0 | 718 | 0.0% |
| 2 | 748 | 640 | 108 | 85.6% |
| 3 | 767 | 640 | 127 | 83.4% |
| 4 | 786 | 640 | 146 | 81.4% |
| 5 | 803 | 768 | 35 | 95.6% |

第一次必然全未命中（缓存还没写进去），之后稳定在 81–96%。

### B：只改 system 的第一句话

其余部分（tools、全部历史消息）完全不变，只把 system 第一句改了几个字：

| 请求 | prompt_tokens | 命中 | 未命中 | 命中率 |
| --- | ---: | ---: | ---: | ---: |
| 同一个 system（热缓存） | 747 | 640 | 107 | 85.7% |
| system 首句改一处 | 751 | **0** | 751 | **0.0%** |

**从 85.7% 直接掉到 0。** 这是「system 变了从第一个 token 起整个前缀作废」最直接的证据，也解释了为什么 dsh 要把易变信息赶出 system。

### C：权限策略变化放哪里

同一件事的两种做法，各切换三次。C1 是被上游否决的做法（策略拼进 system 末尾），C2 是 dsh 现在的做法（策略作为尾部 user 快照，system 不动）。

| 做法 | 第 1 次 | 第 2 次 | 第 3 次 |
| --- | ---: | ---: | ---: |
| C1 策略进 system | 99.0%（768 命中） | **33.0%**（256 命中） | **33.2%**（256 命中） |
| C2 策略进尾部 user 快照 | 97.1%（768 命中） | **81.0%**（640 命中） | **81.3%**（640 命中） |

C1 每次切换只剩 256 个 token 命中——正好是策略文本之前那段公共前缀；后面的 system 尾部加上全部历史都要重算。C2 的 system 一字节没动。

这复现了上游那条设计记录（`.agents/notes/implemented/feature/2026-07-30-current-sandbox-policy-context.md`）的结论。上游在真实会话里量到「放 system 时切换后只命中 256 token」——**我们独立测出来的也是 256**，因为两边都卡在同一个缓存块边界上。

### D：摘要请求怎么发

| 请求 | prompt_tokens | 命中 | 未命中 | 命中率 |
| --- | ---: | ---: | ---: | ---: |
| 主对话最后一次请求（热身） | 1,207 | 1,152 | 55 | 95.4% |
| 摘要：同 system + tools，指令放**尾部** user 消息 | 1,233 | 1,152 | 81 | **93.4%** |
| 摘要：另起一个 summarizer system prompt | 968 | **0** | 968 | **0.0%** |

dsh 的做法（复用主对话前缀）几乎全命中；被它否决的做法从第一个 token 起全部重算。上游那条 bug-fix 记录说的「Every compaction therefore paid full prompt-processing cost for the whole replayed history twice」在这里是可见的。

### 附带发现：64-token 块粒度

这次拿到的全部非零命中值是 `256 / 640 / 768 / 1,152`，**每一个都是 64 的整数倍**（4、10、12、18 块）。

dsh 仓库里对块粒度的唯一说明是一句测试注释（`packages/core/agent-loop/tests/request-cache.e2e.ts:23`）。这组数据是对它的独立佐证。

---

## 怎么复现

上游 e2e（需要 Node 22 以上，仓库 `.nvmrc` 写的是 24）：

```bash
cd sources/checkouts/deepseek-harness
pnpm install --no-frozen-lockfile
export DEEPSEEK_API_KEY=your-own-key
node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts \
  packages/core/agent-loop/tests/request-cache.e2e.ts
```

本仓库的探针：

```bash
export DEEPSEEK_API_KEY=your-own-key
node scripts/experiments/cache-probe.mjs --json probe.json
```

两者都只从环境变量读 key，输出里不含 key。探针的花费约两万 prompt token 的 flash 调用。

## 仍未做的事

- 没有跑 `apps/web/tests/` 下的浏览器 e2e（需要构建前端产物）。
- 没有做长会话的压缩实测：探针里的 D 组模拟了摘要请求的形状，但没有真的触发一次 `compaction-basic` 的完整事务。
- `pnpm install` 会改动上游 checkout 的 `pnpm-lock.yaml`（overrides 配置与 lockfile 不一致），跑完需要 `git checkout -- pnpm-lock.yaml` 还原，否则本仓库的 `sources:verify` 会报「checkout has local changes」。
