---
title: OpenCode 工具注册、权限询问与副作用边界
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/tool/registry.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/permission/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/question/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/snapshot/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/permission/next.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/tool/registry.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 工具注册、权限询问与副作用边界

## 读者会得到什么

本篇追踪工具从注册到执行的完整决策链。内建工具、自定义文件、Plugin 和 MCP 可以进入工具目录；Provider、模型、Feature Flag、Agent 与 Permission Ruleset 再决定模型实际看到的定义。模型选择工具后，参数校验、权限规则、用户答复、外部目录检查和真实执行仍是后续阶段。目录中存在一个工具，既不等于模型可见，也不等于它可无条件执行。

权限系统使用有序规则，最后一个同时匹配 Permission 与 Pattern 的规则生效；没有匹配时默认 `ask`。`allow` 让当前检查继续，`deny` 直接返回拒绝错误，`ask` 则发布待答事件并等待一次或持续批准。这个机制约束 OpenCode 是否调用能力，却没有创建容器、操作系统用户、网络命名空间或内核沙箱。因此「询问过用户」与「进程被强隔离」不能混为一谈。

Question Tool 又是另一类人机交互：它允许模型向用户提出结构化问题，不应与 Permission Prompt 混写。Snapshot/Patch 可以记录和部分恢复工作树变化，但它不是所有工具副作用的事务回滚；网络请求、外部数据库、Shell 子进程和项目外写入仍需各自的隔离与幂等策略。

审计工具调用时还要保存「模型看到的 Schema」。Registry 中的原始定义可能被 Plugin Hook 改写，Edit、Write 与 Apply Patch 也会随模型切换。仅凭最终 Tool Part 无法判断模型当时有哪些选择、参数约束是否一致；可复现实验应冻结目录、筛选条件、最终 Schema、Ruleset 和用户答复事件。

## 核心概念

工具目录、模型可见表面、应用层权限和操作系统能力是四个边界。Registry 汇总候选工具，筛选与 Hook 形成最终 Schema，Permission 决定 OpenCode 是否继续一次调用，宿主进程或外部沙箱决定副作用真正可达哪里。任何前一层的拒绝都可能阻止调用，前一层的允许却不能越过后一层限制。

Permission Ruleset 是有序决策表。规则同时匹配 permission 与 pattern，最后一个匹配项生效，无匹配默认 ask。`once` 只解决当前 Deferred，`always` 把 Pattern 加入当前实例批准集合，`reject` 让调用失败。规则顺序、Pattern 展开和实例生命周期共同决定结果，不能只统计 allow/deny 数量。

Question Tool 与 Permission Ask 面向不同意图。Question 是模型主动向用户收集任务信息，Permission Ask 是执行能力前的应用层决策。二者都可能在 UI 显示对话框，却应使用不同事件、超时和审计字段。混写会让普通澄清被当成安全批准，或让权限拒绝被误判为用户没有回答业务问题。

| 概念 | 输入 | 输出 | 边界 |
| --- | --- | --- | --- |
| Tool Registry | 内建、项目、Plugin、MCP 定义 | 候选工具集合 | 不保证模型可见 |
| Tool Surface | 模型、Feature、Agent、Hook 后的 Schema | 本次请求工具定义 | 不保证可执行 |
| Tool Call Validation | 名称与参数 | 合法调用或错误 | 不处理 OS 权限 |
| Permission Rule | permission、pattern、action | allow / ask / deny | 应用层调用决策 |
| Permission Reply | once / always / reject | Deferred 结果与实例批准 | 不创建强制隔离 |
| Question Tool | 结构化业务问题 | 用户答案 | 不等同权限审批 |
| Tool Executor | 经允许的调用与宿主环境 | 结果、错误、附件 | 受实际进程能力约束 |
| Snapshot / Patch | 工作树变化 | 差异展示或部分恢复 | 不撤销外部副作用 |

## 为什么这样设计

动态 Registry 让 OpenCode 可以组合内建工具、项目定制、Plugin 和 MCP，并针对不同模型选择 Edit、Write 或 Apply Patch 表面。把筛选放在送模前能减少不适用工具，Definition Hook 则允许调整 Schema。灵活性也意味着可复现记录必须保存最终表面，而非只看源目录。

有序 Permission 规则可以表达从宽默认到具体例外，或从严默认到特定放行。最后匹配语义使后追加的托管或临时规则有机会覆盖先前配置，但也会产生顺序风险。审查器需要按真实合并顺序求值，并展示命中的具体规则。

Ask/Deferred 模型把 UI 响应从工具执行线程解耦。工具可以挂起等待 once、always 或 reject，多个同类请求也可在持续批准后释放。它适合交互控制，不适合作为强制安全边界：无人模式、恶意 Tool 实现或宿主高权限仍需容器、受限账户和网络策略约束。

Snapshot 关注工作树，使编辑预览、Revert 和 Session 恢复更实用。它没有跨文件系统、网络和外部服务的事务协调，因此只能作为文件证据与辅助恢复。强行把所有工具塞进一个假想回滚，会隐藏不可逆动作和状态未知。

Question 与 Permission 分开后，产品还能独立设置超时和无人模式策略。业务问题超时可以让任务等待输入，权限问题超时则应拒绝高风险执行；两者共用一个默认答案会形成隐式授权。

## 实现思路

教学实现把 Tool Surface Snapshot 与 Permission Decision Record 绑定到同一 Tool Call。下面结构是课程数据契约，不是 OpenCode 上游同名类型；它保存 Schema 摘要、规则命中、用户答复和副作用检查，避免只留最终文本。

Pattern 规范化应发生在求值前。路径需要解析符号链接与大小写规则，Shell 命令需要保留实际参数或安全摘要，MCP 工具还要包含服务器身份；只用展示字符串匹配，可能让编码差异或间接路径绕过规则。规范化版本也要进入决策记录。

```ts
interface ToolExecutionRecord {
  callId: string;
  surfaceRevision: string;
  toolName: string;
  argsDigest: string;
  permission: { name: string; pattern: string; matchedRule?: number; action: "allow"|"ask"|"deny" };
  reply?: "once" | "always" | "reject";
  execution: "not-started" | "running" | "completed" | "error" | "unknown";
  sideEffectEvidence: string[];
}
```

1. Registry 汇总内建、自定义、Plugin 与 MCP 定义，记录来源和版本；同名冲突形成诊断，不能静默覆盖后仍声称原定义生效。
2. 按客户端、模型、Provider、Feature Flag、Agent 和 Permission 初筛工具，再执行 Definition Hook，生成最终 Tool Surface 与 Schema 哈希。
3. 模型返回调用后验证名称和参数。Schema 不合法时不进入权限和执行阶段，Tool Part 记录明确错误。
4. 工具调用 `ask()` 时展开 permission、pattern、metadata 和 always patterns，按顺序查找最后匹配规则。命中 deny 直接失败，allow 继续，缺省或 ask 发布事件。
5. once 只完成当前 Request；always 将选定 Pattern 写入实例批准并处理同会话匹配等待者；reject 取消当前或按产品语义拒绝相关请求。
6. 执行器在宿主或已验证隔离环境运行，记录开始、提交点、输出截断、附件、错误和真实目标状态。UI 的允许事件不能替代执行后取证。
7. 对文件工具生成 Snapshot/Patch，并验证 Restore 结果；对网络、数据库、外部目录和后台进程使用幂等键、补偿或专用检查。
8. Eval 读取最终文件、测试和副作用清单。工具 completed、用户允许和 Snapshot 成功都只是输入证据。

强隔离部署应把 Permission 当作额外的人机层。即使规则误配为 allow，容器或策略仍阻止越界；即使操作系统允许，应用层仍可要求用户确认。两层独立失败，才能形成纵深防御。

规则更新与待答请求之间要有明确语义。若请求挂起期间托管策略变为 deny，系统应重新求值或取消旧 Deferred，不能让过期 ask 的 once 答复越过新策略。相反，实例 Dispose 时要拒绝全部未决请求，避免 Promise 永久挂起。

执行记录必须绑定最终参数。若 UI 展示的是摘要而 Tool Hook 在批准后改写参数，批准对象与执行对象已经不同，应重新询问或拒绝。高风险工具最好在决策后冻结参数哈希，并在执行前再次校验。

## 贯穿案例

假设模型要运行 `bash`：在工作区生成报告，同时尝试向外部目录写缓存并调用本地 HTTP 服务。Ruleset 先允许 `bash:*`，后面又对外部路径设置 ask，最后以托管规则拒绝网络命令。由于最后匹配生效，同一工具的不同 Pattern 会得到不同动作。

实验运行在受限临时账户中，并设置一个工作区内哨兵、一个项目外哨兵和只记录请求的本地服务。应用层记录 Permission Event，操作系统层记录实际访问结果；两份证据可以发现工具绕过 `ask()` 或规则与执行参数不一致。

规则与调用可表示为：

```json
{
  "rules":[
    {"permission":"bash","pattern":"*","action":"allow"},
    {"permission":"external_directory","pattern":"*","action":"ask"},
    {"permission":"bash","pattern":"curl *","action":"deny"}
  ],
  "calls":["生成工作区报告","写外部缓存","curl 本地服务"]
}
```

1. Tool Surface Snapshot 显示 bash 对当前模型可见，Schema 经过 Hook 后包含命令和描述。可见只说明模型能选择它。
2. 工作区报告调用命中 bash allow，执行器写入文件并生成 Snapshot Patch。Eval 仍要检查报告内容。
3. 外部路径触发 external_directory ask。用户选择 once 后当前调用继续，但实例中没有持续批准；下一次相同路径仍应询问。
4. `curl` 调用的最后匹配规则是 deny，即使前面存在宽泛 allow 也不执行。Tool Part 记录 rejected，HTTP 服务确认没有收到请求。
5. 若用户曾对外部路径选择 always，只影响批准集合和匹配 Pattern，不把所有 Bash 或网络变成允许。
6. 调用 Snapshot Restore 后工作区报告可恢复；若模拟工具绕过约定写外部缓存，Snapshot 无法撤销，副作用检查仍能发现。

最终记录如下：

```json
{
  "workspaceReport":{"permission":"allow","execution":"completed","snapshotRestored":true},
  "externalCache":{"permission":"ask","reply":"once","snapshotRestored":false},
  "network":{"permission":"deny","execution":"not-started","requestsObserved":0},
  "osIsolation":"需要独立部署证据",
  "taskVerdict":"由报告断言另行给出"
}
```

故障变体让 Plugin 工具完全不调用 `ask()`。应用层 Ruleset 无法拦截其内部网络请求，只有受限网络命名空间或策略代理能强制拒绝。这正是 Permission 与 OS Sandbox 必须分开的原因，也说明 Plugin 来源审查和最终 Schema Snapshot都属于可信计算基。

第二个变体在用户看到命令后由 Hook 改写参数，参数哈希因此改变。执行器应拒绝旧批准并重新发出 Ask；若仍执行，审计判定为批准对象不一致。只保存用户点击「允许」无法发现这种问题。

第三个变体让两个并发请求等待同一 Pattern。`always` 可以按契约释放匹配请求，但每个 Call 仍保留独立 ID 和执行记录；一次拒绝不应错误完成无关 Question Tool。并发测试还要在 Instance Dispose 后确认所有 Deferred 均结束。

最后比较 Snapshot Restore 前后的三个目标：工作区文件应恢复，外部缓存若曾写入仍存在，本地服务收到的请求不可撤销。恢复报告必须逐项列出 retained、reverted 和 unknown，不能只返回一个 success 布尔值。

若外部缓存通过符号链接指向工作区之外，路径规范化与执行时检查还要防止检查后替换目标的竞态。仅在 Ask 阶段解析一次路径不足以构成强边界；受控文件描述符、沙箱挂载或操作系统策略才能收窄这种时间窗口。

MCP 工具同样适用这套模型。Registry 中的服务器工具要绑定服务器身份与 Schema Revision，Permission Pattern 应覆盖服务器和工具名称，网络副作用由 MCP 服务端真实执行。客户端 Snapshot 无法回滚远端动作，Eval 必须读取服务端回执或受控测试替身。

对高风险发布类工具，还应采用二阶段提交或服务端幂等键：Permission 批准只允许进入准备阶段，最终提交前再次核对不可变参数和目标。若服务端无法查询提交状态，Abort 后应标为 unknown 并阻止盲目重试。

公开评测使用假服务和临时账户，不执行真实发布。真实系统还需保留审批人、提交回执、撤销条件和数据保留策略，并将这些证据与模型对话分开存放。

## 真实输入与输出

### 输入

```json
{"tool_catalog":["内建","项目自定义","插件","MCP"],"model":"当前模型","call":{"name":"bash","args":{"command":"执行命令"}},"rules":["allow","ask","deny"],"user_reply":"once | always | reject"}
```

### 输出

```json
{"model_visible":"经过筛选的工具定义","decision":"允许 | 询问 | 拒绝","execution":"成功、错误或未执行","record":"工具部件、事件、快照补丁","os_isolation":"未由应用层权限自动提供"}
```

## 调用链

![OpenCode 工具从注册和模型可见性开始，经参数校验、权限规则与用户答复后执行副作用；应用层批准、快照和操作系统隔离边界分开的中文决策图](../../../assets/diagrams/opencode/03-tools-permission-question-patch.svg)

Claim: opencode.tools.registry-is-model-surface

Claim: opencode.permission.ask-is-not-os-sandbox

1. Tool Registry 汇总内建定义、项目工具文件、Plugin 工具和可用 MCP 工具。
2. 当前客户端、Feature Flag、Provider/Model 与 Agent 规则筛选工具；Definition Hook 还可改写描述和 Schema。
3. 处理器把可见工具定义交给模型，模型返回 Tool Call 后进行名称与参数归一。
4. 工具实现通过 `ask()` 提交 Permission、Pattern、Metadata 与可持续允许项。
5. Permission 按顺序寻找最后一个匹配规则；`deny` 失败，`allow` 继续，`ask` 发布事件并挂起当前 Effect。
6. 用户回复 `once` 只完成当前请求，`always` 把允许 Pattern 加入实例批准列表，并可释放同会话中匹配的待答请求。
7. 工具在宿主环境执行，把输出、附件、截断信息、错误与时间写回 Tool Part。
8. Snapshot 记录工作树差异供补丁展示或恢复；独立验收检查真实文件和测试，外部副作用另行核对。

## 源码证据

工具目录把内建与自定义定义合并，但传给模型前仍会按模型和运行特性过滤：

```source
packages/opencode/src/tool/registry.ts:256-339
const filtered = (yield* all()).filter((tool) => {
  if (tool.id === ApplyPatchTool.id) return usePatch
})
```

权限求值采用最后匹配规则，空集合或无匹配回退到询问：

```source
packages/opencode/src/permission/index.ts:28-38
.findLast((rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern)) ?? {
  action: "ask"
}
```

运行时不会把 `ask` 当作隐式允许。它发布请求并等待 Deferred；`always` 才把选定 Pattern 放入当前实例批准列表。

```source
packages/opencode/src/permission/index.ts:67-105
if (rule.action === "deny") return yield* new PermissionV1.DeniedError(...)
yield* events.publish(Event.Asked, info)
return yield* Deferred.await(deferred)
```

## 失败与限制

第一，工具可见性不是权限执行结果。某工具对模型隐藏可以降低误调用概率，但 Plugin、Hook、Code Mode 或配置变化会改变表面；必须冻结有效目录和 Ruleset。

第二，规则是顺序敏感的。更宽的通配规则若放在后面，可以覆盖更具体的拒绝项。审计不能只检查「是否写过 deny」，还要按真实合并顺序计算最终动作。

第三，`always` 是实例内批准规则，不是跨平台强制访问控制。工具内部若绕过约定的 `ask()`，应用层规则无法替代操作系统能力限制。

第四，External Directory Permission 约束被正确实现的工具访问项目外路径；它不自动阻止任意 Shell 命令、子进程、符号链接竞态或已授权工具自身的漏洞。

第五，Snapshot 主要覆盖工作树文件。它无法撤销已经发送的网络请求、数据库写入、包发布、外部目录删除或后台进程。

第六，用户批准证明的是某次界面答复，不证明用户理解全部展开命令，也不证明实际执行内容与展示摘要完全相同。高风险操作还需固定参数、最小权限和执行后取证。

## 验证方法

建立包含内建、自定义、Plugin 与 MCP 工具的测试实例，切换模型、Code Mode、Question Tool Flag 和 Agent Permission。保存 `registry.ids()` 与真正交给模型的 Tool Schema，验证目录和模型表面没有被混写。

对同一 Bash Pattern 依次排列 `allow -> deny` 与 `deny -> allow`，确认最后匹配规则生效；再测试空 Ruleset、未知 Permission、`once`、`always`、Reject 和多个并发待答请求。

副作用实验使用临时仓库、项目外临时目录和受控本地 HTTP 服务。分别执行文件编辑、Shell 外部写入和网络请求，再调用 Snapshot Restore；记录哪些变化被恢复、哪些仍存在。若需要强隔离，应在容器、受限账户或专用沙箱中重复，而不是把 Permission Prompt 当作隔离证据。

## 自检

### 问题 1

工具出现在 Registry 中就会交给模型吗？

**答案：** 不会。模型、Provider、Feature Flag、Agent、Permission 和 Code Mode 还会改变最终可见表面。

### 问题 2

没有匹配权限规则时会怎样？

**答案：** 默认动作是 `ask`，系统发布待答事件并等待用户答复。

### 问题 3

Permission `allow` 是否等同于操作系统沙箱放行？

**答案：** 不等同。它只是应用层调用决策，本身不创建进程、文件系统或网络隔离。

### 问题 4

Snapshot Restore 能否撤销所有工具副作用？

**答案：** 不能。它主要面向工作树文件，网络、数据库、外部路径和后台进程要单独治理。
