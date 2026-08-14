---
sources: [{"repo":"deepseek-harness","path":"packages/core/system-prompt/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/surface.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/request-header.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/runtime-context.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, official-doc]
---

# 04｜System Prompt 与上下文组装

> 本文基线 `47f9438`。所有行号对应该 Commit。

## 一、产品现象

「我想改一下它的语气／身份，去哪改？」

这个问题在 dsh 里没有单一答案，因为不存在一个 `prompts.ts`。模型每一步看到的内容是运行时组装出来的产物，由多个插件共同贡献。

用户能观察到的对应现象：

| 现象 | 背后是什么 |
| --- | --- |
| 装了一个插件，模型突然「知道」了新东西 | 插件注册了 prompt section 或 context |
| 同一次会话里，子 Agent 的行为风格和主 Agent 不同 | prompt 支持 scope，就近作用域覆盖全局 |
| 工具说明的顺序稳定，不随注册顺序抖动 | `toolOrder` 与规范排序 |
| 换个模型跑同一个任务，结果差异比预期大 | prompt 是 benchmark 变量之一，不只是模型名 |

## 二、源码路径

```
packages/core/system-prompt/src/index.ts    545 行   ← 本文主角
packages/core/session/src/surface.ts                 历史消息从哪来
packages/core/session/src/request-header.ts          请求头证据
packages/core/agent-loop/src/runtime-context.ts  76  运行时上下文
```

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `:31` | `'system-prompt/assemble'` waterfall 声明 |
| `:128` | `PERSONA_SECTION = 'deployment:persona'` |
| `:131` | `PERSONA_ORDER = 0` |
| `:134` | `VARIABLE_NAME = /^[a-z][a-z0-9_]*$/` |
| `:137` | `GROUP_AT = /^\{\{([^{}]*)\}\}/` |
| `:140` | `TOOL_ORDER_REST = '<unlisted-tools>'` |
| `:186` | `export interface Config` |
| `:212` | `renderPrompt(assembly)` |
| `:236` | `joinContextSections(sections)` |
| `:251` | `renderContextSections(assembly)` |
| `:338` | `export class SystemPrompt extends Service` |
| `:381` | `section()` |
| `:398` | `context()` |
| `:415` | `suppressRuntimeContext()` |
| `:430` | `tools()` |
| `:446` | `variable()` |
| `:467` | `async assemble(context)` |

## 三、机制

### 五个注册点

`SystemPrompt` 是一个 Cordis Service，插件通过它贡献内容。五个方法，各自去向不同： `evidence: code`

| 方法 | 行号 | 内容去哪 |
| --- | --- | --- |
| `section({ name, order, text })` | `:381` | **system 字符串** |
| `context({ name, order, text })` | `:398` | **runtime context 快照**（进 user-role 消息） |
| `tools(provider)` | `:430` | 工具 schema |
| `variable(name, provider)` | `:446` | 为 `{{name}}` 占位符提供值 |
| `suppressRuntimeContext()` | `:415` | 关闭动态上下文注入 |

每个方法都返回 disposer——这就是文章 02 说的「注册即 effect」。

注意 `suppressRuntimeContext()` 的语义：它关闭的是注入，不是删除提供上下文的服务。`assemble()` 里的判断（`:469-470`）：

```ts
const runtimeContextSuppressed = !this.layers.global.runtimeContextSuppressors.isEmpty()
  || scopeLayers.some(layer => !layer.runtimeContextSuppressors.isEmpty())
```

全局有一个抑制器，或作用域链上任意一层有，就抑制。**任何一处开关都能关掉它**，这是有意的保守设计。

### 模型看到的是两块东西

组装完成后，模型收到的不是一坨字符串，而是两块结构不同的内容：

| 块 | 由什么渲染 | 装什么 |
| --- | --- | --- |
| **system 字符串** | `renderPrompt(assembly)`（`:212`） | 身份、persona、工具指导 |
| **user-role runtime snapshot** | `renderContextSections` + `joinContextSections`（`:251`、`:236`） | 当前工作区、权限、环境、动态上下文 |

动态上下文走 user 角色而不是 system，这一点很关键：它让「稳定的部分」和「每步都在变的部分」在请求里天然分开。这条设计和文章 06 的缓存纪律直接相关——system 槽是 provider 缓存的第一个 token 区域，把易变内容放进去会毁掉整个前缀。

### persona 是一个可被同名遮蔽的 section

`:128` 和 `:131`： `evidence: code`

```ts
export const PERSONA_SECTION = 'deployment:persona'
/** Prompt order of the persona slot; the first section a model reads. */
export const PERSONA_ORDER = 0
```

`:125-126` 的注释解释了为什么要固定这个名字：

> both sides naming the same section is what makes the replacement work rather than duplicate

部署级 persona 通过 `Config.persona` 提供；某个作用域想换掉它，就注册一个**同名**的 `deployment:persona` section。同名是「替换」而非「追加」的实现方式。 名字不一致就会变成两段 persona 同时出现在 prompt 里。

### 严格插值：三条会让你意外的规则

`renderPrompt`（`:212`）的文档注释写死了三条： `evidence: code`

> Malformed, unknown, or undefined references throw; a lone `{{` without any later `}}` is literal prose, and **substituted values are not scanned again**.

1. 格式错误、未知、值为 undefined 的引用一律抛错，不是静默留下原文。写错一个变量名，启动就失败——比模型收到一段 `{{workspace_dir}}` 字面量好得多。
2. 孤立的 `{{` 后面没有 `}}`，当作普通文本。
3. 替换进去的值不会被二次扫描。

第 3 条是安全边界：如果一个变量的值来自工作区文件、环境变量或模型输出，而它里面恰好含 `{{...}}`，**不会**被再次展开。这挡住了一条通过变量值做 prompt 注入的路径。

变量名的合法形状在 `:134`：`/^[a-z][a-z0-9_]*$/` —— 小写字母开头，只允许小写字母、数字、下划线。

### scope 链：就近作用域获胜

`assemble()`（`:467`）的核心语义在 `:459-462` 的注释里：

> Assemble global and scoped providers, detach tool parameters, apply canonical ordering, then run the assembly waterfall. **Scoped sections and variables shadow globals.**

实现上是先铺全局变量，再按作用域链**从远到近**覆盖（`:475-478` 附近）：

```ts
// Scope-chain variables, farthest first, so the nearest scope wins a name.
```

产品含义：agent preset 可以覆盖全局 persona，一个只影响某个子 Agent 的插件也能只改那个 Agent 的 prompt，不会污染主会话。

### assemble 是 waterfall，但有一个不可篡改的例外

`:31` 声明了 `system-prompt/assemble` waterfall。`:20-27` 的契约里有一条很重要： `evidence: code`

> The returned value is authoritative. ... **A registered complete section is restored after this waterfall, so listeners cannot add to or replace that scope's system prompt.**

也就是说：

- 一般情况下，waterfall 监听器**可以**改写组装结果，返回值是权威的；
- **但**如果某个作用域注册了「complete section」（完整 prompt），它会在 waterfall **之后**被恢复为该作用域唯一的 prompt section。

**这是一条权限边界。** 一个部署如果要求「这个 Agent 的 system prompt 就是这段，谁也别动」，用 complete section 表达；中间任何插件的 waterfall 改写都会被覆盖回去。

另外这个 waterfall 是 **scope 过滤分发**的（`@deepseek-ai/dsh-scope`）：作用域监听器只收到该作用域的 assembly。还有一条：传入的 signal 只控制这一次显式组装请求，不得留存用于控制后续轮次。

### 工具顺序

`Config.toolOrder`（`:186`）的规则： `evidence: code`

- 是**面向模型的工具名**按顺序排列
- 必须包含 `TOOL_ORDER_REST`（`'<unlisted-tools>'`）**恰好一次**——没列出的工具去那个位置
- 字段非法在**加载时**失败；名字未知在**组装时**失败
- 某个作用域里被隐藏的已知名字，在该作用域可以缺席
- 不填则按**字典序**

「加载时 vs 组装时」这个区分很实际：格式错误应该立刻炸，而名字对不对要等插件都装完才知道。

### 历史消息不是日志直传

历史来自 Session surface 的 `deriveEventMessage()`，四个分支： `evidence: code`

| 事件 | 派生成 |
| --- | --- |
| `user/message` | user 消息 |
| `assistant/message` | assistant 消息，**内容为空则跳过** |
| `tool/result` | 工具结果消息 |
| 其它一切 | `null` |

所以 `turn/start`、`step/start`、`assistant/chunk`、`request/header`、`request/context` 会留在账本里，**但不进模型消息列表**。

它们是证据，不是 transcript。 这条区分是文章 05 的主题。

### 最后落成请求

Agent Loop 建请求时同时写下两个证据事件：

```ts
preparedCall = await llm.prepareCall(proposedConfig, signal)
session.append('request/header', { header, reason })
session.append('request/context', { provider, model, contextWindow })
request = { ...header.config, messages, system, tools, sessionId, signal }
```

`request/header` 记 provider/model/system/tools/config，`request/context` 记 contextWindow。任何一次请求都能从日志重建——这是文章 01 那条不变量的落地点，也是文章 06 判断缓存命中的前提。

## 四、约束与失效条件

### 改 prompt 之前先分类

要改 prompt，先问它属于哪一类，四类的改法完全不同：

| 类别 | 改哪里 |
| --- | --- |
| 全局 persona | `SystemPrompt.Config.persona` |
| 某个 agent preset | 该作用域注册同名 `deployment:persona` section |
| 某个工具的说明 | 那个工具插件的 `tools()` provider |
| 运行时环境信息 | 对应插件的 `context()` provider |

问错类别就会改错地方，或者改了但被就近作用域覆盖。

### 三个易错点

Session event log 不是直接塞进模型的消息数组。 想让模型看见新东西，必须先设计成 surface 事件，不能只往内存里塞。

历史 reasoning 不一定全部回传。 不同 adapter 有不同协议要求，这条在文章 09 展开。

prompt 变化会影响 benchmark 结果。 比较两次评测时，只对齐模型名是不够的——prompt、工具集、工具顺序都是变量。

### complete section 是覆盖，不是合并

如果一个作用域注册了 complete section，该作用域的所有其它 section 都不会出现。想在 complete prompt 上追加内容，只能改那段 complete 文本本身，或者改用普通 section 组合。

### 变量抛错是特性，不是缺陷

未知变量抛错会让启动失败。这看起来不友好，但替代方案（静默留下 `{{foo}}` 字面量）会让模型收到一段无意义的占位符，而且往往在生产里才被发现。

## 五、可复核实验

### 实验 1：读五个注册点与插值规则（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '186,202p' packages/core/system-prompt/src/index.ts   # Config 四字段
sed -n '203,212p' packages/core/system-prompt/src/index.ts   # renderPrompt 的三条插值规则
sed -n '18,32p'   packages/core/system-prompt/src/index.ts   # assemble waterfall 契约
```

回答：为什么「替换进去的值不会被二次扫描」是一条安全规则？ 假设某个变量的值来自工作区里的一个文件。

### 实验 2：跑 system-prompt 的单元测试（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/core/system-prompt
```

记录：命令、退出码、用例数。重点看关于 `toolOrder` 校验和变量插值抛错的用例。

### 实验 3：对比事件日志与模型可见消息（需要凭据）

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile headless "统计一下 packages 目录下有多少个子目录"
```

跑完后在会话日志里做两件事：

1. 列出**全部事件类型**及各自条数
2. 只挑出 `user/message`、`assistant/message`、`tool/result` 三类

**该得出的结论**：第 2 组是模型看到的消息，第 1 组减去第 2 组是「只作为证据存在」的事件。两者数量差距通常很大——`assistant/chunk` 会有很多条，但它们一条都不进模型消息列表。

再核对 `request/header` 里记的 system 字符串和 tools 列表，与 `request/context` 里的 contextWindow。

## 本篇尚未覆盖的源文件

- `packages/core/system-prompt/src/index.ts` 的 layers 合并实现（`chainLayers`、`merge`）
- `packages/core/agent-loop/src/runtime-context.ts`（76 行）—— runtime context 如何渲染成 user-role snapshot
- `packages/context/` 下各 context 插件（`agent-instructions`、`tmux-context` 等）实际贡献了什么
- `packages/preset/` —— 按会话组合 agent 时 prompt 作用域如何建立
