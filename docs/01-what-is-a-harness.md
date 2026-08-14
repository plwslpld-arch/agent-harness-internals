---
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/agent.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/base/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/headless/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/web-app/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"apps/cli/src/profile-boot.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"pnpm-workspace.yaml","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"AGENTS.md","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"docs/architecture.md","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc, community]
---

# 01｜Harness 是什么：模型之外的那一层

> 本文基线 `47f9438`。所有行号对应该 Commit，上游变动后由更新流程标记待复核。

## 一、产品现象

同一个模型，接在不同的 agent 工具上，完成任务的能力差距很大。这个差距不来自模型权重，来自模型外面那一层：谁给它拼上下文、谁决定它能调什么工具、谁在它想删文件时拦一下、谁记住上一轮发生过什么。

这一层就是 **agent harness**。

具体到用户能观察到的现象：

| 用户看到的 | 实际由 harness 的哪部分决定 |
| --- | --- |
| 「它好像忘了我十分钟前说的话」 | 上下文组装与压缩策略 |
| 「它改文件前会问我」 | 工具审批与权限 preset |
| 「关掉再打开，任务还能接着跑」 | 会话事件日志与恢复 |
| 「第二轮开始明显变快变便宜」 | 请求前缀是否稳定、缓存是否命中 |
| 「同样的活，命令行比网页快」 | 产品表面不同，底层 runtime 相同 |

DeepSeek Harness（下称 dsh）是 DeepSeek 在 2026-08-13 以 MIT 协议开源的 agent harness，首个版本 v0.1，官方明确标注为 developer preview。 `evidence: official-doc`

它的差异点不是「又包了一层模型 API」，而是**连 agent loop 本身都是可替换插件**。

## 二、源码路径

### 仓库拓扑

```
apps/cli/            dsh 命令行入口（832 行）
packages/<group>/<pkg>/   219 个 workspace 包
  core/              产品 API 主干：session、system-prompt、tools、agent、agent-loop
  llm/               模型能力：Service Definition + DeepSeek provider
  bundle/            可安装的 profile patch 层
  session/           持久化、投影、标题、遥测
  ...
vendor/cordis/       vendored 的 Cordis 插件框架
docs/                上游自带文档（54,584 行，中英双语）
.agents/notes/       设计决策记录（implemented 507 篇）
```

**219 这个数字要说清楚。** 它是 `pnpm-workspace.yaml` 里 `packages/*/*` 这一条 glob 匹配到的包数。 `evidence: code` 全仓 `package.json` 共 248 个，把 `apps/`、`vendor/`、`native/`、`website`、`examples` 都算进去；`packages/` 目录下则是 226 个，多出的 7 个嵌在更深层级。

引用这个数字时要小心：**219 是官方 monorepo 的内部模块单元，不是 219 个社区插件。** `evidence: code` 内部模块化程度和外部生态成熟度是两件事。

### 关键行号锚点

| 位置 | 是什么 |
| --- | --- |
| `apps/cli/src/bin.ts:1-53` | CLI 入口 |
| `apps/cli/src/profile-boot.ts:1-300` | profile 组合与启动 |
| `packages/bundle/base/src/index.ts:1-9` | base 装配（全文见下） |
| `packages/bundle/headless/src/index.ts:150` | 一次性直驱 Agent |
| `packages/bundle/web-app/src/index.ts:185` | 浏览器表面 |
| `packages/core/agent-loop/src/agent.ts:64` | `export class ReactLoopAgent implements Agent` |
| `packages/core/agent-loop/src/agent.ts:246` | `private async turn()` |
| `packages/core/agent-loop/src/agent.ts:332` | `private async step(assembly: PromptAssembly)` |
| `AGENTS.md:107` | 「模型可见 ⟺ 已记录」不变量 |
| `docs/architecture.md:96` | 同一不变量的完整说明 |

### 一个 9 行的文件说明了整个设计

`packages/bundle/base/src/index.ts` 是 dsh 的基础装配包。它的全文是： `evidence: code`

```ts
/**
 * @deepseek-ai/dsh-base — the shared dsh core as a profile bundle. The
 * package's substance is `cordis.patch.yml`, declared by the `dsh.bundle.patch`
 * manifest field and resolved by the profile composer through that field;
 * this module carries no runtime API.
 * @module @deepseek-ai/dsh-base
 */

export {}
```

没有运行时代码。**整个 dsh 的核心装配是一份 YAML 补丁**，`export {}` 只是为了让它成为一个合法的 ES 模块。

这不是偷懒，是「一切皆插件」的直接后果：装配层不该有逻辑，它只该声明装什么。三个标准 bundle 的体量对比也说明问题——`base` 9 行、`headless` 150 行、`web-app` 185 行。 `evidence: code` 后两者之所以有代码，是因为它们各自还要驱动一个真实的产品表面（一次性跑完退出 / 起 HTTP 服务），而不是因为装配复杂。

## 三、机制

### 四个平面

dsh 不是一条直线程序，更像一个运行中的组织。按职责分成四个平面：

| 平面 | 解决什么 | 源码位置 |
| --- | --- | --- |
| **控制平面** | profile、plugin、service、event —— 系统怎么装配 | `apps/cli/src/profile-boot.ts`、`vendor/cordis/`、`packages/bundle/` |
| **执行平面** | Agent Loop、模型请求、工具执行 —— 真正推进任务 | `packages/core/agent-loop/`、`packages/llm/`、`packages/core/tools/` |
| **证据平面** | session event、request header、tool result —— 记录发生过什么 | `packages/core/session/`、`packages/session/` |
| **产品表面** | Web、headless、SDK、ACP —— 暴露给用户和外部系统 | `packages/bundle/`、`packages/web/`、`packages/sdk/`、`packages/acp/` |

判断任何一个问题前，先想清楚它属于哪个平面。大量误判来自跨平面下结论——例如用「Web 页面返回 200」证明「Agent 任务完成」，那是拿产品表面的信号去断言执行平面的结果。

### 主链路

```mermaid
sequenceDiagram
  participant User as 用户
  participant Entry as Web / Headless / SDK
  participant Boot as Boot / Profile
  participant Cordis as Cordis Runtime
  participant Loop as Agent Loop
  participant Model as Model Adapter
  participant Tool as Tool Runtime
  participant Session as Session

  User->>Entry: 提交任务
  Entry->>Boot: 选择 profile
  Boot->>Cordis: 装配插件与服务
  Cordis->>Loop: 创建 Agent
  Loop->>Model: 发送模型请求
  Model-->>Loop: 返回文本或 tool call
  Loop->>Tool: 执行受控工具
  Tool-->>Loop: 返回 tool result
  Loop->>Session: 追加事件
  Session-->>Entry: 投影为 UI / 输出
```

### turn 与 step：真实的事件序列

`ReactLoopAgent` 把任务拆成两层：一个 **turn** 含零或多个 **step**，一个 step = 一次模型请求 + 它触发的工具调用。

从 `packages/core/agent-loop/src/agent.ts` 可以直接读出事件写入的顺序： `evidence: code`

| 行号 | 写入的事件 |
| --- | --- |
| `:255` | `session.append('turn/start', { turn })` |
| `:279` | `session.append('step/start', { turn, step })` |
| `:292` | `session.append('step/end', { turn, step })` |
| `:296` | `dispatch.serial('agent/turn-stopping', { turn, signal })` |
| `:319` | `session.append('turn/end', { turn, reason: turnEnds })` |

注意 `:296` 的 `agent/turn-stopping` —— 它在 `turn/end` **之前**，是 turn 收尾前的最后一个检查点，用 `serial` 分发（等待但不做中间件包裹）。想在任务结束前插入动作，这里是挂载点。

还有一处细节值得看，`agent.ts:92`：

```ts
const lastTurn = session.events.findLast(event => event.type === 'turn/start')?.data.turn ?? 0
```

**turn 计数不存在内存里，是从事件日志倒着找出来的。** `evidence: code` 这正是下一条不变量的具体体现。

### 不变量：模型可见 ⟺ 已记录

上游 `AGENTS.md:107` 把它写成一条强制约定： `evidence: official-doc`

> anything that reaches a model request must be reconstructable from the session log; a new model-visible input requires a session event.

`docs/architecture.md:96` 补充了执行方式：这条不变量由运行时 invariant 断言，所以**新增一种模型可见的输入，必须同时扩展 `SessionEventMap` 并从日志渲染**，不能只塞进内存变量。 `evidence: official-doc`

这条约束的价值在恢复和复现：任何时刻都能从日志重建出模型当时看到的完整输入。代价是每一个想让模型看见的东西都得先设计成事件。

### capability seam：三个角色，缺一不可

dsh 把可替换能力组织成 **seam**，一个完整 seam 含三个角色： `evidence: official-doc`

- **Service Definition** —— 接口
- **Service Provider** —— 实现
- **Consumer** —— 使用者，通常是面向模型的工具

文件系统抽象只有配上具体 provider 和面向模型的工具，才形成可用能力。

这个结构的实际收益：把 filesystem 和 process 两个 provider 同时指向远程沙箱，Bash、PTY、LSP 会**一起**搬过去，不需要为每个工具单独开分叉。 `evidence: official-doc`

反过来的风险：**工具名称相同不代表信任边界相同**。同一个 `bash` 工具，provider 是本地还是 E2B 沙箱，副作用落在完全不同的地方。分析任何一次工具调用，都必须同时记录 provider 和部署配置。

### 三类事件域

| 域 | 用途 | 是不是事实源 |
| --- | --- | --- |
| `session/event` | turn、step、message、tool 等可回放事实 | **是** |
| `agent/*` | inbox、状态、请求拦截、续跑、错误协调 | 否，实时控制 |
| 能力事件（`tools/*`、`fs/*`） | 策略与适配挂载点 | 只有另行写入会话事件才持久 |

把实时状态当恢复依据，或把 UI 通知当永久审计记录，都是跨错了边界。

SDK 使用者要拿可复现的 transcript，消费 `session/event`；要做实时排队、steering、错误处理，用 `agent/*`。

## 四、约束与失效条件

### 四层证据阶梯

这是读整个项目时最该带着的心智模型。看到任何一个能力，先问它处在哪一层：

| 层 | 含义 | 用什么证明 |
| --- | --- | --- |
| 1. 源码存在 | 仓库里有这个包 | `packages/` 下能找到 |
| 2. 配置启用 | profile / bundle 把它挂上了 | `dsh --profile web --dump-config` 里有条目 |
| 3. 运行激活 | 服务真的 ready | 运行时状态，不是配置条目 |
| 4. 产品闭环 | 用户任务从输入到结果可复核完成 | 完整 E2E，含失败与恢复 |

**大量错误判断来自把这四层混成一层。** 「仓库里有 sandbox 包」不等于「你的部署是隔离的」；「dump-config 里有这个插件」不等于「它启动成功了」。

### 五个常见误解

| 容易误解 | 正确理解 |
| --- | --- |
| Harness 是模型 API 包装 | 它是 agent runtime，API adapter 只是其中一层 |
| Harness 是评测框架 | 它可以被评测，但本体不是 SWE-bench 那种评分系统 |
| Harness 是 Web UI | Web 只是产品表面，底层还有 headless、SDK、协议入口 |
| 有源码就代表功能可用 | 还要看 profile 是否挂载、运行是否 ready、权限是否允许 |
| 测试通过就代表生产可用 | 测试只证明特定契约，不等于真实业务闭环 |

### 当前产品表面：内置 TUI 已移除

固定快照 `47f9438` 提供 Web 与 headless 组合，**没有内置 TUI**。`packages/bundle` 下只有 `base`、`web-app`、`headless` 三个。 `evidence: code` 更硬的证据在测试里——`apps/cli/tests/built-bin.e2e.ts:323` 把 `tui` 和另外三个入口一起列在「已移除」的断言数组中： `evidence: test`

```ts
for (const removed of [['tui'], ['--config', 'x.yml'], ['-p', 'task'], ['run', 'task']]) {
```

terminal、命令适配、通用 client primitives 这些底层零件仍在仓库里、仍可复用，但**不能据此说官方当前交付了完整 TUI**。历史 Agent Note 解释的是决策沿革，当前能力以现行代码、bundle 和测试为准。

### 五维成熟度

| 维度 | 当前可见证据 | 仍要验证 |
| --- | --- | --- |
| 可运行性 | 构建、快照测试、Web smoke 曾通过 `evidence: runtime` | 你的 OS、Node、凭据、网络下能否重现 |
| 可扩展性 | service / provider / consumer seam 与插件树设计完整 `evidence: code` | 扩展能否走 seam，而不 fork 核心循环 |
| 数据连续性 | append-only log、JSONL / SQLite 与恢复语义存在 `evidence: code` | 预览期格式变化时如何迁移、备份、回滚 |
| 安全性 | 审批、guard、sandbox、permission preset 分层存在 `evidence: code` | 最终副作用发生在哪个进程、容器、身份下 |
| 生态成熟度 | 官方提供讨论区与插件发现方式 `evidence: official-doc` | 维护节奏与插件质量是否满足组织要求 |

### 三个采用档位

**学习 / 研究** —— 锁定源码 Commit，隔离工作区，重点研究事件、seam 和插件生命周期。当前公开信息已足够。

**内部试点** —— 需补真实模型 E2E、凭据管理、权限默认值、会话备份和观测。至少验证一条有业务价值的闭环，而不是停在 HTTP 200。

**生产关键路径** —— 需额外证明升级、数据格式兼容、灾难恢复、供应链、审计和多租户边界。developer preview 不等于不可用，但这些保证不能从版本名称推定。

一句话收束：构建成功不是业务完成，代码量大不是成熟，插件多不是默认可用，社区热度不是安全证明。 `evidence: community`

## 五、可复核实验

三个实验，从不需要凭据到需要凭据递进。

### 实验 1：数清楚 219（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
# workspace glob 匹配的包数
find packages -mindepth 3 -maxdepth 3 -name package.json | wc -l   # 期望 219
# 每个包是否都有 invariant.ts
find packages -mindepth 4 -maxdepth 4 -path "*/src/invariant.ts" | wc -l   # 期望 219
```

两个数字应该都是 **219，且完全相等**。 `evidence: code` 这印证了上游 `packages/AGENTS.md` 的强制约定「Every package owns `./invariant`」被执行到了 100%——连「我这个包没有运行时不变量」都必须写一个带理由的空实现。这条线索在文章 11 展开。

### 实验 2：区分「配置启用」与「运行激活」（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm dsh --profile web --dump-config > /tmp/web-config.yml
pnpm dsh --profile headless --dump-config > /tmp/headless-config.yml
diff /tmp/web-config.yml /tmp/headless-config.yml
```

看两个 profile 的能力树差异。**该记录的是**：命令、退出码、两份配置各自的条目数、差异集合。

**该得出的结论**：这证明了第 2 层「配置启用」，没有证明第 3 层「运行激活」。dump-config 里有条目 ≠ 那个插件能起来。

### 实验 3：跑通一次 headless（需要凭据）

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile headless "列出当前目录下的文件"
```

先跑一次**负向用例**：不设 `DEEPSEEK_API_KEY` 时应得到明确的凭据缺失错误，而不是静默降级。

然后观察会话日志里 `turn/start` → `step/start` → `step/end` → `turn/end` 的顺序，与本文第三节的行号表对照。

记录：版本、profile、命令、退出码、事件序列。结论写成「在 Commit `47f9438` + profile `headless` 的组合下可复现」，不要写成「dsh 能跑」。

## 本篇尚未覆盖的源文件

按上游关键文件清单，以下与本篇主题相关但需要独立展开，分别在后续文章处理：

- `apps/cli/src/bin.ts`、`profile-boot.ts`、`packages/boot/app-boot/src/index.ts` —— 启动与配置合成 → 文章 02
- `vendor/cordis/src/context.ts`、`service.ts`、`vendor/loader/src/index.ts` —— 插件运行时 → 文章 02
- `packages/core/agent-loop/src/index.ts`、`tool-calls.ts` —— 循环与工具调度 → 文章 03
- `packages/core/session/src/surface.ts`、`request-header.ts` —— 事件溯源 → 文章 05
- `packages/core/tools/src/index.ts` —— 工具治理 → 文章 08
- `packages/llm/llm-deepseek/src/index.ts`、`adapter.ts` —— 模型适配 → 文章 09
