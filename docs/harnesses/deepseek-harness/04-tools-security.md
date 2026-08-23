---
title: DSH 工具、审批与多平台安全边界
article_type: harness
harness: deepseek-harness
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/core/tools/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/core/tools/tests/scoped.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/interaction/user-approval/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox/src/escalation.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox/tests/escalation.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox-local/tests/bwrap.e2e.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox-local/tests/seatbelt.e2e.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox-windows-acl/tests/provider-chain.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"}]
---

# DSH 工具、审批与多平台安全边界

## 读者会得到什么

本篇把一次工具调用拆成五道不能互相替代的边界：工具是否存在且参数有效，扩展策略是否放行，单调 Guard 是否否决，权限升级是否得到一次性批准，以及选中的平台后端是否真的限制了进程。读完后，你应能回答「模型看见工具」「用户点了允许」「配置写着只读」和「内核阻止了写入」分别证明什么。

课程锁定 DeepSeek Harness 提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。这里分析的是上游源码和测试契约，不是安全审计证书。尤其是平台 Sandbox：单元测试、Provider 链测试和真实后端端到端测试的证据强度不同，不能用一种平台的结果替另一种平台背书。

现在先看分层。

先记住最重要的结论：审批决定某次请求能否采用更宽模式，Sandbox 决定采用该模式后进程实际能碰什么。审批不是隔离，模式名也不是隔离效果。

不要混为一谈。

入口不是许可。许可不是隔离。模式不是效果。

![DSH 工具调用经过注册、策略、Guard、一次性审批和多平台执行后端的中文安全边界图](../../../assets/diagrams/deepseek-harness/04-tools-security.svg)

Claim: deepseek-harness.security.approval-sandbox-separation

图中绿色主链表示调用仍可继续，红色支路表示在副作用发生前形成失败结果。平台面板故意不把三种系统画成同等级：Linux 与 macOS 有「后端可用时才运行」的真实写入拒绝测试；Windows 的跨平台链测试把执行强度明确记录为 `partial`，真实 Windows 运行器效果仍须在 Windows 主机上单独核对。

## 真实输入与输出

### 输入

假设当前调用的有效模式为只读，而模型请求一条需要写工作区的命令。升级输入不只是一个目标枚举，还必须携带当前真实模式、理由、工具身份、调用标识和 Agent，以便验证「严格变宽」并把问答写入当前 Turn 的审计事件：

```json
{
  "toolName": "bash",
  "callId": "call-17",
  "effectiveMode": "read-only",
  "requestedMode": "workspace-write",
  "justification": "需要在工作区生成报告",
  "subject": "command"
}
```

这个输入并不会直接执行命令。`approveEscalation()` 先比较当前模式和请求模式；如果请求没有严格扩大权限，它在询问用户前就失败。若审批服务或 Agent 缺失，也会失败关闭，而不是因为无法询问就默认放行。

再判断是否该问。

### 输出

只有审批返回 `allowed-once` 时，升级函数才把 `workspace-write` 返回给这一次调用。它不是会话级永久改权，也不会跳过后续平台 Provider：

```json
{
  "approvalOutcome": "allowed-once",
  "grantedModeForThisCall": "workspace-write",
  "nextBoundary": "platform-sandbox-provider"
}
```

其余闭合结果保持不同语义：`rejected` 是明确拒绝，`cancelled` 是等待期间取消，`unavailable` 是没有可用回答通道。工具注册表最终会把抛错规范化为本次调用的错误结果；没有进入工具主体，就不能声称发生了副作用。

允许仍非执行。

```text
非严格升级 → 不询问，调用失败
审批服务缺失 → 失败关闭
用户拒绝／取消／通道不可用 → 各自形成不同错误
一次性允许 → 仅把目标模式交给本次调用，再进入平台隔离
```

## 调用链

先看入口边界。

1. Agent Loop 把调用标识、工具名、已解析参数、Agent 和取消信号交给工具注册表。未知工具、不可直接调用的工具或无损 JSON 物化失败会在策略链前结束；注册成功只说明实现可达。
2. `tools/pre-execute` 提供可扩展策略瀑布，随后运行单调 Guard。Guard 返回拒绝理由后，后来注册的「允许」监听器不能把拒绝翻回许可；上游测试还断言被 Guard 拒绝时工具主体调用次数为零。
3. shell 或文件工具根据当前 `SandboxPolicy` 判断是否需要升级。`approveEscalation()` 先验证请求相对本次有效模式确实更宽，再核对审批服务与 Agent，最后请求审批；顺序确保无效请求不会骚扰用户。
4. 审批服务要求当前 Session 已有开放 Turn，依次写入 `approval/asked` 与 `approval/decided`。策略为 `never`、回答器抛错、返回非法值或信号取消都被收敛为闭合结果；唯一许可词是 `allowed-once`。
5. 获得模式后，本地 Sandbox Provider 根据平台选择运行器并生成受限命令。此处才从产品许可进入操作系统执行边界；Provider 报告的 `enforcement` 和拒绝特征必须随结果一起保留。
6. 工具主体成功或失败后，注册表规范化内容并记录 `tool/result`。Agent 可以在下一次模型请求中看到错误并恢复，但「模型换一种参数再试」不能把一次产品级越权请求重试成通过。

## 源码证据

升级函数把「严格变宽、服务可用、路由 Agent、一次性审批」固定为副作用之前的顺序。只有单次许可返回请求模式，其他结果全部抛出不同错误：

```source
packages/sandbox/sandbox/src/escalation.ts:162-186
if (!(WIDER_MODES[effectiveMode] ?? []).includes(mode as SandboxMode)) throw new Error(...)
if (approval.approver === undefined) throw new Error(...)
if (approval.agent === undefined) throw new Error(...)
const outcome = await approval.approver.request({ ... })
switch (outcome) {
  case 'allowed-once': return mode as SandboxMode
  case 'rejected': throw new Error(...)
  case 'cancelled': throw new Error(...)
  case 'unavailable': throw new Error(...)
}
```

上游升级测试不仅检查返回值，也检查非升级请求从未进入询问，以及审批依赖缺失时失败关闭：

```source
packages/sandbox/sandbox/tests/escalation.spec.ts:77-106
expect(granted).toBe('workspace-write')
expect(seen[0]?.reason).toBe('escalate sandbox to workspace-write: ...')
expect(seen).toEqual([])
await expect(... approver: undefined ...).rejects.toThrow(/no approval service is composed/)
```

Guard 的结论之所以不能被后续允许覆盖，是因为它在可扩展的 `pre-execute` 之后以单调方式求第一个拒绝理由。`scoped.spec.ts:284-332` 进一步证明：前置监听器强制允许后，Guard 仍拒绝；全局 Guard 拒绝时工具主体没有运行。

平台证据必须分开读。`bwrap.e2e.ts:53-101` 在 bwrap 可用时真实启动命令，验证只读写入被拒绝、工作区内写入成功而相邻目录写入失败。`seatbelt.e2e.ts:53-96` 对 macOS `sandbox-exec` 做同类真实验证，但也仅在探针成功时运行。两者的跳过条件意味着仓库存在实验，不意味着本次课程构建环境已经执行它们。

再看平台效果。

Windows 证据更窄。`provider-chain.spec.ts:27-56` 通过真实 `LocalSandboxProvider.confine()` 检查运行器参数、模式标记、拒绝文本和失败规则，却显式断言 `enforcement` 为 `partial`。该测试可跨平台运行，不能替代 Windows 主机上的真实 ACL 拒绝实验。

平台不能互证。

## 失败与限制

第一，把工具 Schema 当授权是最常见误判。Schema 只帮助模型生成结构合法的候选调用；名称存在、参数通过验证和工具出现在 Prompt 中，都没有回答当前用户、路径和执行模式是否允许副作用。

第二，把 Guard 当 Sandbox 也不成立。Guard 是进程内、语义级的单调否决点，适合限制调用身份或模式；若工具实现、插件或子进程绕过了这条注册表路径，只有独立的执行边界才能继续提供隔离。

第三，审批记录也不是系统调用证据。`approval/asked` 与 `approval/decided` 能证明 Harness 请求过并记录了决定；它们不能证明后端成功启动，更不能证明所有写入、网络、进程和临时目录都被内核限制。

第四，`danger-full-access` 与 `approval: never` 是一种显式运行模式，不是审批失效的同义词。基础 bundle 的默认新会话通常组合为 `workspace-write + ask`，但环境变量、权限 preset、会话覆盖和产品表面都可能改变有效值，排障时应读取实际 Session 与执行记录。

第五，真实隔离测试有环境门槛。bwrap、Landlock、Seatbelt 或 Windows ACL 运行器不可用时，Provider 可能降级、不可用或只报告部分执行。文档只能引用已锁定测试的范围；未在目标平台运行，就不能升级为该部署的安全结论。

最后，Agent Harness 安全不是单个布尔值。最小可复核记录应包含原调用、有效策略、Guard 决定、审批问答、所选运行器、执行强度、退出状态、拒绝特征和产物检查。缺一项时，应把结论缩小到仍有证据的那一层。

证据到哪，结论到哪。

## 验证方法

最后核对产物。

先验证进程内门禁：注册一个会计数的测试工具，分别注入 `pre-execute` 拒绝、单调 Guard 拒绝、未知工具和非法参数。断言工具主体调用次数为零，错误仍与原 `callId` 关联，并确认后注册的允许监听器不能覆盖 Guard。

再验证升级矩阵：枚举只读、工作区可写和完全访问作为当前模式与目标模式，断言只有严格变宽才会询问。对允许一次、拒绝、取消、无通道、无审批服务和无 Agent 分别检查事件、错误文本与副作用；允许一次后还要确认下一调用重新判断。

随后在每个目标平台运行真实后端实验。只读模式尝试在工作区写文件；工作区可写模式同时尝试写根目录内外；检查退出码、标准错误和文件是否存在。若测试因后端不可用跳过，应记录为「未运行」，不能把生成的参数或单元测试换算成内核通过。

最后把安全记录接到独立 Eval：固定一个 Trial，要求只在允许目录生成指定哈希的产物，同时拒绝目录外写入。基础设施恢复可以成为 Attempt，但越权副作用一旦发生，这个 Trial 必须失败，不能通过重试擦掉。

## 自检

### 问题 1

模型能够看到 `bash` 的参数 Schema，是否表示它获准执行命令？

**答案：** 不表示。可见性和参数合法性只属于工具入口；策略、Guard、审批与平台隔离仍要逐层决定，任一层都可能在工具主体前失败。

### 问题 2

用户批准从只读升级到工作区可写后，后续调用是否永久获得该模式？

**答案：** 否。锁定实现只在 `allowed-once` 时把请求模式返回给当前调用；会话级策略变更是另一条显式路径，不能从一次许可推断。

### 问题 3

为什么 Windows Provider 链测试不能证明完整 ACL 隔离？

**答案：** 它验证参数、模式、拒绝特征和失败规则，并明确报告 `partial`；跨平台构造命令不是在 Windows 内核上观察真实拒绝，仍需 Windows 主机端到端实验。

### 问题 4

一次工具错误进入下一次模型请求后被模型修复，是否能把先前越权尝试改判为安全？

**答案：** 不能。恢复能力只说明 Agent 能继续；安全评测必须保留每次尝试和副作用，产品级越权不能靠重试成通过。
