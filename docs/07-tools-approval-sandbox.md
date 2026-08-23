---
title: 工具、审批与沙箱：到底什么时候会弹窗
sources: [{"repo":"deepseek-harness","path":"packages/core/tools/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/sandbox/sandbox/src/escalation.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}, {"repo":"deepseek-harness","path":"packages/interaction/user-approval/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: stale
---

# 工具、审批与沙箱：到底什么时候会弹窗

*这一篇讲给要给 agent 加工具、或者要判断「让模型跑 bash 到底有多危险」的人。读完你能回答：默认配置下什么时候真会弹窗、一次工具调用从模型吐字到落盘经过哪几道关、四个沙箱后端各能兑现多少承诺。*

你大概默认工具就是「一个函数加一份 JSON Schema」：模型填参数，harness 调函数，返回结果。dsh 里从模型吐出一个 `bash` 调用到那条命令真的跑起来，中间隔着六段流水线、一次审批瀑布、一层 OS 沙箱包裹，任何一段答不上来都按拒绝处理。

三个问题先自己答一下：默认配置下模型改你的文件会弹窗吗？沙箱拦得住 `bash` 里的 `curl` 吗？子 agent 权限不够时能不能问人？三个答案都和直觉相反。

## 先纠正一个直觉

看到 dsh 有一个叫 approval（审批）的服务，多数人的第一反应是：「改文件前它会弹窗问我」。这个直觉是错的，而且错得挺关键。

在默认组合下（`packages/bundle/base/cordis.patch.yml` 那套，沙箱 `workspace-write` + 审批 `ask`），模型调 `write`、`edit`、`bash` 都**不会弹窗**。安全边界不是弹窗，是沙箱：`bash` 的 argv 被 bwrap / Landlock / Seatbelt / Windows 受限令牌包住，`write`/`edit` 在进程内被路径围栏挡住。（**bwrap** 是 Linux 上的 bubblewrap，用 mount namespace 把工作区外的路径挂成只读；**Landlock** 是 Linux 内核自带的文件访问限制，不需要 namespace 权限；**Seatbelt** 是 macOS 的 `sandbox-exec` 策略；**Windows 受限令牌**靠 ACL 限制进程能碰到的对象。四个后端能兑现的承诺不一样，见后面「沙箱后端」一节。）弹窗只在两种情况下出现：

1. **沙箱真的拒绝了，模型请求升级**：它在同一个工具调用里带上 `sandbox_permissions` + `justification` 重试，这次重试会问人；
2. **`tools/pre-execute` 有插件返回了 `ask`**：在 commit 47f9438 的整个仓库里，唯一会返回 `ask` 的是 Claude Code 方言的 hook 桥（`packages/hooks/hooks-claude-code/src/index.ts:242`），而默认组合**没有挂任何 hooks 桥**。

所以「审批」在 dsh 里不是一个逐调用的确认流程，而是一个**升级通道**。下面这篇讲清楚这三层（工具、审批、沙箱）各自管什么、代码在哪、模型看到什么。

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

块里的英文先读一遍。第一条 `user/message` 是用户的指令：「现在原样重试一次：一个 bash 调用，命令是 `printf 'escalated\n' > /tmp/dsh-escalated.txt && …`，把 `sandbox_permissions` 设成 `danger-full-access`，并给出理由」。第二条是 harness 每步追加的运行时快照，头一句 `This snapshot supersedes earlier runtime-context snapshots.` 是说「这份快照作废之前所有的运行时快照」；后面两段分别告诉模型「当前文件策略是 `workspace-write`，由 DSH 文件沙箱强制的任何可用操作都可以改会话工作区下的文件，某些平台的临时目录可能也可写」和「审批策略是 `ask`，需要审批的操作会通过已配置的应答方去问；没有可用应答方时，请求 fail closed」。

**fail closed（失败即拒绝）**是这一篇反复出现的姿态：拿不到肯定答复就当成否定答复。没人能批准、监听器抛异常、参数解析不出来，结果一律是拒绝，不会因为「不确定」而放行。

几件事：`sandbox_permissions` 和 `justification` 是 `bash` 工具 schema 上的两个字段（**tool schema** 就是发给模型的那份工具声明：名字、说明、参数的 JSON Schema，模型能看见的只有这三样），不是内部机制——**是模型自己决定要升级**。审批的 `reason` 字段把模型写的理由原样拼进去，人看到的就是它。`approval/asked` 和 `approval/decided` 是一对 log-only 事件（不进模型历史，只进审计）。而这个 grant 只作用于这一次调用：`allowed-once` 的字面意思。

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

两条英文：`"reason":"bash requires manual approval in this session"` 是 hook 桥写给人看的理由，意思是「这个会话里 bash 需要人工批准」；`Error: the user rejected tool "bash"` 是人点了拒绝之后模型收到的结果文本，意思是「用户拒绝了 bash 这个工具」。

注意 `tool/call` 在 `hook/invoked` **之前**就落盘了：先记录模型要做什么，再决定让不让做。还有 `tool/result` 的文案 `Error: the user rejected tool "bash"`，这是 `ToolRuntime` 四种拒绝文案里的一种，后面会全部列出来。

## 三个正交旋钮

dsh 把权限拆成三个互不包含的东西。搞混它们是理解这套系统最大的障碍。

| 旋钮 | 取值 | 存在哪 | 谁写 |
| --- | --- | --- | --- |
| **sandbox mode**（文件效果边界） | `read-only` / `workspace-write` / `danger-full-access` | 会话日志的 `sandbox/mode` 事件（log-only），没有就用 `sandbox-policy` 的部署默认 | `setSandboxMode(session, mode)`（`packages/sandbox/sandbox-policy/src/session-mode.ts:69-71`） |
| **approval policy**（要不要问人） | `ask` / `never` | 会话日志的 `approval/policy` 事件，没有就用 `user-approval` 的配置默认 | `setApprovalPolicy(session, policy)` / `ctx.approval.setPolicy(agent, policy)` |
| **tool 可见性**（模型能看见什么） | 由组合决定：`tools.restrict({allow,deny})` + preset 挂了哪些工具包 | 不进日志，是组合事实 | `ctx.tools.restrict(...)`（`packages/core/tools/src/index.ts:1071`） |

`SandboxMode` 只管**文件效果**，源码注释写得很直白（`packages/sandbox/sandbox/src/index.ts:23-29`）：`read-only` 只放行必需的 sink（如 `/dev/null`），`workspace-write` 再加上工作区和后端定义的临时区，`danger-full-access` 直接跳过约束；"Network and process visibility are outside this vocabulary"（网络和进程可见性不在这套词汇表里）。也就是说：**沙箱不管网络，不管进程可见性，不管凭据**。`bash` 里 `curl` 一个内网地址，沙箱不会拦。

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

插件自带的 schema 默认表只有两项（`packages/interaction/permission-presets/src/index.ts:168-175`），bundle 补了 `read-only`。选一个 preset 写一条 `permission/preset` 事件（纯「用户意图」记录），然后按需分别写 `sandbox/mode` 和 `approval/policy`；两个旋钮的值凑不出任何一个 preset 时，派生状态是 `custom`。每个新会话发布前，`pinInitialPermission`（`packages/interaction/permission-presets/src/index.ts:400-430`）把三条事件补齐，于是「这个会话当时是什么权限」永远能从日志本身重建。

默认部署值：`DSH_PERMISSION_MODE ?? 'workspace-write'`，审批是 `danger-full-access ? 'never' : 'ask'`（`packages/bundle/base/cordis.patch.yml:175`、`:191`）。

## 谁会真的调用 `ctx.approval.request()`

整个 commit 里只有两个调用点：

1. **沙箱升级**：`approveEscalation`（`packages/sandbox/sandbox/src/escalation.ts:157-189`），被 `bash`/`pwsh`（`packages/shell/tool-bash/src/index.ts:213-233`）和 `write`/`edit`（`packages/fs/tool-fs/src/sandbox.ts:97`）共用。
2. **`tools/pre-execute` 返回 `ask`**：由 `ToolRuntime.serviceAsk` 转成一次 `request()`（`packages/core/tools/src/index.ts:1689-1729`）。

其余出现 `approval/request` 字样的地方都是**回答方**（answerer），不是发起方：ACP 桥（`packages/acp/acp/src/index.ts:215`）和 Web 客户端的 api-proxy（`packages/host/apiproxy/src/api-proxy.ts:1422`）。**waterfall（瀑布事件）**是 Cordis 的环绕式中间件：监听器排成一队，每个都必须 `await next()` 才轮到下一个，最后的返回值权威；一个监听器都没有时，返回的就是发起方给的默认值。答不上来就是答不上来，零监听器时 waterfall 落到默认值 `'unavailable'`，消费方一律按拒绝处理。

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

里面那段英文报错值得单读：「`approval.request()` 在没有打开的 turn 之外被调用了。`approval/asked` 和 `approval/decided` 这对审计事件必须包在 turn 里面，游离在两个 turn 之间的事件在重新加载时会被当成崩溃残留丢掉。请在真正需要这个决定的那个 turn 内部发起询问。」翻译成人话就是：审批记录落在 turn 外面，下次打开会话它会静悄悄消失，而审计记录消失属于没人会发现的那类坏，所以上游直接抛异常，不留侥幸空间。

`never` 策略在 waterfall **之前**就短路了（`packages/interaction/user-approval/src/index.ts:312`）：

```ts
    if (this.effectivePolicy(session) === 'never') return 'rejected'
```

上面那行的注释解释了为什么不做成监听器：一个用 `prepend: true` 后挂的监听器会排在任何「网关式监听器」前面，那样 `never` 就没法保证确定性了；只有服务自己的 `request` 路径能守住这个承诺。

结果只有四种（`packages/interaction/user-approval/src/types.ts:29`）：`allowed-once | rejected | cancelled | unavailable`。第一个是唯一的通过，其余三个全是拒绝，但**拒绝理由文案不同**，好让模型分得清「人说不行」和「这儿根本没人能答」。

## 完整工具目录：默认组合下模型看得见什么

下面这张表覆盖默认 bundle（`packages/bundle/base/cordis.patch.yml`）与 CLI 的 `standard` preset（`apps/cli/config/agent-presets/standard/agent.cordis.yml`）。描述原文摘自上游自动生成的目录 `docs/tool-catalog.md`。那份文件是启动真实插件后读 `ctx.tools.schemas()` 生成的，所以是**真实 schema**，不是手写文档。

但有一个必须知道的差别：**生成器给每个包用的是它自己的默认配置，不是这两套组合**。最直接的证据是 `grep -c sandbox_permissions docs/tool-catalog.md` 返回 0：目录里 `bash` 的 schema **没有** `sandbox_permissions` / `justification` 这两个字段，因为 `packages/shell/tool-bash/src/index.ts:259-269` 只在挂了会限制的执行器（`escalationModes.length > 0`）时才把它们加进 schema，而默认组合恰恰挂了。所以：描述文本可以照读，字段清单要按组合另算，前面 `escalation-approved` 那条日志里模型真的填了这两个字段，就是这个道理。

「并发」一列的判据是 §「并发分类」。

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
| `report` | "Report selected content to the agent that started you… only your direct parent receives it"（`docs/tool-catalog.md:1586`），**只注册在 continuable 子 agent 的 scope 里** | exclusive | 两处（宿主平面注册） |
| `workflow` | "Run a JavaScript workflow script that orchestrates subagents at scale…"（`docs/tool-catalog.md:1736`） | exclusive | 两处 |
| `ralph` | "Run a foreground fresh-agent Ralph loop toward one immutable objective. Use only when the direct human explicitly asks for Ralph or fresh-agent iteration…"（`docs/tool-catalog.md:1184`） | exclusive | 两处 |
| `create_goal` / `get_goal` / `update_goal` | 同会话持久目标；create/edit/pause/resume 要求直接人类根权限（`docs/tool-catalog.md:945`、`:970`、`:983`） | exclusive | 两处 |
| `web_search` | "Search the web for current information. Returns an optional summary answer and a list of source URLs."（`docs/tool-catalog.md:1852`） | **parallel** | 两处 |
| `ask_user_question` | "Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding…"（`docs/tool-catalog.md:47`） | exclusive | 仅 standard preset |

三点要注意：

- `web_fetch` 存在但**默认关掉**（`packages/bundle/base/cordis.patch.yml:417` 的 `fetch: false`），理由写在上面十几行的注释里（`:399-401`）：这个 provider 把 SSRF 防护推给了调用方，而请求目标是模型选的。（**SSRF**：服务端请求伪造，骗服务端替攻击者去访问它本不该访问的地址，比如云环境的元数据接口。）
- `run_code` 是保留名，只在 `tools.mode` 为 `code`/`both` 时出现；默认组合注释明说保持 `native`（`packages/bundle/base/cordis.patch.yml:422-423`）。见 [09 扩展与 Code Mode](09-extensions-and-code-mode.md)。
- `terminal_*`、`lsp`、`session_*`、`cordis_*`、`schedule_*` 都在仓库里但不在这两套组合中。

发给模型的 schema 是投影过的（`packages/core/tools/src/index.ts:1234-1236`、`:1256-1267`）：只有 `name` / `description` / `parameters` 三个字段出去，`timeoutMs`、`isConcurrencySafe`、`presentCall`/`presentResult` 这些**永远不发给模型**。

### 表里那些英文描述在说什么

上面那一列英文是模型真正读到的字。跳过它就等于没看见 dsh 是怎么用一段描述去改模型行为的。逐条译过来：

- `bash`：每次调用都开一个全新的 shell，cwd、变量、函数一律不留，要换目录就传 `workdir`，别用 `cd`。非零退出以 `[exit code: N]` 的形式报回来。被沙箱挡掉的文件操作报 `[sandbox: file access denied under <mode> mode]`，并明说这是一次策略拒绝、不是命令写错了，**不要换个写法再试**。最后半句是全表最重要的一行行为约束：没有它，模型会把权限拒绝当成语法问题，然后开始花式绕路。
- `pwsh`：`bash` 的 PowerShell 版，多的那一句是说 Windows 上被强制杀掉的命令会以 `[exit code: 1]` 结算，不带信号标记。
- `glob`：结果最多 100 条，按修改时间排序；超过 100 条时不返回截断的前 100 条，而是在顶层条目之间抽样 100 条。这样模型至少能看到目录树的全貌。
- `grep`：前 250 个匹配直接内联返回，超了就告诉模型完整匹配列表存到了哪里。
- `read` / `write` / `edit`：`read` 返回带行号的内容，`write` 是创建或整文件替换，`edit` 只替换字面文本。三句话把「什么时候该用哪个」定死了。
- `read_image`：读一个 PNG/JPEG/WebP/GIF，返回图片本身；要求当前模型收得下图像输入。
- `str_replace_editor`：一个用来查看、创建、编辑文件的自定义编辑工具。它只出现在 base bundle 里，是给不习惯 `read`/`write`/`edit` 三件套的模型留的另一套入口。
- `todo_write`：每次都要发**整个列表**，它**替换**上一份，没有增量更新、没有按项编辑；正在做的每一条都要标 `in_progress`。原文里全大写的 ENTIRE 和 REPLACES 是故意的，模型对大写敏感。
- `subagent`：给子代理的必须是一份完整、能独立成立的 prompt，因为**它看不见当前这段对话**。默认阻塞等结果，`run_in_background: true` 才后台跑。
- `report`：把选定内容报告给启动你的那个 agent，**只有直接父级收得到**。它只注册在 continuable 子 agent 的 scope 里（**continuable** 指可以被继续追加下一轮的子 agent，与用完即弃的 one-shot 相对），别的 agent 根本看不见这个工具。
- `job_output`：流式任务只返回上次读取之后的新输出，每次响应结尾都带一个 `[status: ...]`；读取默认不阻塞，除非显式 `wait: true`。
- `skill`：把某个可用 skill 的完整说明加载进来，调用时要填会话 skill 目录里的**准确名字**。目录本身不进 system prompt，理由见 [08 编排层](08-orchestration.md)。
- `workflow`：跑一段 JavaScript 工作流脚本，用来大批量编排子代理。
- `ralph`：只有直接的人类明确要求 Ralph 循环、或者要求「每轮换一个全新 agent」时才用。
- `exit_plan_mode`：只在 plan 模式下用，把计划交给用户过目，批准之后离开 plan 模式。
- `ask_user_question`：需要确认、需要用户二选一、或者缺关键信息做不下去时，问一个简短的问题。
- `web_search`：搜网页，返回一段可选的摘要答案加一串来源 URL。

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

fail-closed 到了偏执的程度：未声明、返回了别的东西、抛异常、工具不存在，一律 exclusive。而且 `defineTool`（上游定义一个工具的唯一入口：名字、描述、参数 schema、执行体、这些元数据一次性声明完）会先校验参数再调分类器，参数非法直接当 exclusive（`packages/core/tools/src/schema.ts:610-615`）。整个仓库里 opt-in 的一共 8 处，用 `grep -rn "isConcurrencySafe: () => true" packages/*/*/src/*.ts` 一眼能数完（不加冒号后缀会把接口声明和分类器本身也数进来）。调度细节见 [03 Agent Loop](03-agent-loop.md)。

## `ToolRuntime` 的执行流水线

一次工具调用的完整路径是六段：`createExecution` → `tools/pre-execute` → guard → `tools/execute` → 工具体 → `tools/post-execute` → `finalizeContent` → `tools/result`。前两段和 guard 打包在 `prepareExecution`（`packages/core/tools/src/index.ts:1463-1505`）：

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
- **guard 在 pre-execute 之后**，而且是单调的：任何 guard 返回字符串就拒绝，没有 guard 能把别的 guard 拒掉的调用放行（注册接口的契约写在 `packages/core/tools/src/index.ts:1107`，取第一条拒绝的实现在 `:1118-1128`）。**guard（守卫）**是挂在工具注册表上的同步检查函数：返回一个字符串就是拒绝，那个字符串就是理由；什么都不返回就是放行。顺序是全局层先、再 scope 链由远到近（**scope（作用域）**是按 agent 隔离的注册单位：一个工具、一段 prompt，要么全局可见，要么只属于某一个 agent 的 scope；更近的 scope 上的同名注册遮蔽更远的那份）。
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

两段英文注释是这段代码的全部理由。第一段：「collapse 在策略流水线之前就拒了这次调用，但派发前的取消仍然要遵守既有的取消契约：`prepare` 里那次调用方取消检查对终态结果是跳过的，所以在这里就把取消兑现掉，别在一个已经被取消的调用上抛 `UNKNOWN_TOOL`。」第二段更有意思：「工具名在这里是可见的，所以这条拒绝要顺带告诉模型该改走哪条路。不带这句的话，模型会为一个 prompt 刚刚声明过的工具读到一句光秃秃的 `unknown tool`，然后得出结论说这套部署坏了，而不去纠正自己。」

设计理由写在注释里：一个注定失败的调用不能让 pre-execute 监听器、审批、guard 看见，更不能被它们「批准」。这跟真正的未知工具名不同：未知名仍走原来的 dispatch 阶段 `UNKNOWN_TOOL` 路径，好让策略监听器看到每一个到过注册表的名字。

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

这两种拒绝的中文是「工具 `<name>` 需要审批（暂不支持）」和「工具 `<name>` 需要审批，但这次调用没有可以路由过去的 agent」。前者是组合里压根没装审批服务，后者是这次调用不挂在任何 agent 上，两种都没人可问，于是按拒绝算。

后面三种来自审批结果本身：

| 结果 | 模型看到的 `tool/result` 文本 |
| --- | --- |
| `allowed-once` | 正常执行 |
| `rejected` | `Error: the user rejected tool "<name>"` |
| `cancelled` | `Error: approval for tool "<name>" was cancelled` |
| `unavailable` | `Error: tool "<name>" requires approval, but no approval channel is available` |

沙箱升级那条路的文案是另一套（`packages/sandbox/sandbox/src/escalation.ts:184-186`）：`the user rejected escalating this <subject> to "<mode>"` / `approval for escalating to "<mode>" was cancelled` / `sandbox escalation to "<mode>" requires approval, but no approval channel is available`。**两套文案刻意不复用**，因为模型需要分清「这个工具要批准」和「这次升级要批准」。

### `ABORTED` 与 `ABORTED_BEFORE_DISPATCH`

取消有两个码，判据是「工具体有没有被调用过」（`packages/core/tools/src/index.ts:1518-1525`）：

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

中间那行 `v8 ignore` 注释的意思是「只有注册表自己铸出来的 execution 才会走到这套分阶段调度方法，所以这条分支覆盖率工具永远够不着」；紧跟的报错说的是调度器的不变量被破坏了，取消状态丢了。

`bodyInvoked` 只在 `dispatchToolBody` 真正要调 `tool.execute` 的那一瞬间置位（`packages/core/tools/src/index.ts:1532-1560`）。所以：进了工具体再取消 → `ABORTED`（文本 `Error: tool call aborted`）；派发前就取消 → `ABORTED_BEFORE_DISPATCH`（文本 `Error: tool call aborted before dispatch`）。这两个码就是前面 `cancel-tool-calls` 快照里那对结果的来源。还有一种 `ABORTED_BEFORE_DISPATCH` 不经过 `ToolRuntime`：调度器在取消后给**根本没启动**的调用补写合成结果，那是 agent-loop 干的，见 [03 Agent Loop](03-agent-loop.md)。

### `fuseToolSignals`：取消不会丢

`tools/execute` 是「环绕派发」的 waterfall，wrapper 可以替换 `exec.signal`（超时策略就是这么加 deadline 的）。问题是：wrapper 换了 signal 之后，调用方的原始取消还灵不灵？答案在 `dispatchToolBody`（`packages/core/tools/src/index.ts:1536-1538`）：

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

最后两段：`finalizeContent` 是定义方自己注册的同步「最后一英里」内容变换（`packages/core/tools/src/index.ts:1649-1654`，`tool-jobs` 用它切输出长度），然后深冻结、无损 JSON 化，`Object.freeze(exec)` 之后才 emit `tools/result`（`:1657-1676`）。观察者拿到的是不可变的、已经无损序列化过的最终结果，改不动也不会影响调用。

默认组合里挂在这四个点上的插件：`tools/pre-execute` 有 `tool-jobs`；`tools/execute` 有 `timeout-policy`、`session-checkpoint-policy`；`tools/post-execute` 有 `spill-policy`、`repeat-tool-reminder`、`tool-fs-search`；`tools/result` 有 `agent-instructions`、`subagent-in-process-driver`。

## 沙箱后端：三个平台四个后端，两种完整度

`ctx.sandbox.confine(argv, policy)` 返回一个 `ConfinedArgv`：包好的 argv、这次的强制完整度、这个后端的**拒绝方言**、以及 runner 自身失败的识别规则（`packages/sandbox/sandbox/src/index.ts:95-117`）。没有可用后端就抛 `SANDBOX_UNAVAILABLE`（`packages/sandbox/sandbox/src/index.ts:124`），**绝不静默放行**。

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

Windows 那三行英文注释是说：受限令牌 runner 是这个平台唯一的候选，选它的时候不做探测；它在执行期真的拒绝时，靠 stderr 里的 `windows-acl-run:` 签名加退出码 127 被识别出来，走 fail closed。

只有候选多于一个的平台才做功能性探测（Linux 上先真跑一次 `bwrap ... true` 看退出码）；只有一个候选的平台不探测：探测是用来仲裁的，不是用来复验一个没有替代品的选择的。Landlock 那条路自带一个约 300 行 C 的 launcher（`native/landlock-run`）随 SDK 发布，因为 `bwrap` 恰恰在最需要沙箱的宿主上不可用（最小容器、禁用 unprivileged userns、拒绝 `mount` 的 LSM）。

**`SandboxEnforcement` 只有两态**：`'full' | 'partial'`（`packages/sandbox/sandbox/src/index.ts:59`）。别把它和 `'unavailable'` 混在一起。后者不是 enforcement 的取值，它是 `EscalationOutcome` 的一个成员（`packages/sandbox/sandbox/src/escalation.ts:93`），语义是「审批渠道答不上来」。一个说的是沙箱能兑现多少承诺，一个说的是有没有人来批准，两者在不同的轴上。

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

那段英文注释解释了 Windows 为什么只敢报 `partial`：`WRITE_RESTRICTED` 令牌要能完成进程初始化，就必须让 Everyone 同时出现在两张限制列表里；于是一个外部对象只要给 Everyone 授过写权限，它在沙箱里仍然可写。另外 NTFS 硬链接可以把一个被授权的工作区文件别名到工作区外的路径。这个后端仍然守住了 ACL 能表达的那部分，但**不宣称一个它兑现不了的绝对承诺**。这条注释是这一篇最值得学的写法：后端把自己的能力缺口写进返回值，让上层拿着 `partial` 去决策，没把缺口藏在一句「已启用沙箱」里。

Landlock 还可能在探测时报 `partial`（老内核 ABI 管不了全部承诺的文件效果），并且它自己在每次受限运行时都会往 stderr 打一句自述。

每个后端的**拒绝方言不同**，这点很实际（`packages/sandbox/sandbox-local/src/index.ts:205-213`）：bwrap 下是 `read-only file system`（EROFS），Landlock 下是 `permission denied`（EACCES），Seatbelt 下是 `operation not permitted`（EPERM），windows-acl 下是 `access is denied` 等三种。消费方只拿**当前后端**的签名去匹配，不用跨后端并集——并集会声称某个后端根本不会产生的拒绝。

拿到拒绝之后，`bash` 会把它翻译成模型认得的两行（`packages/sandbox/sandbox/src/escalation.ts:71-73`、`:84-86`）：

```
[sandbox: file access denied under workspace-write mode]
[sandbox: escalation available — retry this exact command once with sandbox_permissions (the narrowest wider mode that suffices) + justification; the approval prompt asks the user]
```

两行的中文是「[sandbox: 在 workspace-write 模式下文件访问被拒绝]」和「[sandbox: 可以升级，用 sandbox_permissions（选够用的最窄的那个更宽模式）加 justification 把这条命令原样重试一次；审批提示会去问用户]」。第二行等于把补救步骤直接写进拒绝信息里，模型不用猜。

第二行只在组合真的挂了升级通道时才出现。`write`/`edit` 用同一对函数，只把 `command` 换成 `operation`：两个工具家族刻意共用一套词汇，好让模型不用分辨「这次是内核拒的还是路径围栏拒的」。

升级的合法性是**执行期**判定，不是 schema 约束（`packages/sandbox/sandbox/src/escalation.ts:28-31`）：

```ts
export const WIDER_MODES: Record<string, readonly SandboxMode[]> = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
}
```

schema 里的 enum 是封闭的目标词汇 `ESCALATION_TARGETS = ['workspace-write', 'danger-full-access']`（`packages/sandbox/sandbox/src/escalation.ts:41`），因为 schema 是注册表全局的，而「当前有效模式」是每次调用的事实。`approveEscalation` 的顺序是固定的：先查是否严格变宽（不变宽**根本不会惊动人**），再解析审批通道，最后映射结果（`packages/sandbox/sandbox/src/escalation.ts:157-189`）。

## 两段运行时上下文的原文

模型是怎么知道当前策略的？靠两段注册在 `ctx.systemPrompt.context()` 上的运行时上下文。它们**不进 system prompt**，而是每个 step 被渲染、去重、以一条 user 角色消息追加进历史（机制见 [03 Agent Loop](03-agent-loop.md)，缓存影响见 [02 KV-Cache](02-kv-cache.md)；system prompt 本身的构成见 [01 System Prompt](01-system-prompt.md)）。

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

三段的中文：

- `read-only`：「当前 DSH 文件策略是 read-only。在这个常驻模式下，由 DSH 文件沙箱强制的任何可用操作都改不了文件。不要仅凭这条策略就拒绝一个必要的修改：照常调用可用的工具，然后按它返回的拒绝信息和升级指引走。」
- `workspace-write`：「当前 DSH 文件策略是 workspace-write。由 DSH 文件沙箱强制的任何可用操作都可以修改会话工作区 `<workspaceRoot>` 下的文件。某些平台的临时目录可能也可写。」
- `danger-full-access`：「当前 DSH 文件策略是 danger-full-access。DSH 文件沙箱不限制可用操作对文件的修改。」

`approval:policy`，order 115（`packages/interaction/user-approval/src/index.ts:206-207`），两句原文（`packages/interaction/user-approval/src/index.ts:100`、`:102`）：

```
Approval prompts are disabled in this session: actions that require approval are rejected
automatically — do not request sandbox escalation (do not set `sandbox_permissions`).

Approval policy: ask. Operations that require approval may ask through the configured answerers;
without an available answerer, the request fails closed.
```

两句的中文：审批关掉时是「本会话已禁用审批提示：需要审批的操作会被自动拒绝，不要请求沙箱升级（不要设置 `sandbox_permissions`）」；审批为 `ask` 时是「审批策略：ask。需要审批的操作可以通过已配置的应答方询问；没有可用应答方时，请求 fail closed」。第一句把「别去试」直接写给模型，省掉一轮注定被拒的调用。

order 决定了它们在快照里的先后：110 的沙箱段在前，115 的审批段在后。前面 `escalation-approved` 那条 `user/message` 里两段的顺序正是如此，而且事件的 `source.sections` 字段还逐段留了名字和文本，UI 能据此归因到贡献它的子系统。

`read-only` 那段的措辞要单读一遍："Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns."——设计者明确不希望模型看到 `read-only` 就自我审查、直接放弃；它应该照常尝试，让沙箱来拒，然后按拒绝里的指引走升级。这是把「策略」和「边界」分开的一个具体表现。

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

1. **审批钉死为 `never`**：只要组合里有审批服务，子会话就写一条 `approval/policy: never`，"regardless of the parent's own policy"（不管父 agent 自己的策略是什么）。子 agent 永远问不了人，也就永远升不了权，只能把失败报告回去。
2. **沙箱只复制父的显式覆盖**：`overrideOf` 读的是父会话日志里的 `sandbox/mode` 事件，部署默认和一次性 grant 都不复制。父没显式切过，子就继承部署默认（因为它们本来就在同一个组合里）。捕获必须在子启动的第一个 await 之前同步做完：之后父再切模式，那属于父的未来，不属于这个孩子。
3. **`toolFilter` 只过滤继承来的工具**：`tools.restrict()` 只作用于「全局 + 祖先 scope」来的工具，不影响子 scope 自己注册的，也碰不到保留的 `run_code`（`packages/core/tools/src/index.ts:1071-1098`）。所以子 agent 的 `report` 工具（注册在它自己的 scope 里）不会被父设的过滤器删掉。多层限制取交集。

## 威胁模型：源码自己承认的边界

dsh 的仓库在这件事上相当坦白，几处原文：

- **插件、工具、scope 全在宿主进程里。** `packages/core/scope/README.md:27`：`Scopes route trusted same-process plugins; they are not sandboxes or authority boundaries.`（scope 路由的是同进程内受信的插件；它们不是沙箱，也不是权限边界。）scope 是可见性和所有权的路由，不是权限边界。
- **Code Mode 的 worker 是「容纳，不是安全边界」。** `packages/code-runtime/code-runtime-worker-thread/README.md:5`：`Containment, not a security boundary`（只做容纳，不是安全边界），信任姿态被明确定义为「与 bash 等价」。同样的话出现在 workflow 的 worker（`packages/workflow/README.md:14`）和动态 Cordis 包的 vm（`packages/extensions/tool-cordis/README.md:23`）。
- **fs 围栏是「在受信代码里检查一个模型控制的路径」。** `packages/fs/fs-sandbox/README.md:21` 把残留的 TOCTOU（**TOCTOU**：检查的那一刻和真正使用的那一刻之间，状态被人换掉了；这里指重新规范化和实际 syscall 之间被换掉祖先符号链接）写明为「已知并接受」，并说明真正内核级的隔离是 `ctx.shell` 的活。
- **沙箱只管文件效果。** 网络、进程可见性、凭据不在 `SandboxMode` 的词汇表里（`packages/sandbox/sandbox/src/index.ts:23-28`）。

把这些拼起来，dsh 的实际立场是：**模型写的东西（bash 命令、`run_code` 程序、workflow 脚本）在文件效果上受真 OS 沙箱约束；人装的东西（Cordis 插件、工具包）拥有宿主进程的全部权限。** 装一个插件等于给一次 shell 访问——这是组合式设计的必然代价，上游选择了写清楚而不是假装它不存在。

据此可以判断什么算漏洞：沙箱在 `workspace-write` 下让 bash 写到工作区外，是漏洞；插件代码读了环境变量，不是漏洞（它本来就有进程权限）；`allowed-once` 的 grant 泄漏到下一次调用，是漏洞；`bash` 在沙箱里访问了网络，不是漏洞（不在承诺范围内）。

## 别人怎么做

六家在同一条轴上分布得很开：一端是「靠一套规则语言逐调用判」（Claude Code、OpenCode、Codex），另一端是「干脆不做权限系统、把隔离推给容器」（pi）。dsh 靠近后者，但补了一层真 OS 沙箱。

**Claude Code 那一列全部来自官方公开文档**（`code.claude.com/docs` 的 permissions / sandboxing / settings 几页），它闭源，本仓库没有它的 checkout，那些模式名和「`auto` 用第二个模型分类」都无法从源码核实；其余五家读自 `sources/checkouts/` 里锁定的 commit。

| 维度 | dsh | Codex CLI | Claude Code | OpenCode | pi | mini-swe-agent |
| --- | --- | --- | --- | --- | --- | --- |
| 审批词汇 | policy `ask`/`never` × sandbox 三档；grant 一次性 | `AskForApproval` 四态：`UnlessTrusted`/`OnRequest`/`Granular`/`Never`；决定还有 `ApprovedForSession`、写回规则等多种 | 6 种权限模式（`default`/`acceptEdits`/`plan`/`auto`/`dontAsk`/`bypassPermissions`），`auto` 用第二个模型做分类器 | 规则引擎 `allow`/`ask`/`deny`，取**最后一条**匹配，默认 `ask` | **刻意没有权限系统**，README 建议用容器隔离 | `human`/`confirm`/`yolo` 三档，默认 `confirm` |
| 逐调用弹窗 | 默认不弹；只在沙箱升级或 hook `ask` 时弹 | `OnRequest` 下仅当文件系统策略是 Restricted 才问 | 是，按规则和模式逐调用判 | 是，按规则判 | 无 | 是，正则白名单可免 |
| 规则语言 | 无。只有 mode + 一次性升级 | execpolicy：Starlark 风格 `prefix_rule(pattern=[...], decision="allow\|prompt\|forbidden")`，模型可提议前缀规则并被持久批准 | `Bash(npm run *)`、`Read(~/secrets/**)`、`WebFetch(domain:...)`；求值顺序固定 deny → ask → allow，具体性不改顺序 | `{permission, pattern, action}`；bash 用 tree-sitter 解析命令树，逐子命令判；`always` 的粒度来自一张 **LLM 生成的命令前缀元数表** | 无（有 project trust：未信任目录不加载项目级扩展） | `whitelist_actions` 正则 |
| 持久授权 | **没有** "always allow"，grant 只活一次调用 | `ApprovedForSession`、规则写回 `~/.codex/rules/*.rules` | settings 里的 allow 规则 + 会话内"always" | `always` 写进会话 `approved`，并自动放行同会话其它等待中的匹配请求 | — | — |
| OS 沙箱 | bwrap → Landlock（Linux）、Seatbelt（macOS）、受限令牌+ACL（Windows，`partial`）；fs 另有进程内路径围栏 | Seatbelt / Landlock+seccomp / bubblewrap / Windows 受限令牌；另有受管网络代理 | Seatbelt / bubblewrap（+ socat 网络代理）；**原生 Windows 不支持** | **无 OS 沙箱** | **无**（推荐 Gondolin micro-VM / Docker / OpenShell） | 沙箱=换环境类（`local`/`docker`/`singularity`/`bubblewrap`/…） |
| 网络 | 不在沙箱词汇表内 | 域名白/黑名单渲染进 `<environment_context><network>` | 外部代理按 hostname 放行，首访新域提示；有 TLS 终止+凭据 mask 的实验特性 | 无 | 无 | 无 |
| 拒绝后怎么办 | 模型带 `sandbox_permissions` + `justification` 原样重试一次，人批准才放行 | 沙箱内失败判定为 `Denied` → 用 `"command failed; retry without sandbox?"` 再问一次 → 去沙箱重跑 | 失败信息附上「沙箱挡了哪个路径/主机」，模型可用 `dangerouslyDisableSandbox` 重试并走常规权限流 | 拒绝变成 `CorrectedError` 反馈给模型；`continue_loop_on_deny !== true` 时直接停循环 | — | 拒绝时把用户评论作为 user 消息喂回模型 |
| 自动审核 | 无 | **guardian**：独立子会话重建紧凑 transcript 交给模型判，超时/异常一律拒绝（fail closed） | `auto` 模式的分类器（信任工作目录与会话开始时的 git remotes） | 无 | 无 | 无 |
| 受保护路径 | 无专门名单；靠 sandbox mode 的工作区边界 | deny-read 路径规则；存在 deny-read 时绝不免沙箱 | `.git`、`.claude/`、`.mcp.json`、shell 启动文件等，除 bypass 外**永不**自动批准，allow 规则也不能预批 | `.env`/`.env.*` 读取默认 `ask`；项目外目录单独请求 | 无 | 无 |

三点观察：

- **dsh 的词汇几乎照搬 Codex**（`read-only`/`workspace-write`/`danger-full-access`、`sandbox_permissions`、justification、拒绝后升级重试），但把 Codex 的四态审批砍成了两态，并且**去掉了所有持久授权**。取舍很清楚：宁可没有 allow 规则，也不要一个「批准过一次就一直放行」的状态需要维护和审计。
- **Claude Code 走了完全相反的路**：规则语言极其丰富（顺序固定的 deny/ask/allow、glob、域名、按参数），沙箱是后来才补的，并且专门列了一份「沙箱内也不许写」的路径名单，理由写得很直白：能改这些文件的命令可以给自己授权。dsh 没有对应的名单，因为它的信任模型里「插件本来就有进程权限」。
- **pi 是另一个极端**：明确不做权限系统，把隔离整个推给容器。这不是偷懒，是一种主张：权限系统给的是虚假的安全感，真边界只能是进程/VM 边界。dsh 的 README 其实同意后半句（scope 不是权限边界、worker 不是安全边界），只是它还额外提供了一层真 OS 沙箱。

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

# 谁 opt-in 了并发（应当恰好 8 处）
grep -rn "isConcurrencySafe: () => true" packages/*/*/src/*.ts

# 两段运行时上下文的原文
sed -n '38,52p' packages/sandbox/sandbox-policy/src/index.ts
sed -n '99,103p' packages/interaction/user-approval/src/index.ts

# 模型看到的工具描述（这份文件由启动真实插件后读 schemas() 生成）
grep -n "^### \`" docs/tool-catalog.md
```

想确认「默认不弹窗」这个结论，最直接的读法是把上面两条 `grep` 的结果和 `packages/bundle/base/cordis.patch.yml` 对一遍：调用审批的只有升级和 `ask`，产生 `ask` 的只有 hooks 桥，而默认 bundle 里没有 hooks 桥。

相关的其它篇：工具调度与取消语义见 [03 Agent Loop](03-agent-loop.md)；这两段运行时上下文为什么不进 system prompt 见 [02 KV-Cache](02-kv-cache.md)；子代理的完整委托流程见 [08 Orchestration](08-orchestration.md)；Code Mode 下工具怎么呈现见 [09 扩展与 Code Mode](09-extensions-and-code-mode.md)；术语见 [附录 A 术语表](appendix-a-glossary.md)。

## 自检

**1. 默认组合的审批策略是 `ask`，为什么模型改你的文件还是不弹窗？要让它开始弹，最小的改动是什么？**

因为 `ask` 只决定「有人问的时候要不要转给人」，不决定「什么时候有人问」。整个仓库里只有两个地方会发起审批：沙箱升级（`packages/sandbox/sandbox/src/escalation.ts:157-189`）和 `tools/pre-execute` 返回 `ask`。而返回 `ask` 的唯一实现是 Claude Code 方言的 hook 桥（`packages/hooks/hooks-claude-code/src/index.ts:242`），默认 bundle 没挂它。所以默认组合下弹窗的唯一入口是模型自己在调用里填 `sandbox_permissions` + `justification` 请求升级。最小改动是挂上那个 hooks 桥，或者自己写一个在 `tools/pre-execute` 上返回 `ask` 的插件。

**2. `windows-acl` 后端报 `partial`，`unavailable` 也听着像「不行」。这两个词差在哪？为什么 Windows 不干脆报 `unavailable`？**

它们在两根不同的轴上。`SandboxEnforcement` 只有 `'full' | 'partial'` 两个取值（`packages/sandbox/sandbox/src/index.ts:59`），说的是「这个后端能兑现多少文件效果上的承诺」；`unavailable` 是 `EscalationOutcome` 的成员（`packages/sandbox/sandbox/src/escalation.ts:93`），说的是「审批渠道答不上来」。Windows 的受限令牌确实在限制文件效果，只是有两个 ACL 表达不了的缺口：进程初始化要求 Everyone 出现在两张限制列表里，所以外部对象给 Everyone 授过写权限的仍然可写；NTFS 硬链接还能把工作区内的文件别名到工作区外。报 `partial` 是把这两个缺口如实交给上层，报 `unavailable` 会让 `confine()` 直接抛 `SANDBOX_UNAVAILABLE`，等于在 Windows 上放弃了那部分真实有效的限制。

**3. 子 agent 的审批策略被钉死成 `never`，什么场景下这个设计会咬人？**

`captureDelegatedPolicyOverrides`（`packages/subagent/subagent/src/child-agent.ts:199-204`）只要发现组合里有审批服务，就给子会话写一条 `approval/policy: never`；而 `never` 在 waterfall 之前就短路返回 `rejected`（`packages/interaction/user-approval/src/index.ts:312`）。于是子 agent 永远问不了人，也就永远升不了权，只能把失败报回父级。咬人的场景是一个需要写工作区外文件的任务：父 agent 自己做可以走升级问人，委托给子 agent 就必然失败。更麻烦的是子 agent 收到的 `approval:policy` 段会渲染成禁用版本，那一段明确写着「不要设置 `sandbox_permissions`」，它连试都不会试，报回来的失败原因也就不会提到「需要升级」（这一句是推断，依据是子会话策略为 `never` 时该段落取的是禁用文案）。
