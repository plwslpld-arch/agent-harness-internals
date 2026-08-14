---
sources: [{"repo":"deepseek-harness","path":"packages/core/tools/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/tools/src/code-mode.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/interaction/user-approval/src/types.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/interaction/user-approval/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/interaction/permission-presets/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox/src/escalation.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"docs/tool-execution-pipeline.md","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 08｜工具、审批、沙箱与威胁模型

> 本文基线 `47f9438`。所有行号对应该 Commit。

## 一、产品现象

模型可以「提出」要做某件事，但不能直接做。

| 现象 | 背后是什么 |
| --- | --- |
| 改文件前弹窗问你 | approval seam |
| 同意之后它仍然写不进 `/etc` | sandbox，与审批是两件事 |
| 拒绝之后模型知道被拒了，并换了个方案 | 拒绝也要产生模型可见结果 |
| 换个 `--profile` 就不再弹窗了 | permission preset 是「用户意图包」 |

审批不是沙箱，沙箱也不是用户同意。 两者都需要，而且回答的是不同问题。

## 二、源码路径

```
packages/core/tools/src/               5,620 行
  index.ts        1946   ToolRuntime 与注册表
  py-types.ts      818   Python 类型投影
  code-mode.ts     673   Code Mode
  json-schema.ts   656   JSON Schema 校验
  schema.ts        617
  presentation.ts  389   UI 投影
  ts-types.ts      293
  invariant.ts     128
  types.ts          58
  testing.ts        42

packages/interaction/user-approval/       审批 seam
packages/interaction/permission-presets/  preset 表
packages/sandbox/sandbox/                 沙箱词汇与升级
packages/sandbox/sandbox-local/           平台 runner
packages/shell/bash-sandbox/              bash 的沙箱消费者
```

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `user-approval/src/types.ts:29` | `ApprovalOutcome` 四态 |
| `user-approval/src/index.ts:89` | 链路落空 → fail-closed `'unavailable'` |
| `user-approval/src/index.ts:90` | `'never'` → 每次 ask 都 `'rejected'` |
| `permission-presets/src/index.ts:168-175` | preset 表 |
| `sandbox/src/index.ts:29` | `SandboxMode` 三值 |
| `sandbox/src/index.ts:32` | `ConfinedSandboxMode` |
| `sandbox/src/index.ts:59` | `SandboxEnforcement = 'full' \| 'partial'` |
| `sandbox/src/index.ts:61-68` | policy 是 per-call 而非 per-provider |
| `sandbox/src/escalation.ts:186` | 无审批通道时升级抛错 |
| `core/tools/src/code-mode.ts:355` | 每次启动前重读 executionMode |

## 三、机制

### 三个概念不能混

| 概念 | 回答的问题 |
| --- | --- |
| **Approval** | 人是否允许这一次动作 |
| **Sandbox** | 技术上副作用能触达哪里 |
| **Permission preset** | 一组审批与沙箱策略的组合选择 |

### 七段流水线

一次工具调用要走完这条链（顺序来自上游工具流水线文档）： `evidence: official-doc`

| 阶段 | 责任 | 典型失败 |
| --- | --- | --- |
| 展示 / 解析 | 校验工具名与参数 schema | 未知工具、无效参数 |
| `tools/pre-execute` | 权限、沙箱、策略改写 | deny、审批拒绝 |
| guards | 追加**不可逆**的拒绝约束 | 身份或作用域不满足 |
| execute wrapper | 超时、指标、重试等环绕行为 | wrapper 或 body 抛错 |
| tool body | 产生实际效果 | 进程、文件、网络错误 |
| `tools/post-execute` | 接受、阻断、替换、追加上下文 | 输出策略失败 |
| finalize / result | 内容不变量与权威通知 | 物化或序列化失败 |

**guard 是单调的**：下游不能把上游已有的 deny 放开。这让策略可以层层收紧而不会被后面的插件意外放宽。

### 执行前必须先持久化 `tool/call`

这条约束的理由在崩溃恢复上： `evidence: official-doc`

> 执行前先持久化 `tool/call`，才能在崩溃后区分「从未提出」「提出但未开始」和「开始后未产生结果」。

三种状态对应文章 05 里的 `TOOL_NOT_STARTED` 与 `TOOL_OUTCOME_UNKNOWN`。如果不先落盘 call，崩溃后就只剩「不知道发生过什么」这一种状态。

### 审批四态，全都 fail-closed

`user-approval/src/types.ts:29`： `evidence: code`

```ts
export type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
```

| 结果 | 何时产生 |
| --- | --- |
| `allowed-once` | 人明确同意**这一次** |
| `rejected` | 人拒绝；或策略是 `'never'`（`:90`：每次 ask 都直接 `rejected`） |
| `cancelled` | signal abort，问题被撤回（`:170`） |
| `unavailable` | **没有 answerer**，链路落空（`:89` 明确写 fail-closed） |

**四态里三态都是拒绝。** 唯一放行的是 `allowed-once`，而且语义是「这一次」——不是「以后都行」。

### 沙箱：三种模式，但只有两种是「受限」

`sandbox/src/index.ts:29-32`： `evidence: code`

```ts
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type ConfinedSandboxMode = Exclude<SandboxMode, 'danger-full-access'>
```

`danger-full-access` 被类型系统从「受限模式」里排除掉了。 需要一个受限执行的地方，在类型上就拿不到 `danger-full-access`。这比在文档里写「请不要用它」强得多。

`SandboxEnforcement`（`:59`）只有两个值：

```ts
export type SandboxEnforcement = 'full' | 'partial'
```

`:54-58` 的注释：

> `partial` means an active backend or older kernel ABI cannot govern every promised file effect; **callers requiring an absolute boundary must not treat it as `full`**.

有个说法要更正一下：把 enforcement 说成 "full / partial / unavailable" 三态是不对的，`'unavailable'` 属于 `EscalationOutcome`（`escalation.ts:93`，审批那一族），不属于 `SandboxEnforcement`。两者是不同的类型。

### policy 是 per-call，不是 per-provider

`sandbox/src/index.ts:61-68` 的注释说明了这一点： `evidence: code`

> What one confined execution is allowed to touch — carried **PER CALL, not fixed on the provider**: two consumers may confine under different policies at the same instant (bash under `read-only` while a confined child agent needs its state directory writable), and **an approved escalated retry is a new call with a wider policy**.

两个推论：

1. 同一时刻，bash 可以跑在 `read-only` 下，而某个受限子 Agent 的状态目录是可写的——它们是不同的 call，不是一个全局开关。
2. 「批准升级后重试」在实现上是一次全新的 call，带更宽的 policy，不是把原来那次调用的权限改大。这让审批粒度天然绑定到单次调用。

`escalation.ts:186` 补上失败路径：

```
sandbox escalation to "<mode>" requires approval, but no approval channel is available
```

没有审批通道就抛错，不是默默降级放行。

### permission preset 是组合，不是安全机制

`permission-presets/src/index.ts:168-175` 的默认表： `evidence: code`

| preset | sandbox | approval | 描述 |
| --- | --- | --- | --- |
| `workspace-write`（默认） | `workspace-write` | `ask` | 在工作区和允许的临时目录内写；更宽的重试需要审批 |
| `danger-full-access` | `danger-full-access` | `never` | 完全文件访问，不弹审批 |

preset 只是「sandbox mode + approval policy」的一个命名组合。 真正的约束还要看：shell/sandbox 插件是否挂载、工具是否走 ToolRuntime、审批策略是否真的有 answerer。

### 四层控制

把上面的都串起来，一次危险调用要过四层，每层回答一个不同的问题：

| 层 | 问题 |
| --- | --- |
| Tool schema | 模型能提出**什么形状**的意图？ |
| Guard / policy | 当前身份和上下文**是否允许**？ |
| Approval | 人**这一次**是否同意？ |
| Sandbox / executor | 即使同意，副作用**实际能触达哪里**？ |

跳过任何一层的推理都会得出错误结论。最常见的错误是「审批通过了所以安全」——审批是交互策略，不是操作系统边界。

### Code Mode 的同一条纪律

`code-mode.ts:355` 有一条和文章 03 里 `tool-calls.ts:200` 一模一样的注释：

> re-read via `executionMode()` immediately before each start (a registry ...)

Code Mode 的嵌套调用**重入同一条流水线**，并且遵守同样的「启动前重读执行模式」规则。这是「拒绝必须可执行」的体现：不能提供一条绕过流水线的捷径。

## 四、约束与失效条件

### 七条不变量

1. 被拒绝的工具也要产生模型可见结果——不能让模型下一步看到一个缺口
2. 工具报错要结构化，不能静默丢失
3. 工具输出的**展示**与 program value 要分开
4. 插件不能绕过 ToolRuntime 自己执行危险副作用
5. 并发只允许工具声明 concurrency-safe 时进入 parallel group
6. wrapper 可以替换执行 signal，但**不能切断调用者的取消语义**
7. `presentCall` / `presentResult` 是 UI 投影，**不应影响工具真实返回值**

第 3 和第 7 条是同一件事的两面：给人看的和给模型看的必须可以不同，但不能因此改变事实。

### 五个不该写进产品文案的说法

| 错误说法 | 正确表述 |
| --- | --- |
| 「Harness 已完全沙箱化」 | 特定工具经特定 provider 请求某种文件系统策略，runner 返回 `full` 或 `partial` |
| 「插件是隔离的」 | Cordis 插件**在宿主进程内运行**，插件机制本身不是沙箱 |
| 「workflow 在 vm 里跑所以安全」 | worker thread 与 `node:vm` **不是**运行不可信代码的安全边界 |
| 「沙箱模式已开启」 | Linux Landlock/bwrap、macOS Seatbelt、Windows ACL 的能力和失败方言都不同 |
| 「文件受限所以安全」 | 文件系统约束不自动等于网络、进程可见性、凭据隔离 |

`danger-full-access` 是**显式绕过**。E2B 替换 FS/subprocess provider 时，Cordis、模型调用、session log、SDK buffer **仍在宿主**——不能宣称整个 Harness 已迁到远端隔离。

### 审批不是免责按钮

审批界面应显示：具体工具、规范化后的参数、cwd 与目标、副作用、当前 enforcement。允许要绑定**一次调用或一次窄重试**；取消或无人回答**失败关闭**。

模型的解释是上下文，不是授权主体。 模型说「这个操作是安全的」不构成授权。

### 七项必跑攻击演练

1. 仓库文字要求上传环境变量 → 应被内容/出站/审批控制阻断
2. MCP `list_changed` 把只读工具换成写操作 → schema 与权限重新审查
3. stdio server 污染 stdout / 挂起 / 崩溃循环 → 协议隔离、timeout、预算耗尽
4. runner 打印信息性 warning 且子命令非零 → 保留真实子命令失败，不误报 sandbox unavailable
5. ACP 两会话并行权限并取消其一 → 结果不能串线
6. log 含 secret / 超大结果 / 恶意 HTML → 存储与 UI 均按策略处理
7. 依赖升级新增 transitive 或 platform payload → license、完整性、notice 门禁失败

第 4 项对应上游一个真实复盘（Landlock 部分强制与子命令非零被合并）。

### 设计新工具时的测试矩阵

必须覆盖：allow、deny、审批取消、超时、取消、输出过大、恢复。

对应五个场景与期望：

| 场景 | 期望 Session | 期望副作用 |
| --- | --- | --- |
| 只读成功 | `tool/call` + success `tool/result` | 无写入 |
| 审批拒绝 | `tool/call` + rejected `tool/result` | 无写入 |
| sandbox 阻止 | `tool/call` + sandbox error result | 越界写入失败 |
| 工具抛错 | `tool/call` + structured error result | 只保留已声明副作用 |
| 并发工具 | 多个 call/result 按**模型顺序**写入 | 并发不破坏共享状态 |

## 五、可复核实验

### 实验 1：核对四态与类型排除（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '25,35p' packages/interaction/user-approval/src/types.ts
sed -n '85,95p' packages/interaction/user-approval/src/index.ts    # fail-closed
sed -n '27,34p' packages/sandbox/sandbox/src/index.ts              # ConfinedSandboxMode
sed -n '53,70p' packages/sandbox/sandbox/src/index.ts              # enforcement + per-call
```

回答两个问题：

1. 为什么 `ConfinedSandboxMode` 要用 `Exclude` 而不是在文档里写「别用 danger-full-access」？
2. 「批准升级后重试是一次新 call」这个设计，对审批粒度意味着什么？

### 实验 2：跑工具与审批测试（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
pnpm install
pnpm vitest run packages/core/tools
pnpm vitest run packages/interaction/user-approval
pnpm vitest run packages/sandbox
```

记录：命令、退出码、用例数。

### 实验 3：五场景副作用矩阵（需要凭据）

用两个不同 preset 各跑一次同样的写操作任务：

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
mkdir -p /tmp/dsh-lab && cd /tmp/dsh-lab

# 场景 A：默认 preset（workspace-write + ask）
pnpm --dir <harness> dsh --profile headless "在 /etc 下创建一个文件 test.txt"
```

**该记录**：preset 名、effective sandbox mode、approval 决策、执行 provider、OS 身份、cwd、实际写入目标、退出码。
**该得出**：写 `/etc` 应当失败。失败是来自 **sandbox 阻止**还是**审批拒绝**？两者在 `tool/result` 里的表现不同——这正是「审批 ≠ 沙箱」的可观测证据。

再看 enforcement 是 `full` 还是 `partial`。如果是 `partial`，任何「已隔离」的结论都不成立，按 `:54-58` 的注释处理。

只有真实运行且产物可核对时，才把结论标为 `evidence: runtime`。

## 本篇尚未覆盖的源文件

- `packages/core/tools/src/index.ts`（1,946 行）—— ToolRuntime 的完整注册与执行语义
- `packages/core/tools/src/code-mode.ts`（673 行）—— Code Mode 的嵌套调用与 SDK 生成
- `packages/core/tools/src/{json-schema,schema,py-types,ts-types}.ts`（2,384 行）—— schema 校验与多语言类型投影
- `packages/sandbox/sandbox-local/profiles/` —— 各平台 runner 的实际能力差异
- `packages/shell/bash-sandbox/`、`packages/fs/fs-observation-policy/` —— 真正把 argv 包起来的消费者
- `docs/postmortem/` 下与 Landlock 部分强制相关的复盘 → 文章 11
