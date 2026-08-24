# 工具、审批、Sandbox 与一次性提权

[返回 DeepSeek Harness 课程地图](README.md)

工具能被模型看到，不等于能绕过策略执行。DeepSeek Harness 把工具 Schema、Runtime Pipeline、Approval 和 Sandbox 分开：Schema 告诉模型怎样提出调用；Runtime 校验、调度和归一化结果；Approval 决定是否授予一次性许可；Sandbox 最终约束文件和进程能力。

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

任何一层放行都不能替代下一层。例如 Approval 允许一次更宽 Sandbox，只说明用户同意这次请求；内核、文件 ACL 或执行器仍可能拒绝实际操作。

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

规范输出要求工具先返回可验证 JSON Value，再由纯 `render()` 投影成模型内容。这样 UI、模型文本和结构化业务值不会被一个任意字符串混为一谈。

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

Runtime 禁止在 Root Context 上调用 `restrict()`，因为那会意外屏蔽所有 Agent。空 Restriction 也会失败，避免「配置材料化为空却被当成有效策略」。

## 并行默认是拒绝式选择

工具只有在 `isConcurrencySafe(args)` 精确返回 `true` 时才能和兄弟调用重叠。未声明、抛异常、返回非 true、工具隐藏或参数非法时一律 exclusive。

源码：[查看并发分类](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L1270-L1284)

这是一种 fail-closed 设计：读文件可能安全并行，修改共享状态的工具默认形成屏障。并发安全声明只描述与同批工具重叠，不代表该工具整体安全或无需权限。

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

Approval 要求 Turn 仍开放，因为 Turn 是持久化提交与重放边界。把询问事件写在 Turn 之间，崩溃恢复时可能像无主尾部而被丢弃。

`ask` 策略把问题交给已组合 Answerer；没有 Answerer 时返回 unavailable。`never` 在服务内部直接拒绝，后注册 Listener 无法绕过。Headless/CI 应使用确定性 `never`，而不是期待无人回答的 Prompt 自动安全结束。

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

目标枚举不能只根据部署默认 Mode 缩减，因为 Session 可能运行时切到更窄 Mode。真正「是否更宽」必须在执行时用本调用有效 Mode 判断。

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

申请同级或更窄 Mode 不会打扰用户；缺少 Approval Service、缺 Agent、拒绝、取消和无通道都失败关闭。一次性授权也不能沉淀成永久白名单。

## ToolRuntime 如何保证取消后不遗留活动

Runtime 的 `dispatchToolBody()` 会融合调用方信号与 Wrapper 替换信号。工具体一旦开始，取消不会直接遗弃 Promise；Runtime 等它达到静止，再把结果规范化为 aborted。

源码：[查看 Tool Body 分派](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L1527-L1559)

同进程 JavaScript 不能被 Runtime 强行杀死，所以 Tool 必须合作观察 `exec.signal`，并把它传给子进程、网络或文件操作。声明 timeout 也只有在相应 Policy Wrapper 已组合且 Tool 合作取消时才真正有效。

## 三个平台的 Sandbox 不能假设完全同构

Linux 可以使用 Bubblewrap/Landlock 等 Provider，macOS 常用 Seatbelt，Windows 可能依赖 ACL 或受限进程链。统一 Mode 是 Harness 契约，不代表内核能力完全一致。部署验收至少测试：

1. read-only 下工作区写入确实失败；
2. workspace-write 不能越过工作区边界；
3. 提权必须先出现 Approval Event；
4. 拒绝后没有子进程或文件副作用；
5. Sandbox 不可用时是否失败关闭，而非静默裸跑；
6. 符号链接、盘符、网络和子进程继承是否符合平台策略。

下一篇：[Session、Compaction 与冷恢复](05-session-compaction.md)。
