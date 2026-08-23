---
title: Extensions 与 Code Mode：让 agent 改自己的运行时，以及只给它一个 run_code
sources: [{"repo":"deepseek-harness","path":"packages/extensions/README.md","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"}]
last_verified: 2026-08-23
status: reviewed
---

# Extensions 与 Code Mode：让 agent 改自己的运行时，以及只给它一个 run_code

*写给读过前几篇、大致知道工具怎么注册和派发的人。读完你能回答：把整张工具表折叠成一个 `run_code` 之后，模型看到的东西变了什么、省下来的是什么、代价在哪，以及为什么 dsh 敢让模型往活着的进程里塞代码。*

你让 agent 去查 40 个文件的许可证头。它调 40 次 `read`，40 份完整文件内容一份不落地排进上下文，然后模型在第 41 步告诉你：「看完了，3 个不合规。」

那 37 份合规文件的正文，从进上下文的那一刻起就没用了。可它们会一路跟着你，跟到这轮对话结束。

有没有办法让模型只把那 3 个文件名带回来，剩下 37 份连进都不进上下文？

有。代价是模型不再「调工具」，改成「写程序」。

dsh 有两件事是别家 harness 基本没有的：

- **Code Mode**（code mode，直译「代码模式」：模型的动作从「填一个工具调用的参数」换成「写一段调工具的程序」）：把「模型看到的工具表」整体折叠成一个 `run_code`，其余工具变成系统提示里的一段 TypeScript（或 Python）SDK 声明；模型不再一次调一个工具，而是写一段程序，在程序里调工具、循环、分支、汇总，最后只把它想留下的东西返回给自己。
- **Extensions**（`packages/extensions/`，16,096 行非测试源码，仅次于 `client` 组，见 [00 总览](dsh-overview.md)的包组表）：给模型一组 `cordis_*` 工具，让它在**当前这个进程里**定义、启动、停止、删除 Cordis 插件。也就是说，agent 可以在运行期给自己加一个新工具、加一个浏览器 UI 面板，然后继续干活。

两者都不是默认开启的。它们是 dsh「万物皆插件」这条路线走到尽头时长出来的东西：既然工具注册表是一个可替换的服务，那「工具怎么呈现给模型」就是它的一个配置项；既然整个 harness 是一棵 Cordis 插件树，那「往树上再插一个节点」也可以是一个工具。

本篇先看 Code Mode 的真实产物，再讲机制与代价，然后讲 Extensions，最后横向对照。循环层与工具流水线本身见 [03 Agent Loop](dsh-agent-loop.md) 与 [07 工具、审批与沙箱](dsh-tools-approval-sandbox.md)；系统提示的段落装配见 [01 System Prompt](dsh-system-prompt.md)。

---

## 一、先看见：一次 Code Mode 的 turn

上游仓库里有一组可回放的 ACP 快照 fixture，其中 `code-mode-turn` 是完整的 Code Mode 一轮。先看模型**收到**了什么。

### 1.1 工具表里只剩一个工具

`examples/acp-agent/tests/snapshots/code-mode-turn/tool-schemas.expected.json` 是这次请求的 `tools` 字段快照。文件有两个键：`initial`（首次请求发出的工具表）和 `changes`（后续请求里工具表的变更，本例为空数组）。`initial` 全文只有一个条目：

```json
{
  "name": "run_code",
  "description": "Execute a TypeScript program against the available tools. Takes two required arguments: `code`, the BODY of an async function (erasable syntax only; top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Only what you print or return comes back — curate it.",
  ...
}
```

这段 `description` 说的是：

（拿可用的工具跑一段 TypeScript 程序。两个参数都必填：`code` 是一个 async 函数的**函数体**（只能用可擦除语法；顶层 `await` 和 `return` 都能用），`description` 是一句话说明这段程序干什么。调工具照系统提示里的声明写成 `await tools.name(args)`。只有你打印或返回的东西会回到你面前，所以自己挑好带什么回来。）

`bash`、`read`、`write`、`edit`、`subagent`、`workflow`、`todo_write` 一个都不在里面。它们没有消失，只是换了个地方。

### 1.2 它们搬到了系统提示里

同目录的 `system-prompt.expected.md` 是渲染后的完整系统提示。第 8 行是一句独立的规则：

> `` `run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program. ``
>
> —— `examples/acp-agent/tests/snapshots/code-mode-turn/system-prompt.expected.md:8`

（`run_code` 是你唯一能直接调的工具，调用里写上别的工具名一律失败。下面 SDK 声明的每一个工具，都要在程序内部去够。）

再往后，第 28 行开始是 SDK 段：

> ## Writing code for run_code
>
> `run_code` takes two required arguments: `code` — the body of an async TypeScript function (erasable syntax only — no `enum` or namespaces; type annotations are advisory, the code runs type-stripped) — and `description`, a short summary of what the program does. Inside the program:
>
> - Call tools as `await tools.name(args)` — quoted access for exotic names: `tools["my-tool"](args)`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
> - A FAILED tool call rejects with `ToolCallError`, whose `toolName` identifies the failed tool and whose `message` is human-readable — `try/catch` it to handle and continue.
> - Independent read-only calls MAY overlap under `Promise.all` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with `await`.
> - Emit results with `return` and/or `console.log(...)`. ONLY what you print or return comes back to you — intermediate tool results never enter the conversation, so extract just what you need.
>
> The available tools:
>
> —— `examples/acp-agent/tests/snapshots/code-mode-turn/system-prompt.expected.md:28-37`

这一段的中文意思：

（**给 run_code 写代码。** `run_code` 要两个必填参数：`code` 是一个 async TypeScript 函数的函数体（只能用可擦除语法，不能有 `enum` 和 namespace；类型标注只是给你参考的，代码是剥掉类型之后跑的），`description` 是一句话说明这段程序干什么。在程序里面：调工具写成 `await tools.name(args)`，名字奇怪的用引号取，比如 `tools["my-tool"](args)`，每次调用拿到的是这个工具规范化后、带类型的 JSON 值，传进去的参数必须是无损 JSON；调用失败会抛 `ToolCallError`，它的 `toolName` 告诉你哪个工具挂了、`message` 是给人看的说明，用 `try/catch` 接住就能处理完继续往下跑；互不依赖的只读调用可以放进 `Promise.all` 一起发（声明为安全的调用会真的并发，会改东西的调用单独跑、按提交顺序来），有依赖的用 `await` 串起来；用 `return` 或 `console.log(...)` 输出结果，只有你打印或返回的东西会回到你面前，中间的工具结果永远不进对话，所以只挑你要的那点提出来。下面是可用的工具：）

翻译成人话就是：这不是「工具说明书」，是「API 文档」。模型被要求像写脚本一样干活，包括自己处理异常、自己决定哪些能并发、自己决定往回带什么。

紧接着是一整块 `ts` 围栏，里面是自动生成的类型声明。开头三行是公共类型与参数表：

```ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

interface ToolArgsMap {
```

`JsonValue` 是「能无损写成 JSON 的值」，`ToolArgsMap` 是「工具名 → 这个工具吃什么参数」的对照表。

每个工具占两段：一段 JSDoc 就是它原本的 `description` 原文，一段是参数类型。以 `bash` 为例（`system-prompt.expected.md:43-59`，此处截取开头）：

```ts
  /** Execute a bash command (`bash -c`) and return its stdout/stderr. Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`. ... */
  bash: {
    /** The bash command to execute. */
    command: string;
    /** Clear, concise description of what this command does in active voice, 5-10 words (shown in the UI). ... */
    description: string;
    /** Timeout in milliseconds. The executor applies its configured default and cap, and kills the command on expiry. */
    timeoutMs?: number;
    ...
  } & Record<string, JsonValue>;
```

这几行 JSDoc 注释的中文意思：顶上那句是 `bash` 工具本身的说明（执行一条 bash 命令并返回它的 stdout/stderr。每次调用都在一个全新的 shell 里跑：cwd、变量、函数这些状态在两次调用之间都不保留，要换目录就传 `workdir`，别用 `cd`。非零退出码会以 `[exit code: N]` 的形式报出来）；三个参数分别是 `command`（要执行的 bash 命令）、`description`（用主动语态、5 到 10 个词说清这条命令干什么，会显示在 UI 上）、`timeoutMs`（超时毫秒数，执行器会套上自己配置的默认值和上限，超时就把命令杀掉）。

这里有个 native 模式看不到的东西：**返回值也有类型**。声明块的第二半是 `interface ToolOutputMap`，把每个工具的规范输出类型也写了出来（`system-prompt.expected.md:221-431`）：

```ts
  bash: {
    kind: "background";
    jobId: string;
  } | {
    kind: "foreground";
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    aborted: boolean;
    timeoutMs: number;
    stdout: {
      text: string;
      truncated: boolean;
      spillPath?: string;
    };
    ...
  };
```

这块的字段名照着念就是：`kind` 分 `"background"`（后台任务，只回一个 `jobId`）和 `"foreground"`（前台跑完，带 `exitCode` 退出码、`signal` 信号、`timedOut` 是否超时、`aborted` 是否被取消、`timeoutMs` 实际用的超时值）；`stdout` 里的 `text` 是输出正文，`truncated` 表示被截断过，`spillPath` 是完整输出溢写到磁盘的位置。模型能在程序里直接读 `out.stdout.text`，靠的就是这份声明。

最后是把两张表接起来的三段声明（`system-prompt.expected.md:433-442`）：

```ts
type ToolName = keyof ToolOutputMap

declare class ToolCallError extends Error {
  readonly name: "ToolCallError";
  readonly toolName: ToolName;
}

declare const tools: {
  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;
}
```

三段分别是：`ToolName` 是所有工具名的联合类型；`ToolCallError` 是调用失败时抛出的错误类，带一个 `toolName` 指明是谁挂的；`tools` 就是模型在程序里用的那个命名空间对象，每个键是一个「吃这个工具的参数、返回这个工具的输出」的 async 函数。

这就是「模型看到什么」的全部答案：**一个工具 schema + 一份 `.d.ts`**。native 模式下模型只知道每个工具吃什么参数，Code Mode 下它还知道每个工具吐什么结构，因为它要在程序里消费这些结果。

### 1.3 模型写了什么，session 里留下了什么

同一 fixture 的 `session.jsonl` 记录了这一轮的每个事件。模型发出的 `tool/call`（`examples/acp-agent/tests/snapshots/code-mode-turn/session.jsonl:20`）里的程序，去掉 JSON 转义后是：

```ts
const out1 = await tools.bash({command: "echo CODE_ONE", description: "Print CODE_ONE"});
const out2 = await tools.bash({command: "echo CODE_TWO", description: "Print CODE_TWO"});
console.log("captured output");
const text1 = out1.stdout.text.trim();
const text2 = out2.stdout.text.trim();
return text1 + "+" + text2;
```

这段程序做的事：跑两次 `bash` 分别打印 `CODE_ONE` 和 `CODE_TWO`，打一行日志 `captured output`（意思是「输出已取到」），把两次的 stdout 去掉首尾空白，拼成一个字符串返回。

接下来 session 里出现四条子调用事件（`session.jsonl:21-24`），成对出现：

```
tool/code-dispatch-start  subCallId=call_..._7875:code:1  name=bash  arguments={"command":"echo CODE_ONE",...}
tool/code-dispatch        subCallId=call_..._7875:code:1  isError=false  content=[{"type":"text","text":"CODE_ONE\n"}]
tool/code-dispatch-start  subCallId=call_..._7875:code:2  name=bash  arguments={"command":"echo CODE_TWO",...}
tool/code-dispatch        subCallId=call_..._7875:code:2  isError=false  content=[{"type":"text","text":"CODE_TWO\n"}]
```

读法：`code-dispatch-start` 是「第 n 个子调用发出去了」，`code-dispatch` 是「它结算了」，`subCallId` 后缀里的 1 和 2 是子调用序号，`isError=false` 表示没出错，`content` 里就是这次 `bash` 的完整输出。

然后是模型真正收到的东西，唯一一条 `tool/result`（`session.jsonl:25`）：

```
captured output
CODE_ONE+CODE_TWO
```

**两次 bash、一次模型往返、33 个字符进上下文。** native 模式下这是两次往返，两条完整 `tool/result`（各自带 `[exit code: 0]` 和输出），中间还要模型自己写一句「现在我把它们拼起来」。

子调用的完整结果并没有丢——它们躺在 `tool/code-dispatch` 事件里，UI 和持久化能读，只是不进模型历史。

上游有一条被反复引用的硬纪律，写成 `Model-visible ⟺ durably referenced`（`.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md:17`），大白话是：**凡是进过模型请求的东西，必须能从会话日志（加上它引用的不可变对象）里逐字节重建出来**。这条纪律约束的是「进过模型的必须在日志里」这个方向；反过来不成立——日志里有的东西不一定进过模型。Code Mode 就是这个反方向最极端的例子：`tool/code-dispatch` 里躺着完整的子调用参数和结果，可审计、可回放，但模型只看到最后那 33 个字符。

---

## 二、Code Mode 的机制

### 2.1 `tools.mode`：native / code / both

呈现模式是工具注册表 `ToolRuntime` 的一个配置字段，三态（`packages/core/tools/src/index.ts:651`）：

```ts
export type ToolPresentationMode = 'native' | 'code' | 'both'
```

配置项自己的 JSDoc 把三态说得很干净（`packages/core/tools/src/index.ts:655-664`）：

> Model presentation. `native` (default) sends every visible schema; `code` sends only `run_code` plus a generated SDK prompt and collapses the executor to the same surface (a model-direct call may only name `run_code`; `run_code` SDK sub-dispatches keep every visible tool); `both` sends both forms. Code modes require a `ctx.codeRuntime` whose `language` has a registered SDK renderer (TypeScript or Python) and fail prompt assembly when it is absent or has no renderer. Under `code`, native names in `toolOrder` are invalid.

（模型呈现方式。`native`（默认）把每个可见工具的 schema 都发出去；`code` 只发 `run_code` 加一段生成的 SDK 提示，并把执行器也折叠到同一个 surface 上（模型直接发的调用只能写 `run_code`，而 `run_code` 内部的 SDK 子派发仍然够得到每一个可见工具）；`both` 两种形式都发。code 系的模式要求挂着一个 `ctx.codeRuntime`，它的 `language` 得有已注册的 SDK 渲染器（TypeScript 或 Python）；运行时缺失或者没有对应渲染器时，prompt 装配直接失败。`code` 模式下，`toolOrder` 里出现 native 工具名就算非法。）

这里的 surface（界面，指模型这一侧能看见、能调到的那一层）是关键词：声明的那一层和执行的那一层必须是同一层，不能嘴上说只有 `run_code`、背地里 `bash` 还能直接调通。

注意最后一句：`code` 模式下，如果部署还配着 native 工具名的 `systemPrompt.toolOrder`，整次装配直接失败。这是有意的：不是 bug，是「你换了呈现方式就得更新顺序配置」。

生产 dsh 的组装里 `tools` 行**不写** `mode`，也就是保持默认 native（`packages/bundle/base/cordis.patch.yml:422-425` 注释：「Presentation mode is a deployment choice; omitting it here keeps the schema default (native).」，意思是：呈现模式是部署时的选择，这里不写就保持 schema 的默认值 native）。Web 与 headless 两个 bundle 各自加了一个进程级临时开关，读环境变量（`packages/bundle/web-app/cordis.patch.yml:41`、`packages/bundle/headless/cordis.patch.yml:19`）：

```yaml
- id: tools
  config:
    # Keep the same temporary process-wide Code Mode opt-in as the Web surface.
    mode: !!js process.env.DSH_TOOLS_MODE
```

yaml 里那行注释的意思是：跟 Web 那一侧保持同一个进程级的 Code Mode 临时开关。

真正「产品化」的开关是 agent preset。`apps/cli/config/agent-presets/code/`（UI 名「PTC 模式」）就是 standard preset 加一行（`apps/cli/config/agent-presets/code/agent.cordis.yml:260-263`）：

```yaml
- id: tool-presentation
  name: '@deepseek-ai/dsh-agent-tool-presentation'
  config:
    mode: code
```

这一行做的事就是在这个 agent 的 scope 上调 `ctx.tools.presentAs('code')`。它的文件头注释解释了为什么是 preset 级而不是进程级（`apps/cli/config/agent-presets/code/agent.cordis.yml:1-6`）：

> Everything in `standard` is here unchanged. What is added is the `tool-presentation` row: instead of one tool call per action, the model writes a TypeScript program against a generated SDK and `run_code` executes it, so a sequence that would be five round trips becomes one.

（`standard` 里的东西原封不动全在这儿。多出来的是 `tool-presentation` 那一行：模型不再一个动作一次工具调用，而是照着生成的 SDK 写一段 TypeScript 程序、由 `run_code` 执行，于是本来要五个来回的一串动作变成一个。）

`presentAs` 是 scope-only 的（`packages/core/tools/src/index.ts:946-950`）：在没有 scope 的 context 上调用直接抛错，错误信息还告诉你替代方案是 `mode` 配置字段。解析规则是「链上最近的 scope 胜出」（`modeFor`，`packages/core/tools/src/index.ts:900-911`）。结果是**同一个进程里，Code Mode 会话和 native 会话可以并排跑，各自看到各自的工具目录**。

### 2.2 两个 prompt section：order 99 与 order 150

Code Mode 往系统提示里塞两段，顺序是有讲究的。

**`tools:code-only`，order 99**（`packages/core/tools/src/index.ts:856-863`）。文本是一个常量（`packages/core/tools/src/index.ts:58`）：

```
`run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.
```

这句常量的中文是：`run_code` 是你唯一能直接调的工具，调用里写别的工具名一律失败；下面 SDK 声明的每个工具，都要从程序内部去够。

为什么是 99？源码注释写得很直白（`packages/core/tools/src/index.ts:46-50`）：

> Prompt order of the `code` collapse statement: after the persona and before the 100-199 per-tool guidance band, so the model reads which tools it may call before it reads what each one is for.

（`code` 折叠声明的 prompt 顺序：排在 persona 之后、100-199 这条每工具指导带之前，这样模型先读到「哪些工具能调」，再读到「每个工具是干什么的」。）

再往下的注释解释了不放这一段会发生什么（`packages/core/tools/src/index.ts:843-850`）：每个工具包都会注册自己的 `tool:*` 指导段（order 100-199），这些段落只讲「这个工具怎么用」，没有一段会说「但你不能直接调它」。缺了 order 99 这一句，模型读到一整本工具手册、发出一次 native 调用、收到一个刚刚在 prompt 里声明过的工具的 `UNKNOWN_TOOL`，然后**得出「这个部署坏了」的结论**。把规则排在手册前面，就是为了不让模型走到那一步。

`both` 模式下这一段渲染成空字符串，因为在 `both` 下 native 调用确实能执行，这条规则是假的（`packages/core/tools/src/index.ts:852-853`）。

**`tools:sdk`，order 150**（`packages/core/tools/src/code-mode.ts:23`）。JSDoc：「The `tools:sdk` section order: inside the 100–199 tool-guidance band, after per-tool guidance sections.」（`tools:sdk` 这一段的顺序：落在 100-199 的工具指导带内，排在每工具指导段之后。）也就是说：先读规则（99），再读每个工具的散文指导（100-199），最后读机器可读的类型声明（150 落在带内偏后）。

段落文本由 `sdkSection()` 生成（`packages/core/tools/src/index.ts:876-894`）：按调用方 scope 重新枚举可见工具，查 `ctx.codeRuntime.language`，从渲染器表里取对应语言的渲染函数（`packages/core/tools/src/index.ts:60-63`，目前两项：`typescript`、`python`）。native scope 渲染成空：空段会被 prompt 装配丢掉，所以「部署默认 code、某个 agent 选了 native」也不会漏出一段孤立的 SDK。

TypeScript 渲染器 `renderToolsSdk`（`packages/core/tools/src/ts-types.ts:273-293`）有一个对 KV cache 关键的细节：**工具按名字字典序排序**。函数 JSDoc 明说这是为了「an unchanged tool set produces byte-identical text across assemblies」（工具集没变，多次装配生成的文本就逐字节相同）。注册顺序变了不影响这一段的字节。

### 2.3 `run_code` 自己：两个参数，按语言换皮

`run_code` 不是普通注册的工具。它是注册表**保留**的传输层（`packages/core/tools/src/code-mode.ts:20`，`RUN_CODE_NAME = 'run_code'`），在 `view()` 的最后一步、绕过全部可见性过滤直接塞进去（`packages/core/tools/src/index.ts:1186-1191`）：

```ts
if (this.modeFor(scope) !== 'native') {
  visible.set(RUN_CODE_NAME, this.requireCodeTransport())
}
```

注释解释了两头都要防：per-agent 的 `restrict()` 不能把它 deny 掉（否则 Code Mode agent 一个工具都调不了），scoped 注册也不能同名遮蔽它；同时 native agent 的 dispatch 表里不能因为「进程里别的 agent 在跑 code 模式」就冒出一个 `run_code`。

它的两个参数都是必填的 `code` 和 `description`。为什么描述文本要在开头就把这两个参数点名？Agent Note 里有一句解释（`.agents/notes/implemented/feature/2026-06-15-code-mode.md`，§What the model sees）：

> The transport's own `description` and both SDK instruction flavors open by naming `code` and `description` as the call's two required arguments. Prose that describes the call as passing a program leaves the second argument discoverable only through the parameter schema, and a model that emits `{code}` alone loses the whole written program to an `INVALID_ARGS` rejection.

（传输层自己的 `description` 和两种 SDK 指令口径，开头都点名 `code` 和 `description` 是这次调用的两个必填参数。如果只用散文说「这个调用传的是一段程序」，第二个参数就只能靠翻参数 schema 才能发现，而一个只发了 `{code}` 的模型会因为 `INVALID_ARGS` 被拒，整段写好的程序全丢。）

翻译成人话就是：描述文本本身就是防错设计。参数 schema 里写了不算数，模型不一定读；写进描述的第一句才拦得住。

描述与 `code` 参数说明按运行时语言换皮：`TYPESCRIPT_FLAVOR`（`packages/core/tools/src/code-mode.ts:46-54`）与 `PYTHON_FLAVOR`（`packages/core/tools/src/code-mode.ts:62-70`）。换皮是**惰性**的：两个 getter 装在定义对象上（`packages/core/tools/src/code-mode.ts:663-679`），在注册表投影 schema 的那一刻才读 `ctx.codeRuntime.language`。理由也写在注释里：定义在注册时铸造一次，那时还不知道会挂哪个运行时；推迟到投影点是「仍能发出所载入运行时语言」的最小改动。

### 2.4 直呼 native 工具会发生什么

`code` 模式下模型如果还是发了一个 `bash` 调用，会走一条**不进策略流水线**的短路。判定函数只有一行（`packages/core/tools/src/index.ts:1324-1326`）：

```ts
private collapses(name: string, scope: ScopeKey | undefined, nested: boolean): boolean {
  return !nested && this.modeFor(scope) === 'code' && name !== RUN_CODE_NAME
}
```

`nested`（带 `parent` token 的子调用）不受折叠影响——这正是程序内部的 `tools.bash(...)` 能跑通的原因。JSDoc 特意点出这个谓词读的是 `modeFor` 而不是部署默认值（`packages/core/tools/src/index.ts:1315-1319`）：一个 native 部署下被 preset 给成 `code` 的 agent，若按部署默认判定就会「宣告一个界面、执行另一个界面」，那正是这层折叠要堵的绕过。

被折叠的调用返回的错误信息带路（`packages/core/tools/src/index.ts:1439-1442`）：

```
unknown tool "bash": only `run_code` is callable directly — call `bash` from inside a `run_code` program instead
```

这条错误的意思是：不认识的工具 `bash`，只有 `run_code` 能直接调，`bash` 请在 `run_code` 程序里面调。

注释写明了为什么要带这后半句：「Without it the model reads a bare `unknown tool` for a tool the prompt just declared and concludes the deployment is broken rather than correcting itself.」（少了这半句，模型就只看到一个光秃秃的「不认识这个工具」，而这工具 prompt 里刚刚才声明过，于是它会断定这个部署坏了，而不是回头改自己的调用方式。）

### 2.5 程序在哪跑

执行落在 `ctx.codeRuntime` 这个能力接缝（seam，只定契约、实现可换的那道缝：上层只认接口，底下换成 worker、容器还是别的进程都行）上（`packages/code-runtime/code-runtime/`）。接缝本身对工具一无所知：给它一段程序和一组具名 async 绑定，它跑完返回 `{ value?, logs, error? }`。失败是**结果上的字段**而不是 `run()` 的 reject，失败种类是六个正交的 kind（`packages/code-runtime/code-runtime/src/types.ts:103-108`）：

```ts
kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit'
```

六个 kind 分别是：`exception`（程序自己抛了异常）、`timeout`（算力预算烧完）、`abort`（被外部取消）、`worker-exit`（worker 进程/线程自己挂了，比如堆撑爆）、`invalid-output`（返回值没法序列化）、`output-limit`（输出超过字节上限）。

按 `docs/defensive-patterns.md` 的规矩，这几个是独立报告的：预算耗尽不是异常，取消不是超时，底座挂了两个都不是。

发行版里挂的实现是 `@deepseek-ai/dsh-code-runtime-worker-thread`（Web 与 headless 两个 bundle 各挂一行：`packages/bundle/web-app/cordis.patch.yml:48-49`、`packages/bundle/headless/cordis.patch.yml:24-25`）。它的模块头一句话定了性质（`packages/code-runtime/code-runtime-worker-thread/src/index.ts:2-5`）：

> Worker-thread code runtime: a fresh worker runs each host-type-stripped TypeScript program and bridges bindings over its message port. This is containment, not a security boundary: model code has bash-equivalent trust despite an empty environment, a heap cap, measured event-loop busy-time and wall-time budgets, and termination that also stops synchronous loops.

（worker 线程代码运行时：每段被剥掉宿主类型的 TypeScript 程序都由一个新 worker 来跑，绑定通过它的 message port 桥接过去。这是「圈住」，不是安全边界：尽管有空环境、堆上限、实测的事件循环忙时预算和墙钟预算、以及连同步死循环也能一起停掉的终止机制，模型代码的信任级别仍然等同于 bash。）

四个预算全部是 config，默认值在 schema 里（`packages/code-runtime/code-runtime-worker-thread/src/index.ts:239-244`）：

| 字段 | 默认 | 含义 |
|---|---|---|
| `computeMs` | 60 000 | worker **实测**事件循环忙时上限（`eventLoopUtilization()`），超了记 `timeout` |
| `maxWallMs` | 600 000 | 墙钟上限，兜住「等一个永不 resolve 的 promise」 |
| `maxOutputBytes` | 67 108 864 | 外层 logs / 完成值 / 诊断消息的序列化总字节上限 |
| `maxOldGenerationSizeMb` | 512 | worker 老生代堆上限，撑爆记 `worker-exit` |

`computeMs` 用「实测忙时」而不是墙钟，理由写在字段 JSDoc 里（`packages/code-runtime/code-runtime-worker-thread/src/index.ts:27-34`）：这样既公平（程序等一个慢工具不累计）又不可作弊（热循环无论有没有诱饵调用在飞都在累计）。

每次运行开一个新 Worker，也就是说 `run_code` 是 one-shot 的（一次性：程序跑完 worker 就销毁，下一次调用从零开始，什么都不留）。选项里有两行要看（`packages/code-runtime/code-runtime-worker-thread/src/index.ts:378-388`）：

```ts
const worker = new Worker(WORKER_PATH, {
  workerData: bootData,
  // Model code gets NO ambient environment — stronger than the scrubbed
  // env the defensive-patterns rule requires for spawned commands.
  env: {},
  execArgv: [],
  resourceLimits: { maxOldGenerationSizeMb: this.config.maxOldGenerationSizeMb },
  ...
})
```

代码块里那两行英文注释是说：模型代码拿不到任何环境变量，比防御规则对派生命令要求的「清洗过的环境」还要更狠一档。

`env: {}` 是真空环境，比「spawn 子进程时清洗环境变量」那条防御规则还严。`execArgv: []` 是为了不继承宿主进程的 loader hook（测试跑起来才不会污染）。

### 2.6 子调用怎么调度

程序里每个 `await tools.xxx(...)` 都是一次**完整重入**工具流水线的子调用。绑定函数在 `packages/core/tools/src/code-mode.ts:466-481`：参数先 `snapshotJsonValue` 归一为无损 JSON（不是无损就当场报错，`packages/core/tools/src/code-mode.ts:153-169`），然后构造一次调用输入，`callId` 是父 callId 加后缀（`` `${exec.callId}:code:${n}` ``），并把父的 `token` 放进 `parent` 字段，这个字段就是 §2.4 里让折叠放行的凭证。

绑定表按**调用方 agent 的可见集**枚举（`packages/core/tools/src/code-mode.ts:614-617`），也就是 SDK 段声明的那同一份视图，所以「prompt 里承诺的」和「程序里能绑的」永远一致。命名空间对象用 null 原型 + `defineProperty` 建（`packages/core/tools/src/code-mode.ts:609`），这样一个叫 `__proto__` 的工具是普通自有属性而不是原型碰撞。

调度器是一条**单一有序车道**（`packages/core/tools/src/code-mode.ts:395-449`）。它刻意复刻了 native 循环的时序，注释把契约列了出来（`packages/core/tools/src/code-mode.ts:346-359`）：

- 有序阶段（写 dispatch-start 事件、pre-execute + guards、post-execute、上下文延迟、写 settle 事件）全部在这一条车道里跑，彼此不重叠；只有「环绕派发 / body」阶段并发。
- 启动严格按提交顺序；结果按提交顺序经一个 head-of-line 游标提交。
- 连续的 parallel 调用最多重叠到 `maxParallelSubCalls`（默认 10，`packages/core/tools/src/index.ts:776`）；exclusive 调用要等池子排空、独占运行，并且**把屏障一直held 到它的 commit（含 post-execute）结束**。
- 分类在每次启动前**重新读一遍**（`executionMode()`），因为一个调用排队期间注册表可能变了、把它翻成 exclusive。

也就是说：程序里的 `Promise.all` 买到的是「工具自己声明为并发安全的那些调用之间」的墙钟并行，不是无条件并行。SDK 指令里那句「safe calls run concurrently; mutating calls run alone, in submission order」（声明为安全的调用会并发跑；会改东西的调用单独跑，按提交顺序来）讲的就是这条真实契约。

子调用的 `additionalContexts` 不能就地注入（那会破坏父调用与父结果的相邻性），所以统一走 `exec.deferContext()` 攒起来，由外层结果带出（`packages/core/tools/src/code-mode.ts:570-572`）。

**取消与排空**：整个运行有一条 run-scoped 的 AbortController，外层信号进来会转发，运行以任何方式结束都会 abort 它。`finally` 里两行（`packages/core/tools/src/code-mode.ts:635-636`）：

```ts
runController.abort('run_code settled')
await drainDispatches()
```

排空的语义是「每个已派发的子调用都 settle 且 commit 完，排队未启动的被放弃」，而且要等所有 settle 事件都 append 完，因为这些 append 必须落在还没关闭的 `run_code` turn 里面。

### 2.7 session 里留下什么

两类 log-only 事件（不进模型历史）：`tool/code-dispatch-start` 在入池时写，`tool/code-dispatch` 在结算时写并带完整渲染内容（`packages/core/tools/src/code-mode.ts:512-523`）。写进日志的参数是**归一化值的兄弟副本**：`jsonNormalizeArgs` 把同一个值 snapshot 了两次（`packages/core/tools/src/code-mode.ts:153-168`），一份派发一份记录，注释给的理由是「a tool mutating its args cannot desync this record from what it actually received」（`packages/core/tools/src/code-mode.ts:518-520`）。这句是说：就算某个工具在执行中把自己收到的参数改了，日志里那份记录也不会跟它实际收到的东西对不上，因为两份是各自独立的快照。

`tool/code-dispatch` 的内容还会先过一次 `tools/code-dispatch-log` waterfall（瀑布：一串注册在同一个名字下的处理器，前一个的输出接着喂给后一个，这里是 `shapeDispatchLog`），spill 后端就是在这里把超大内容换成预览 + 定位符的，**只换持久副本，程序拿到的值和模型看到的外层结果都不动**（`packages/core/tools/src/code-mode.ts:502-511`）。

---

## 三、为什么这样能省，代价是什么

`.agents/notes/implemented/feature/2026-06-15-code-mode.md` 把动机写得很清楚。原始问题是：native 呈现下模型每步一个 tool call，**每一个中间 `tool-result` 都会在下一次请求里回到上下文**，不管模型需不需要；模型也没法在一次回合里对结果集做循环、分支、扇出。它引的是 Cloudflare 的 Code Mode 观察：LLM 写代码比发 tool call 强，因为它见过几百万行真实代码、见过的人造 tool-calling 轨迹要少得多。

**省在哪**：往返数（N 次调用 → 1 次）和上下文（N 份完整结果 → 模型自己 curate 的一小段）。§1.3 那个玩具例子是 2 → 1；真实的「审计 40 个文件」是 40 → 1。

**代价，Note 自己列了**：

1. **SDK 前缀的 token 成本可能不比 native schema 小**，`both` 模式更是两份都带。Note 的原话是「The `.d.ts` can rival the native schemas it complements; `'both'` carries two representations」（这份 `.d.ts` 的体量可以跟它所替代的 native schema 打平；`both` 模式则是两种表示各带一份），并且明确说这篇笔记**不做无条件省钱的断言**：什么时候用哪个模式是「post-ship learning」（发布之后才学得到的东西，也就是要靠真实用量去摸）。前缀稳定 + provider 缓存能摊掉每会话成本，但摊不掉「这一段本来就更长」。
2. **并发预期落差**。程序里写 `Promise.all` 不代表真并行；一串 exclusive 调用还是要一个一个来。SDK 指令陈述了真实契约，但模型可能过度期待。
3. **worker 不是安全边界**。信任姿态等同 bash 工具；`worker.terminate()` 停得了线程，停不了它 spawn 出去的 OS 进程（`packages/code-runtime/code-runtime-worker-thread/README.md` 的 Known Limitations 第一条就是这个）。需要硬多租户边界的部署要等 `isolation: 'container'` 的后端。
4. **`stripTypeScriptTypes` 是 Node 的实验 API**。它拒绝非 erasable 语法（`enum`、namespace），这个拒绝会以 `exception` 形式回到模型面前，SDK 指令里那句「erasable syntax only」（只能用可擦除语法，也就是那些删掉类型标注后代码还成立的写法）就是配套的预防。
5. **中间绑定值没有字节上限**。只有外层输出（logs + 完成值 + 诊断）受 `maxOutputBytes` 管；程序可以在内存里堆出一个永远不成为外层输出的巨大值，把进程撑爆。
6. **`toolOrder` 兼容性**：切到 `code` 的部署必须更新或删掉 native 工具名的顺序配置，否则每次装配都失败。

Note 的「Alternatives considered」（考虑过但没选的方案）里有两条解释了 dsh 为什么**没有**做得更激进：

- **「Always-exclusive（忠实于 Cloudflare、不做模式）」被拒**（always-exclusive 就是「永远只给 code mode，不留 native」）：理由是编码 agent 的日常单次调用（`bash`、`read`、`edit`）本来就最适合 native，硬把每次编辑塞进一个程序是给常见情形加税。留一个 `mode` 配置，让忠实形态离你只有一行。
- **「REPL 式常驻内核」（跨 `run_code` 调用保留状态）被拒**：跨调用状态对 session log 不可见，会破坏「每次请求是 log 的纯函数」这条可重建性保证。每次一个新 worker 才守得住。

还有一条 Note 里的取舍解释了 dsh 与别家的分工：**它没有把 Code Mode 做成一个后置的 waterfall 插件**。理由是 `agent/request` 在「可重建请求」纪律下只允许改调用配置；而在装配好的工具表上做变换，就得在不拥有 `toolOrder` 配置的前提下撤销它的规范化，还会依赖监听器顺序。「模型被提供哪些工具、以什么表示」是注册表的单一职责，native schema 和 SDK 是同一份可见存储的两个投影。

---

## 四、Extensions：让 agent 在运行期改自己

### 4.1 先看见：模型收到的那一大段

`packages/extensions/tool-cordis` 注册了一个系统提示段和七个工具。提示段的注册只有一行（`packages/extensions/tool-cordis/src/index.ts:36`）：

```ts
ctx.systemPrompt.section({ name: 'tool:cordis', order: 115, text: CORDIS_SYSTEM_PROMPT })
```

order 115 落在 100-199 的工具指导带内。文本是一个 105 行的模板字符串（`packages/extensions/tool-cordis/src/prompt.ts:3-107`），是全仓最长的单个 prompt section。开头这几句定了整件事的边界：

> # Dynamic Cordis Plugins
>
> Dynamic Cordis plugins temporarily extend the current DSH process. A Plugin uses apply(ctx) to consume Services, listen to Events, provide Services, register model Tools, or register browser UI in Slots.
>
> - Plugin and Package definitions exist only in the current process. define itself does not modify repository source, configuration, or disk, and definitions do not survive a process restart.
> - The restricted execution environment prevents accidental misuse; it is not a security boundary for malicious code. Services obtained by dynamic code connect to the real runtime.
>
> —— `packages/extensions/tool-cordis/src/prompt.ts:3-8`

（# 动态 Cordis 插件

动态 Cordis 插件临时扩展当前这个 DSH 进程。一个 Plugin 用 `apply(ctx)` 去消费 Service、监听 Event、提供 Service、注册模型可见的 Tool，或者把浏览器 UI 注册到 Slot 里。

- Plugin 和 Package 的定义只存在于当前进程。define 本身不改仓库源码、不改配置、不写盘，定义也活不过一次进程重启。
- 这个受限执行环境防的是手滑误用，不是防恶意代码的安全边界。动态代码拿到的 Service 连的是真实运行时。）

这里的 Slot（槽位）是浏览器 UI 上预留好的挂载点，插件把自己的界面注册进某个 slot 才显示得出来。

第二段是「先把面向用户的计划讲清楚」，通篇在**劝阻**模型滥用这套工具：

> - Dynamic Cordis Plugins are one available implementation mechanism, not the default for every request. Consider whether one could help only when the user intends to design or create something, or when a temporary interface could materially aid the current work. The presence of these instructions or Tools, and discussion of Cordis itself, do not make a request a dynamic-Plugin task.
>
> —— `packages/extensions/tool-cordis/src/prompt.ts:12`

（动态 Cordis 插件只是一种可用的实现手段，不是每个请求的默认做法。只有当用户想设计或创造点什么、或者一个临时界面确实能显著帮到手头的活儿时，才考虑它是不是有用。这套说明和这些 Tool 摆在这儿，以及用户提到了 Cordis 本身，都不等于这个请求就是一个动态插件任务。）

后面还有「不要让用户来选 Host 还是 Client，那是实现选择」「最多问一个简明的产出/生命周期问题，不要做多轮访谈」「`cordis_run` 返回 awaiting-approval 时要解释用户需要在 UI 里批准，不要等待、不要重试、不要声称它在跑了」「用户拒绝之后不要再次请求批准」（`packages/extensions/tool-cordis/src/prompt.ts:13-20`）。

再往后是三块硬知识：**推荐工作流与七个工具的顺序**（`:22-36`）、**身份/版本/批准**（`:38-54`）、**高频错误**（`:56-92`）。最后这块直接把模型最容易犯的四类错写死了，还带代码示例：

- Services：默认用 `ctx.get('serviceName')` 并处理 undefined；只有硬依赖才在返回的 plugin 对象上声明 `inject`；**没声明就不许当 ctx 属性读**（`:58-73`）。
- Code：host/client 代码不过 TypeScript / JSX / bundler；不许用类型、`as`、装饰器、`import`、`require`、JSX；React 只能 `React.createElement(...)`；不要假设 `process`/`Buffer`/`window`/`document`/`fetch`/原生定时器存在，先查对应平台的 Builtins（`:75-80`）。
- Data：Service/Event/Slot/Session 及其派生对象是**活数据**，不是能 dump 的 JSON；不许 `JSON.stringify`、`structuredClone`、递归枚举、整体拷贝（`:82-86`）。
- Lifecycle：每个副作用必须可逆，全部挂在当前 Fiber 上，用 `ctx.effect()` / `ctx.on()` / 返回 disposer 的官方 API（`:88-92`）。Fiber（纤程）是 Cordis 里一个插件实例的生命周期单元：插件注册的东西都记在它自己的 fiber 上，fiber 一销毁，挂在上面的副作用跟着一起撤掉。

最后一块讲 Host 与 Client 的分工与它们之间的私有 JSON 方法通道（`harness.handle` / `host.call`，方向只有 Client→Host，只许无损 JSON 通过，`:94-100`），以及异步结果怎么回到模型（「Do not wait inside a Tool for approval or browser work that can happen only after the current turn ends. Asynchronous success, rejection, and runtime errors update Run state and notify you through steering context.」`:104-105`）。那句是说：不要在一个 Tool 里面干等审批或浏览器那边的动作，那些事只可能在当前这一轮结束之后才发生；异步的成功、拒绝和运行时错误会去更新 Run 状态，再通过 steering 上下文通知你。

### 4.2 七个工具

工具描述在 `packages/extensions/tool-cordis/src/index.ts` 里逐个 `defineTool`，`docs/tool-catalog.md` 有生成的完整目录。分两类：

**三个只读的 inspect 工具**：`cordis_inspect_list`（`packages/extensions/tool-cordis/src/index.ts:42`）、`cordis_inspect_query`（`:61`）、`cordis_inspect_self`（`:97`）。前两个的用途是让模型在写代码之前**问清楚运行时到底有什么**：

> Run a read-only query explicitly declared by an Inspect Provider. platform, provider, and method must come from cordis_inspect_list, and input must satisfy that method's schema. Use this Tool before cordis_define to read exact Service methods, Event modes, Builtin signatures, Tool schemas, theme tokens, or live Slot trees and props. Host queries run locally. A Client query waits for the first valid page response and remains pending until a page answers or the Tool is cancelled. This Tool cannot invoke business Service methods or modify the runtime. ...
>
> —— `docs/tool-catalog.md:367`（`cordis_inspect_query`）

（跑一次由 Inspect Provider 明确声明过的只读查询。platform、provider、method 三个值必须来自 `cordis_inspect_list`，input 必须满足那个 method 的 schema。在 `cordis_define` 之前用这个 Tool 去读准确的 Service 方法、Event 模式、Builtin 签名、Tool schema、主题 token，或者活的 Slot 树和 props。Host 侧的查询在本地跑。Client 侧的查询会等第一个有效的页面响应，在某个页面回答它或者这个 Tool 被取消之前一直挂着。这个 Tool 不能调业务 Service 方法，也不能改运行时。）

注意「Host queries run locally. A Client query waits for the first valid page response」（Host 侧查询在本地跑；Client 侧查询要等第一个有效的页面响应）——inspect 是跨进程半边的：Host 半在 Node 进程，Client 半在浏览器页面，一次查询可能要等某个页面回答。

**四个生命周期工具**：`cordis_define`（`:149`）、`cordis_run`（`:241`）、`cordis_stop`（`:330`）、`cordis_undefine`（`:352`）。`cordis_define` 的描述定义了整个身份模型：

> Define an immutable Cordis Package. For a new Plugin, use kind:"new" and provide only a semantic prefix of 3–6 lowercase English letters; the Host returns the final pluginId and packageId. To modify an existing Plugin, use kind:"existing" with its exact pluginId to append a Package without overwriting older versions. Provide at least one of code.host and code.client. Each value is a plain JavaScript function body that returns a Cordis Plugin; no TypeScript, JSX, or import transformation occurs. Query Inspect before depending on a Service, Event, Builtin, Slot, or token. Define only validates parameters and syntax and records source: it does not request approval, execute apply, or change currentPackageId. On success, call cordis_run with the returned IDs.
>
> —— `docs/tool-catalog.md:272`

（定义一个不可变的 Cordis Package。新建插件时用 `kind:"new"`，只需要给一个 3 到 6 个小写英文字母的语义前缀，最终的 pluginId 和 packageId 由 Host 返回。要改一个已有插件，就用 `kind:"existing"` 加上它准确的 pluginId，这样是追加一个 Package，不会覆盖旧版本。`code.host` 和 `code.client` 至少要给一个。每个值都是一段普通 JavaScript 函数体，返回一个 Cordis Plugin；不做任何 TypeScript、JSX 或 import 的转换。在依赖某个 Service、Event、Builtin、Slot 或 token 之前，先用 Inspect 查一下。define 只校验参数和语法、把源码记下来，它不申请审批、不执行 apply、也不改 `currentPackageId`。成功之后，拿返回的那组 id 去调 `cordis_run`。）

三级身份（prompt 里也重复了一遍，`packages/extensions/tool-cordis/src/prompt.ts:40-44`）：

- **pluginId**：一个可以持续修改的插件；新建时模型只提交 3–6 个小写字母的语义前缀，最终 id 由 Host 分配。
- **packageId**：该插件下一个**不可变**的 Host/Client 源码版本。改代码 = 定义一个新 Package，**永不覆盖旧版本**。
- **pluginRunId**：一次激活尝试，把它的批准、Host/Client 加载、私有 RPC、Run 卡片和错误串起来。

两个指针：`currentPackageId` 是最近一次**完全成功**的 Package（停止、开始更新、更新失败都不会清它）；`nextPackageId` 是正在等批准/正在尝试/最近失败的目标。

批准模型是两档（`packages/extensions/tool-cordis/src/prompt.ts:45`）：

> A single check mark authorizes only the current Package; double check marks authorize future versions of the same Plugin. A grant remains in effect after a technical failure.

（单个对勾只授权当前这个 Package；双对勾授权同一个 Plugin 的后续版本。技术性失败之后，已经给出的授权继续有效。）

### 4.3 host 半在 `node:vm` 里跑

`packages/extensions/cordis-host-runner` 提供 `ctx.dynamicCordisRunner`，也就是定义注册表 + host 半生命周期。模型写的 host 代码在一个 `node:vm` 上下文里求值（`packages/extensions/cordis-host-runner/src/sandbox.ts:14`：`import { createContext, runInContext, Script } from 'node:vm'`）。模块头把性质写得毫不含糊（`packages/extensions/cordis-host-runner/src/sandbox.ts:2-7`）：

> The `node:vm` sandbox a dynamic package's HOST half evaluates in: a fresh realm whose globals are a tagged write-through console, the `harness` registration helpers, the encoding primitives a bare vm context lacks, and callable traps over the Node APIs the sandbox deliberately withholds. Traps steer filesystem, network, process, and timer work to `ctx.fs`, `ctx.web`, `ctx.bash`, and Cordis timers. **This keeps cooperative packages inspectable and disposable but is not containment: host-realm helper functions remain an escape route.**

（一个动态 package 的 HOST 半就在这个 `node:vm` 沙箱里求值：一个全新的 realm，它的全局只有几样东西，一个打了标签、写穿到外面的 console，`harness` 那组注册辅助函数，裸 vm 上下文缺的那几个编码原语，以及沙箱故意不给的那些 Node API 上架的可调用陷阱。陷阱会把文件系统、网络、进程和定时器相关的活儿引到 `ctx.fs`、`ctx.web`、`ctx.bash` 和 Cordis 定时器上。**这让配合的 package 可被检查、可被销毁，但这不是圈禁：宿主 realm 的辅助函数仍然是一条逃逸通道。**）

realm 是 JS 引擎里一套独立的全局环境和内置对象。开一个新 realm，意思是沙箱里的 `Object`、`Array` 这些跟外面不是同一份，模型代码碰不到宿主的原型链。

沙箱里的全局只有五类，写在一张可被 inspect 读到的表里（`packages/extensions/cordis-host-runner/src/sandbox.ts:18-42`）：受限的 `ctx`（只有 `get` / `on` / `provide` / `effect` 四个方法）、`harness`（`handle` / `defineTool` / `registerTool`）、打标签的 `console`、`btoa`/`atob`、`TextEncoder`/`TextDecoder`。**没有** `process`、`Buffer`、`fetch`、`require`——prompt 里那句「Do not assume that process, Buffer, window, document, fetch, native timers, or any other global is available」（别假定 process、Buffer、window、document、fetch、原生定时器或者任何别的全局对象存在）不是客气话。

真正的注册边界是 `guard.ts` 里的**上下文 façade**（`packages/extensions/cordis-host-runner/src/guard.ts:1-8`）：

> The registration boundary between a sandboxed host half and the real runtime: ParameterSchemaSpec normalization + validation with teaching errors, the marker-guarded `harness.defineTool` / `harness.registerTool` pair, the `harness.handle` invoke-handler normalizer, the SANDBOX CONTEXT FAÇADE a running plugin's `apply` receives in place of the real `ctx`, and the plugin-shape helpers the run lifecycle narrows sandbox return values with. The façade is a whitelist of lifecycle-safe verbs and declared services; framework internals and context-valued service returns are denied.

（一个被沙箱化的 host 半与真实运行时之间的注册边界：ParameterSchemaSpec 的归一化与校验（报错信息带教学性质）、有标记守卫的 `harness.defineTool` / `harness.registerTool` 这一对、`harness.handle` 的调用处理器归一化器、插件 `apply` 拿到的那个顶替真 `ctx` 的沙箱上下文 façade，以及 run 生命周期用来收窄沙箱返回值的那几个插件形状辅助函数。这个 façade 是一份白名单，只放行生命周期安全的动作和已声明的服务；框架内部件和返回 context 的服务方法一律拒绝。）

「context-valued service returns are denied」（返回值是 context 的服务方法一律拒绝）这条是关键的一环：注释解释了它挡的是什么（`packages/extensions/cordis-host-runner/src/guard.ts:658-661`）：一个返回 Context 的服务方法会把「一个全新的、未加固的运行时句柄」交回给沙箱代码，正是 façade 要堵的逃逸。

有一条约束不在这套护栏里，上游自己把它记在了另一篇笔记里（`.agents/notes/implemented/architecture/2026-08-10-host-plane-ownership-after-presets.md:23`）：模型挂上的临时插件**属于组装（composition）而不是挂它的那个 session**。也就是说这不是 per-session 的能力隔离。

### 4.4 Client 半与 UI

`cordis-client-runner` 是浏览器半边：把定义求值成一个活的浏览器插件，并回答 run 请求；它有自己的一套 façade（不复用 host 的 vm sandbox 模块）。`ui-cordis` 提供一个 frame 级面板（run / stop / undefine）和一个只读 define 卡片；用户从面板发起的动作会把状态变化排给模型的下一步，`undefineFromPanel` / `stopFromPanel` 的 JSDoc 原文是「queue the resulting state change for the model's next step」（`docs/subsystems/extensions.md`），意思是把这次操作引起的状态变化排队，留给模型的下一步去看到。

Host 与 Client 之间的往返被记成六个 `cordis/*` 事件（`docs/subsystems/extensions.md`，源在 `packages/extensions/cordis-host-runner/src/types.ts:367-397`）：`cordis/request-run`、`cordis/request-run-resolved`、`cordis/dynamic-package`、`cordis/dynamic-retract`、`cordis/inspect-query`、`cordis/inspect-query-resolved`。

### 4.5 `cordis` preset：一整套「让 agent 写 agent」的组合

`apps/cli/config/agent-presets/cordis/`（UI 名「创造模式」）是这套工具的产品形态。文件头把它的存在理由和信任姿态写在一起（`apps/cli/config/agent-presets/cordis/agent.cordis.yml:1-12`）：

> It exists so a person can ask an agent to author another agent. Everything in `standard` is here unchanged; what is added is the self-referential Cordis toolset, a skill that teaches composition authoring, and a persona that says which of the two planes an edit belongs to.
>
> TRUST: `cordis_mount` evaluates model-written JavaScript against the live runtime, and a composition this agent writes becomes a preset other sessions mount. **Treat a session on this preset as shell access** — the toolset's own documentation makes the same statement.

（它存在的意义，是让一个人可以叫一个 agent 去写另一个 agent。`standard` 里的东西原封不动全在这儿；多出来的是那套自指的 Cordis 工具集、一个教人怎么写 composition 的 skill，还有一段说清「一处改动属于两个平面中的哪一个」的 persona。

信任：`cordis_mount` 会拿模型写的 JavaScript 去对着活的运行时求值，而这个 agent 写出来的 composition 会成为别的 session 挂载的 preset。**把一个跑在这个 preset 上的 session 当成 shell 访问权限来对待**，这套工具集自己的文档也是这么说的。）

（顺带一提：这句注释里的 `cordis_mount` 是旧工具名，发行版里的工具是 `cordis_define`/`cordis_run`/`cordis_stop`/`cordis_undefine` 那七个；旧名只在 Agent Note 与这条注释里还留着。）

它的 persona 直接把「两个平面」的判据教给模型（`apps/cli/config/agent-presets/cordis/agent.cordis.yml:23-29`）：

> You can read and modify the harness you run on. Its composition is Cordis: every capability is a plugin row in a `cordis.yml`, and an agent preset is one such file mounted for a single session.
>
> Two planes decide where an edit belongs. The HOST composition holds the registries and anything shared across sessions — persistence, the sandbox and approval stack, the model route, the subagent registry and its backends. An AGENT PRESET holds what one session contributes to those registries: its tools, its persona, its prompt sections. A row that publishes a service belongs in the host composition, or inside an `isolate` realm if the preset genuinely owns that service and nothing outside one agent reads it.
>
> Presets you author live one directory per preset under `${DSH_HOME:-$HOME/.dsh}/.agent-presets/<id>/`; the roster reports each preset's real path, so take the one you edit from there. **NEVER edit or delete the shipped preset install** (the `agent-presets` directory beside the deployment's own config): it belongs to the deployment, an upgrade overwrites it, and corrupting the `cordis` preset would disable this very mode. To change what a shipped preset does, copy its composition into a new preset directory and edit the copy.
>
> Load the `editing-cordis-compositions` skill before writing or changing a composition.

（你能读、也能改你自己正跑在上面的这套 harness。它的 composition 就是 Cordis：每一项能力都是 `cordis.yml` 里的一行插件，而一个 agent preset 就是这样一个文件、为单个 session 挂载。

两个平面决定一处改动该放哪儿。HOST composition 装的是各种注册表，以及所有跨 session 共享的东西：持久化、沙箱与审批栈、模型路由、subagent 注册表和它的后端。AGENT PRESET 装的是一个 session 往这些注册表里贡献的东西：它的工具、它的 persona、它的 prompt 段。会发布服务的那种行属于 host composition；除非这个 preset 真的独占那个服务、而且除了这一个 agent 之外没人读它，那才可以放进一个 `isolate` realm 里。

你自己写的 preset 一个 preset 一个目录，放在上面那个 preset 根目录下；花名册会报出每个 preset 的真实路径，要改就从那儿取。**绝对不要改或删发行版自带的那份 preset 安装**（部署自己配置旁边的 `agent-presets` 目录）：它属于这个部署，升级会覆盖它，而把 `cordis` preset 搞坏就等于把这个模式本身废掉。要改一个自带 preset 的行为，把它的 composition 复制成一个新的 preset 目录，改副本。

写或改 composition 之前，先加载 `editing-cordis-compositions` 这个 skill。）

除了 `tool-cordis` 那一行（`apps/cli/config/agent-presets/cordis/agent.cordis.yml:246-247`），preset 还随身带两个 skill（`cordis-plugin-development` 和 `editing-cordis-compositions`），通过给 `skill-filesystem` 配一个指向 preset 自己目录的 `customSkillDirs` 实现（`apps/cli/config/agent-presets/cordis/agent.cordis.yml:256-260`）。注释解释了为什么 skill 跟着 preset 走而不是放用户的 skill root：「it documents THIS deployment's two planes, and a preset is the unit that gets copied and edited」（它记录的是**这一个**部署的两个平面，而 preset 正是被整个复制、整个修改的那个单位）。skill 机制本身见 [08 编排层](dsh-orchestration.md)。

### 4.6 风险与护栏，逐条

这套东西让模型往活着的进程里塞代码，护栏就得逐条摊开看。下表的第三列是**上游自己承认还没堵上的**，每一条都能在源码或笔记里找到原话。

| 风险 | 现有护栏 | 缺口 |
|---|---|---|
| 模型代码拿到真运行时 | `node:vm` 新 realm、白名单 `ctx` façade、拒绝返回 Context 的服务、`inject` 声明才能读服务 | 源码自陈「is not containment: host-realm helper functions remain an escape route」（`packages/extensions/cordis-host-runner/src/sandbox.ts:6-7`），这句是说：它不是圈禁，宿主 realm 的辅助函数仍然是一条逃出去的路 |
| 副作用泄漏 | 一切必须挂当前 Fiber、用 `ctx.effect()`/返回 disposer；stop/update/undefine 撤销全部 | 靠模型遵守 prompt 里的规矩，无强制 |
| 版本回滚 | Package 不可变、只追加；`currentPackageId` 只在**完全成功**后才变 | 更新失败不自动重启旧版本，要模型自己 `run` 回滚 |
| 未授权的浏览器代码 | Client 半要用户批准；单勾只授权本 Package，双勾授权该 Plugin 的未来版本 | 双勾等于把一个插件的后续所有版本一次性放行 |
| 身份/归属 | 每个工具都 `requireAgent(exec)`（`packages/extensions/tool-cordis/src/index.ts:29-31`），Plugin 归属校验到 session | 临时插件属于 composition 而非 session（上游自记，见 §4.3） |
| 持久化 | 定义只活在当前进程，重启即无（`packages/extensions/tool-cordis/src/prompt.ts:7`） | 反过来说：没有「让它活下来」的路径，要固化只能写成真的 preset 文件 |
| 装进生产 | `tool-cordis` **不在任何发行组装里**，只在 `cordis` preset 里，且这是刻意的 opt-in（`docs/tool-catalog.md:23`：「Not in any shipped tree (a deliberate opt-in — dynamic package code reaches the real runtime …)」，意思是不在任何发行的组装树里，这是刻意留的 opt-in，因为动态 package 的代码够得到真实运行时） | 一个跑着的插件可以**再注册模型可见的工具**，直到它被停/删/进程重启；这些工具集变化会以一次 changed request header 记录下来 |

最后一条单独说：`docs/tool-catalog.md:23` 明确写着「A running package may register ADDITIONAL model-visible tools until it is stopped, undefined, or DSH restarts; a full changed request header logs those tool-set changes.」，意思是：一个跑着的 package 可以再注册**额外的**、模型可见的工具，直到它被停掉、被删掉，或者 DSH 重启；这些工具集变化会由一次完整的 changed request header 记录下来。也就是说，Extensions 是 dsh 里**唯一一处工具集能在会话中途被模型自己改变**的地方。对 KV cache 而言这是一次确定的前缀失效（见 [02 KV-Cache](dsh-kv-cache.md)），而 dsh 选择的是把它**记下来**而不是禁止它。

---

## 五、别人怎么做

本节要回答的是两个不同的问题：**「模型写程序而不是发工具调用」这件事谁在做**（前三行），以及**「运行时能不能被改」谁开了口子、开给谁**（后四行）。

| | dsh | Codex | Claude Code | OpenCode | pi |
|---|---|---|---|---|---|
| **Code mode** | `tools.mode: native/code/both`，per-agent-preset 可选；`run_code` + 生成的 `.d.ts`（TS/Python 两种渲染器）；子调用重入完整工具流水线 | 有：模型元数据带 `tool_mode: code_mode_only` 时只暴露一个 freeform `exec`，模型写 JavaScript，在 V8 isolate 里通过全局 `tools.<name>(...)` 调工具；配 `wait` 续接长脚本（`codex!codex-rs/code-mode-protocol/src/description.rs:22-45`） | 无 | `experimentalCodeMode` 开关（环境变量 `OPENCODE_EXPERIMENTAL_CODE_MODE`，`opencode!packages/opencode/src/effect/runtime-flags.ts:48`）下走 code-mode 工具 | 无 |
| **code mode 的语言与运行时** | 类型剥离后的 TypeScript，Node worker thread（新 worker/次，`env: {}`，四个预算）；接缝允许换成 Python 或容器后端 | JavaScript，V8 isolate，自陈「no Node, no file system, no network access, no console」（没有 Node、没有文件系统、上不了网、没有 console） | — | — | — |
| **code mode 里的类型信息** | 参数表 **和** 返回值表都生成（`ToolArgsMap` + `ToolOutputMap`），加 `ToolCallError` | 描述模板里给 `text()/image()/store()/load()/notify()/yield_control()/ALL_TOOLS` 等原语与 `// @exec:` pragma | — | — | — |
| **运行期改自己的运行时** | `cordis_*` 七工具：定义/启动/停止/删除进程内 Cordis 插件，可注册新的模型可见工具与浏览器 UI；host 半在 `node:vm` | Extension API：`context_contributors()` 贡献上下文片段与 WorldState 分节（`ext/memories`、`ext/goal` 等都这样挂），但那是**开发者写的扩展**，不是模型运行期生成的 | plugins / skills / MCP：打包 skills、commands、agents、hooks、MCP、LSP，**不改运行时**，装卸是会话外的动作 | npm/本地插件，`plugin/loader.ts` 按需 `import()`，`Hooks` 接口 21 个键（`opencode!packages/plugin/src/index.ts:222-334`）；MCP 客户端 | Extensions：TS 模块 `export default function (pi: ExtensionAPI)`，`registerTool` / `registerCommand` / `registerProvider` / `registerShortcut` / `registerFlag` + `ctx.ui.*`；`/reload` 热重载；Packages 从 npm/git 装 |
| **扩展的作者是谁** | **模型自己**（运行期），或人写 preset | 人（编译期/配置期） | 人（plugin 包） | 人（npm 包） | 人（TS 文件），但 system prompt 内嵌 pi 自身 README/docs 绝对路径，**鼓励让 pi 给自己写扩展** |
| **扩展存活期** | 只到进程结束 | 进程/配置生命周期 | 安装即持久 | 安装即持久 | 文件即持久，`/reload` 生效 |
| **工具集能否会话中途变** | 能（跑着的动态包可再注册工具），变化记进 changed request header | MCP 服务器上下线、deferred 工具加载会改 `tools` 并失效缓存 | MCP 服务器连断、按名 deny 工具会移除定义并失效缓存 | 插件 `tool.definition` 钩子 | `setActiveTools` |

三点展开说：

**dsh 与 Codex 的 code mode 是同一个想法的两种实现。** Codex 走 V8 isolate + freeform Lark grammar，dsh 走 Node worker thread + 类型剥离的 TypeScript。最大的差别在两处：（一）dsh 生成**返回值类型**，Codex 的描述模板给的是一组通用原语（`text()`、`image()`、`store()`、`load()`）；（二）Codex 有 `wait` 让长脚本续接，也就是 continuable（可续接：脚本能中途挂起，之后接着从断点往下跑），dsh 的 `run_code` 则是 one-shot：它明确拒绝了 REPL 式常驻内核，理由是跨调用状态对 session log 不可见、破坏可重建性。dsh 的模式还是 per-agent-preset 的，同进程可以混跑；Codex 的 code mode 绑在模型元数据上。

**Claude Code 的 plugins/skills 是另一条路子。** 它扩展的是「模型能读到什么、什么时候被触发」，不改运行时本身：skill 正文在调用点作为 user message 注入，plugin 打包 skills/commands/agents/hooks/MCP/LSP。装卸是会话外的动作，装完这套东西对模型是静态的。dsh 的 Extensions 是模型在**这一轮**里写一段 JS、下一轮就多出一个工具。

**pi 走到了另一个极端。** 它的哲学明说「No MCP. No sub-agents. No permission popups. No plan mode. No built-in to-dos.」（`pi!packages/coding-agent/README.md:494`），意思是不做 MCP、不做 subagent、不弹权限确认框、不做 plan 模式、不内置待办清单——但它给的是最全的扩展 API（`ExtensionAPI` 上 33 个 `on(event, …)` + `registerTool`/`registerCommand`/`registerProvider` 等，`pi!packages/coding-agent/src/core/extensions/types.ts:1214`），并且在 system prompt 里内嵌自己的文档路径，鼓励「让 pi 给自己写扩展」。差别在**谁来写、什么时候写**：pi 让模型写一个磁盘上的 `.ts` 再 `/reload`，可审计可持久；dsh 让模型直接在活着的进程里 define + run，更快但只活一轮进程。

---

## 六、怎么自己核

以下命令都在 dsh checkout 根目录跑（`C:/w/dshi/sources/checkouts/deepseek-harness`，commit `b150a55`）。

```bash
# 1. Code Mode 下模型收到的工具表：只有 run_code
cat examples/acp-agent/tests/snapshots/code-mode-turn/tool-schemas.expected.json

# 2. 渲染后的完整系统提示（443 行），SDK 段从第 28 行开始
sed -n '1,60p' examples/acp-agent/tests/snapshots/code-mode-turn/system-prompt.expected.md

# 3. 一次 run_code 的完整事件流：tool/call → 两对 code-dispatch → 一条 tool/result
grep -n 'tool/code-dispatch\|"tool/call"\|"tool/result"' \
  examples/acp-agent/tests/snapshots/code-mode-turn/session.jsonl

# 4. both 模式的对照（同一场景，两种呈现都发）
diff <(sed -n '1,40p' examples/acp-agent/tests/snapshots/code-mode-turn/system-prompt.expected.md) \
     <(sed -n '1,40p' examples/acp-agent/tests/snapshots/both-mode-turn/system-prompt.expected.md)

# 5. 三种呈现模式的定义与两个 prompt section 的 order
grep -n "COLLAPSE_SECTION_ORDER\|CODE_ONLY_INSTRUCTION\|ToolPresentationMode" packages/core/tools/src/index.ts
grep -n "SDK_SECTION_ORDER" packages/core/tools/src/code-mode.ts

# 6. worker 运行时的四个预算默认值
sed -n '239,244p' packages/code-runtime/code-runtime-worker-thread/src/index.ts

# 7. tool-cordis 的完整 prompt section（105 行）
cat packages/extensions/tool-cordis/src/prompt.ts

# 8. 七个 cordis_* 工具的生成目录与「不在任何发行组装里」的说明
grep -n "cordis_" docs/tool-catalog.md

# 9. 哪些组装挂了 code-runtime / tool-cordis
grep -rn "code-runtime\|tool-cordis" packages/bundle/*/cordis.patch.yml apps/cli/config/agent-presets/*/agent.cordis.yml
```

设计记录本体：`.agents/notes/implemented/feature/2026-06-15-code-mode.md`（Code Mode 的三个决策、What the model sees、五条 Risks、六条 Alternatives considered）与 `.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md`（Extensions 的设计家）。相关的还有 `2026-07-20-code-mode-typed-tool-returns.md`（`ToolOutputMap` 的来源）、`2026-07-26-code-mode-live-parallel-dispatch.md`（子调用调度器）、`2026-07-31-code-mode-language-dispatch.md`（Python 渲染器）。

更多背景：工具流水线本身见 [07 工具、审批与沙箱](dsh-tools-approval-sandbox.md)，prompt section 的排序与装配见 [01 System Prompt](dsh-system-prompt.md)，前缀稳定性见 [02 KV-Cache](dsh-kv-cache.md)，`cordis` preset 与 boot/profile 的关系见 [10 Cordis 与 boot preset](dsh-cordis-boot-preset.md)，横向对照的完整版见 [14 横向对比](../00-overview.md)，术语见 [附录 A 术语表](../appendix-a-glossary.md)。

---

## 自检

**1. 折叠规则那一段（`tools:code-only`）排在 order 99，也就是所有 per-tool 指导段之前。如果把它挪到 order 199，模型会经历什么？**

答：模型会先读完一整本工具手册（每个工具怎么用、参数是什么、什么时候该调），读到最后才被告知「这些其实一个都不能直接调」。在读到那句话之前，它已经很可能按手册发出一次 native 调用，收到的是一个刚在 prompt 里声明过的工具的 `UNKNOWN_TOOL`。这种自相矛盾最容易让模型得出「这个部署坏了」的结论，然后不再纠正自己。order 99 的意义就是让「哪些能调」永远排在「每个是干嘛的」前面。

**2. 程序里写 `Promise.all([tools.edit(a), tools.edit(b)])`，两个 edit 会同时跑吗？**

答：不会。`Promise.all` 只是把两次调用一起提交，真正的时序由那条单一有序车道决定：只有工具自己声明为并发安全的调用才会重叠，会改东西的调用是 exclusive 的，要等池子排空、独占运行、把屏障一直 held 到自己 commit 完成。所以两个 `edit` 仍然一前一后，顺序是提交顺序。`Promise.all` 买到的是「安全调用之间」的墙钟并行，不是无条件并行。这也是 Note 自己列的代价之一：并发预期落差。

**3. 如果把 `run_code` 从 one-shot 改成 REPL 式常驻内核（跨调用保留变量和状态），dsh 会失去什么？**

答：会失去可重建性。dsh 有一条硬纪律：凡是进过模型请求的东西，必须能从会话日志加上它引用的不可变对象里逐字节重建出来，也就是「每次请求是 log 的纯函数」。常驻内核里的跨调用状态既不在日志里，也不在任何被引用的不可变对象里，重放同一份日志就可能得到不同的请求。每次开一个新 worker，看着浪费，实际是在守这条保证。上游的 Alternatives considered 里明确按这个理由拒了 REPL 方案。

**4. Extensions 是 dsh 里唯一一处工具集能在会话中途被模型自己改变的地方。这对 KV cache 意味着什么，dsh 为什么不干脆禁掉？**

答：意味着一次确定的前缀失效。工具表是系统提示前缀的一部分，跑着的动态插件再注册一个模型可见的工具，这个前缀就变了，后面所有缓存命中作废。dsh 没有禁它，而是选择把变化**记下来**：以一次完整的 changed request header 落进日志。理由和上一题同源，可审计比省缓存更要紧；而且这个能力本来就不在任何发行组装里，只在 `cordis` preset 里，是刻意的 opt-in，代价由主动打开它的人承担。
