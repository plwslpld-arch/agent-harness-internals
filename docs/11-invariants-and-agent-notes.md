---
sources: [{"repo":"deepseek-harness","path":"packages/runtime-diagnostics/invariants/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/AGENTS.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"AGENTS.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"scripts/verify-package-invariants.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":".agents/notes/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"docs/postmortem/README.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/compaction/compaction/src/invariant.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/invariant.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, official-doc]
---

# 11｜Invariant 与 Agent Note：一个仓库如何自证

> 本文基线 `47f9438`。所有行号对应该 Commit。
>
> 这篇讲的不是 agent 技术，是 dsh 用什么办法保证自己没坏：每个包一个运行时不变量，每个非平凡改动一篇设计记录。

## 一、产品现象

对使用者来说，这一层的表现是：

| 现象 | 背后是什么 |
| --- | --- |
| 升级一个版本后，行为变化在文档里能查到「为什么」 | 507 篇 implemented Agent Note |
| 某个能力被删了，但删除理由和历史仍可追溯 | Agent Note 的 lifecycle 分层 + archived 冻结树 |
| 一个包「没有不变量」也要写明理由 | 219 个 `invariant.ts`，一个不落 |
| 同一类 bug 没有再犯 | 4 篇 postmortem 各自留下了守卫 |

对贡献者来说更直接：你没法悄悄改坏一件事，也没法悄悄不解释。

## 二、源码路径

```
packages/runtime-diagnostics/invariants/src/
  index.ts        200   InvariantRegistry 服务
  invariant.ts     30   它自己的不变量伴生

packages/*/src/invariant.ts     219 个，每包一个

.agents/notes/
  proposed/        25 篇
  implemented/    507 篇   architecture 129 / feature 170 / bug-fix 77 / process 69
  archived/       143 篇   冻结
  README.md               格式与生命周期定义

docs/postmortem/  4 篇（每篇 .md + .zh.md + .i18n.yaml）
```

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `invariants/src/index.ts:32` | `export interface InvariantInstaller` |
| `invariants/src/index.ts:50` | `export class InvariantError` |
| `invariants/src/index.ts:94` | `export class InvariantRegistry extends Service` |
| `invariants/src/index.ts:136` | `register(packageName, installer)` |
| `packages/AGENTS.md` | 「Every package owns `./invariant`」 |
| `AGENTS.md` | 「Runtime invariants assert owned relationships」 |

## 三、机制

### 每个包都必须有 `./invariant`

`packages/AGENTS.md` 的原文： `evidence: official-doc`

> **Every package owns `./invariant`.** Register the manifest name; check an event/data relation or give empty installers package-specific `No runtime invariant:` reasons. **Generated companions, unexplained empties, and ignored reporters fail `verify-package-invariants`.**

219 个包，219 个 `invariant.ts`，1:1 完全吻合。 这个数字在文章 01 里核过。

### 但 184 个是「带理由的空实现」

注意这个比例：219 个里有 **184 个**包含 `No runtime invariant:`。 `evidence: code`

只有约 35 个包有真正的运行时不变量。举个空实现的完整样子（`llm-deepseek/src/invariant.ts`，30 行）：

```ts
const PACKAGE_NAME = '@deepseek-ai/dsh-llm-deepseek'
export const name = 'llm-deepseek-invariant'
export const inject = ['invariants']

/**
 * No runtime invariant: this package exposes no independent event sequence or
 * mutable data relation beyond contracts enforced at its owning seam.
 */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
```

空实现也要注册、也要写理由。 这样「这个包没有不变量」是一个**被审查过的判断**，而不是「没人想过这件事」。

和文章 06 里 KV-cache 豁免包必须留审计理由、文章 05 里 `ignorable` 默认拒绝，是同一个思路的第三次出现：**缺失必须与遗忘可区分。**

### 不变量该检查什么，不该检查什么

根 `AGENTS.md` 划了界： `evidence: official-doc`

> **Runtime invariants assert owned relationships.** Check **authoritative event streams or mutable data**, not service or method presence, plugin metadata or effects, or fixed pure examples. Without a plausible relationship, **an explained empty companion is correct**.

| 应该检查 | 不该检查 |
| --- | --- |
| 权威事件流的关系 | 服务或方法是否存在 |
| 可变数据的关系 | 插件元数据或 effect |
| — | 固定的纯函数样例 |

这条界限解释了为什么 184 个是空的：大多数包只是实现一个契约，不拥有跨事件的关系。 拥有关系的那 35 个才需要在运行时断言。

### 断言代码可以比实现还大

最大的十个 `invariant.ts`：

| 行数 | 包 |
| --- | --- |
| **306** | `compaction/compaction` |
| **250** | `core/session` |
| 193 | `context/time-context` |
| 174 | `llm/llm-retry` |
| 167 | `workflow/tool-workflow` |
| 136 | `workflow/workflow` |
| 128 | `core/tools` |
| 121 | `hooks/hook-protocol` |
| 112 | `llm/llm` |
| 111 | `interaction/user-approval` |

`compaction/compaction` 的不变量 306 行，而它的服务实现 `index.ts` 只有 172 行。 证明自己没坏的代码，比功能代码多了 78%。

这不是浪费。回看文章 07：压缩要维护「锁配对」「被影节点全部举证」「surface 位置可能 start > end」「工具配对边界」四类关系——这些关系没法靠类型系统表达，只能在运行时断言。

而 `invariants` 服务本身只有 **200 行**。制度的成本在各个包里，不在框架里。

### Agent Note：路径即状态

`.agents/notes/README.md` 定义的结构： `evidence: official-doc`

```
{lifecycle}/{class}/yyyy-mm-dd-topic-title.md
```

**lifecycle**（顶层文件夹，随状态移动）：

| 目录 | 含义 |
| --- | --- |
| `proposed/` | 实现前评审的提案，尚未构建或只构建了一部分 |
| `implemented/` | 决策已发货，**并与实际发货保持一致** |
| `rejected/` | 提案被考虑后否决。**只在它能阻止一个诱人且有意义的错误时保留** |
| `archived/` | 冻结树，低未来价值的 implemented 记录 |

**class**（嵌套文件夹，封闭集合，由 `scripts/agent-note-tree.ts` 的门禁强制）：

`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`

有意思的是**缺席的那个**：

> (`refactor` is deliberately absent — it overlaps `simplification`, whose discriminator, "does observable behavior change?", already covers it.)

`refactor` 被故意排除，因为「可观察行为是否改变」这个判别标准已经能覆盖它。分类学上少一个含糊的桶，等于少一堆归类争论。

`architecture` 与 `process` 的分界也写明了：architecture 关于我们发货的源码；process 关于围绕代码的工具与工作流。

### 没有中心索引，这是一个决策

> Do not add a centralized `INDEX.md`; the no-index Agent Note (`.agents/notes/implemented/process/2026-07-19-remove-generated-agent-note-index.md`) owns the rationale.

「不要加索引」本身是一篇 Agent Note。 活的 lifecycle 树就是工作清单，浏览文件夹或全仓搜索即可。

交叉引用有硬规定：

> Cross-references between Agent Notes use **relative markdown links** — never bare prose or numbers — **so they are mechanically checkable and survive moves between folders.**

因为 note 会在 `proposed → implemented → archived` 之间移动，用编号或散文引用会烂掉，相对链接则可以被工具检查、也能随移动修复。

（这条规矩和本仓库自己的 `check:links` 是同一个道理。）

### 归档只允许五种改动

> An archival change **moves the complete English/Chinese/sidecar triplet**, retains `Status: implemented`, **inserts the same `Archived: YYYY-MM-DD` line immediately below that status in both language files**, re-records the sidecar, and repairs or deletes inbound links. **These are the only permitted content changes during archival.**

归档不是「顺手改改」的机会。**内容一个字都不许动**，只能移动、加一行 `Archived:`、重录 sidecar、修入链。

### implemented 要更新事实，但不许重写决策

`implemented/AGENTS.md` 的规矩很微妙： `evidence: official-doc`

> Keep paths, symbols, defaults, and mechanisms current in the same change that alters them. Rewrite stale facts in place; **do not append change history.**
>
> ### This is not a license to rewrite the *decision*
>
> Update factual realization in place. **A reversal of the decision or its rationale requires a new Agent Note and cross-link.**

事实可以就地改，决策不可以。 改了主意就写新的 note 并交叉链接——历史决策的完整性被保护起来。

这也是为什么 `archived/` 是冻结的：「Archived notes are frozen: never edit or treat them as current authority.」

### Postmortem 不是 Agent Note

`docs/postmortem/README.md` 把两者分得很清： `evidence: official-doc`

| | Agent Note | Postmortem |
| --- | --- | --- |
| 方向 | 前瞻：记录**深思熟虑的设计决策**与被否决的替代方案 | 回溯：记录一次**失败** |
| 关注 | 为什么这样决定、放弃了什么 | 什么坏了、机制是什么、**为什么每一层防护都没拦住**、加了什么守卫 |

写 postmortem 的三个条件（**全部满足**才写）：

1. **subtle** —— 机制不明显，一个细心的工程师会重新艰难推导一遍
2. **systemic** —— 逃逸原因是测试/工具/约定的缺口，不是一次性笔误
3. costly to rediscover —— 花过真实的调试时间，而且还会再花一次

每篇必须以 Executive summary 开头：

> one short paragraph a busy reader can absorb in **thirty seconds** — what broke, the root cause in plain terms, why it escaped, and the durable lesson

### 四篇复盘

| # | 标题 |
| --- | --- |
| 0001 | ACP server 连接时崩溃：`export default` 吞掉了插件的 `inject` |
| 0002 | 文件系统快照工具被一个字面量 `!!js` 对象**永久禁用** |
| 0003 | Web agent 验证了一个替代 server，而不是承载其 session 的 GUI |
| 0004 | Landlock 部分强制的 notice **误分类了子命令失败** |

四篇的共同规律：都是「看起来成功了」的失败。

- 0001：插件加载了，但 namespace 被丢弃
- 0002：配置解析通过了，但表达式没求值，工具静默消失
- 0003：HTTP 200 拿到了，但不是用户那个 origin
- 0004：sandbox 报告了 warning，但真实的子命令失败被合并掉了

这也是为什么本仓库反复强调「四层证据阶梯」（文章 01）和「四种 ready」（文章 10）——这四篇复盘就是那些区分被写进规矩的原因。

## 四、约束与失效条件

### 不变量不是测试

它在**运行时**断言关系，测试在 CI 断言行为。两者互补：

- 测试能覆盖你想到的场景
- 不变量能在你没想到的场景里，让违规**立刻大声失败**，而不是产生一份静默损坏的数据

`InvariantError`（`index.ts:50`）是专门的错误类型——违规不会被当成普通异常吞掉。

### 空实现的理由必须是包特定的

`verify-package-invariants` 会拒绝：**生成的伴生文件**、**没有解释的空实现**、被忽略的 reporter。

复制粘贴一句通用理由是过不了的——理由要说清**这个包**为什么没有拥有的关系。

### Agent Note 的两个失效模式

| 失效 | 后果 |
| --- | --- |
| 代码改了但 note 没跟着改 | note 变成误导性的过期文档，比没有更糟 |
| 改了主意直接改 note | 决策历史丢失，后人重新踩同一个坑 |

规矩把这两条都堵上了：事实要在**同一个 change 里**更新；决策反转要写**新 note**。

### archived 不是当前权威

「Archived notes are frozen: never edit or treat them as current authority.」

引用一篇 archived note 来论证当前行为，是一个方法论错误——TUI 移除那个案例（文章 10）就是典型：archived note 描述了曾经的 TUI 能力，但当前能力以现行代码、bundle 和测试为准。

### 这套制度的代价

诚实地说：

- 每个包多一个文件，即使它什么都不做
- 每个非平凡改动多写一篇 note（上游 `AGENTS.md`：「Non-trivial changes MUST include an Agent Note in the same PR」）
- 双语维护（每篇 note 有 `.md` + `.zh.md` + `.i18n.yaml` 三件套）

这套投入只有在项目要长期演进、贡献者会换人的前提下才划算。一个三个月的原型项目照搬，多半只会拖慢自己。

## 五、可复核实验

### 实验 1：数不变量（无需凭据）

```bash
cd sources/checkouts/deepseek-harness

# 包数 vs invariant 数,应完全相等
find packages -mindepth 3 -maxdepth 3 -name package.json | wc -l   # 219
find packages -path "*/src/invariant.ts" | wc -l                    # 219

# 其中多少是带理由的空实现
grep -rl "No runtime invariant:" --include=invariant.ts packages/ | wc -l   # 184

# 最大的十个
find packages -path "*/src/invariant.ts" | xargs wc -l | sort -rn | sed -n '2,11p'

# 对比:compaction 的不变量 vs 它的实现
wc -l packages/compaction/compaction/src/{invariant.ts,index.ts}
```

**该得出**：断言代码 306 行 > 实现 172 行。回答：为什么压缩这个能力需要这么多运行时断言？（提示：回看文章 07 的四类关系。）

### 实验 2：读一个空实现和一个满实现（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
cat packages/llm/llm-deepseek/src/invariant.ts       # 30 行,空实现
head -60 packages/compaction/compaction/src/invariant.ts   # 306 行,满实现
```

回答：为什么 adapter 这种关键组件反而没有运行时不变量？（提示：读根 `AGENTS.md` 关于「owned relationships」的那一段。）

### 实验 3：遍历 Agent Note 的分类分布（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
for lc in proposed implemented rejected archived; do
  n=$(find .agents/notes/$lc -name "*.md" ! -name "*.zh.md" ! -name "AGENTS.md" ! -name "README.md" 2>/dev/null | wc -l)
  printf "%-14s %s\n" "$lc" "$n"
done
for c in feature bug-fix simplification architecture process testing; do
  printf "  %-16s %s\n" "$c" \
    "$(ls .agents/notes/implemented/$c/*.md 2>/dev/null | grep -vc '\.zh\.md')"
done
```

然后挑一篇 `bug-fix` 类的读完（推荐文章 07 用的那篇），观察固定结构：Problem / Decision / Alternatives considered / Consequences / Testing。

### 实验 4：读四篇复盘的 Executive summary（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
for f in docs/postmortem/000*.md; do
  echo "===== $f"
  sed -n '/Executive summary/,/^## /p' "$f" | head -12
done
```

**该得出**：四篇的共同形态是「某个信号显示成功，但那个信号并不代表要证明的事」。把这四条写成你自己项目的验收清单，比读一百页最佳实践有用。

## 本篇尚未覆盖的源文件

- `packages/runtime-diagnostics/invariants/src/index.ts`（200 行）—— registry 的完整注册与报告语义
- 35 个非空 `invariant.ts` 中除 compaction / session 外的其余 33 个
- `scripts/agent-note-tree.ts` —— 分类门禁的封闭集合定义
- `scripts/verify-agent-note-format.ts` —— 生命周期结构校验
- `.agents/skills/` —— 上游自己的 agent skill（`dsh-archive-agent-notes`、`dsh-prose-standard`、`dsh-pre-push-checks` 等）
- `.agents/notes/rejected/` —— 被否决的提案树，本文没有展开
