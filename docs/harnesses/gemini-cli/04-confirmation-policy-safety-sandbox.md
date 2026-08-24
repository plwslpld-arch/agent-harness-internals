---
title: Gemini CLI 确认、策略、安全与沙箱边界
article_type: harness
harness: gemini-cli
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"gemini-cli","path":"packages/core/src/confirmation-bus/message-bus.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/policy/policy-engine.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/services/sandboxManagerFactory.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/sandbox/linux/LinuxSandboxManager.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/sandbox/macos/MacOsSandboxManager.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/sandbox/windows/WindowsSandboxManager.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/cli/src/config/sandboxConfig.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/cli/src/config/config.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/core/turn.test.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"}]
---

# Gemini CLI 确认、策略、安全与沙箱边界

## 读者会得到什么

本篇把四个经常被写成同一个「安全层」的机制拆开：PolicyEngine 决定允许、拒绝还是询问用户；MessageBus 传递并关联确认；模型的 SAFETY 只是候选结束原因；SandboxManager 才把文件、网络、环境和进程权限落实到平台后端。读完后，你可以从一次工具请求追到执行命令，同时指出每层能证明什么、不能证明什么。

先记住最重要的结论：前一层通过，只表示调用取得进入下一层的资格。用户点了允许，不等于命令安全；Policy 返回允许，不等于沙箱启用；沙箱成功包装，不等于目标结果正确。

## 核心概念

安全判断分为模式约束、Policy、确认通道、平台隔离和模型 FinishReason。前四者位于工具执行路径，第五个属于模型响应。它们共享 Session 与 callId 关联，却没有共同的 `safe` 布尔值。

| 概念 | 直接输入 | 直接输出 | 不能证明 |
|---|---|---|---|
| 审批模式 | Settings、信任、管理策略 | DEFAULT、PLAN、AUTO_EDIT、YOLO | 某调用已获授权 |
| PolicyEngine | 工具、参数、规则、交互性 | ALLOW、DENY、ASK_USER | OS 隔离已生效 |
| MessageBus | Policy 决定、correlationId | confirmed、requiresUserConfirmation | 一定由人点击 |
| 用户确认 | 展示请求与选择 | 单次允许、拒绝、持久规则 | 风险评估正确 |
| SandboxManager | 命令、路径、网络、平台 | 包装程序、参数、环境 | 无旁路或业务成功 |
| 外层 Sandbox | CLI 启动配置 | 容器或宿主启动方式 | 逐工具 manager 同样启用 |
| FinishReason.SAFETY | 模型候选 | Turn Finished | 工具被 Policy 拒绝 |
| 副作用 Scorer | 执行前后产物 | 合规 / 越界 / 不确定 | 模型回答整体正确 |

非交互语义尤其重要。没有界面监听器时，ASK_USER 不能无限等待，也不能默认同意；MessageBus 返回 requiresUserConfirmation，调用方据此结算。PolicyEngine 的非交互默认是 DENY，防止不存在的人类成为隐式授权来源。

用户确认应绑定规范化工具请求、callId 和权限范围。`confirmed: true` 可以由 Policy ALLOW 自动产生，因此审计必须保存确认来源；ProceedAlways 之类选择可能更新后续规则，还要记录规则版本和作用域。

Sandbox 有两层：CLI 外层可以选择 Docker、Podman、runsc 等启动方式，Core 逐工具 manager 又可按平台包装命令。两者可能同时、分别或都不启用。`sandbox.enabled` 只是一项配置，实际后端、最终 program / args、环境清洗和进程创建才是执行证据。

模型 SAFETY 只结束当前候选生成。Turn 在收到 FinishReason 后发布 Finished，不经过 PolicyEngine；此前工具可能已经执行。评测时间线必须将模型安全事件和工具授权事件分列，避免把同名「安全」合并。

## 为什么这样设计

第一，审批模式先约束全局交互风格，Policy 再针对具体调用判定。计划模式可以限制写操作，YOLO 可以被管理员或未受信目录压回，单个工具规则仍独立发挥作用。

第二，Policy 与 MessageBus 分离，使规则决策可用于交互和 Headless。Policy 返回 ASK_USER，MessageBus 根据是否有监听器决定交互或返回结构化需求；业务规则不必依赖某个终端组件。

第三，平台 Sandbox 与授权分离，承认「允许做」和「只能在何处做」是两类问题。Policy 可以跨平台复用，Linux Bubblewrap、macOS Seatbelt 和 Windows 受限令牌分别兑现能力。

第四，外层和逐工具隔离同时存在，满足不同威胁模型。整个 CLI 可运行在容器里，单个命令仍按权限包装；审计分别记录，避免一个绿色标签掩盖另一层 Noop。

第五，模型 SAFETY 保持在响应域，避免把内容保护误用为主机安全。模型拒绝生成不能撤销已发生副作用，工具 Policy 拒绝也不意味着模型一定返回 SAFETY。

第六，决策链保存关联标识和中间状态，使撤销与竞态可解释。用户在确认后、进程启动前取消，系统可以阻止本次执行；进程已启动后只能请求终止并检查副作用。一个最终 Cancelled 标签无法表达这两种安全差别。

## 实现思路

教学安全链使用追加型 `SafetyDecisionTrace`，它是课程蓝图，不表示 Gemini CLI 存在同名统一类型。

1. **解析运行模式。** 合并设置、命令行、目录信任和管理策略，记录模式被压回或禁用的原因。
2. **规范化工具请求。** 保存 callId、工具、参数哈希、工作目录和请求权限，拒绝确认后参数漂移。
3. **运行 Policy。** 按规则优先级、工具注解、MCP 来源、子 Agent 和交互性生成三态决定，保存命中规则。
4. **关联确认。** MessageBus 以 correlationId 路由；ALLOW 自动确认，DENY 明确拒绝，ASK_USER 有监听器才等待用户。
5. **准备隔离。** 记录外层启动方式和逐工具 manager，生成最终 program、args、读写路径、网络与环境。
6. **执行并清理。** 只有控制面通过且 Sandbox 准备成功才创建进程，保存退出、临时文件清理和副作用。
7. **独立记录 SAFETY。** 模型 FinishReason 进入响应 Trace，不覆盖工具决定。
8. **交给 Scorer。** 安全 Scorer 检查允许集合，任务 Scorer 检查目标产物，两者分开输出。

```text
mode = resolve_mode(settings, trust, admin_policy)
decision = policy.check(tool_call, mode, non_interactive)
confirmation = message_bus.resolve(decision, correlation_id)
如果未确认: 返回结构化拒绝
sandbox = prepare_outer_and_tool_sandbox(platform, permissions)
如果要求隔离但无法准备: 失效关闭
result = execute(sandbox.command)
score_side_effects(result.artifacts, allowed_set)
```

Trace 同时保存 Policy 决定和确认来源，避免 `confirmed: true` 被误读成人工批准。程序参数与界面展示都关联规范化请求哈希，批准后任何变更都要求重新判断。秘密只做脱敏与哈希。

测试矩阵正交变化审批模式、交互性、Policy 三态、监听器、平台 manager 和外层 Sandbox。每个格子检查是否创建 Executor、实际包装命令和副作用；模型 SAFETY 作为独立轴注入。

实现还要冻结确认时展示的规范化请求。用户批准后若 Hook 改写参数、工作目录或权限范围，旧确认立即失效并重新进入 Policy；否则界面看到的内容与进程执行的内容不一致。持久规则同样绑定工具和参数范围，而非仅绑定名称。

平台能力清单随运行记录保存：哪些读写规则、网络控制、进程限制和环境清洗由当前后端直接强制，哪些不可用。无法证明的能力写 unavailable，不能用另一个平台测试补齐。

## 贯穿案例

任务要求读取公开配置、写入报告，再尝试读取秘密文件。目录刚被信任，模式 DEFAULT，Policy 对只读公开文件 ALLOW、工作区写 ASK_USER、秘密路径 DENY；Linux 逐工具 Sandbox 已启用。

1. **读取公开文件。** Policy ALLOW，MessageBus 自动生成 confirmed；证据标记来源为 policy，而非用户点击。Bubblewrap 包装后进程成功。
2. **写入报告。** Policy ASK_USER，界面用 correlationId 展示精确路径；用户只批准本次写入，规则不扩张到其他文件。
3. **执行与检查。** Sandbox 允许报告目录写入并关闭网络，进程退出零；副作用检查确认只有目标文件变化。
4. **拒绝秘密读取。** Policy DENY，MessageBus 返回 confirmed false，Executor 从未启动；模型随后可以正常 STOP。
5. **注入 SAFETY。** 下一次模型响应因 SAFETY 停止，该事件只属于模型候选，不改写前面三次工具轨迹。
6. **独立评分。** 任务 Scorer 检查报告，安全 Scorer 检查秘密未泄露；两个结果分别保存。

```json
{"call":"write-report","policy":"ASK_USER","confirmationSource":"user-once","sandbox":"linux-manager","processExit":0}
```

```json
{"call":"read-secret","policy":"DENY","executorStarted":false,"modelFinishLater":"SAFETY"}
```

Headless 变体没有界面监听器，写报告返回 requiresUserConfirmation，不会卡住或自动放行；Trial 依据预先声明的 Target 约束判 blocked 或 fail，不能临时切 YOLO。

Noop 变体让 Policy ALLOW，但逐工具 Sandbox 未启用。运行记录只能写「已授权、无逐工具隔离」，不能沿用上一调用的后端标签。若任务要求强制 Sandbox，启动前门禁直接失败。

最后让命令在允许目录内写错文件。安全 Scorer可能判合规，任务 Scorer仍 fail；确认、隔离与正确性由此保持独立。

## 真实输入与输出

### 输入

上游 MessageBus 测试发送的确认请求包含事件类型、工具调用与关联标识：

```json
{"type":"tool-confirmation-request","toolCall":{"name":"test-tool","args":{}},"correlationId":"123"}
```

另一个真实输入来自 Turn 上游测试：模型候选携带 `finishReason: "SAFETY"` 和文本 `Content blocked`。这个输入属于模型响应面，不是工具确认消息。

### 输出

同一个确认输入由 Policy 决定三个分支。ALLOW 直接产生 `confirmed: true`；DENY 同时发出策略拒绝和 `confirmed: false`；ASK_USER 有界面监听器时转给界面，没有监听器时立即返回 `requiresUserConfirmation: true`，避免 Headless 流程长时间悬挂。

```json
{"type":"tool-confirmation-response","correlationId":"123","confirmed":false,"requiresUserConfirmation":true}
```

这里的 `confirmed: true` 可能来自策略自动允许，并不证明有人点击确认。反过来，`confirmed: false` 也要区分策略拒绝、没有可用界面和用户取消。

模型安全夹具的输出是一条 Content 和一条 Finished；它不会因此生成 Tool Policy 的 ALLOW、DENY 或 ASK_USER，也不会配置平台沙箱。

Linux SandboxManager 的测试输入是 `ls -la`，输出程序改为 `sh`，参数中包含 `exec bwrap`、参数文件和 seccomp 描述符。macOS 测试把 `echo hello` 包装成 `/usr/bin/sandbox-exec -f <临时配置> -- echo hello`。这些是上游单元测试的命令构造证据，不是本仓库在 Linux、macOS 或 Windows 上执行了真实隔离进程。

## 调用链

![Gemini CLI 从审批模式、策略三态、消息确认到平台沙箱，并与模型安全结束原因保持分离的中文边界图](../../../assets/diagrams/gemini-cli/04-confirmation-policy-safety-sandbox.svg)

Claim: gemini-cli.security.confirmation-policy-sandbox-separation

Claim: gemini-cli.security.safety-is-not-tool-authorization

1. CLI 从命令行和设置得到审批模式。YOLO、AUTO_EDIT、PLAN 与 DEFAULT 不是同义词；安全管理设置可禁用 YOLO，未受信目录会把非 DEFAULT 模式压回 DEFAULT。
2. Config 根据 `sandbox.enabled` 创建平台 SandboxManager。未启用时是 Noop；启用后按运行平台选择 Windows、Linux 或 macOS 管理器，未知平台退到 Local 管理器。
3. Scheduler 已完成工具存在性和参数构建后，PolicyEngine 才按工具名、参数、MCP 来源、注解、子代理、审批模式、交互性、规则优先级和检查器计算决定。
4. 没有匹配规则时，交互默认 ASK_USER，非交互默认 DENY。非交互模式不会凭空弹出一个用户界面；上游测试验证交互规则被过滤后落到拒绝。
5. MessageBus 用 correlationId 关联请求与响应。ALLOW 直接确认，DENY 发出策略拒绝，ASK_USER 才交给界面；派生给子代理的总线会移除强制决定和可伪造元数据。
6. Scheduler 收到允许后才进入 Executor；策略拒绝结算为 POLICY_VIOLATION，用户取消结算为 Cancelled，两者都不进入本次工具执行器。
7. 若启用逐工具隔离，Executor 把命令交给 SandboxManager。Linux 生成 Bubblewrap 与 seccomp 包装，macOS 生成 Seatbelt profile，Windows 使用受限令牌、作业对象和低完整性辅助进程。
8. CLI 还存在 Docker、Podman、sandbox-exec、runsc、LXC 与 Windows 原生等外层启动选择。环境变量、命令行、设置、平台和命令可用性决定选择；它与逐工具 manager 的状态必须分别采集。
9. 模型响应若以 SAFETY 结束，Turn 只发布 Finished 原因。独立 Eval 仍需检查是否曾调用工具、目标工件是否正确、沙箱是否真实生效以及是否存在越界副作用。

## 五个边界怎样分工

| 边界 | 权威输入 | 权威输出 | 能阻止什么 | 不能证明什么 |
| --- | --- | --- | --- | --- |
| 目录信任与审批模式 | Settings、命令行、受信目录、管理策略 | 当前审批模式 | 禁止危险模式在不受信环境静默生效 | 某个具体工具一定被拒绝 |
| PolicyEngine | 工具调用、规则、模式、注解、检查器 | ALLOW、DENY、ASK_USER | 不符合策略的调用进入执行器 | OS 权限真的受限 |
| MessageBus 与用户确认 | 策略决定、关联标识、界面监听器 | 确认响应、拒绝事件、用户结果 | 需要人类决定的调用无确认执行 | 人类决定正确，或命令无风险 |
| SandboxManager | 命令、路径、环境、网络、平台后端 | 包装后的程序、参数、环境与清理器 | 后端支持范围内的文件、网络、进程越界 | 业务结果正确或无旁路 |
| 模型 SAFETY | 模型候选与 FinishReason | Turn Finished | 模型侧停止当前候选生成 | 工具策略拒绝、隔离生效或副作用回滚 |

表中的输出都是局部事实。把它们压成一个布尔 `safe=true`，会丢掉拒绝主体、默认模式、用户是否出现、隔离后端和模型结束原因。

## 源码证据

Policy 的默认值显式区分交互和非交互：

```source
packages/core/src/policy/policy-engine.ts:290-298
this.defaultDecision =
  config.defaultDecision ??
  (this.nonInteractive ? PolicyDecision.DENY : PolicyDecision.ASK_USER);
this.sandboxManager = config.sandboxManager ?? new NoopSandboxManager();
```

MessageBus 并不自己发明授权；它先调用 Policy，再按三态路由：

```source
packages/core/src/confirmation-bus/message-bus.ts:104-153
const { decision: policyDecision } = await this.policyEngine.check(...)
case PolicyDecision.ALLOW
case PolicyDecision.DENY
case PolicyDecision.ASK_USER
```

平台管理器只有在 sandbox 启用后才被选择：

```source
packages/core/src/services/sandboxManagerFactory.ts:31-42
if (sandbox?.enabled) {
  win32 -> WindowsSandboxManager
  linux -> LinuxSandboxManager
  darwin -> MacOsSandboxManager
}
return new NoopSandboxManager(options);
```

Linux 后端生成 Bubblewrap 和 seccomp 包装，而非只在状态上写「已隔离」：

```source
packages/core/src/sandbox/linux/LinuxSandboxManager.ts:301-329
const bwrapArgs = await buildBwrapArgs(...)
bwrapArgs.push('--seccomp', '9');
exec bwrap --args 8 ...
```

macOS 后端生成临时 Seatbelt profile 并调用系统程序：

```source
packages/core/src/sandbox/macos/MacOsSandboxManager.ts:172-192
const sandboxArgs = buildSeatbeltProfile(...)
program: '/usr/bin/sandbox-exec'
args: ['-f', tempFile, '--', finalCommand, ...finalArgs]
```

模型 FinishReason 被映射成 Turn Finished；它没有经过工具策略分支：

```source
packages/core/src/core/turn.ts:393-413
const finishReason = resp.candidates?.[0]?.finishReason;
if (finishReason) {
  yield { type: GeminiEventType.Finished, value: { reason: finishReason } };
}
```

两个 Claim 使用 B 级。锁定源码定义分层和默认值，上游测试验证三态消息、非交互拒绝、平台命令包装、SAFETY Finished 与 POLICY_VIOLATION；本仓库没有把这些夹具扩张成线上模型行为或跨平台真实隔离证明。

## 失败与限制

第一，ASK_USER 不保证有用户。Headless 或 ACP 流可能没有确认监听器；当前 MessageBus 会返回 `requiresUserConfirmation`，调用方仍要正确结算，不能把「需要用户」卡成无限等待。

第二，ALLOW 不保证有 Sandbox。Factory 在 sandbox 未启用时返回 Noop。即使启用，后端命令缺失、辅助程序编译失败、profile 错误、容器镜像或挂载配置不当都可能让执行失败。

第三，用户确认不是风险分析。界面展示可能截断命令、隐藏间接副作用或缺失工具注解；ProceedAlways 还可能更新后续规则。评测必须保留确认详情、原始参数和规则更新。

第四，受信目录不是授权通行证。它只是允许某些审批模式和配置参与；Policy 仍可 DENY，沙箱仍可拒绝路径或网络，工具仍可运行失败。

第五，SAFETY 不是 Policy。它来自模型候选的 FinishReason。一个 Turn 可以因 SAFETY 结束，但会话此前已经完成工具调用；也可能工具被 Policy 拒绝，而模型从未返回 SAFETY。

第六，沙箱包装不等于无旁路。允许路径、网络开关、环境白名单、includeDirectories、持久授权、YOLO、容器挂载和宿主进程都改变边界。必须记录最终解析后的命令与权限，而非只记录 `enabled: true`。

第七，平台实现并不等于平台实测。本篇锁定版本含 Linux、macOS 和 Windows 源码及上游测试，但本仓库只渲染文档与校验证据，没有在三类 OS 上运行破坏性逃逸测试。生产结论需要各平台独立夹具和受控环境。

第八，取消不是回滚。策略拒绝能证明本次 Executor 没有启动；确认期间取消或执行后中止仍需检查已启动进程、文件和网络副作用。

安全是分层不变量，不是一枚绿色徽章。

## 验证方法

先建立决策轨迹，以 callId 和 correlationId 关联原始工具请求、审批模式、目录信任、匹配规则、Policy 三态、确认监听器、用户结果、规则更新、Scheduler 终态和是否进入 Executor。分别注入 ALLOW、DENY、ASK_USER、有界面、无界面、用户取消和超时。

再建立隔离轨迹，保存 `sandbox.enabled`、外层 command、平台 manager 类型、原始命令、包装后 program/args、解析后的读写路径、网络、环境清洗、临时文件、清理结果和 denial。不能只截取一条「sandbox enabled」日志。

对 Linux 验证 Bubblewrap 参数、只读工作区、额外路径、网络关闭、seccomp 与拒绝解析；对 macOS 验证 Seatbelt profile、临时文件清理和环境脱敏；对 Windows 验证辅助程序、受限令牌、作业对象、低完整性和拒绝解析。外层 Docker、Podman、runsc 与 LXC 还要核对镜像、挂载、用户、网络和退出码。

最后构造四个反例：Policy ALLOW 但 Noop Sandbox；Policy DENY 且模型正常 STOP；模型 SAFETY 但此前工具已写文件；沙箱包装成功但目标文件内容错误。独立 Scorer 必须分别判定授权、隔离、副作用和任务结果。

## 自检

### 问题 1

`confirmed: true` 为什么不一定代表用户点击了允许？

**答案：** MessageBus 在 Policy 返回 ALLOW 时会直接生成确认成功响应；只有 ASK_USER 分支才需要界面或旧确认流程，因此必须同时记录 Policy 决定和确认来源。

### 问题 2

非交互模式遇到默认 ASK_USER 会发生什么？

**答案：** 锁定 PolicyEngine 的默认决定在非交互模式为 DENY，上游测试也验证交互规则不适用时回落到拒绝，避免不存在的用户界面成为授权来源。

### 问题 3

为什么 `finishReason: SAFETY` 不能证明工具被安全阻止？

**答案：** 它是模型候选结束原因，由 Turn 映射为 Finished；工具授权由 Policy 与 Scheduler 处理，二者事件和时间线都不同，之前的工具还可能已经执行。

### 问题 4

为什么 `sandbox.enabled: true` 还不足以证明隔离有效？

**答案：** 还需证明选择了正确平台 manager 或外层命令、后端实际存在、最终权限与挂载符合预期、包装程序真的启动且没有旁路；源码存在和配置布尔值都只是前置条件。
