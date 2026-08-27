# 工具、审批、Sandbox 与一次性提权

[返回 DeepSeek Harness 课程地图](README.md)

模型看得到某个工具，并不表示它能绕过策略直接执行。各层不能互相代替。DeepSeek Harness 把 Tool Schema、Runtime Pipeline、Approval（审批）和 Sandbox 分成几层，分别处理不同问题。Schema 告诉模型怎样提出调用，Runtime 随后校验参数、安排执行并统一结果格式，Approval 决定是否只放行这一次请求，Sandbox 则真正限制文件和进程能够触及的范围。

## 一次工具调用的安全链

```text
模型 ToolCall
  → Agent Loop 记录 tool/call
  → ToolRuntime 解析可见定义与 Scoped Restriction
  → pre-execute / policy / approval
  → Sandbox 或其他执行器
  → post-execute / 结果规范化
  → Session 记录 tool/result
```

前一层放行后，调用仍要接受后一层检查。即使 Approval 允许某次调用使用范围更宽的 Sandbox，也只能证明用户同意了这次请求，真正开始执行时，操作系统内核、文件 ACL 或执行器仍可拒绝操作。

### 第 1 站：工具定义同时声明输入、输出和执行体

源码：[查看 ToolDefinition](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L211-L269)

```typescript
export interface ToolDefinition extends ToolSchema {
  readonly output: ToolOutputDefinition
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  finalizeContent?(exec, result): ContentBlock[] | undefined
  timeoutMs?: number
  isConcurrencySafe?(args: unknown): boolean
}
```

- **调用者**：文件、Shell、Todo、MCP Bridge 等插件向 ToolRuntime 注册定义。
- **输入**：模型可见 Schema、规范输出 Schema、执行函数和可选并发/超时元数据。
- **状态变化**：定义进入 Global 或 Agent Scope Registry，还没有执行。
- **返回**：注册函数返回精确 disposer，用于卸载定义。
- **下一站**：SystemPrompt 获取可见 Schema；模型提出调用后 Runtime 解析同一个 Scoped 定义。

工具要先返回可验证的 JSON Value，再由纯函数 `render()` 转成模型内容。这样一来，UI 展示、模型文本和结构化业务值不会全被塞进一个任意字符串，调用方也能分别验证和使用它们。

### 第 2 站：注册与 Scope Restriction 是不同操作

源码：[查看注册和限制](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L1031-L1080)

```typescript
register(definition: ToolDefinition): () => void {
  ...
  return this.layers.effect(
    this.ctx,
    layer => layer.tools.insert(name, definition),
  )
}

restrict(filter: ToolRestriction): () => void {
  const scope = scopeOf(this.ctx)
  if (scope === undefined) throw new Error(...)
  ...
}
```

- **调用者**：Host 插件注册全局工具；Agent Preset 可以注册局部工具或限制全局集合。
- **输入**：完整 ToolDefinition，或 allow/deny Restriction。
- **状态变化**：Scoped Tool 可以遮蔽 Global；Restriction 只影响目标 Agent Scope。
- **返回**：可撤销本次变更的 disposer。
- **下一站**：Prompt Assembly 和执行解析都读取相同 Scoped 可见集合。

Runtime 禁止在 Root Context 上调用 `restrict()`，因为这会意外屏蔽所有 Agent。Restriction 为空时，调用同样会直接失败，避免系统把「配置最终展开为空」误认成一条有效策略。

## 并行默认是拒绝式选择

只有 `isConcurrencySafe(args)` 明确返回 `true`，工具才能与同批的其他调用重叠执行。如果工具没有声明该函数、函数抛出异常或返回的不是 true，又或者工具不可见、参数不合法，Runtime 都会把这次调用按 exclusive 处理。

源码：[查看并发分类](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L1270-L1284)

这里采用 fail-closed 策略。读取文件一类工具可能适合并行，但工具只要会修改共享状态，就默认阻断同批调用与它重叠执行。并发不等于安全。并发安全声明只回答「能否与同批工具同时运行」，既不保证工具整体安全，也不会免除权限检查。

### 第 3 站：Approval 每次询问都写成一对 Session Event

源码：[查看 Approval 请求](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/interaction/user-approval/src/index.ts#L250-L275)

```typescript
const id = ApprovalRequestId(randomUUID())
session.append('approval/asked', {
  id, toolName: req.toolName, callId: req.callId, reason: req.reason,
})
const outcome = await this.decide(req, session)
session.append('approval/decided', { id, outcome })
return outcome
```

- **调用者**：Sandbox 提权或其他需要人类决定的策略层。
- **输入**：发起 Agent、Tool 名、Call ID、理由和取消信号。
- **状态变化**：在同一开放 Turn 内先记 asked，再记 decided；两者用 Approval ID 关联。
- **返回**：`allowed-once`、`rejected`、`cancelled` 或 `unavailable`。
- **下一站**：策略层只在 `allowed-once` 时继续本次执行。

两条记录必须配对。Approval 要求当前 Turn 仍处于开放状态，因为系统以 Turn 划分持久化提交和重放范围。如果询问事件落在两个 Turn 之间，崩溃恢复时就可能把它当作不属于任何 Turn 的尾部记录并丢弃。

`ask` 策略会把问题交给已经接入的 Answerer，没有 Answerer 时便返回 unavailable。`never` 则由服务内部直接拒绝，之后注册的 Listener 也无法改变这个决定。因此，Headless/CI 环境应该采用结果确定的 `never`，不要指望无人回答的 Prompt 会自动安全收尾。

## Sandbox Mode 与 Approval Policy 不是同一个轴

- Sandbox Mode 决定调用在什么文件/进程边界运行，如 read-only、workspace-write、danger-full-access。
- Approval Policy 决定遇到需要授权的请求时能否询问。
- 一次调用可以在 workspace-write 下直接运行，也可以请求更宽模式；请求更宽必须先获 Approval。

### 第 4 站：提权参数必须成对并严格变宽

源码：[查看提权参数与 Mode 阶梯](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/sandbox/sandbox/src/escalation.ts#L22-L59)

```typescript
export const WIDER_MODES = {
  'read-only': ['workspace-write', 'danger-full-access'],
  'workspace-write': ['danger-full-access'],
}

if (sandboxPermissions !== undefined && justification === undefined) {
  throw new Error('... requires a justification')
}
```

- **调用者**：Shell 和文件工具在解析 `sandbox_permissions` 时调用。
- **输入**：目标 Mode 和用户可读理由。
- **状态变化**：这里只校验请求形状，不改变会话默认 Mode。
- **返回**：合法时无返回；缺字段、空理由或错误配对直接抛错。
- **下一站**：`approveEscalation()` 对照本次调用的有效 Mode 并发起 Approval。

系统不能只根据部署时的默认 Mode 缩减目标枚举，因为 Session 运行期间可能切换到范围更窄的 Mode。执行每次调用时，都要拿它当时生效的 Mode 作比较，才能判断申请的目标是否确实更宽。

### 第 5 站：授权发生在任何执行之前

源码：[查看 `approveEscalation()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/sandbox/sandbox/src/escalation.ts#L144-L187)

```typescript
if (!(WIDER_MODES[effectiveMode] ?? []).includes(mode as SandboxMode)) {
  throw new Error('... is not strictly wider ...')
}
if (approval.approver === undefined) throw new Error('... no approval service ...')
if (approval.agent === undefined) throw new Error('... no agent ...')

const outcome = await approval.approver.request({ ... })
switch (outcome) {
  case 'allowed-once': return mode as SandboxMode
  default: throw new Error(...)
}
```

- **调用者**：具备提权字段的 Tool，在启动命令或文件变更前调用。
- **输入**：目标 Mode、有效 Mode、理由、Agent、Call ID 和 Approval Service。
- **状态变化**：Approval 轨迹写入 Session；不会改写后续调用的默认 Mode。
- **返回**：只在 allowed-once 时返回本调用使用的 Mode。
- **下一站**：执行器以该 Mode 运行这一次操作。

授权不会永久生效。申请同级或范围更窄的 Mode 时，系统不会询问用户。只要 Approval Service 或 Agent 缺失，或者用户拒绝、取消、没有可用回答通道，本次执行就会按失败处理。即使获得授权，也只对当前调用生效。

## ToolRuntime 如何保证取消后不遗留活动

取消仍需工具配合。Runtime 的 `dispatchToolBody()` 会合并调用方传入的信号与 Wrapper 替换后的信号。工具体一旦开始运行，收到取消请求后，Runtime 不会丢下仍在执行的 Promise，而会等待工具停止活动，再把结果统一标记为 aborted。

源码：[查看 Tool Body 分派](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L1527-L1559)

同一进程内运行的 JavaScript 无法由 Runtime 强行终止，因此 Tool 必须主动检查 `exec.signal`，并继续把信号传给子进程、网络请求或文件操作。即使 Tool 声明了 timeout，也要等相应的 Policy Wrapper 接入，而且 Tool 本身配合取消，超时限制才真正生效。

## 三个平台的 Sandbox 不能假设完全同构

Linux 可以使用 Bubblewrap/Landlock 等 Provider，macOS 常用 Seatbelt，Windows 则可能依赖 ACL 或受限进程链。统一 Mode 只是 Harness 对外提供的行为契约，各平台未必具备完全一致的内核能力，因此部署验收至少要测试：

1. read-only 下工作区写入确实失败；
2. workspace-write 不能越过工作区边界；
3. 提权必须先出现 Approval Event；
4. 拒绝后没有子进程或文件副作用；
5. Sandbox 不可用时是否失败关闭，而非静默裸跑；
6. 符号链接、盘符、网络和子进程继承是否符合平台策略。

下一篇：[Session、Compaction 与冷恢复](05-session-compaction.md)。
