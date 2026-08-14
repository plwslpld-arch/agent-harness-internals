---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"codex","path":".","commit":"cbe85e117b1db59cdbe8175c59793c3cf2a4a7b8"},{"repo":"opencode","path":".","commit":"722e717e995b38123b442150ec2c5b149c081e85"},{"repo":"qwen-code","path":".","commit":"53a7f2fd1bd439f16be3269b4945460628d2a39b"},{"repo":"mini-swe-agent","path":".","commit":"a83fcae82d2a08f0ee0c688f9d137b3566c097f8"},{"repo":"pi","path":".","commit":"9d2ec7ffabe927bfad2214c1cee25b6632a78dcf"},{"repo":"claude-agent-sdk-typescript","path":".","commit":"8716a39f83dd7506e6421199caface603d4941ab"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, official-doc]
---

# 12｜横向对照：dsh vs Claude Code / Codex / OpenCode

> 各仓库基线见本文 frontmatter 的 `sources`。所有数字都可以用第五节的命令复核。
>
> **这不是排名。** 这些项目的目标不同，一个 15,000 行的 harness 和一个 497,000 行的 harness 各自解决的问题就不一样。本文只做可验证的结构对照。

## 一、产品现象

「都是命令行 AI 编码工具，差别到底在哪？」

用户能观察到的差异往往是表层的：谁的 UI 好看、谁支持哪些模型。真正决定长期体验的是三件用户看不见的事：

| 用户体验 | 由什么决定 |
| --- | --- |
| 长会话是否越用越贵 | 请求前缀是否稳定 |
| 崩溃后能否安全接着跑 | 会话是否事件溯源 |
| 三个月后还能不能加新能力 | 扩展是加插件还是改核心 |

## 二、对照对象与规模

| 项目 | 语言 | 源码行数 | 基线 Commit |
| --- | --- | --- | --- |
| codex | Rust + TS | 1,434,593 | `cbe85e117b` |
| opencode | TS | 533,146 | `722e717e99` |
| deepseek-harness | TS | 497,179 | `47f9438` |
| pi | TS | 257,448 | `9d2ec7ffab` |
| qwen-code | TS | 68,917 | `53a7f2fd1b` |
| mini-swe-agent | Python | 15,028 | `a83fcae82d` |
| claude-agent-sdk-typescript | TS | 1,380 | `8716a39f83` |

两个极端值得先说：

- mini-swe-agent 15,028 行是一个**论点**，不是缺陷。它主张 harness 可以很薄，复杂度应该在模型里。
- claude-agent-sdk-typescript 1,380 行根本不是 harness，是一个 SDK ——它把 harness 留给 Claude Code 本体。放进对照是为了说明「SDK」和「harness」不是一个层次。

Claude Code 本体不开源，没法做源码级对照。下面凡是提到它的地方都只能基于公开 SDK 和文档，不能和其它几家放在一起比。

## 三、机制对照

### 维度 1：扩展模型

| 项目 | 扩展方式 | 能否替换核心循环 |
| --- | --- | --- |
| **dsh** | Cordis 插件树；模型、工具、会话、沙箱、UI、**连 agent loop 本身**都是插件 | **能**（换 `agent-loop` 插件） |
| codex / opencode / qwen-code | 主要靠 MCP 接外部工具 + 配置项 | 需改核心代码 |
| mini-swe-agent | 极简，改代码即扩展 | 不适用（本来就很小） |

这是 dsh 最大的结构性差异，也是它 497k 行的主要来源之一：为了让一切可替换，每个能力都要拆成 Service Definition / Provider / Consumer 三个角色（文章 01、02）。

代价很直接：**理解成本更高**。要改一个行为，先得判断是改插件、改配置、改 profile，还是真的要动核心。

### 维度 2：会话模型

| 项目 | 会话表示 |
| --- | --- |
| **dsh** | append-only 事件日志 + surface 投影；13 个 `session/*` 包（文章 05） |
| codex | rollout 记录 |
| opencode / qwen-code | 有会话持久化 |
| mini-swe-agent | **无持久会话层** |

dsh 的特殊之处不是「有日志」，而是把「模型看到的历史」和「真实发生过什么」显式拆成两件事，并用 `SurfaceOp` 的类型约束保证替换必须举证。

### 维度 3：缓存纪律 ← 最大的差异

这是本仓库文章 06 的主题，也是最能量化的一项：

| 项目 | 包级 README 数 | 强制 KV-cache 文档化 |
| --- | --- | --- |
| **deepseek-harness** | **268** | **215 个包有 `#### KV Cache effect`，CI 门禁强制** |
| qwen-code | 24 | 未见同类制度 |
| opencode | 17 | 未见同类制度 |
| pi | 11 | 未见同类制度 |

**268 vs 17** 这个量级差距不是「文档写得多」，而是**制度不同**：dsh 要求每个包在设计阶段就回答「我会不会打断请求前缀」，并由 553 行的校验器在 CI 里检查（文章 06）。

我在其它几个仓库里没有找到同类的强制约定。这是 dsh 目前最独特的工程设计。

### 维度 4：自证制度 ← 第二大差异

| 项目 | 决策记录树 | AGENTS.md / CLAUDE.md 数 |
| --- | --- | --- |
| **deepseek-harness** | **`.agents/notes/`（675 篇）+ `docs/postmortem/`（4 篇）** | **24** |
| opencode | 无 | 18 |
| qwen-code | 无 | 3 |
| codex | 无 | 2 |
| mini-swe-agent | 无 | 2 |
| pi | 无 | 1 |

六个仓库里只有 dsh 有结构化的决策记录树。 其余五家都没有 ADR / notes / postmortem 目录。

再加上 219 个 `invariant.ts`（文章 11），dsh 在「让别人相信它没坏」这件事上的投入是数量级的差异。

### 维度 5：协议面

| 项目 | 对外协议面 |
| --- | --- |
| **dsh** | MCP（入）+ ACP（出）+ 自有 SDK JSON-RPC + Web/API |
| codex | MCP + 自有 SDK |
| qwen-code | MCP |
| opencode | MCP + 自有 SDK |
| mini-swe-agent | 无 |

MCP 现在是事实标准，各家都接。差异在「谁能驱动我」这一侧——dsh 用 ACP 做编辑器/父 Agent 入口，并明确把它做窄（532 行，文章 10）。

### 维度 6：语言选择

codex 用 Rust 写核心（`codex-rs`），是唯一一个不以 TS/JS 为主的。这带来分发优势（单二进制）和性能确定性，代价是插件生态的门槛——用 Rust 写扩展的人远少于用 TS 的。

dsh 全 TS + vendored Cordis，插件门槛低，但要处理 ESM/NodeNext/tsx 那一整套工程复杂度（文章 02 的 18 类 vendor 差异里有好几条是这个）。

## 四、约束与失效条件

### 这些数字能证明什么、不能证明什么

| 能证明 | 不能证明 |
| --- | --- |
| 代码规模与结构 | 代码质量 |
| 存在某种制度（决策树、README 契约） | 该制度被执行得好 |
| 存在某个能力的源码 | 该能力默认启用、生产可用 |
| 某个仓库没有 ADR 目录 | 该团队没有设计评审（可能在别处，如 PR 描述或内部系统） |

**最后一行尤其重要。** 「codex 没有 `.agents/notes/`」只证明它的公开仓库里没有这个目录，不证明 OpenAI 内部没有设计文档。我能核实的只有公开仓库。

### 规模大不等于成熟

codex 1.43M 行、dsh 497k 行、mini-swe-agent 15k 行——这三个数字不能排序成质量高低。

- codex 的体量部分来自 Rust + 多语言 SDK + 大量 vendored 依赖
- dsh 的体量部分来自「一切皆插件」的三角色拆分
- mini-swe-agent 的小是设计目标

用行数论优劣是最没有信息量的比较。

### dsh 的三条代价

诚实列出来：

1. **理解成本高。** 219 个包、Cordis 插件树、四层配置合成——上手曲线明显比 qwen-code 陡。
2. **制度开销。** 每个非平凡改动要写 Agent Note，每个包要写 Model Experience 与 invariant，三件套还要双语。这只在长期演进 + 贡献者轮换时才划算（文章 11）。
3. developer preview。 `SESSION_FORMAT_VERSION = 0` 且明确不作兼容承诺（文章 05）。上面两条投入换来的稳定性，暂时还没有兼容性承诺来兑现。

### 什么场景选什么

| 场景 | 倾向 |
| --- | --- |
| 想读懂现代 harness 怎么造 | **dsh** —— 拆分最清晰，且有决策记录可追溯 |
| 要一个能跑的单二进制 CLI | codex |
| 要最小可改的研究基座 | mini-swe-agent |
| 主要用 Qwen 模型 | qwen-code |
| 要在自己产品里嵌 Claude | claude-agent-sdk |
| 长会话成本敏感 + 用 DeepSeek | **dsh**（文章 06） |

## 五、可复核实验

### 实验 1：复核规模（无需凭据）

```bash
cd sources/checkouts
for r in deepseek-harness codex opencode pi qwen-code mini-swe-agent claude-agent-sdk-typescript; do
  n=$(find $r \( -name '*.rs' -o -name '*.ts' -o -name '*.py' -o -name '*.go' \) \
        -not -path '*/node_modules/*' -not -path '*/target/*' -not -name '*.d.ts' 2>/dev/null \
      | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
  printf "%-32s %s\n" "$r" "$n"
done
```

### 实验 2：复核制度差异（无需凭据）

```bash
cd sources/checkouts

echo "--- 决策记录树"
for r in deepseek-harness codex opencode qwen-code mini-swe-agent pi; do
  d=$(find $r -maxdepth 3 -type d \( -iname "*adr*" -o -iname "*decision*" -o -iname "notes" \
        -o -iname "*postmortem*" -o -iname "*rfc*" \) -not -path "*/node_modules/*" 2>/dev/null | head -3 | tr '\n' ' ')
  printf "%-20s %s\n" "$r" "${d:-—}"
done

echo "--- 包级 README"
for r in deepseek-harness opencode qwen-code pi; do
  printf "%-20s %s\n" "$r" \
    "$(find $r/packages -maxdepth 3 -name README.md -not -path '*/node_modules/*' 2>/dev/null | wc -l)"
done
```

期望：只有 `deepseek-harness` 一行有决策记录目录；包级 README 是 268 / 17 / 24 / 11。

### 实验 3：验证「只有 dsh 强制 KV-cache 文档化」（无需凭据）

```bash
cd sources/checkouts
for r in deepseek-harness opencode qwen-code pi; do
  printf "%-20s KV Cache effect: %s\n" "$r" \
    "$(grep -rl "KV Cache effect" --include=README.md $r 2>/dev/null | grep -v node_modules | wc -l)"
done
```

期望：`deepseek-harness` 215，其余为 0。

如果你在其它仓库里找到了同类制度，那是本文的一个错误 —— 欢迎提 issue 纠正。

### 实验 4：同一任务跑三家（需要各自的凭据）

这是最有说服力但也最费事的实验。固定同一个任务、同一个模型（如果可能），分别跑 dsh / opencode / qwen-code，记录：

| 指标 | 怎么取 |
| --- | --- |
| 完成 / 未完成 | 各自的退出码或最终状态 |
| 总 input token | 各自的 usage 上报 |
| **缓存命中 token** | dsh 有 `cacheReadTokens`；其它家看它们各自的 usage 字段 |
| wall-clock | `time` |
| 工具调用次数 | 各自的日志 |

**该记录**：任务原文、各家版本 SHA、模型、profile/配置、五项指标。
**该得出**：只能得出「在这个任务、这个模型、这些配置下」的结论。单个任务的对比不构成 benchmark——评测结果属于「模型 + Harness + 工具 + 上下文 + 沙箱 + 终止条件」的组合，不能单独归因给任何一方。

## 本篇尚未覆盖的内容

- codex 的 Rust 核心（`codex-rs`）架构，本文只提了语言选择
- opencode 533k 行的内部分层
- pi 与 dsh 的关系（dsh 有 `llm-pi-ai` provider，两者不是竞争关系）
- 各家的 sandbox 实现对照 —— 这是一个值得单独写的题目
- Claude Code 本体（不开源，无法源码级对照）
- 真实的多任务 benchmark —— 需要独立的实验设计，见后续附录
