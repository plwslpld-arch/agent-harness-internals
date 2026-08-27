# Confirmation、Policy、模型 Safety 与 Sandbox 是四条边界

[返回 Gemini CLI 课程地图](README.md)

上一章跟着一个 Tool Call 走过 Registry（注册表）、活动视图和 Scheduler，又看了系统怎样规范化 Invocation（调用实例）并收拢执行结果，最后停在 Policy Decision 与 Confirmation。走到授权这一步，你会碰到四个都像是在管「安全」的名字，可它们各管一段：PolicyEngine 判断工具动作该允许、拒绝还是询问，Confirmation Bus 把用户决定配回这次调用，模型用 `SAFETY` 说明为什么停止生成，只有 SandboxManager 才会把文件、网络、环境和进程限制写成平台真正执行的规格。

```text
Tool Invocation
     ↓
PolicyEngine：ALLOW / DENY / ASK_USER
     ↓
Confirmation Bus：请求与响应配对
     ↓
SandboxManager：平台命令与权限
     ↓
Process / Tool 执行

模型 SAFETY：属于上游生成响应，不在这条执行授权链中
```

## 第 1 站：非交互默认拒绝，交互默认询问

源码：[查看 Policy 默认值](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/policy/policy-engine.ts#L290-L298)

```typescript
this.defaultDecision =
  config.defaultDecision ??
  (this.nonInteractive
    ? PolicyDecision.DENY
    : PolicyDecision.ASK_USER)

this.sandboxManager =
  config.sandboxManager ?? new NoopSandboxManager()
```

- **调用者**：Core Config 创建 PolicyEngine。
- **输入**：规则集、是否非交互、默认决定和 Sandbox Manager。
- **状态变化**：确定没有规则命中时的行为。
- **返回**：后续 `check()` 使用的 PolicyEngine。
- **下一站**：Confirmation Bus 对具体 Invocation 查询决定。

非交互任务里没人能点击确认，如果默认走 ASK_USER，任务就会一直等下去，因此系统直接选择 DENY。这里还要看懂 `NoopSandboxManager` 这个名字：Policy（策略）和 Sandbox 可以分开配置，前者决定没有规则命中时该怎么办，后者则可能明确选用 Noop 实现，完全不加隔离。

## 第 2 站：Message Bus 不自己发明授权

源码：[查看确认路由](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/confirmation-bus/message-bus.ts#L104-L153)

```typescript
const { decision } = await this.policyEngine.check(...)

switch (decision) {
  case PolicyDecision.ALLOW:
  case PolicyDecision.DENY:
  case PolicyDecision.ASK_USER:
}
```

- **调用者**：Scheduler 准备执行需要确认的 Invocation。
- **输入**：工具动作、会话语境和 Confirmation Request。
- **状态变化**：ALLOW 直接继续；DENY 生成拒绝；ASK_USER 发布请求并等待关联响应。
- **返回**：本次调用的确认结果。
- **下一站**：Executor 或取消路径。

Confirmation ID 必须关联 Call ID，这样系统才能把用户的每次响应配回那一条具体调用。用户批准的是另一条命令时，当前正在等待的调用绝不能把这个决定拿走。调用身份不能串。

## 第 3 站：只有启用 Sandbox 才选择平台后端

源码：[查看 Sandbox Manager Factory](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/services/sandboxManagerFactory.ts#L31-L42)

```typescript
if (sandbox?.enabled) {
  // win32 -> WindowsSandboxManager
  // linux -> LinuxSandboxManager
  // darwin -> MacOsSandboxManager
}
return new NoopSandboxManager(options)
```

- **调用者**：Core 启动与配置刷新。
- **输入**：Sandbox 开关、平台和选项。
- **状态变化**：实例化平台后端或明确的 Noop 实现。
- **返回**：Policy/Executor 使用的 SandboxManager。
- **下一站**：具体工具请求调用 Manager 生成执行规格。

Policy 给出 ALLOW、Sandbox Manager 却选了 Noop，这是一种明确存在的配置组合，日志不能把它记成「已隔离」，因为动作虽然获准执行，进程实际上没有套上任何 Sandbox 后端。反过来也一样，即使启用了 Sandbox，工具动作仍要先过 Policy。这两层不能混。

## 平台后端必须产生真实执行变化

### Linux

源码：[查看 Bubblewrap 包装](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/sandbox/linux/LinuxSandboxManager.ts#L301-L329)

```typescript
const bwrapArgs = await buildBwrapArgs(...)
bwrapArgs.push('--seccomp', '9')
// 执行 bwrap，并把原命令放在包装参数之后
```

### macOS

源码：[查看 Seatbelt 包装](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/sandbox/macos/MacOsSandboxManager.ts#L172-L192)

```typescript
const sandboxArgs = buildSeatbeltProfile(...)
return {
  program: '/usr/bin/sandbox-exec',
  args: ['-f', tempFile, '--', finalCommand, ...finalArgs],
}
```

- **调用者**：执行工具在启动进程前调用当前平台 Manager。
- **输入**：原程序、参数、工作目录和权限选项。
- **状态变化**：生成 Bwrap/Seatbelt/Windows 包装与临时策略文件。
- **返回**：真正交给 Process Host 的程序和参数。
- **下一站**：进程启动；初始化失败进入 Tool Error。

核对 Sandbox 时别只看 Config 开关，你还得跟着平台 Manager 生成的执行规格往下查，看看最终的 Program/Args、临时 Profile（配置档）、网络和挂载参数，以及启动时抛出的错误，确认 Process Host 收到的确实是包装后的命令。

## 模型 Safety 属于另一条链

模型可能用 `SAFETY` FinishReason 拒绝继续生成，这件事发生在 Tool Invocation 出现以前，只能说明 Provider（模型提供商）拦下了这次内容。它既不能告诉你本地命令有没有经过 Policy 和 Sandbox，也不能替你核对后面的执行授权链。

做评测时，模型拒绝、用户拒绝工具和 Sandbox 初始化失败必须分成三类错误，因为它们发生的位置不同，修复办法也不同。分清以后，你还得追问运行时历史、模型投影和 JSONL 记录各自留下了什么，Compression 怎样拿摘要换掉旧 Context，以及 GEMINI.md 和 Memory Service 怎样把知识带到下一次会话，这正是下一篇要拆开的五种「过去信息」。

下一篇：[Session、记录、压缩与 Memory](05-session-history-compression-memory.md)。
