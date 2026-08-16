---
title: System Prompt：模型第一眼看到的到底是什么
sources: [{"repo":"deepseek-harness","path":"packages/core/system-prompt/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# System Prompt：模型第一眼看到的到底是什么

dsh 里没有 `prompts.ts`。你 grep 不到一个把 system prompt 写在一起的文件，因为它压根不存在。模型看到的那段文字是十几个互不认识的插件各贡献一两句话，先由 `assemble()` 按 `order` 排好序，再由 `renderPrompt()` 这四行代码插值、丢空、用空行拼起来。

这一篇先把默认组合下模型真实收到的东西逐字贴出来，再回过头讲它是怎么来的。

---

## 一、先看见：一次首轮请求逐字长什么样

场景：`dsh web`，默认 `standard` preset，Linux/macOS，沙箱模式 `workspace-write`（`packages/bundle/base/cordis.patch.yml:175` 的默认值），审批策略 `ask`（`packages/bundle/base/cordis.patch.yml:191`），项目里有一个 `AGENTS.md`，用户输入「帮我看看 README」。

### 1.1 `messages[0]`：system 字符串

下面这 18 段是按源码逐字重建的（`{{model}}` / `{{cwd}}` / 路径已代入示例值；段与段之间的空行由 `'\n\n'` 的 join 产生）。**每一句英文都是源码里的字符串字面量**，出处见 §三的贡献者表。

```text
You are an AI agent powered by DeepSeek Harness.

The DeepSeek Harness implementation checkout is at /opt/dsh. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.

You are interacting with the user through the DeepSeek Harness Web GUI at http://127.0.0.1:3080. When the user refers to "this page", "this GUI", or "this app" without naming another target, they mean this GUI. The browser provides no implicit DOM, route, or screenshot context. The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while `pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh. Starting another server does not update this GUI. The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__. Do not start a replacement server unless the user asks; if one is needed, use a managed background job and verify its exact URL.

You are a coding agent powered by the deepseek-v4-flash model. Your working directory is /work/demo.

Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.

Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it) and prefer edit for targeted changes.

Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session.

Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, while a larger one keeps the modification-time-ordered head.

Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.

Check the [exit code: N] marker on every bash result; investigate failures before moving on.

Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.

Use the web_search tool to discover current information on the web. It returns an optional answer plus a list of source URLs. Use the returned source snippets when available, and cite the relevant URLs as markdown links.

Use goal tools for one long-running completion objective in the current session. create_goal may infer goal intent from a direct human request in any language; do not create a goal for routine single-turn work. Call get_goal before update_goal and copy its exact goal_id and revision. After session resume or fork, an active goal is disarmed: when a human asks to continue or resume in any wording or language, use update_goal action resume to rearm it. Mark complete only when the objective is actually achieved. Mark blocked only after the same blocking condition persists for at least 3 consecutive goal rounds, and report that concrete condition in blocked_reason; difficulty, uncertainty, or useful remaining work is not blocked.

Use the workflow tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.

Use the ralph tool ONLY when the direct human explicitly asks for a Ralph loop or fresh-agent iterative execution. Each Ralph round starts a fresh child with no conversation seed and uses the shared workspace as durable memory. Completion and blockers are worker reports, not independent evaluation. Use same-session goal tools for ordinary long-running objectives, and plain subagents or workflows for bounded delegation and fan-out.

Use subagent in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set `run_in_background: false` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.

Use subagent_fork in the background by default. Start independent delegations together in one assistant message and continue useful work while they run. Set `run_in_background: false` only when your next action depends on that subagent's result. When a background run settles, the runtime sends you a notice containing its outcome and any final assistant message.

When you successfully create or modify files, mention the primary outputs in your final response. To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.
```

就这些。没有「回答要简洁」、没有代码风格、没有安全守则、没有 markdown 排版要求。默认 dsh 的 system prompt 只有一句身份、一句 persona、每个工具一句跨调用习惯，以及 Web 特有的三段环境说明。这是个刻意的设计判断，代价在 §九。

有几段**不在**上面：`plan:policy`（order 50）在未进入 plan 模式时 provider 返回 `''`，被 `renderPrompt` 的 `.filter(text => text.length > 0)` 丢掉；`tools:code-only`（99）与 `tools:sdk`（150）在默认的 `native` 呈现模式下同样渲染为空。

**上游 fixture 可以直接对照**。`apps/web/tests/snapshots/fresh-round-trip/system-prompt.expected.md` 是 Web 的真实录制结果，逐字是这样的。注意 `{{sourceRoot}}` / `{{webUrl}}` / `{{cwd}}` 这三个都**不是**源码里的 prompt 变量，而是录制器为了让快照跨机器稳定而替进去的归一化 token：`{{cwd}}` 由通用的快照工具产生（`packages/test-support/acp-snapshot/README.md`），前两个由 Web 那套回放测试自己替（`apps/web/tests/replay-round-trip.e2e.ts:89`、`:91`）。

```text
You are an AI agent powered by DeepSeek Harness.

The DeepSeek Harness implementation checkout is at {{sourceRoot}}. …

You are interacting with the user through the DeepSeek Harness Web GUI at {{webUrl}}. …

You are a coding agent powered by the deepseek-v4-flash model. Your working directory is {{cwd}}.
```

它只有四段，因为那个测试场景没挂 preset 的工具行。挂满工具的版本看 `examples/acp-agent/tests/snapshots/text-turn/system-prompt.expected.md`（3,466 字节，11 段；那个组合没装 fs-search 和 web，persona 也不同）。数段落的时候小心：那份文件里空行分隔的自然段有 12 个，因为 ACP 那份 persona 一段里自己带了个空行。

### 1.2 `tools[]`：字典序的 24 个 schema

工具 schema **不在 system 字符串里**，它们是请求体的 `tools` 字段，由 `serializeRequest` 单独映射成 `{type:'function', function:{name, description, parameters}}`（`packages/llm/llm-deepseek/src/serialize.ts:161`）。默认没有配 `toolOrder`，所以按名字的 UTF-16 code unit 排序（`packages/core/system-prompt/src/index.ts:169`）：

```text
ask_user_question, bash, create_goal, edit, exit_plan_mode, get_goal, glob, grep,
interrupt_agent, job_kill, job_list, job_output, list_agents, ralph, read,
send_message, skill, subagent, subagent_fork, todo_write, update_goal,
web_search, workflow, write
```

（这份清单是我按 `apps/cli/config/agent-presets/standard/agent.cordis.yml` 逐行推出来的，**是推断**；已录制的等价物是 ACP 示例的 `examples/acp-agent/tests/snapshots/text-turn/tool-schemas.expected.json`，那份组合是这 24 个的真子集：少了 `glob`、`grep`、`web_search`、`ask_user_question`、`exit_plan_mode` 五个，剩下 19 个名字同样是纯字典序。）

注意 `exit_plan_mode` 即使不在 plan 模式也一直注册着，注释写得很直白：「It stays registered while plan mode is inactive so the request tool catalog is stable across transitions」（`packages/plan/plan-mode/src/index.ts:64-67`）。工具目录稳定是缓存约束，不是功能需要。

每个工具的 `description` 才是模型看到的大头。`bash` 的 description 一个人就有 1,836 个字符（`examples/acp-agent/tests/snapshots/text-turn/tool-schemas.expected.json` 第 5 行），从「每次调用是全新 shell」讲到「被沙箱拒绝时怎么升级」。这是上游「单次调用语义放 description」原则的直接结果，见 §六。

### 1.3 `messages[1..]`：四条 user 消息

首轮 messages 数组里有四条 user 消息，全部是 role `user`（DeepSeek 的 wire 没有 developer role）：

```text
[1] source.kind = 'user'
    帮我看看 README

[2] source.kind = 'agent-instructions', form='instructions', baseline=true
    <system-reminder>
    The following workspace instructions may be relevant to your work. Use them as guidance
    when applicable. More specific instructions take precedence over broader ones. They do not
    override system, developer, or direct user instructions.

    Instructions from: ~/.dsh/AGENTS.md

    <用户全局文件内容>

    Instructions from: AGENTS.md

    <项目根 AGENTS.md 内容>
    </system-reminder>

[3] source.kind = 'plugin', plugin='@deepseek-ai/dsh-system-prompt', form='snapshot'
    Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

    Current DSH file policy: workspace-write. Any available operation enforced by the DSH file
    sandbox may modify files under the session workspace: "/work/demo". Some platform temporary
    areas may also be writable.

    Approval policy: ask. Operations that require approval may ask through the configured
    answerers; without an available answerer, the request fails closed.

[4] source.kind = 'skill-catalog', form='catalog'
    <system-reminder>
    A skill is a reusable set of task-specific instructions. The following skills are available
    in this session:

    <available_skills>
    - `model-only-skill`: Prove user-disabled skills remain available to the model.
    - `snapshot-skill`: Exercise project skill discovery and loading in snapshot tests.
    </available_skills>

    If the user names a skill, or the task clearly matches a skill's description, call the
    `skill` tool with the exact skill name before taking task actions. Load all applicable
    skills, then follow their full instructions. This catalog contains summaries only; do not
    infer or follow a skill's instructions until it has been loaded.
    A user may also invoke a skill directly; its <skill_content> block then appears in this
    conversation. Follow it, and do not call the `skill` tool again for that skill.
    </system-reminder>
```

这四条的**顺序和内容都有录制证据**。`examples/acp-agent/tests/snapshots/agent-instructions/session.jsonl` 的前几条事件是：

```text
seq 3  step/start
seq 4  user/message  source.kind = "user"
seq 5  user/message  source.kind = "agent-instructions"
seq 6  user/message  source.plugin = "@deepseek-ai/dsh-system-prompt"
seq 7  session/title
seq 8  request/header
seq 9  request/context
```

seq 5 的正文逐字就是上面 `[2]` 的框架；seq 6 的正文逐字就是 `[3]`（那个 fixture 是 `danger-full-access` + `never`，所以两句不同）。skill 目录的位置在 `examples/acp-agent/tests/snapshots/skill-load/session.jsonl` 里：seq 4 user、seq 5 runtime 快照、seq 6 skill-catalog，**skill 目录排在 runtime 快照之后**。

顺便注意 `request/header` 出现在这些 user 消息**之后**。原因是「模型可见 ⟺ 已记录」要求先把消息 append 进日志，再用 `session.deriveMessages()` 派生出请求（`packages/core/agent-loop/src/agent.ts:282-284`、`:341`）。

---

## 二、`SystemPrompt` 服务：五个注册点

整个装配机制在一个 545 行的文件里：`packages/core/system-prompt/src/index.ts`。插件只有五种方式往请求里加东西。

| API | 定义行 | 进 assembly 的哪个字段 | 语义要点 |
| --- | --- | --- | --- |
| `section({name, order, text, complete?})` | `:381` | `sections` → system 字符串 | `name` 在同一层内唯一；`order` 必须有限；`text` 可以是 `string`，也可以是 `(AssembleContext) => string`，每次装配重新求值 |
| `context({name, order, text})` | `:398` | `contexts` → user-role 快照 | 同上；返回空串等于「本次不贡献」而不是占位 |
| `tools(provider)` | `:430` | `tools` | provider 返回 `{schemas, knownNames?}`；`knownNames` 是这个 scope 在被 `tools.restrict()` 过滤**之前**能看见的名字全集，用来区分「名字写错了」和「名字被过滤掉了」 |
| `variable(name, provider)` | `:446` | `variables` | 名字必须匹配 `/^[a-z][a-z0-9_]*$/`（`:134`）；provider 可以返回 `undefined`，但被引用时渲染抛错 |
| `suppressRuntimeContext()` | `:415` | 让 `contexts = []` | 匿名条目，可注册多个各自 dispose |

五个方法都走 `this.layers.effect(this.ctx, ...)`，**注册即 Cordis effect**：谁调用就属于谁的 fiber，插件卸载时注册自动撤销，同时 `emit('system-prompt/change')`。落到哪一层取决于调用方 context 有没有 scope：没有就是全局层，有就是那个 scope 的 `PromptLayer`。

同名重复注册直接抛错，而且错误信息会顺手教你怎么办（`:316-318`）：

```
prompt section "deployment:persona" is already registered
(for a per-agent override, register through that agent's `agent.ctx` instead)
```

服务自己在构造时就注册了两段（`:353-370`）：`harness:identity`（order −100，文本固定为 `You are an AI agent powered by DeepSeek Harness.`）和 `deployment:persona`（order 0，文本取自配置，默认 `''`）。配置里 `includeHarnessIdentity`（`:340`）关掉第一段，`includeRuntimeContext: false`（`:341`）等价于全局调一次 `suppressRuntimeContext()`。

`toolOrder` 的 schema 特意写成 `.default(undefined as unknown as string[])`（`:344`），注释解释了原因：「Preserve omission because an explicit empty order lacks the rest marker」，也就是必须能区分「没配」和「配了个空数组」。

### `assemble()` 做了什么

`assemble(context)` 在 `:467-542`，每个 step 跑一次。关键步骤：

1. `chainLayers(scope)` 取出 scope 父链上**已存在**的层，最远祖先在前、本 scope 最后（`:469`）。典型链是 `agent → preset → global`。
2. 抑制判定：全局层或链上任一层有抑制器，`runtimeContextSuppressed` 就为真（`:470-471`）。
3. 变量：先铺全局 provider 的结果，再按链从远到近覆盖，**最近的 scope 赢**（`:473-482`）。
4. sections 与 contexts 用 `layers.merge(scope, …)` 合并（`:484`）：全局 Map 打底，链上同名覆盖。这就是 per-agent persona 的实现方式。
5. 工具 provider 是**并集不是遮蔽**（`:486-503`）：全局层加链上所有层的 provider 全部调用，结果累加。每个 schema 的 `parameters` 走 `structuredClone`（`:498`），保证后面的 waterfall 改不脏注册表。
6. sections 按 `order` 升序稳定排序（`:504`）。同 order 的按 Map 插入顺序，也就是插件注册顺序；上游 README 自己承认这是「a plugin-load artifact」。
7. `complete === true` 的 section 超过一个就抛错（`:505-508`）。
8. 求值每段文本（函数就调用），顺手记下 complete 的那一份（`:510-518`）。
9. contexts：被抑制就是 `[]`，否则按 order 排序求值（`:521-528`）。
10. `orderTools(collected, this.toolOrder, knownNames)`（`:529`）。
11. 把装好的 assembly 交给 `system-prompt/assemble` 这个 waterfall 走一圈（`:532-535`）。第一个参数 `scopeTarget(this, scope)` 的作用是「只分发给挂在这个 scope 或它祖先上的监听器」，别的 agent 的监听器收不到。监听器的返回值**权威**，它可以整体改写 assembly。
12. 事后强制（`:536-541`）：有 complete section 就把 `sections` 换成只有那一段；有抑制就把 `contexts` 清空，**连 waterfall 里加进来的也丢**。

全仓库只有三个 `system-prompt/assemble` 监听器：`packages/core/agent/src/model-selection.ts:40` 把 UI 选中的 provider/model 覆写进 `variables`（让 `{{model}}` 与真正路由一致），加上两个纯校验用的 invariant（`packages/core/system-prompt/src/invariant.ts:47`、`packages/preset/agent-presets/src/invariant.ts:60`）。这个拦截点很强，但上游自己几乎不用。

### `renderPrompt` 就是这四行

「prompt 是怎么拼的」的完整答案（`packages/core/system-prompt/src/index.ts:212`）：

```ts
export function renderPrompt(assembly: PromptAssembly): string {
  return assembly.sections
    .map(section => interpolate(section, assembly.variables, 'section'))
    .filter(text => text.length > 0)
    .join('\n\n')
}
```

排序在 `assemble()` 里已经做完，这里只做三件事：插值、丢空、用空行拼。没有标题、没有分隔符、没有包裹标签。

### 严格插值的三条规则

`interpolate` 在 `:258-295`，逐个扫描 `{{`：

1. **未知或无值即抛错。** 名字用 `Object.hasOwn(variables, name)` 查（`:283`），所以 `{{constructor}}` 算未知而不是解析到 `Object.prototype`；provider 返回 `undefined` 时抛 `has no value for this assembly`。抛错发生在**每步渲染时**，后果是这个 turn 以 error 结束、loop 存活，不是启动失败。
2. **不完整的引用要么是错误、要么是散文。** 匹配 `/^\{\{([^{}]*)\}\}/` 失败时，如果后面还有 `}}` 就抛 malformed（`{{{model}}}` 会中招），否则孤立的 `{{` 原样输出（`:268-276`）。
3. **替换值不再扫描**（`:291`）。变量值里如果碰巧有 `{{…}}`（比如 cwd 里有），不会被二次展开。

没有转义语法。想在 persona 里写一个字面的 `{{x}}` 目前做不到，上游 README 的「Known Limitations」明确记着这一条。

### `complete` section：一个硬边界

`PromptSection.complete` 让某一段变成「唯一的一段」。装配照常跑完（tools、contexts、变量、waterfall 都正常），最后把 `sections` 恢复为只有它。`minimal` preset 就靠这个（`apps/cli/config/agent-presets/minimal/agent.cordis.yml:8-13`）：

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: You are a helpful software engineer assistant.
    complete: true
    includeRuntimeContext: false
```

于是 `harness:identity`、`harness:source`、`app:web-surface`、所有 `tool:*` 段落**全部消失**，模型只看到那一句。上游给这个 preset 的定位是「Claude SWE 兼容的 RL 契约」组合（`.agents/notes/implemented/feature/2026-07-29-persistent-bash-str-replace-editor.md:21`）：要的正是「system prompt 完全由部署固定、其它包一句话都插不进来」。

### `toolOrder` 与字典序

`orderTools` 在 `:164-178`：

- 没配 ⇒ `tools.sort(compareToolNames)`（`:169`），纯 code-unit 比较，注释写明「locale-independent, so the order is identical on every machine」（`:180`）。
- 配了 ⇒ 加载时校验必须恰好含一次 `'<unlisted-tools>'`、不许重复（`:146-157`）；装配时校验列出的名字都在 `knownNames` 里（`:170-173`），所以配错名字是**第一个 turn** 炸，不是启动炸。未列出的按字典序插到 rest 位置。

为什么要多这一层？`.agents/notes/implemented/feature/2026-07-06-explicit-tool-order.md` 记着：工具顺序影响请求字节、缓存和持久 header，而注册顺序受并发 import 影响，CI 出现过快照漂移。解法是「在列表诞生的地方规范化」，让无序列表不可表示。

---

## 三、全部 section 贡献者

`grep -rn "systemPrompt.section({" packages/ --include=*.ts | grep -v /tests/` 数出 26 处调用点；再加上服务构造时自注册的两段（`packages/core/system-prompt/src/index.ts:358` 与 `:364`）和 `core/tools` 用私有方法注册的两段（`packages/core/tools/src/index.ts:834-835`），就是模型可能看到的全部段落。按 order 排：

| order | name | owner（文件:行） | 文本（原文或摘要） | 何时出现 |
| ---: | --- | --- | --- | --- |
| −100 | `harness:identity` | `packages/core/system-prompt/src/index.ts:358` | `You are an AI agent powered by DeepSeek Harness.` | 默认总在 |
| −99 | `harness:source` | `packages/boot/app-boot/src/index.ts:824`（由 `packages/bundle/web-app/src/index.ts:142` 调用） | `The DeepSeek Harness implementation checkout is at ${sourceRoot}. …never infer the working directory from this path. Use pwd…` | Web 且 `surfaceContext: true` |
| −98 | `app:web-surface` | `packages/bundle/web-app/src/index.ts:143`（文本 `:95-105`） | `You are interacting with the user through the DeepSeek Harness Web GUI at ${webUrl}. …` | 同上；`text` 是函数，每次装配读端口 |
| 0 | `deployment:persona` | 全局：`packages/core/system-prompt/src/index.ts:364`（文本来自配置）；preset 遮蔽：`packages/preset/persona/src/index.ts:61`；子代理遮蔽：`packages/subagent/subagent/src/child-agent.ts:172` | Web/headless 默认 `You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.` | 总在（空则丢） |
| 50 | `plan:policy` | `packages/plan/plan-mode/src/index.ts:225` | 文本来自配置的 `section` 键（`apps/cli/config/agent-presets/standard/agent.cordis.yml:113-124`，六段，开头 `You are in plan mode. Stay in plan mode until exit_plan_mode succeeds…`）；未激活时返回 `''` | **动态**：进出 plan 模式会改 system 字符串 |
| 99 | `tools:code-only` | `packages/core/tools/src/index.ts:855`（文本 `:58`） | `` `run_code` is the only tool you can call directly — a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program. `` | 仅 `mode: 'code'`（`both` 渲染空） |
| 100 | `tool:read` | `packages/fs/tool-fs/src/read.ts:70` | `Use the read tool — not shell commands like cat — to inspect text files. …` | 装了 tool-fs |
| 101 | `tool:write` | `packages/fs/tool-fs/src/write.ts:63` | `Use the write tool to create files or completely replace file contents. …` | 同上 |
| 102 | `tool:edit` | `packages/fs/tool-fs/src/edit.ts:77` | `Use the edit tool for targeted changes to existing UTF-8 text files. …` | 同上 |
| 103 | `tool:glob` | `packages/fs/tool-fs-search/src/glob.ts:301` | `Use the glob tool — not shell find — to discover files by path pattern. …` 末句随 `sampleOverCapGlobResults` 变（`:299-300`） | 装了 tool-fs-search |
| 104 | `tool:grep` | `packages/fs/tool-fs-search/src/grep.ts:276` | `Use the grep tool — not shell grep or rg — to search file contents. …` | 同上 |
| 105 | `tool:bash` | `packages/shell/tool-bash/src/index.ts:236` | `Check the [exit code: N] marker on every bash result; investigate failures before moving on.` | 非 Windows |
| 105 | `tool:pwsh` | `packages/shell/tool-pwsh/src/index.ts:245` | `` Non-zero exits are reported as `[exit code: N]` markers… `` | Windows |
| 106 | `tool:jobs` | `packages/jobs/tool-jobs/src/index.ts:263` | `Track every background job id you start. …` | 装了 tool-jobs |
| 106 | `tool:pty` | `packages/terminal/tool-terminal/src/index.ts:156` | `Use a terminal session only when work needs persistent terminal state or interactive stdin; …` | 装了 tool-terminal（standard 未装） |
| 110 | `tool:web_search` | `packages/web/tool-web/src/search.ts:216` | 两版：`fetch` 开时说 `Follow up with web_fetch…`，关时说 `Use the returned source snippets…` | 装了 tool-web |
| 111 | `tool:web_fetch` | `packages/web/tool-web/src/fetch.ts:430` | `Use the web_fetch tool to retrieve the content of a specific HTTP(S) URL …` | `fetch: true`（standard 是 `false`） |
| 112 | `tool:lsp` | `packages/lsp/tool-lsp/src/index.ts:104`（文本 `:54`） | `Use search/read for ordinary navigation. Use lsp when textual matches are ambiguous …` | 装了 tool-lsp |
| 113 | `tool:session-query` | `packages/session-query/tool-session-query/src/index.ts:60`（文本 `:52`） | `Use session_search to find relevant work from prior sessions, …` | 装了该工具 |
| 114 | `tool:goal` | `packages/goal/tool-goal/src/index.ts:189`（文本由 `:113` 的 `guidance()` 拼） | `Use goal tools for one long-running completion objective in the current session. …` | 装了 tool-goal |
| 115 | `tool:${toolName}` | `packages/workflow/tool-workflow/src/index.ts:212` | `Use the workflow tool ONLY when the user explicitly asks for a workflow …` | standard 装 |
| 115 | `tool:cordis` | `packages/extensions/tool-cordis/src/index.ts:36`（文本 `packages/extensions/tool-cordis/src/prompt.ts:3`） | `# Dynamic Cordis Plugins` 开头的长 markdown，全仓最长的一段 | 装了 tool-cordis（`cordis` preset） |
| 116 | `tool:ralph` | `packages/workflow/tool-ralph/src/index.ts:407` | `Use the ralph tool ONLY when the direct human explicitly asks for a Ralph loop …` | standard 装 |
| 116.5 | `tool:${toolName}` | `packages/subagent/tool-subagent/src/index.ts:459`（order 常量 `:26`） | `` Use ${toolName} in the background by default. … Set `run_in_background: false` only when… `` | 仅 `backgroundMode: continuable`；provider 缺席时返回 `''` |
| 117 | `tool:report` | `packages/subagent/tool-subagent-report/src/index.ts:54` | `Deliver your result with the report tool before you finish: call it once with a self-contained answer. …` | **仅子代理 scope** |
| 150 | `tools:sdk` | `packages/core/tools/src/index.ts:875`（order 常量 `packages/core/tools/src/code-mode.ts:23`） | 由 `SDK_RENDERERS[language](sdkSchemas)` 生成的 `## Writing code for run_code` + TypeScript 声明块 | 仅 code/both 模式 |
| 190 | `ui:deliverable-file-references` | `packages/client/ui-deliverables/src/index.ts:23`（文本 `:15`） | `When you successfully create or modify files, mention the primary outputs in your final response. …` | Web bundle |
| 190 | `tool:structured_output` | `packages/subagent/subagent-in-process-driver/src/structured.ts:99`（文本 `:26`） | `` When you have your final answer, you MUST report it by calling the `structured_output` tool … `` | 仅结构化输出子代理 scope |

order 的分段约定写在 `.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md`：identity −100、persona 0、工具指导 100–199。

变量提供者全仓只有三个，都在 agent-loop 里（`packages/core/agent-loop/src/index.ts:351-353`）：

```ts
ctx.systemPrompt.variable('provider', context => context.agent?.options.provider)
ctx.systemPrompt.variable('model', context => context.agent?.options.model)
ctx.systemPrompt.variable('cwd', context => context.agent?.session.header.cwd)
```

`{{provider}}` 存在但没有任何 persona 用它。变量留在 loop 插件上而不是 prompt 服务上，是因为它们是「这个 loop 驱动的那些 agent 的运行时事实」；换一个 loop 实现就换一套变量。

### runtime-context 的三个贡献者

`systemPrompt.context(` 的调用点全仓只有三处：

| order | name | owner | 文本 |
| ---: | --- | --- | --- |
| 110 | `sandbox:policy` | `packages/sandbox/sandbox-policy/src/index.ts:113`（文本 `:38-51`） | 三选一。`read-only`：`Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.`；`workspace-write`：`… may modify files under the session workspace: "<root>". Some platform temporary areas may also be writable.`；`danger-full-access`：`… does not restrict file modifications by available operations.`。无 agent 时返回 `''` |
| 115 | `approval:policy` | `packages/interaction/user-approval/src/index.ts:205`（文本 `:100-102`） | `ask` ⇒ `Approval policy: ask. Operations that require approval may ask through the configured answerers; without an available answerer, the request fails closed.`；`never` ⇒ `` Approval prompts are disabled in this session: actions that require approval are rejected automatically — do not request sandbox escalation (do not set `sandbox_permissions`). `` |
| 120 | `subagent:delegation` | `packages/subagent/subagent/src/child-agent.ts:170`（文本 `:135-139`） | `You are a delegated subagent: your permission scope was fixed when you were started and cannot be widened from inside this session — operations that require approval are rejected automatically. When the task needs access beyond that scope, do not retry the denied operation; state the limitation in your reply so the delegating agent can handle it.` | 仅子代理 scope |

`user-approval` 的注释把设计意图直接写在了注册点上方（`packages/interaction/user-approval/src/index.ts:202-203`）：

```
// The complete current value travels after retained history, so switching
// policy does not rewrite the stable system-prompt cache prefix.
```

---

## 四、runtime-context 为什么走 user 消息

上游的原则一句话：**稳定的放 system，会变的以 user-role 快照追加到历史尾部**。所以「当前沙箱模式」「审批策略」「你是被委派的子代理」这三条运行时事实**不在 system prompt 里**。

### 渲染

`renderContextSections(assembly)` 逐条插值、丢空（`packages/core/system-prompt/src/index.ts:251`）；`joinContextSections(sections)` 用 `'\n\n'` 拼起来，前面加一句固定导语（`:236-239`）：

```ts
export function joinContextSections(sections: readonly ContextSnapshotSection[]): string {
  const body = sections.map(section => section.text).join('\n\n')
  if (body.length === 0) return ''
  return `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n${body}`
}
```

「supersedes earlier」这半句是整套设计的关键：历史里会累积多条快照，靠这句话让模型忽略旧的。

### 只在变化时才追加

`RuntimeContextProjection`（`packages/core/agent-loop/src/runtime-context.ts`，全文 76 行）不「拥有」提交，只跟踪「最后一条仍在 surface 上的自家快照」：

- 构造时倒扫 `session.events`，找 `user/message` 且 `source.kind === 'plugin' && source.plugin === '@deepseek-ai/dsh-system-prompt'`（`:15-17`、`:36-44`）。命中且 seq 还在 `session.surface.nodes` 里 ⇒ `retained = {seq, text}`；出现过但已不在 surface（被压缩替换掉了）⇒ `retained = null`；从来没有过 ⇒ `undefined`。
- 订阅 `session/event`（`:46-55`）：自家新快照就更新 retained；一条替换类 surface 事件的 `sourceEventSeqs` 包含 `retained.seq` 就把 retained 置空。
- `project(current, sections)`（`:64-75`）：

```ts
project(current: string, sections: readonly ContextSnapshotSection[]): UserMessage | undefined {
  if (this.retained === undefined && current.length === 0) return
  const snapshot = current.length === 0 ? CLEARED : current
  if (this.retained?.text === snapshot) return
  return createUserMessage({ … })
}
```

`CLEARED` 是 `'Current runtime context: none. Earlier runtime-context snapshots no longer apply.'`（`:13`）。最后一条 context 消失时要发一条「清空」快照，而不是什么都不发。

`retained` 的三种取值（`undefined` = 从来没发过、`null` = 发过但已经不在 surface 上、有值 = 现在还留着）是整个逻辑的核心：从没发过 + 当前为空 ⇒ 什么都不做；发过但被压缩掉了 ⇒ 即使内容一个字没变也要重发一遍。

### 上游实测：这条设计值多少 token（不是我跑的）

`.agents/notes/implemented/feature/2026-07-30-current-sandbox-policy-context.md` 记录了改造前后的真实 provider 测量。

改造前（沙箱那句话放在 system section 里）：

> The first `danger-full-access` and `workspace-write` requests each reported only 256 cache-read tokens against 14,691 and 14,782 uncached input tokens.

也就是说，用户切一次权限模式，整个前缀作废，一万四千多 token 全价重付。

改造后（尾部 user 快照）：

> Across the permission switches and four mutation steps, cache reads were 14,848–15,872 tokens while uncached input was 59–306 tokens per request.

未命中从 14,691 降到 59–306。笔记里「Alternatives considered」一节否掉了四个方案，第三个正是「Put current policy in a dynamic system section」，理由写得很干脆：「DeepSeek matches complete prefixes; changing the first wire message prevents reuse of the longer system-plus-history prefix.」

### 录制证据

`apps/web/tests/snapshots/permission-policy-context/session.jsonl` 是这套机制最直接的证据。那个 fixture 里：

- 4 条来自 `@deepseek-ai/dsh-system-prompt` 的 runtime 快照（read-only+ask → danger-full-access+never → workspace-write+ask → read-only+ask）；
- 7 条 `step/start`；
- **`request/header` 只有 1 条，`reason` 是 `initial`，没有任何一条 `reason: 'change'`**。

七次模型请求、四次权限切换，system 字符串和工具 schema 一个字节都没动。这不是推断，是从录制日志里数出来的。（那份 jsonl 是经过归一化的录制产物，chunk 之类的事件被折叠过，所以别拿它数总事件数；`request/header` 是这个 fixture 专门要 pin 住的东西，它的条数和 `reason` 是可信的。）

---

## 五、`agent/pre-step` 注入链

不在 system 里的上下文，全部走 `agent/pre-step` 这个 waterfall。事件契约在 `packages/core/agent/src/runtime-types.ts:231`：

```ts
'agent/pre-step'(this: Scoped<Agent>, payload: { agent: Agent; messages: UserMessage[]; turn: number; step: number; signal: AbortSignal }, next: () => Promise<PreStepDecision>): Promise<PreStepDecision>
```

默认实现返回 `[...claimed, runtimeSnapshot?]`（`packages/core/agent-loop/src/agent.ts:236-239`）。每个插件都是先 `const decision = await next()` 再改 `decision.messages`。

| 插件 | 监听点 | 插到哪 | 内容框架 |
| --- | --- | --- | --- |
| `dsh-agent-instructions` | `packages/context/agent-instructions/src/index.ts:322` | `toSpliced(lastClaimedIndex + 1, 0, desired)`（`:346`），紧跟用户消息之后、runtime 快照之前 | `<system-reminder>` 包裹的 AGENTS.md 基线 |
| `dsh-tool-skill` 目录 | `packages/skill/tool-skill/src/index.ts:213` | `[...decision.messages, catalog]`（`:248`），追加到尾 | `<system-reminder>` + `<available_skills>` |
| `dsh-tool-skill` 用户显式调用 | `packages/skill/tool-skill/src/index.ts:177` | 目录之后（注册在目录监听器之前，所以是更外层，改得更晚，见 `:166-170` 的注释） | `<skill_content>` 块 |
| `dsh-plan-mode` 叙述 | `packages/plan/plan-mode/src/index.ts:205` | 追加到尾（`:221`） | 切换 plan 模式的通知 |
| `dsh-time-context` | `packages/context/time-context/src/index.ts:170` | `{prepend: true}`（`:208`）⇒ 最外层，最后追加到尾（`:200-206`） | `Time sampled while preparing turn …` 三行读数；**opt-in，默认不装** |
| `dsh-tmux-context` | `packages/context/tmux-context/src/index.ts:218` | `{prepend: true}`（`:246`），仅 `step === 1`（`:223`），前置到最前（`:238-244`） | tmux 位置读数；opt-in |

`agent-instructions` 那行 splice 的注释把顺序意图讲清了（`packages/context/agent-instructions/src/index.ts:343-344`）：

```
// Fold the context right after the claimed batch, so the direct prompt
// precedes it and the driver-appended runtime context follows it.
```

### AGENTS.md / CLAUDE.md 到底怎么被发现

发现逻辑在 `packages/context/agent-instructions/src/files.ts:267-306`：

1. 先 `$DSH_HOME/AGENTS.md`（默认 `~/.dsh/AGENTS.md`，`:280-281`）。文件名固定为 `AGENTS.md`（常量在 `packages/context/agent-instructions/src/render.ts:98`），不受候选列表影响，也没有 local 覆盖版。
2. 再 `findProjectRoot(cwd, ['.git'])` 向上找 marker，找不到就用 cwd 自己（`:299-300`）。
3. 从项目根到 cwd 的目录链（根在前），每个目录先扫 `instructionFileCandidates`（默认 `['AGENTS.md', 'CLAUDE.md']`），再扫 `localInstructionFileCandidates`（默认 `['AGENTS.local.md', 'CLAUDE.local.md']`）；默认值在 `packages/context/agent-instructions/src/config.ts:12-13`。
4. **同一目录里所有存在的候选都加载**，之后按 trimmed 内容 digest 在**该目录内**去重（`packages/context/agent-instructions/src/files.ts:375-383`）。所以你同时放 `AGENTS.md` 和一个内容相同的 `CLAUDE.md`，只会进一份；内容不同则两份都进。

这条规则是 2026-07-21 改的（`.agents/notes/implemented/feature/2026-07-21-instruction-load-all-dedup.md`）；更早的版本是「每目录只取第一个命中的候选」。

### 渲染与预算

渲染在 `packages/context/agent-instructions/src/render.ts`。导语（`:12-14`）：

```
The following workspace instructions may be relevant to your work. Use them as guidance when
applicable. More specific instructions take precedence over broader ones. They do not override
system, developer, or direct user instructions.
```

每个文件一段 `Instructions from: <displayPath>\n\n<content>`（`:86`）。整体包在 `<system-reminder>…</system-reminder>` 里，正文中出现的字面 `</system-reminder>` 被转义成 `<\/system-reminder>`（`:81-83`）。文件内容是不可信输入，不能让它伪造框架边界。

预算是 `maxBytes`，必填，Web 的 `standard` preset 配 65536（`apps/cli/config/agent-presets/standard/agent.cordis.yml:33`）。超预算的处理顺序（`packages/context/agent-instructions/src/render.ts:284-300`）：

1. 全文能装下就直接用；
2. 装不下就从**最宽的那一侧**（项目根方向）整文件往下丢，每丢一个再试；
3. 只剩最具体的那份还是超，就对它做二分截断（`:249-273`）；
4. 前置一条通知（`:224`）：`Workspace instruction budget 65536 bytes: omitted <…>; truncated <…> from A to B bytes`。

### 什么时候刷新

首个 step 注入完整基线（`source.baseline: true`）；之后只有**成功的 `read`/`write`/`edit`** 会触发重新协调（`packages/context/agent-instructions/src/index.ts:70`）：

```ts
const FILE_TOUCH_TOOL_NAMES = new Set(['read', 'write', 'edit'])
```

**没有文件 watcher，shell 命令不算 touch。** 你在 bash 里 `echo >> AGENTS.md`，模型这一轮看不见。resume 时对比 `baselineIdentity` 决定是复用还是发一条「This complete workspace instruction baseline replaces all earlier workspace instruction baselines.」（`packages/context/agent-instructions/src/render.ts:15-16`）；压缩把基线挡住之后，下一个 step 重发完整基线。

为什么不进 system prompt？`.agents/notes/implemented/feature/2026-06-24-workspace-context.md:9` 给的第一个理由是隔离：

> a global system-prompt section leaks one workspace's files into another live ACP session

第二个理由在 `:37`：user-role `<system-reminder>` 是模型熟悉的框架，避免发明一套 harness 专用的 XML 词汇。缓存友好是顺带的好处：改 AGENTS.md 不动 header。

---

## 六、工具 schema 怎么进 prompt

整条路径分四步：

1. **`defineTool`**（`packages/core/tools/src/schema.ts:545`）接收简写的参数表，`parameterSchemaSpecToJsonSchema` 把它编译成 `{type:'object', properties, required?}` 的 JSON Schema（`packages/core/tools/src/schema.ts:449-457`）。工具的 `description` 原样成为 wire 上的 `function.description`。
2. **`ToolRuntime` 构造时注册唯一的 provider**（`packages/core/tools/src/index.ts:832`）：

```ts
ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))
```

3. **`wireSchemas(scope)`**（`packages/core/tools/src/index.ts:980-1000`）按呈现模式分支：`native` 返回该 scope 可见的全部 schema 加 `knownNames`；`code` 只暴露 `run_code`，`knownNames` 也只有它；`both` 全部加 `run_code`。`knownNames` 是「限制之前」的名字全集，用来区分「`toolOrder` 里写错了名字」和「这个 scope 被 `restrict()` 挡住了」。
4. **`orderTools`** 规范化顺序，见 §二。

代码模式下还多两段 prompt，`tools:code-only`（99）在所有 `tool:*`（100–199）之前，`tools:sdk`（150）在它们之后。为什么这么排，注释解释得很清楚（`packages/core/tools/src/index.ts:843-850`）：

> Every tool contributes its own guidance section naming its tool, none of them qualify how that tool is reached … Without this the model reads a catalog of tools it is told to use and no statement that only `run_code` may be called, so it emits a native call, receives `UNKNOWN_TOOL` for a tool the prompt just declared, and concludes the deployment is inconsistent.

`code-mode-turn` 的 fixture 里可以看到实际效果：`examples/acp-agent/tests/snapshots/code-mode-turn/system-prompt.expected.md` 有 28 KB，第 7 行就是那句 `` `run_code` is the only tool you can call directly ``，后面跟着生成的 TypeScript 声明块。

### 「一个事实一个 owner」

工具说明为什么要拆成 description 和 section 两处？`.agents/notes/implemented/architecture/2026-07-05-prompt-variables-and-tool-guidance-ownership.md` 的 Decision 段写了这条规则：

> **One principle: every fact in the prompt has exactly one owner.** … Per-tool semantics and when-to-use → the tool's `description`. Cross-call habits a description cannot carry → the tool package's prompt section. The product name and SDK identity line → the static `harness:identity` section. Deployment role and behavior → the deployment's persona.

按这条规则，`todo_write`、`ask_user_question`、`skill` 都**没有** section，它们的 description 已经写全了契约。而 `bash` 需要一段 section，因为「每次结果都要看 exit code」是跨调用的习惯，塞进 description 里每次都要重复。

同一篇笔记还记着这套规则解决的具体问题：以前 shell/subagent/todo 的用法指导是手写在 coding-agent 和 ACP 两份 persona 字符串里的，「two drifting copies (the ACP one was already abridged)」，装一个插件要去改每个部署的 YAML。

---

## 七、scope 如何改变某个 agent 的 prompt

scope key 就是 agent 对象本身。`assembleContextFor(agent, signal)` 返回 `{agent, scope: agent, signal}`（`packages/core/agent/src/dispatch.ts:174-176`），而 `ReactLoopAgent` 构造时建自己的 scope（`packages/core/agent-loop/src/agent.ts:94-95`）：

```ts
this.scope = createScope(loopCtx, this)
this.ctx = this.scope.ctx.extend({ agent: this })
```

任何用 `agent.ctx` 调 `systemPrompt.*` 的注册都落在这一层。

**preset** 是中间一层。`apps/cli/config/agent-presets/<name>/agent.cordis.yml` 每进程挂载一次到一个 standing scope，session 通过 scope 父链加入，于是链是 `agent → preset → global`。Web bundle 把 base 里所有 agent 级的工具行全部 `disabled: true`，改由 preset 挂，所以 **Web 下模型看到的工具和段落几乎完全由 preset 决定**。`packages/bundle/web-app/cordis.patch.yml` 里每一段禁用都带着注释解释 host 平面与 agent 平面的判据。

**子代理**走 `applyChildComposition`（`packages/subagent/subagent/src/child-agent.ts:163-175`）：

```ts
childCtx.get('agentPresets')?.composeFrom(childCtx, parent.ctx)
// Order 120: after the sandbox:policy (110) and approval:policy (115) sentences.
childCtx.systemPrompt.context({ name: 'subagent:delegation', order: 120, text: SUBAGENT_DELEGATION_CONTEXT })
if (composition.persona !== undefined) {
  childCtx.systemPrompt.section({ name: 'deployment:persona', order: 0, text: composition.persona })
}
if (composition.toolFilter !== undefined) childCtx.tools.restrict(composition.toolFilter)
```

先加入父的 preset，再装自己那几样，全部落在 child scope 上，父和兄弟看不见。driver 还会额外装 `tool:report`（117）或 `tool:structured_output`（190）。对照 `examples/acp-agent/tests/snapshots/subagent-report/system-prompt.1.expected.md` 与父的版本，差别就是末尾多了一段 `Deliver your result with the report tool…`。

**persona 的替换机制就是同名遮蔽**，所以 `PERSONA_SECTION` 这个常量被导出（`packages/core/system-prompt/src/index.ts:128`）：preset 行、子代理、系统默认三处都必须用完全相同的字符串 `'deployment:persona'`，写错一个字就会变成两段 persona 并存。`dsh-persona` 这个 row 只能在 scope 里挂，全局挂会跟服务自己的注册撞名而 fail loud；模块头注释把这个约束当成了这个包存在的理由（`packages/preset/persona/src/index.ts:4-12`）。

---

## 八、想改 prompt，先分类

上游把「这句话该放哪」做成了硬规则，改之前先对号入座，否则你多半会在错的地方写出第二份副本：

| 你想加的东西 | 放哪 | 为什么 |
| --- | --- | --- |
| 某个工具「怎么调、什么时候用」 | 那个工具的 `defineTool({description})` | 单次调用语义，模型看 schema 时就要知道 |
| 某个工具「跨调用的习惯」（每次都要看 exit code、别 busy-poll） | 那个工具包里的 `ctx.systemPrompt.section({name: 'tool:xxx', order: 100-199})` | description 里重复写会随每次调用重复计费，而且描述不该讲跨调用纪律 |
| 部署的角色与行为风格 | `system-prompt` 行的 `persona` 配置，或 preset 里的 `dsh-persona` 行 | 换部署换 persona，不动任何插件 |
| 一个运行时会变的事实（当前模式、当前策略） | `ctx.systemPrompt.context({...})` | 走 user 快照，不打断缓存前缀 |
| 一个会话级、模型必须遵守但来自文件的东西 | AGENTS.md / CLAUDE.md | 走 `<system-reminder>` user 消息，随会话历史一起被压缩与恢复处理 |
| 一段按需加载的长指令 | skill | 目录只放一行描述，正文按需 `skill` 工具加载 |
| 模型名、工作目录这类 harness 已知的事实 | `{{model}}` / `{{cwd}}` 变量 | 手写一遍就会漂移 |
| 完全自定义、丢掉一切默认内容 | `complete: true` 的 persona | 唯一能让所有其它 section 消失的机制 |

注意一个常见误解：**`systemPrompt.tools(provider)` 不是给你加工具说明的地方**。全仓只有 `ToolRuntime` 在构造时注册这一个 provider（`packages/core/tools/src/index.ts:832`），你想加工具走 `ctx.tools.register(defineTool({...}))`，schema 会自动进入下一次装配。

如果你要做的是「让某个 agent 用 Code Mode 看工具」，那是 `tools.presentAs(mode)`（`packages/core/tools/src/index.ts:946`）。它只能在 scope 里调（`:948-950` 显式拒绝全局调用），一个 scope 只能声明一次（`:955-957`），并且会顺手在该 scope 上注册 `tools:code-only` 与 `tools:sdk` 两段（`:967-970`）。这是「一个 preset 用 Code Mode、另一个 preset 用 native、同一个进程」的实现方式。

## 九、代价与失效点

1. **默认 prompt 极简，没有通用行为规范。** 一句身份 + 一句 persona + 每个工具一句话，没有 Claude Code 那种「简洁作答 / 安全 / 代码风格 / 不要过度承诺」的行为章节。可以理解为「harness 不替部署做产品决策」，但默认体验偏薄，行为质量高度依赖模型自身和用户的 AGENTS.md。
2. **18 段一句话散文平铺，没有标题。** `join('\n\n')` 就是全部结构。唯一自带 markdown 标题的是 `tool:cordis`。同 order 的 tie-break 依赖注册顺序，上游 README 自己承认这是 plugin-load artifact。
3. **`plan:policy` 和 `{{model}}` 是两个「稳定 system」的例外。** 进入 plan 模式会让 order 50 从空变成六段文字，整个前缀作废；UI 切模型会让 `{{model}}` 变，persona 那一段跟着变。plan-mode 的配置注释显式接受了这个代价：「The tool catalog stays the same across modes for request-cache stability」：保住工具目录，牺牲 system 字符串。
4. **没有转义语法。** persona 里写不了字面 `{{x}}`。
5. **runtime 快照是完整重发不是 diff。** 任一 context 变化就重发全部三段。好处是原子、可比对；代价是历史里累积多份快照，靠导语让模型忽略旧的。
6. **每个 step 都重新 `assemble()`。** provider 都是同步函数，通常够快；但 `app:web-surface` 这种函数型 section 每步求值，如果某个插件在 provider 里做重活，会拖慢每一步。
7. **AGENTS.md 只在 fs 工具 touch 后刷新。** shell 里改文件看不见。这是显式取舍，不是 bug。
8. **默认工具顺序是字典序，与重要性无关。** `ask_user_question` 排第一、`write` 排最后。可以用 `toolOrder` 改，但要部署自己写，而且写错名字要到第一个 turn 才炸。

---

## 十、别人怎么做

Claude Code 闭源，下表关于它的内容全部来自官方公开文档（`code.claude.com/docs` 的 memory / context-window / prompt-caching 三页），不使用任何泄露的 prompt 转储；Codex / OpenCode / pi / mini-swe-agent 是读源码得来的。

| harness | system prompt 从哪来 | 动态上下文放哪 | 指令文件 |
| --- | --- | --- | --- |
| **dsh** | 插件注册的 section 按 order 拼接，无中心文件；`renderPrompt` 四行 | user-role 快照追加到历史尾部，仅变化时追加 | AGENTS.md/CLAUDE.md → user-role `<system-reminder>` 基线，fs 工具 touch 触发增量 |
| **Claude Code** | 中心大 prompt（官方 context-window 页给的示例数据约 4.2k token，标注为 illustrative）+ 工具定义 + output style，分层排序保缓存 | `<system-reminder>` 注入 user 消息；`excludeDynamicSections` 可把环境块也移出 system | CLAUDE.md **作为 user message 交付**，官方文档明说「delivered as a user message after the system prompt, not as part of the system prompt itself」；沿目录树向上全量拼接，子目录惰性加载 |
| **Codex** | `instructions` 来自 `ModelInfo.instructions_template`，**模型元数据的一部分，可由 `/models` 端点服务端下发**，客户端只填 `{{ personality }}` | `WorldState` 分节，developer/user role，首轮全量、之后只发 diff，merge-patch 持久化 | `AgentsMdState` 是 user role，渲染成 `# AGENTS.md instructions for {dir}\n\n<INSTRUCTIONS>…</INSTRUCTIONS>` |
| **OpenCode** | 按模型族选主提示文件（`anthropic.txt` / `gpt.txt` / `codex.txt` / `gemini.txt` …），再 join env + 指令 + MCP + skills 成**一条 system 消息** | `<env>` 段在 system 里（含 `Today's date`）；plan-mode reminder 走 user part | 全局 `~/.config/opencode/AGENTS.md`，项目侧 `findUp` 首个命中的文件名类别为准（明确避免堆叠所有祖先） |
| **pi** | 一段默认文本（可被 `.pi/SYSTEM.md` 整体替换）+ `APPEND_SYSTEM.md` + `<project_context>` + skills + `Current working directory` | 基本没有：system 里无日期、无平台、无 git 状态，cwd 是唯一环境变量 | `AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md`，每目录取第一个存在的，从 cwd 一路向上到文件系统根 |
| **mini-swe-agent** | 两段 Jinja2 模板：`system_template`（默认只有一句 `You are a helpful assistant that can interact with a computer.`）+ `instance_template`（任务 + 规则 + 环境 + 示例） | 环境信息 `{{system}} {{release}} …` 在 **instance（user）消息**里 | 无 |

几个观察：

- **「动态信息进 user 消息」是行业共识**，dsh、Claude Code、Codex 走的是同一条路，只是 role 不同（dsh 用 user 是因为 DeepSeek wire 没有 developer role）。OpenCode 和 pi 把环境放 system 里，OpenCode 甚至把 `Today's date` 放进去，那意味着每天缓存必断一次。
- **dsh 是唯一没有中心 prompt 文件的**。别人都有一个可以打开来读的 `.txt` 或模板，dsh 只有分散在二十多个包里的一句话。可组合性最好，可读性最差。
- **Codex 把 prompt 从发版里解耦出去了**：模板随模型元数据下发。这是 dsh 做不到也没打算做的事。
- **只有 dsh 和 Codex 有「结构化的 owner 规则」**（每个事实一个 owner / WorldState 分节）；Claude Code 与 OpenCode 是一大段中心散文加若干注入点。

---

## 十一、怎么自己核

不需要凭据，全部在 checkout 里跑：

```sh
# 1. 全部 section 贡献者，一个不漏
grep -rn "systemPrompt.section({" packages/ --include=*.ts | grep -v /tests/ | sort

# 2. 全部 runtime-context 贡献者（应该恰好三处）
grep -rn "systemPrompt.context(" packages/ --include=*.ts | grep -v /tests/

# 3. 全部 prompt 变量（应该恰好三个）
grep -rn "systemPrompt.variable(" packages/ --include=*.ts | grep -v /tests/

# 4. 渲染好的 prompt 长什么样：13 份录制快照
find examples apps -name 'system-prompt.expected.md' | xargs wc -c

# 5. 工具字典序
node -e "const j=require('./examples/acp-agent/tests/snapshots/text-turn/tool-schemas.expected.json'); console.log(j.initial.map(t=>t.name).join(', '))"

# 6. 「切权限不动 header」的证据：4 条快照、7 个 step、1 条 request/header
node -e "const fs=require('fs');const L=fs.readFileSync('apps/web/tests/snapshots/permission-policy-context/session.jsonl','utf8').trim().split('\n');const c={};for(const l of L){const e=JSON.parse(l);c[e.type]=(c[e.type]||0)+1}console.log(c)"
```

单元测试是最好的规则说明书：`packages/core/system-prompt/tests/system-prompt.spec.ts`（582 行，覆盖插值规则、`complete`、waterfall、change 事件回滚）、`scoped.spec.ts`（226 行，scope 遮蔽）、`tool-order.spec.ts`（115 行）。runtime 快照那套逻辑在 `packages/core/agent-loop/tests/loop.spec.ts:357` 起的几个用例里，用例名字本身就是规格：「materializes changed runtime context at the history tail without rewriting the system header」。

带 `DEEPSEEK_API_KEY` 的缓存端到端在 `packages/core/agent-loop/tests/request-cache.e2e.ts`，本系列**跑过了**，通过（记录见 [research/runtime-evidence](../research/runtime-evidence/2026-08-16-deepseek-cache-probe.md)）。上面引用的 256 / 14.7k 那组数字仍然来自上游笔记，但「策略进 system 会把命中打到只剩 256 token」这个结论我们自己也独立测出来了，见 [02 KV-Cache](02-kv-cache.md)。

---

下一篇 [02 KV-Cache](02-kv-cache.md) 把「前缀边界在哪、什么会打断它」讲完：本篇讲清了 system 和 tools 两块为什么设计成不变，那一篇讲历史那一块怎么保持只追加，以及压缩这个唯一会重写头部的操作怎么把损失降到最小。
