# Confirmation、Policy、模型 Safety 与 Sandbox 是四条边界

[返回 Gemini CLI 课程地图](README.md)

上一章沿着一个 Tool Call 走过 Registry、活动视图与 Scheduler，经过规范化 Invocation 和执行终态，最后停在 Policy Decision 与 Confirmation。到了这条授权链，Gemini CLI 中四个名字都与「安全」有关，位置却完全不同——PolicyEngine 判断工具动作是允许、拒绝还是询问，Confirmation Bus 负责关联一次用户决定，而模型 `SAFETY` 表示生成结束原因，只有 SandboxManager 会把文件、网络、环境和进程限制转换为平台执行规格。

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

非交互任务没有人能点击确认，如果默认 ASK_USER 就会永久等待，所以系统选择 DENY。`NoopSandboxManager` 的存在也说明 Policy 与 Sandbox 可以独立配置，因为前者决定没有规则命中时怎样处理，后者则允许明确使用 Noop 实现。

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

Confirmation ID 必须与 Call ID 关联，使一次请求和一次响应按具体调用配对，因为用户批准另一条命令，不能被正在等待的调用误消费。

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

Policy ALLOW 加 Noop Sandbox 是一种明确的配置状态，日志不能把它写成「已隔离」，因为这时 Policy 虽然允许了动作，Sandbox Manager 却还是 Noop 实现。反过来，启用 Sandbox 也不会绕过 Policy。

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

核对 Sandbox 不能只看 Config 开关，还应沿着平台 Manager 生成的执行规格，查看最终 Program/Args、临时 Profile、网络/挂载参数和启动错误，确认包装确实进入了 Process Host。

## 模型 Safety 属于另一条链

模型可能以 `SAFETY` FinishReason 拒绝生成，而这个结果发生在 Tool Invocation 出现之前。它反映的是 Provider 的内容安全决定，属于上游生成响应，所以既不能说明本地命令是否受 Policy/Sandbox 控制，也不能代替执行授权链的核对。

评测中应把模型拒绝、用户拒绝工具和 Sandbox 初始化失败分成不同错误类别。分清这些发生在不同位置的结果之后，还要继续追问运行时历史、模型投影与 JSONL 记录分别保留了什么，Compression 如何用摘要替换旧 Context，以及 GEMINI.md/Memory Service 如何保存跨会话知识。下一篇就从这五种「过去信息」继续。

下一篇：[Session、记录、压缩与 Memory](05-session-history-compression-memory.md)。
