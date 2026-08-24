---
title: Claude 工具、权限与 Hook
article_type: harness
harness: claude
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"claude-agent-sdk-python","path":"README.md","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/types.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"tests/test_option_warnings.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"type":"official-doc","title":"配置权限","url":"https://code.claude.com/docs/en/agent-sdk/permissions","accessed":"2026-08-24"},{"type":"official-doc","title":"Hook 参考","url":"https://code.claude.com/docs/en/hooks","accessed":"2026-08-24"}]
---

# Claude 工具、权限与 Hook

## 读者会得到什么

读完后，你能把工具定义是否进入模型上下文、声明式允许或拒绝规则、权限模式、`can_use_tool` 回调、`PreToolUse` Hook、参数改写、最终工具执行和操作系统隔离分开。它们共同影响一次工具调用，却不是同一个开关，也不能用一个「已允许」覆盖整条安全链。

Python SDK 的 `allowed_tools` 是自动批准规则来源，不是工具可用性清单。未列出的工具默认仍可能出现在 Claude 的工具集中，并继续落入权限模式和回调。裸名 `disallowed_tools` 才能从请求中移除整个工具定义；带范围的拒绝规则则保留工具，但阻止匹配调用。

官方公开契约给出的判定顺序是：先运行 Hook，再检查 deny、ask、权限模式和 allow，最后才把未决调用交给 `can_use_tool`。因此自动批准、`bypassPermissions` 或裸名 allow 可能让回调根本收不到调用；需要覆盖每次工具请求的检查应放在 `PreToolUse`，而不是假设回调总是最终守门人。

`PermissionResultAllow` 可以返回 `updated_input` 和 `PermissionUpdate`，`PermissionResultDeny` 可以携带原因和 `interrupt`。这些是 Python SDK 对控制协议的公开投影：允许回调修改当前调用或建议更新后续权限，但不证明 Claude Code 闭源产品怎样内部存储、合并或审计规则。

审批回答「策略是否允许继续」，Sandbox 回答「进程实际上能触碰什么」。没有隔离的 `bypassPermissions` 可能把完整系统权限交给智能体；即使 Hook、规则或回调批准，最终执行仍可能因路径保护、平台权限、网络策略、工具自身校验或进程错误失败。

## 真实输入与输出

### 输入

下面的抽象输入同时配置自动批准、范围拒绝、默认权限模式、回调与 Hook。`Read` 会在 allow 阶段自动批准，`Bash(rm *)` 会在 deny 阶段阻止匹配命令；其他未决调用才可能到达回调。

```json
{"tool":"Bash","input":{"command":"rm -rf build"},"allowed_tools":["Read"],"disallowed_tools":["Bash(rm *)"],"permission_mode":"default","can_use_tool":"configured","hooks":["PreToolUse"]}
```

### 输出

这次调用在 Hook 没有先拒绝的情况下仍会被范围 deny 阻止；不会执行，也不进入 `can_use_tool`。安全审计应记录每层结果，而不是只保存最后一个布尔值。

```json
{"visibleToModel":true,"hookDecision":"pass","denyMatched":true,"callbackInvoked":false,"executed":false,"sandboxResult":"not-reached"}
```

如果输入改成未命中规则的 `Bash "ls"`，默认模式会把未决请求送到回调。回调可返回 `PermissionResultAllow(updated_input=...)`，SDK 会把 Python 字段转换成控制协议的 `updatedInput`；若返回 Deny 且 `interrupt=true`，则拒绝调用并请求中断当前运行，而不等于关闭整个 Client。

## 调用链

![Claude 工具请求从模型可见性、Hook、规则、权限模式和回调进入最终执行与隔离的中文分层架构图](../../../assets/diagrams/claude/04-tools-permissions-hooks.svg)

Claim: claude.permissions.allowed-tools-are-not-availability

Claim: claude.hooks.can-modify-or-deny

1. 应用通过 SDK 选项、设置来源和 MCP 配置形成候选工具；Claude Code 产品契约决定哪些定义实际进入模型上下文。裸名 deny 可以提前移除定义，范围 deny 只保留工具并拦截匹配输入。
2. 模型产生工具名与参数后，`PreToolUse` 在权限流水线最前执行。它可放行、拒绝、要求询问、延后或替换完整输入；多个 Hook 冲突时，公开契约规定拒绝优先。
3. 未被 Hook 终止的调用依次经过 deny 和 ask。deny 在 `bypassPermissions` 下仍有效；ask 把调用导向交互确认，在 `dontAsk` 下则直接拒绝。
4. 权限模式处理剩余调用。`acceptEdits` 只自动批准约定范围内的文件操作；`plan` 把写操作导向回调；`bypassPermissions` 自动批准到达这一层的大多数调用；`dontAsk` 不弹出权限询问。
5. allow 规则只自动批准匹配调用。裸名 `allowed_tools=["Read"]` 不会删除 Bash、Write 或 Edit；它们继续沿后续路径处理。早期已批准的调用不会再调用 `can_use_tool`。
6. Python SDK 通过 stdio 控制协议接收 `can_use_tool` 请求，构造 `ToolPermissionContext`，调用应用回调，并把 Allow、Deny、`updated_input`、`PermissionUpdate` 或 `interrupt` 序列化回 CLI。
7. 策略批准后才进入真实工具实现。文件、Shell、MCP 或外部服务还要面对工作目录、Sandbox、凭据、网络和系统权限；任何一层都可失败，并应生成独立 Artifact。
8. Eval Adapter 收集原始工具请求、每层决定、改写前后参数、工具结果、副作用和隔离证据。Scorer 检查目标正确性与安全约束，不能把 allow 或零退出直接当作通过。

## 源码证据

锁定 Python README 直接说明 `allowed_tools` 是权限 allowlist，未列出工具继续落入模式与回调；要阻止工具应使用 `disallowed_tools`：

```source
README.md:57-64
allowed_tools is a permission allowlist: listed tools are auto-approved,
and unlisted tools fall through to permission_mode and can_use_tool.
It does not remove tools from Claude's toolset.
```

权限更新与回调结果是显式类型。Allow 可携带改写后的输入和权限更新，Deny 可携带解释与中断标志：

```source
src/claude_agent_sdk/types.py:238-252
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict[str, Any] | None = None
    updated_permissions: list[PermissionUpdate] | None = None
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False
```

`PermissionUpdate` 支持增删替换规则、切换模式和增删目录，并可指定更新目标。它描述协议形状，不保证应用必须接受建议，也不证明规则已经持久化。

`can_use_tool` 与 `permission_prompt_tool_name` 互斥。SDK 在配置回调后把权限提示通道设为 stdio；同时对会被 `bypassPermissions` 或裸名 allow 遮蔽的回调发出警告。

```source
src/claude_agent_sdk/types.py:1896-1919
if options.permission_prompt_tool_name:
    raise ValueError(...)
_warn_if_can_use_tool_shadowed(options)
return replace(options, permission_prompt_tool_name="stdio")
```

控制请求处理器保留原始输入；Allow 未提供 `updated_input` 时回送原值，提供时回送新值。Deny 只有在标志为真时附加 `interrupt`。Hook 回调走另一种 `hook_callback` subtype，再转换 Python 安全字段名。

```source
src/claude_agent_sdk/_internal/query.py:502-526
response = await self.can_use_tool(...)
if isinstance(response, PermissionResultAllow):
    response_data = {"behavior": "allow", "updatedInput": ...}
elif isinstance(response, PermissionResultDeny):
    response_data = {"behavior": "deny", "message": response.message}
    if response.interrupt:
        response_data["interrupt"] = response.interrupt
```

官方文档补足闭源产品层的公开契约：权限判定按六层执行；裸名 deny 移除工具定义，范围 deny 保留工具但阻止匹配；`PreToolUse` 在参数生成后、执行前运行，可以 allow、deny、ask、defer 或替换输入。课程只引用这些公开语义，不把它们画成 Claude Code 内部源码类。

## 规则与模式怎样组合

工具存在、模型可见与自动批准是三个问题。SDK 默认说明 Claude 可访问完整 Claude Code 工具集；候选工具还可能来自 MCP、Agent 或设置。`allowed_tools` 只向 allow 规则表加项，不能把未列工具变成不存在。若目标是固定无提示表面，可把明确 allow 与 `dontAsk` 组合；若目标是彻底隐藏，应使用裸名 deny 或受支持的工具装配选项，并核对初始化结果。

`disallowed_tools=["Bash"]` 与 `disallowed_tools=["Bash(rm *)"]` 不等价。前者让模型看不到整个 Bash 定义，后者让模型仍可提出 Bash，只在实际输入匹配时拒绝。评测工具选择能力时必须记录这种差异，否则「模型没有选择」与「选择后被拦截」会被混成一个失败。

`bypassPermissions` 的名字很强，但不是「关闭所有安全层」。Hook、deny、显式 ask 和关键路径保护仍可能先行；同时它会自动批准大量未列入 `allowed_tools` 的工具，所以不能用 allowlist 给它收口。官方文档明确要求只在受控环境中使用；对子智能体的继承还会扩大自主系统访问面。

`acceptEdits` 也不是无限文件写。官方契约只对工作目录或额外目录内的一组编辑与文件系统操作自动批准，受保护路径和关键删除仍有例外。`plan` 则把编辑和写 Shell 操作送到回调，适合让写操作保持显式确认；这仍依赖回调存在且没有被错误配置。

`dontAsk` 的含义是未预批准调用拒绝，而不是「没有回调就默认允许」。它不会调用 `can_use_tool`。在无人值守运行中，这种硬拒绝通常比依赖一个不存在或超时的 UI 更可核对，但仍要验证必要工具是否提前批准。

## Hook 与权限回调的责任差异

`PreToolUse` 面向每次工具调用，适合强制组织策略、输入规范化和高风险阻断。它运行得比 allow 和权限模式更早；Hook 的 allow 也不会跳过后续 deny 与 ask，因此「Hook 放行」不是最终执行许可。Hook 超时、非零退出、无效 JSON 和不同事件的输出语义各不相同，不能把所有 Hook 当成同一种布尔拦截器。

`can_use_tool` 只处理前面没有解决、或被 ask/plan 等明确路由来的调用。它更适合应用 UI 的即时批准、把 `PermissionUpdate` 建议交给用户，以及在 Allow 时安全地修正输入。自动批准调用绕过它，所以把合规检查只写在回调里会产生静默缺口。

参数改写必须保留完整对象。官方 Hook 契约说明 `updatedInput` 替换整个输入，而不是局部补丁；Python 回调的 `updated_input` 同样被完整序列化。审计应同时保存 before 与 after，并重新执行目标路径、命令与参数校验，防止改写后权限规则的含义发生变化。

`interrupt=true` 比普通 Deny 更强：普通拒绝可把原因作为工具错误反馈，让智能体调整；中断标志请求停止当前运行。它不等于 `disconnect()`，也不证明已经启动的外部子进程或远端动作回滚。是否继续会话、清理副作用和恢复 Session 属于另外的生命周期责任。

## 失败与限制

第一，官方权限与 Hook 页面随 Claude Code 版本演进。当前文档包含关键路径保护、auto 模式和版本条件；课程记录访问日期，但锁定 Python SDK 与当日在线 CLI 契约不一定完全同版。

第二，Python 源码只证明 SDK 怎样配置回调、转换结果和发送控制响应。它没有公开 Claude Code 内部规则合并器、工具注册器、Classifier 或 Sandbox 实现，不能从 `Query` 类反推闭源产品对象图。

第三，`allowed_tools` 与 `disallowed_tools` 的规则语法存在裸名、范围、路径锚点和 MCP 命名差异。示例只说明核心边界，不能替代对真实规则解析和工作目录的版本化测试。

第四，Hook 自身就是可执行扩展面。恶意项目配置、环境变量泄露、超时脚本或不安全输出都可能引入新风险；必须限制设置来源、固定 Hook 代码、记录来源层级，并为 Hook 进程设置最小权限和超时。

第五，审批不是 Sandbox，Sandbox 也不是正确性证明。工具在允许且隔离的情况下仍可能修改错误文件、产生错误答案或留下网络副作用；Eval 必须检查目标产物、行为约束和副作用清单。

## 验证方法

先建立权限矩阵：工具是否进入初始化上下文、deny 形式、ask 规则、权限模式、allow 形式、是否到达 Hook、是否到达回调、是否执行、隔离结果。至少覆盖裸名 deny、范围 deny、裸名 allow、范围 allow、未列工具和所有主要模式。

运行锁定 SDK 的选项警告测试，确认 `bypassPermissions` 与裸名 allow 会提示回调被遮蔽，带参数范围的 allow 不会被误判为整个工具遮蔽。再用 Mock Transport 注入 `can_use_tool` 控制请求，分别返回 Allow 原输入、Allow 改写输入、权限更新、普通 Deny 与中断 Deny，核对控制响应。

为 `PreToolUse` 构造四组夹具：无决定、拒绝、询问、改写后允许。记录匹配器来源、输入 before/after、多个 Hook 冲突优先级、超时和非法输出。不要用真实危险命令验证拒绝；使用临时目录和无副作用替身工具。

最终做隔离实验：同一工具请求分别在无 Sandbox、只读 Sandbox 和受控可写目录运行。Artifact 保存权限轨迹、系统调用或文件差异、进程退出、工具结果及清理状态。独立 Scorer 分别给策略合规、目标正确和副作用三个分量，任何一个都不能由 allow 字段替代。

## 自检

### 问题 1

为什么 `allowed_tools=["Read"]` 不能证明 Bash 对模型不可用？

**答案：** 因为它只为 Read 增加自动批准规则；未列出的 Bash 默认仍可能存在，并继续经过权限模式与回调。要隐藏整个 Bash，应使用裸名 deny 或核对工具装配结果。

### 问题 2

为什么 `can_use_tool` 不能作为每次调用的唯一合规检查？

**答案：** 因为权限模式或 allow 规则可能更早自动批准，回调不会被调用。必须覆盖每次调用的检查应放在最前面的 PreToolUse Hook，并保留后续 deny 和隔离层。

### 问题 3

`updated_input` 应怎样审计？

**答案：** 把它视为完整参数替换，保存改写前后对象，重新校验命令、路径和规则含义，再将实际执行参数写入 Artifact。

### 问题 4

`bypassPermissions` 是否等于不受任何限制？

**答案：** 不等于。Hook、deny、ask 和关键路径保护仍可能生效；但它会自动批准大量到达模式层的调用，所以必须在受控、最小权限且可观测的隔离环境中使用。
