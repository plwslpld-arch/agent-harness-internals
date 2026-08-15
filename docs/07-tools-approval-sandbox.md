---
title: 工具、审批与沙箱：到底什么时候会弹窗
sources: [{"repo":"deepseek-harness","path":"packages/core/tools/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/sandbox/sandbox/src/escalation.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/interaction/user-approval/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# 工具、审批与沙箱：到底什么时候会弹窗

## 先纠正一句话

本仓库早先的版本这么开篇：「改文件前弹窗问你 —— 这就是 approval seam」。这句话是错的，而且错得挺关键。

在默认组合下（`packages/bundle/base/cordis.patch.yml` 那套，沙箱 `workspace-write` + 审批 `ask`），模型调 `write`、`edit`、`bash` 都**不会弹窗**。安全边界不是弹窗，是沙箱：`bash` 的 argv 被 bwrap / Landlock / Seatbelt / Windows 受限令牌包住，`write`/`edit` 在进程内被路径围栏挡住。弹窗只在两种情况下出现：

1. **沙箱真的拒绝了，模型请求升级**——它在同一个工具调用里带上 `sandbox_permissions` + `justification` 重试，这次重试会问人；
2. **`tools/pre-execute` 有插件返回了 `ask`**——在 commit 47f9438 的整个仓库里，唯一会返回 `ask` 的是 Claude Code 方言的 hook 桥（`packages/hooks/hooks-claude-code/src/index.ts:242`），而默认组合**没有挂任何 hooks 桥**。

所以"审批"在 dsh 里不是一个逐调用的确认流程，而是一个**升级通道**。下面这篇讲清楚这三层——工具、审批、沙箱——各自管什么、代码在哪、模型看到什么。

## 先看见：两条真实的日志

### 一次真的弹了窗

上游的 `escalation-approved` 端到端快照记录了完整过程（`examples/acp-agent/tests/snapshots/escalation-approved/`，跑在 `DSH_PERMISSION_MODE=workspace-write` 下）。抽掉流式碎片后：

```text
user/message      "…Retry it now exactly once: one single bash call with the command
                   printf 'escalated\n' > /tmp/dsh-escalated.txt && … , with
                   sandbox_permissions set to danger-full-access and the justification …"
user/message      "Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

                   Current DSH file policy: workspace-write. Any available operation enforced by the
                   DSH file sandbox may modify files under the session workspace: \"…\". Some platform
                   temporary areas may also be writable.

                   Approval policy: ask. Operations that require approval may ask through the
                   configured answerers; without an available answerer, the request fails closed."
request/header    {"reason":"initial"}
assistant/message tool-call bash {"command":"printf 'escalated\n' > /tmp/dsh-escalated.txt && …",
                                  "description":"Write file outside workspace and verify",
                                  "sandbox_permissions":"danger-full-access",
                                  "justification":"the user asked to write a file outside the workspace"}
tool/call         seq 133
approval/asked    seq 134 {"toolName":"bash","callId":"call_00_d0sA…",
                           "reason":"escalate sandbox to danger-full-access: the user asked to write a file outside the workspace"}
approval/decided  seq 135 {"outcome":"allowed-once"}
tool/result       seq 136 content "escalated\n"  isError:false
turn/end          {"reason":{"kind":"completed"}}
```

几件事：`sandbox_permissions` 和 `justification` 是 `bash` 工具 schema 上的两个字段，不是内部机制——**是模型自己决定要升级**。审批的 `reason` 字段把模型写的理由原样拼进去，人看到的就是它。`approval/asked` 和 `approval/decided` 是一对 log-only 事件（不进模型历史，只进审计）。而这个 grant 只作用于这一次调用：`allowed-once` 的字面意思。

### 一次是 hook 要求的

`hook-cc-pretool-ask` 快照挂了 Claude Code 方言的 hook 桥，PreToolUse 返回 `ask`：

```text
tool/call        seq 58  bash {"command":"echo HELLO","description":"Echo HELLO"}
hook/invoked     seq 59  {"point":"PreToolUse","dialect":"claude-code","matcher":"bash"}
hook/result      seq 60  {"point":"PreToolUse","decision":"ask","exitCode":0}
approval/asked   seq 61  {"toolName":"bash","callId":"…","reason":"bash requires manual approval in this session"}
approval/decided seq 62  {"outcome":"rejected"}
tool/result      seq 63  content "Error: the user rejected tool \"bash\""  isError:true
```

注意 `tool/call` 在 `hook/invoked` **之前**就落盘了——先记录模型要做什么，再决定让不让做。还有 `tool/result` 的文案 `Error: the user rejected tool "bash"`，这是 `ToolRuntime` 四种拒绝文案里的一种，后面会全部列出来。

## 三个正交旋钮

dsh 把权限拆成三个互不包含的东西。搞混它们是理解这套系统最大的障碍。

| 旋钮 | 取值 | 存在哪 | 谁写 |
| --- | --- | --- | --- |
| **sandbox mode**（文件效果边界） | `read-only` / `workspace-write` / `danger-full-access` | 会话日志的 `sandbox/mode` 事件（log-only），没有就用 `sandbox-policy` 的部署默认 | `setSandboxMode(session, mode)`（`packages/sandbox/sandbox-policy/src/session-mode.ts:69-71`） |
| **approval policy**（要不要问人） | `ask` / `never` | 会话日志的 `approval/policy` 事件，没有就用 `user-approval` 的配置默认 | `setApprovalPolicy(session, policy)` / `ctx.approval.setPolicy(agent, policy)` |
| **tool 可见性**（模型能看见什么） | 由组合决定：`tools.restrict({allow,deny})` + preset 挂了哪些工具包 | 不进日志，是组合事实 | `ctx.tools.restrict(...)`（`packages/core/tools/src/index.ts:1071`） |

`SandboxMode` 只管**文件效果**，源码注释写得很直白（`packages/sandbox/sandbox/src/index.ts:23-29`）：`read-only` 只放行必需的 sink（如 `/dev/null`），`workspace-write` 再加上工作区和后端定义的临时区，`danger-full-access` 直接跳过约束；"Network and process visibility are outside this vocabulary"。也就是说：**沙箱不管网络，不管进程可见性，不管凭据**。`bash` 里 `curl` 一个内网地址，沙箱不会拦。

`permission preset` 是这两个旋钮上面的一层产品化封装，不是第四个旋钮。默认表在 `packages/bundle/base/cordis.patch.yml:196-205`：

```yaml
        presets:
          read-only:
            sandbox: read-only
            approval: ask
          workspace-write:
            sandbox: workspace-write
            approval: ask
          danger-full-access:
            sandbox: danger-full-access
            approval: never
```

插件自带的 schema 默认表只有两项（`packages/interaction/permission-presets/src/index.ts:168-175`），bundle 补了 `read-only`。选一个 preset 写一条 `permission/preset` 事件（纯"用户意图"记录），然后按需分别写 `sandbox/mode` 和 `approval/policy`；两个旋钮的值凑不出任何一个 preset 时，派生状态是 `custom`。每个新会话发布前，`pinInitialPermission`（`packages/interaction/permission-presets/src/index.ts:400-430`）把三条事件补齐，于是"这个会话当时是什么权限"永远能从日志本身重建。

默认部署值：`DSH_PERMISSION_MODE ?? 'workspace-write'`，审批是 `danger-full-access ? 'never' : 'ask'`（`packages/bundle/base/cordis.patch.yml:175`、`:191`）。

## 谁会真的调用 `ctx.approval.request()`

整个 commit 里只有两个调用点：

1. **沙箱升级**：`approveEscalation`（`packages/sandbox/sandbox/src/escalation.ts:157-189`），被 `bash`/`pwsh`（`packages/shell/tool-bash/src/index.ts:213-233`）和 `write`/`edit`（`packages/fs/tool-fs/src/sandbox.ts:97`）共用。
2. **`tools/pre-execute` 返回 `ask`**：由 `ToolRuntime.serviceAsk` 转成一次 `request()`（`packages/core/tools/src/index.ts:1689-1729`）。

其余出现 `approval/request` 字样的地方都是**回答方**（answerer），不是发起方：ACP 桥（`packages/acp/acp/src/index.ts:215`）和 Web 客户端的 api-proxy（`packages/host/apiproxy/src/api-proxy.ts:1422`）。答不上来就是答不上来——零监听器时 waterfall 落到默认值 `'unavailable'`，消费方一律按拒绝处理。

`ApprovalService.request()` 本身很短（`packages/interaction/user-approval/src/index.ts:257-276`）：

```ts
  async request(req: ApprovalRequest): Promise<ApprovalOutcome> {
    const session = req.agent.session
    if (!hasOpenTurn(session.events)) {
      throw new Error(
        'approval.request() outside an open turn: the approval/asked + approval/decided audit pair '
        + 'must be turn-enclosed (a bare event between turns is crash-tail garbage on reload). '
        + 'Ask from inside the turn that needs the decision.',
      )
    }
    const id = ApprovalRequestId(randomUUID())
    session.append('approval/asked', { … })
    const outcome = await this.decide(req, session)
    session.append('approval/decided', { id, outcome })
    return outcome
  }
```

`never` 策略在 waterfall **之前**就短路了（`packages/interaction/user-approval/src/index.ts:312`）：

```ts
    if (this.effectivePolicy(session) === 'never') return 'rejected'
```

上面那行的注释解释了为什么不做成监听器：一个用 `prepend: true` 后挂的监听器会排在任何"网关式监听器"前面，那样 `never` 就没法保证确定性了；只有服务自己的 `request` 路径能守住这个承诺。

结果只有四种（`packages/interaction/user-approval/src/types.ts:29`）：`allowed-once | rejected | cancelled | unavailable`。第一个是唯一的通过，其余三个全是拒绝，但**拒绝理由文案不同**，好让模型分得清"人说不行"和"这儿根本没人能答"。

## 完整工具目录：默认组合下模型看得见什么

下面这张表覆盖默认 bundle（`packages/bundle/base/cordis.patch.yml`）与 CLI 的 `standard` preset（`apps/cli/config/agent-presets/standard/agent.cordis.yml`）。描述原文摘自上游自动生成的目录 `docs/tool-catalog.md`（那份文件是**启动真实插件后读 `ctx.tools.schemas()`** 生成的，所以就是模型收到的字面文本）。"并发"一列的判据是 §「并发分类」。

| 工具 | 模型看到的描述（摘要，原文见目录） | 并发 | 在哪 |
| --- | --- | --- | --- |
| `bash` | "Execute a bash command (`bash -c`)… Each call runs in a fresh shell: no state (cwd, variables, functions) persists between calls — pass `workdir` instead of using `cd`. Non-zero exits are reported as `[exit code: N]`… a blocked file operation is reported as `[sandbox: file access denied under <mode> mode]` — a policy denial, not a bug in the command; do not retry another way… Set `run_in_background: true`…"（`docs/tool-catalog.md:180`） | exclusive | 两处（非 Windows） |
| `pwsh` | 同上的 PowerShell 版；多一句 "On Windows a force-killed command settles as `[exit code: 1]` without a signal marker"（`docs/tool-catalog.md:224`） | exclusive | 两处（Windows） |
| `read` | "Read a UTF-8 text file and return line-numbered content."（`docs/tool-catalog.md:638`） | **parallel** | 两处 |
| `write` | "Create or fully replace a UTF-8 text file."（`docs/tool-catalog.md:688`） | exclusive | 两处 |
| `edit` | "Edit an existing UTF-8 text file by replacing literal text."（`docs/tool-catalog.md:603`） | exclusive | 两处 |
| `read_image` | "Read a PNG/JPEG/WebP/GIF file and return the image itself. Requires the current model to accept image input."（`docs/tool-catalog.md:667`） | **parallel** | 两处 |
| `glob` | "Find files whose paths match a glob pattern… Up to 100 paths come back in modification-time order; a larger result instead returns 100 paths sampled across top-level entries…"（`docs/tool-catalog.md:720`） | exclusive | 两处 |
| `grep` | "Search file contents with a ripgrep regular expression… Returns the first 250 matches inline; a capped result reports where the complete match list was saved."（`docs/tool-catalog.md:745`） | exclusive | 两处 |
| `str_replace_editor` | "Custom editing tool for viewing, creating and editing files"（`docs/tool-catalog.md:533`） | exclusive | 仅 base bundle |
| `job_output` | "Read a background job. Stream jobs return only output since the previous read… Every response ends with `[status: ...]`. Reads are non-blocking unless `wait: true`…"（`docs/tool-catalog.md:1651`） | exclusive | 两处 |
| `job_list` / `job_kill` | 列出 / 请求终止后台任务（`docs/tool-catalog.md:1638`、`:1613`） | exclusive | 两处 |
| `todo_write` | "Send the ENTIRE list every call — it REPLACES the previous list (there are no partial updates, no per-item edits)… Mark every todo being actively worked on `in_progress`…"（`docs/tool-catalog.md:1686`） | exclusive | 两处 |
| `skill` | "Load the full instructions for an available skill. Call this with the exact skill name from the session skill catalog…"（`docs/tool-catalog.md:1215`） | exclusive | 两处 |
| `exit_plan_mode` | "Use only in plan mode. Present your plan for the user's review and, on approval, leave plan mode…"（`docs/tool-catalog.md:153`） | exclusive | 两处 |
| `subagent` | "Delegate a self-contained task to a subagent… Give it a complete, standalone prompt: it does not see this conversation. This call waits for the result by default. Set `run_in_background: true`…"（`docs/tool-catalog.md:1475`） | **parallel** | 两处 |
| `subagent_fork` | 同包第二实例，绑 fork 后端 | **parallel** | 两处 |
| `send_message` / `interrupt_agent` / `list_agents` | 给后台子代理续发下一 turn / 取消其当前 turn / 列出子孙（`docs/tool-catalog.md:1554`、`:1511`、`:1532`） | exclusive | 两处 |
| `report` | "Report selected content to the agent that started you… only your direct parent receives it"（`docs/tool-catalog.md:1586`）——**只注册在 continuable 子 agent 的 scope 里** | exclusive | 两处（宿主平面注册） |
| `workflow` | "Run a JavaScript workflow script that orchestrates subagents at scale…"（`docs/tool-catalog.md:1736`） | exclusive | 两处 |
| `ralph` | "Run a foreground fresh-agent Ralph loop toward one immutable objective. Use only when the direct human explicitly asks for Ralph or fresh-agent iteration…"（`docs/tool-catalog.md:1184`） | exclusive | 两处 |
| `create_goal` / `get_goal` / `update_goal` | 同会话持久目标；create/edit/pause/resume 要求直接人类根权限（`docs/tool-catalog.md:945`、`:970`、`:983`） | exclusive | 两处 |
| `web_search` | "Search the web for current information. Returns an optional summary answer and a list of source URLs."（`docs/tool-catalog.md:1852`） | **parallel** | 两处 |
| `ask_user_question` | "Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding…"（`docs/tool-catalog.md:47`） | exclusive | 仅 standard preset |

三点要注意：

- `web_fetch` 存在但**默认关掉**（`packages/bundle/base/cordis.patch.yml:417` 的 `fetch: false`），注释写明理由是这个 provider 把 SSRF 防护推给了调用方而请求目标由模型选。
- `run_code` 是保留名，只在 `tools.mode` 为 `code`/`both` 时出现；默认组合注释明说保持 `native`（`packages/bundle/base/cordis.patch.yml:422-423`）。见 [09 扩展与 Code Mode](09-extensions-and-code-mode.md)。
- `terminal_*`、`lsp`、`session_*`、`cordis_*`、`schedule_*` 都在仓库里但不在这两套组合中。

发给模型的 schema 是投影过的（`packages/core/tools/src/index.ts:1234-1236`、`:1256-1267`）：只有 `name` / `description` / `parameters` 三个字段出去，`timeoutMs`、`isConcurrencySafe`、`presentCall`/`presentResult` 这些**永远不发给模型**。

### 并发分类

一个调用能不能和兄弟调用重叠，由工具自己的一个同步纯函数决定（`packages/core/tools/src/index.ts:1276-1285`）：

```ts
  executionMode(exec: ToolExecutionInput): ToolExecutionMode {
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== undefined)
    if (!tool?.isConcurrencySafe) return { kind: 'exclusive' }
    try {
      const concurrencySafe: unknown = tool.isConcurrencySafe(exec.arguments)
      return concurrencySafe === true ? { kind: 'parallel' } : { kind: 'exclusive' }
    } catch {
      return { kind: 'exclusive' }
    }
  }
```

fail-closed 到了偏执的程度：未声明、返回了别的东西、抛异常、工具不存在，一律 exclusive。而且 `defineTool` 会先校验参数再调分类器，参数非法直接当 exclusive（`packages/core/tools/src/schema.ts:610-615`）。整个仓库里 opt-in 的一共 8 处，用 `grep -rn "isConcurrencySafe" packages/*/*/src/*.ts` 一眼能数完。调度细节见 [03 Agent Loop](03-agent-loop.md)。

## `ToolRuntime` 的执行流水线

一次工具调用的完整路径是六段：`createExecution` → `tools/pre-execute` → guard → `tools/execute` → 工具体 → `tools/post-execute` → `finalizeContent` → `tools/result`。前两段和 guard 打包在 `prepareExecution`（`packages/core/tools/src/index.ts:1463-1507`）：

```ts
      const carrier = scopeTarget(this, exec.agent)
      const gate = await this.ctx.waterfall(
        carrier, 'tools/pre-execute', exec,
        () => Promise.resolve<PreToolDecision>({ kind: 'allow' }),
      )
      const askResolution: ToolAskResolution = gate.kind === 'ask'
        ? await this.serviceAsk(exec, gate)
        : { decision: gate, approvalCancelled: false }
      const { decision } = askResolution
      if (this.callerCancelled(exec) && askResolution.approvalCancelled) {
        return await next({ kind: 'post-result', exec, result: toolAbortedBeforeDispatchResult() })
      }
      const denialReason = decision.kind === 'allow'
        ? this.guardReason(exec)
        : decision.reason
      if (denialReason !== undefined) {
        return await next({
          kind: 'post-result',
          exec,
          result: this.materializeFinalResult({
            content: [{ type: 'text', text: `Error: ${denialReason}` }],
            isError: true,
            error: { message: denialReason },
          }),
        })
      }
```

读法：

- `tools/pre-execute` 是 waterfall，默认 `{kind:'allow'}`，三种决定 `allow | deny{reason} | ask{reason?}`（`packages/core/tools/src/index.ts:588-591`）。
- `ask` 走审批服务，`allowed-once` 才继续。
- **guard 在 pre-execute 之后**，而且是单调的：任何 guard 返回字符串就拒绝，没有 guard 能把别的 guard 拒掉的调用放行（`packages/core/tools/src/index.ts:1110-1116`）。顺序是全局层先、再 scope 链由远到近（`:1119-1128`）。
- 被拒绝的调用**仍然会走 post-execute**（返回的是 `post-result`），所以 hooks 的 PostToolUse 一样看得到它。
- 拒绝的模型可见文本统一是 `Error: <reason>`。

### `createExecution`：进流水线之前就可能被毙掉

`createExecution`（`packages/core/tools/src/index.ts:1364-1451`）做三件事：把参数 `snapshotJsonValue` + `deepFreeze`（工具拿到的永远是冻住的快照，不是模型给的活对象）、分配执行 token、以及一个容易被忽略的早拒。

在 Code Mode 下，模型只应该调 `run_code`；如果它直接点名了别的工具，`createExecution` 会**在策略流水线之前**直接返回终态（`packages/core/tools/src/index.ts:1423-1444`）：

```ts
      if (collapsed) {
        // The collapse denies the call before the policy pipeline, but a
        // pre-dispatch abort still keeps the established cancellation
        // contract: `prepare`'s caller-cancellation check is skipped for
        // final-results, so honor the abort here instead of surfacing
        // `UNKNOWN_TOOL` on an already-cancelled call.
        if (signal.aborted) {
          return { kind: 'final-result', exec: execution, result: toolAbortedBeforeDispatchResult() }
        }
        // The name IS visible here, so the denial carries the route the model
        // must take instead. Without it the model reads a bare `unknown tool`
        // for a tool the prompt just declared and concludes the deployment is
        // broken rather than correcting itself.
        return {
          kind: 'final-result',
          exec: execution,
          result: toolErrorResult(new ToolNotFoundError(
            name,
            `only \`${RUN_CODE_NAME}\` is callable directly — call \`${name}\` from inside a \`${RUN_CODE_NAME}\` program instead`,
          )),
        }
      }
```

设计理由写在注释里：一个注定失败的调用不能让 pre-execute 监听器、审批、guard 看见——更不能被它们"批准"。这跟真正的未知工具名不同：未知名仍走原来的 dispatch 阶段 `UNKNOWN_TOOL` 路径，好让策略监听器看到每一个到过注册表的名字。

### 四种拒绝文案

`serviceAsk`（`packages/core/tools/src/index.ts:1689-1729`）把审批结果映射成拒绝原因，四种文案各不相同：

```ts
    const approval = this.ctx.get('approval')
    if (approval === undefined) {
      return {
        decision: { kind: 'deny', reason: ask.reason ?? `tool "${exec.name}" requires approval (not yet supported)` },
        approvalCancelled: false,
      }
    }
    if (exec.agent === undefined) {
      return {
        decision: { kind: 'deny', reason: `tool "${exec.name}" requires approval, but the call has no agent to route it through` },
        approvalCancelled: false,
      }
    }
```

后面三种来自审批结果本身：

| 结果 | 模型看到的 `tool/result` 文本 |
| --- | --- |
| `allowed-once` | 正常执行 |
| `rejected` | `Error: the user rejected tool "<name>"` |
| `cancelled` | `Error: approval for tool "<name>" was cancelled` |
| `unavailable` | `Error: tool "<name>" requires approval, but no approval channel is available` |

沙箱升级那条路的文案是另一套（`packages/sandbox/sandbox/src/escalation.ts:184-186`）：`the user rejected escalating this <subject> to "<mode>"` / `approval for escalating to "<mode>" was cancelled` / `sandbox escalation to "<mode>" requires approval, but no approval channel is available`。**两套文案刻意不复用**，因为模型需要分清"这个工具要批准"和"这次升级要批准"。

### `ABORTED` 与 `ABORTED_BEFORE_DISPATCH`

取消有两个码，判据是"工具体有没有被调用过"（`packages/core/tools/src/index.ts:1518-1529`）：

```ts
  private cancellationResult(exec: ToolRunContext, prior?: ToolExecutionResult): ToolExecutionResult {
    const state = this.cancellationStates.get(exec)
    /* v8 ignore next -- only registry-minted executions reach the staged scheduler methods */
    if (state === undefined) throw new Error('tool registry scheduler invariant violated: missing cancellation state')
    return state.bodyInvoked
      ? toolAbortedResult(prior)
      : toolAbortedBeforeDispatchResult(prior)
  }
```

`bodyInvoked` 只在 `dispatchToolBody` 真正要调 `tool.execute` 的那一瞬间置位（`packages/core/tools/src/index.ts:1532-1560`）。所以：进了工具体再取消 → `ABORTED`（文本 `Error: tool call aborted`）；派发前就取消 → `ABORTED_BEFORE_DISPATCH`（文本 `Error: tool call aborted before dispatch`）。这两个码就是前面 `cancel-tool-calls` 快照里那对结果的来源。还有一种 `ABORTED_BEFORE_DISPATCH` 不经过 `ToolRuntime`：调度器在取消后给**根本没启动**的调用补写合成结果，那是 agent-loop 干的，见 [03 Agent Loop](03-agent-loop.md)。

### `fuseToolSignals`：取消不会丢

`tools/execute` 是"环绕派发"的 waterfall，wrapper 可以替换 `exec.signal`（超时策略就是这么加 deadline 的）。问题是：wrapper 换了 signal 之后，调用方的原始取消还灵不灵？答案在 `dispatchToolBody`（`packages/core/tools/src/index.ts:1537-1539`）：

```ts
    const wrapperSignal = exec.signal
    const fused = fuseToolSignals(state.callerSignal, wrapperSignal)
    const signal = fused.signal
```

`fuseToolSignals`（`packages/core/tools/src/index.ts:1889-1916`）把两个 signal 融成一个：任一触发就转发 reason，工作 settle 时立刻摘掉监听器（避免长会话里的监听器堆积）。两个 signal 相同就直接返回原对象，不多建一个 `AbortController`。`finally` 里还会把 `exec.signal` 还原成 wrapper 的那个。

### post-execute 的 `block`

`tools/post-execute` 的决定有两类（`packages/core/tools/src/index.ts:597-600`）：`accept`（可替换 `content` 或 `value`，可附加 `additionalContexts`）和 `block`（把纠正性 `feedback` 变成一个 `isError` 结果）。有一条容易踩的规则（`packages/core/tools/src/index.ts:1747-1756`）：

```ts
    const decisionContexts = decision.additionalContexts ?? []
    if (decision.kind === 'block') {
      const message = failureMessageFromContent(decision.feedback)
      return this.markCanonical(exec, {
        content: decision.feedback,
        isError: true,
        error: { message },
        ...decisionContexts.length > 0 ? { additionalContexts: decisionContexts } : {},
      })
    }
```

`block` 会**丢弃工具自己 defer 的上下文**——被拦下的调用只暴露拦截方自己给的上下文。这不是 bug，是刻意的：被否决的调用不该顺带把它自己想说的话塞进下一步。

最后两段：`finalizeContent` 是定义方自己注册的同步"最后一英里"内容变换（`packages/core/tools/src/index.ts:1649-1654`，`tool-jobs` 用它切输出长度），然后深冻结、无损 JSON 化，`Object.freeze(exec)` 之后才 emit `tools/result`（`:1657-1676`）。观察者拿到的是不可变的、已经无损序列化过的最终结果，改不动也不会影响调用。

默认组合里挂在这四个点上的插件：`tools/pre-execute` 有 `tool-jobs`；`tools/execute` 有 `timeout-policy`、`session-checkpoint-policy`；`tools/post-execute` 有 `spill-policy`、`repeat-tool-reminder`、`tool-fs-search`；`tools/result` 有 `agent-instructions`、`subagent-in-process-driver`。

## 沙箱后端：四个平台，两种完整度

`ctx.sandbox.confine(argv, policy)` 返回一个 `ConfinedArgv`：包好的 argv、这次的强制完整度、这个后端的**拒绝方言**、以及 runner 自身失败的识别规则（`packages/sandbox/sandbox/src/index.ts:91-116`）。没有可用后端就抛 `SANDBOX_UNAVAILABLE`（`packages/sandbox/sandbox/src/index.ts:124`），**绝不静默放行**。

后端按平台先选、再探测（`packages/sandbox/sandbox-local/src/index.ts:159-166`）：

```ts
const PLATFORM_CHAINS: Record<string, readonly SelectedRunner['runner'][]> = {
  linux: ['bwrap', 'landlock'],
  darwin: ['seatbelt'],
  // The Windows restricted-token runner (@deepseek-ai/dsh-sandbox-windows-acl):
  // a sole candidate, selected without a probe — its execution-time refusal
  // fails closed through its stderr signature (windows-acl-run:) and exit 127.
  win32: ['windows-acl'],
}
```

只有候选多于一个的平台才做功能性探测（Linux 上先真跑一次 `bwrap ... true` 看退出码）；只有一个候选的平台不探测——探测是用来仲裁的，不是用来复验一个没有替代品的选择的。Landlock 那条路自带一个约 300 行 C 的 launcher（`native/landlock-run`）随 SDK 发布，因为 `bwrap` 恰恰在最需要沙箱的宿主上不可用（最小容器、禁用 unprivileged userns、拒绝 `mount` 的 LSM）。

**`SandboxEnforcement` 只有两态**：`'full' | 'partial'`（`packages/sandbox/sandbox/src/index.ts:59`）。这里要更正本仓库早期的一处说法——`'unavailable'` 不是 enforcement 的取值，它是 `EscalationOutcome` 的一个成员（`packages/sandbox/sandbox/src/escalation.ts:93`），语义是"审批渠道答不上来"。两者是不同轴上的东西。

`partial` 目前只有一个来源（`packages/sandbox/sandbox-local/src/index.ts:177-187`）：

```ts
const STATIC_ENFORCEMENT: Record<SelectedRunner['runner'], SandboxEnforcement> = {
  bwrap: 'full',
  landlock: 'full',
  seatbelt: 'full',
  // WRITE_RESTRICTED needs Everyone in both restricting lists for process
  // initialization. An external object that grants Everyone write access
  // therefore remains writable, and NTFS hard links can alias a granted
  // workspace file to a path outside it. The backend enforces the remaining
  // ACL-addressable surface but must not advertise the absolute promise.
  'windows-acl': 'partial',
}
```

Landlock 还可能在探测时报 `partial`（老内核 ABI 管不了全部承诺的文件效果），并且它自己在每次受限运行时都会往 stderr 打一句自述。

每个后端的**拒绝方言不同**，这点很实际（`packages/sandbox/sandbox-local/src/index.ts:205-213`）：bwrap 下是 `read-only file system`（EROFS），Landlock 下是 `permission denied`（EACCES），Seatbelt 下是 `operation not permitted`（EPERM），windows-acl 下是 `access is denied` 等三种。消费方只拿**当前后端**的签名去匹配，不用跨后端并集——并集会声称某个后端根本不会产生的拒绝。

拿到拒绝之后，`bash` 会把它翻译成模型认得的两行（`packages/sandbox/sandbox/src/escalation.ts:71-73`、`:84-86`）：

```
[sandbox: file access denied under workspace-write mode]
[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]
```

第二行只在组合真的挂了升级通道时才出现。`write`/`edit` 用同一对函数，只把 `command` 换成 `operation`——两个工具家族刻意共用一套词汇，好让模型不用分辨"这次是内核拒的还是路径围栏拒的"。

升级的合法性是**执行期**判定，不是 schema 约束（`packages/sandbox/sandbox/src/escalation.ts:28-31`）：

```ts
export const WIDER_MODES: Record<string, readonly SandboxMode[]> = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
}
```

schema 里的 enum 是封闭的目标词汇 `ESCALATION_TARGETS = ['workspace-write', 'danger-full-access']`（`packages/sandbox/sandbox/src/escalation.ts:41`），因为 schema 是注册表全局的，而"当前有效模式"是每次调用的事实。`approveEscalation` 的顺序是固定的：先查是否严格变宽（不变宽**根本不会惊动人**），再解析审批通道，最后映射结果（`packages/sandbox/sandbox/src/escalation.ts:157-189`）。

## 两段运行时上下文的原文

模型是怎么知道当前策略的？靠两段注册在 `ctx.systemPrompt.context()` 上的运行时上下文——它们**不进 system prompt**，而是每个 step 被渲染、去重、以一条 user 角色消息追加进历史（机制见 [03 Agent Loop](03-agent-loop.md)，缓存影响见 [02 KV-Cache](02-kv-cache.md)；system prompt 本身的构成见 [01 System Prompt](01-system-prompt.md)）。

`sandbox:policy`，order 110（`packages/sandbox/sandbox-policy/src/index.ts:113-122`），三种模式三段原文（`packages/sandbox/sandbox-policy/src/index.ts:38-52`）：

```
Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox
cannot modify files in the standing mode. Do not refuse a required modification from this policy
alone: try an available tool normally and follow any denial and escalation guidance it returns.

Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox
may modify files under the session workspace: "<workspaceRoot>". Some platform temporary areas may
also be writable.

Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file
modifications by available operations.
```

`approval:policy`，order 115（`packages/interaction/user-approval/src/index.ts:206-207`），两句原文（`packages/interaction/user-approval/src/index.ts:100`、`:102`）：

```
Approval prompts are disabled in this session: actions that require approval are rejected
automatically — do not request sandbox escalation (do not set `sandbox_permissions`).

Approval policy: ask. Operations that require approval may ask through the configured answerers;
without an available answerer, the request fails closed.
```

order 决定了它们在快照里的先后：110 的沙箱段在前，115 的审批段在后。前面 `escalation-approved` 那条 `user/message` 里两段的顺序正是如此，而且事件的 `source.sections` 字段还逐段留了名字和文本，UI 能据此归因到贡献它的子系统。

`read-only` 那段的措辞值得单读一遍："Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns."——设计者明确不希望模型看到 `read-only` 就自我审查、直接放弃；它应该照常尝试，让沙箱来拒，然后按拒绝里的指引走升级。这是把"策略"和"边界"分开的一个具体表现。

子 agent 还会额外收到 order 120 的 `subagent:delegation` 段（`packages/subagent/subagent/src/child-agent.ts:170`），注释里明写它排在 110 和 115 之后。

## 子代理的权限继承：只减不增

委托时捕获哪些策略，写在 `captureDelegatedPolicyOverrides`（`packages/subagent/subagent/src/child-agent.ts:199-204`）：

```ts
export function captureDelegatedPolicyOverrides(parent: Agent): DelegatedPolicyOverrides {
  return {
    sandboxMode: parent.ctx.get('sandboxPolicy')?.overrideOf(parent.session),
    approvalPolicy: parent.ctx.get('approval') === undefined ? undefined : 'never',
  }
}
```

三条规则：

1. **审批钉死为 `never`**——只要组合里有审批服务，子会话就写一条 `approval/policy: never`，"regardless of the parent's own policy"。子 agent 永远问不了人，也就永远升不了权，只能把失败报告回去。
2. **沙箱只复制父的显式覆盖**——`overrideOf` 读的是父会话日志里的 `sandbox/mode` 事件，部署默认和一次性 grant 都不复制。父没显式切过，子就继承部署默认（因为它们本来就在同一个组合里）。捕获必须在子启动的第一个 await 之前同步做完：之后父再切模式，那属于父的未来，不属于这个孩子。
3. **`toolFilter` 只过滤继承来的工具**——`tools.restrict()` 只作用于"全局 + 祖先 scope"来的工具，不影响子 scope 自己注册的，也碰不到保留的 `run_code`（`packages/core/tools/src/index.ts:1071-1098`）。所以子 agent 的 `report` 工具（注册在它自己的 scope 里）不会被父设的过滤器删掉。多层限制取交集。

## 威胁模型：源码自己承认的边界

dsh 的仓库在这件事上相当坦白，几处原文：

- **插件、工具、scope 全在宿主进程里。** `packages/core/scope/README.md:27`：`Scopes route trusted same-process plugins; they are not sandboxes or authority boundaries.` scope 是可见性和所有权的路由，不是权限边界。
- **Code Mode 的 worker 是"容纳，不是安全边界"。** `packages/code-runtime/code-runtime-worker-thread/README.md:5`：`Containment, not a security boundary`，信任姿态被明确定义为"与 bash 等价"。同样的话出现在 workflow 的 worker（`packages/workflow/README.md:14`）和动态 Cordis 包的 vm（`packages/extensions/tool-cordis/README.md:23`）。
- **fs 围栏是"在受信代码里检查一个模型控制的路径"。** `packages/fs/fs-sandbox/README.md:21` 把残留的 TOCTOU（重新规范化和实际 syscall 之间被换掉祖先符号链接）写明为"已知并接受"，并说明真正内核级的隔离是 `ctx.shell` 的活。
- **沙箱只管文件效果。** 网络、进程可见性、凭据不在 `SandboxMode` 的词汇表里（`packages/sandbox/sandbox/src/index.ts:23-28`）。

把这些拼起来，dsh 的实际立场是：**模型写的东西（bash 命令、`run_code` 程序、workflow 脚本）在文件效果上受真 OS 沙箱约束；人装的东西（Cordis 插件、工具包）拥有宿主进程的全部权限。** 装一个插件等于给一次 shell 访问——这是组合式设计的必然代价，上游选择了写清楚而不是假装它不存在。

据此可以判断什么算漏洞：沙箱在 `workspace-write` 下让 bash 写到工作区外，是漏洞；插件代码读了环境变量，不是漏洞（它本来就有进程权限）；`allowed-once` 的 grant 泄漏到下一次调用，是漏洞；`bash` 在沙箱里访问了网络，不是漏洞（不在承诺范围内）。

## 别人怎么做

| 维度 | dsh | Codex CLI | Claude Code | OpenCode | pi | mini-swe-agent |
| --- | --- | --- | --- | --- | --- | --- |
| 审批词汇 | policy `ask`/`never` × sandbox 三档；grant 一次性 | `AskForApproval` 四态：`UnlessTrusted`/`OnRequest`/`Granular`/`Never`；决定还有 `ApprovedForSession`、写回规则等多种 | 6 种权限模式（`default`/`acceptEdits`/`plan`/`auto`/`dontAsk`/`bypassPermissions`），`auto` 用第二个模型做分类器 | 规则引擎 `allow`/`ask`/`deny`，取**最后一条**匹配，默认 `ask` | **刻意没有权限系统**，README 建议用容器隔离 | `human`/`confirm`/`yolo` 三档，默认 `confirm` |
| 逐调用弹窗 | 默认不弹；只在沙箱升级或 hook `ask` 时弹 | `OnRequest` 下仅当文件系统策略是 Restricted 才问 | 是，按规则和模式逐调用判 | 是，按规则判 | 无 | 是，正则白名单可免 |
| 规则语言 | 无。只有 mode + 一次性升级 | execpolicy：Starlark 风格 `prefix_rule(pattern=[...], decision="allow\|prompt\|forbidden")`，模型可提议前缀规则并被持久批准 | `Bash(npm run *)`、`Read(~/secrets/**)`、`WebFetch(domain:...)`；求值顺序固定 deny → ask → allow，具体性不改顺序 | `{permission, pattern, action}`；bash 用 tree-sitter 解析命令树，逐子命令判；`always` 的粒度来自一张 **LLM 生成的命令前缀元数表** | 无（有 project trust：未信任目录不加载项目级扩展） | `whitelist_actions` 正则 |
| 持久授权 | **没有** "always allow"，grant 只活一次调用 | `ApprovedForSession`、规则写回 `~/.codex/rules/*.rules` | settings 里的 allow 规则 + 会话内"always" | `always` 写进会话 `approved`，并自动放行同会话其它等待中的匹配请求 | — | — |
| OS 沙箱 | bwrap → Landlock（Linux）、Seatbelt（macOS）、受限令牌+ACL（Windows，`partial`）；fs 另有进程内路径围栏 | Seatbelt / Landlock+seccomp / bubblewrap / Windows 受限令牌；另有受管网络代理 | Seatbelt / bubblewrap（+ socat 网络代理）；**原生 Windows 不支持** | **无 OS 沙箱** | **无**（推荐 Gondolin micro-VM / Docker / OpenShell） | 沙箱=换环境类（`local`/`docker`/`singularity`/`bubblewrap`/…） |
| 网络 | 不在沙箱词汇表内 | 域名白/黑名单渲染进 `<environment_context><network>` | 外部代理按 hostname 放行，首访新域提示；有 TLS 终止+凭据 mask 的实验特性 | 无 | 无 | 无 |
| 拒绝后怎么办 | 模型带 `sandbox_permissions` + `justification` 原样重试一次，人批准才放行 | 沙箱内失败判定为 `Denied` → 用 `"command failed; retry without sandbox?"` 再问一次 → 去沙箱重跑 | 失败信息附上"沙箱挡了哪个路径/主机"，模型可用 `dangerouslyDisableSandbox` 重试并走常规权限流 | 拒绝变成 `CorrectedError` 反馈给模型；`continue_loop_on_deny !== true` 时直接停循环 | — | 拒绝时把用户评论作为 user 消息喂回模型 |
| 自动审核 | 无 | **guardian**：独立子会话重建紧凑 transcript 交给模型判，超时/异常一律拒绝（fail closed） | `auto` 模式的分类器（信任工作目录与会话开始时的 git remotes） | 无 | 无 | 无 |
| 受保护路径 | 无专门名单；靠 sandbox mode 的工作区边界 | deny-read 路径规则；存在 deny-read 时绝不免沙箱 | `.git`、`.claude/`、`.mcp.json`、shell 启动文件等，除 bypass 外**永不**自动批准，allow 规则也不能预批 | `.env`/`.env.*` 读取默认 `ask`；项目外目录单独请求 | 无 | 无 |

三点观察：

- **dsh 的词汇几乎照搬 Codex**（`read-only`/`workspace-write`/`danger-full-access`、`sandbox_permissions`、justification、拒绝后升级重试），但把 Codex 的四态审批砍成了两态，并且**去掉了所有持久授权**。取舍很清楚：宁可没有 allow 规则，也不要一个"批准过一次就一直放行"的状态需要维护和审计。
- **Claude Code 走了完全相反的路**：规则语言极其丰富（顺序固定的 deny/ask/allow、glob、域名、按参数），沙箱是后来才补的，并且专门列了一份"沙箱内也不许写"的路径名单，理由写得很直白——能改这些文件的命令可以给自己授权。dsh 没有对应的名单，因为它的信任模型里"插件本来就有进程权限"。
- **pi 是另一个极端**：明确不做权限系统，把隔离整个推给容器。这不是偷懒，是一种主张——权限系统给的是虚假的安全感，真边界只能是进程/VM 边界。dsh 的 README 其实同意后半句（scope 不是权限边界、worker 不是安全边界），只是它还额外提供了一层真 OS 沙箱。

## 怎么自己核

```bash
cd sources/checkouts/deepseek-harness

# 一次真的审批长什么样（含 approval/asked + approval/decided 对）
grep -o '"type":"approval/[a-z]*"[^}]*}' \
  examples/acp-agent/tests/snapshots/escalation-approved/session.jsonl

# hook 触发的 ask
grep -o '"type":"\(hook/[a-z]*\|approval/[a-z]*\)"[^}]*}' \
  examples/acp-agent/tests/snapshots/hook-cc-pretool-ask/session.jsonl

# 全仓库里谁会返回 ask
grep -rn "kind: 'ask'" --include=*.ts packages/

# 全仓库里谁调用审批
grep -rn "approval.request(\|approveEscalation(" --include=*.ts packages/

# 谁 opt-in 了并发
grep -rn "isConcurrencySafe" packages/*/*/src/*.ts

# 两段运行时上下文的原文
sed -n '38,52p' packages/sandbox/sandbox-policy/src/index.ts
sed -n '99,103p' packages/interaction/user-approval/src/index.ts

# 模型看到的工具描述（这份文件由启动真实插件后读 schemas() 生成）
grep -n "^### \`" docs/tool-catalog.md
```

想确认"默认不弹窗"这个结论，最直接的读法是把上面两条 `grep` 的结果和 `packages/bundle/base/cordis.patch.yml` 对一遍：调用审批的只有升级和 `ask`，产生 `ask` 的只有 hooks 桥，而默认 bundle 里没有 hooks 桥。

相关的其它篇：工具调度与取消语义见 [03 Agent Loop](03-agent-loop.md)；这两段运行时上下文为什么不进 system prompt 见 [02 KV-Cache](02-kv-cache.md)；子代理的完整委托流程见 [08 Orchestration](08-orchestration.md)；Code Mode 下工具怎么呈现见 [09 扩展与 Code Mode](09-extensions-and-code-mode.md)；术语见 [附录 A 术语表](appendix-a-glossary.md)。
