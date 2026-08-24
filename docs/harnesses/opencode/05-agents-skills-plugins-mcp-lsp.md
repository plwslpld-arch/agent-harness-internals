---
title: OpenCode 智能体、技能、插件、MCP 与 LSP 扩展
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/agent/agent.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/agent/subagent-permissions.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/tool/task.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/skill/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/plugin/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/mcp/catalog.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/lsp/lsp.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 智能体、技能、插件、MCP 与 LSP 扩展

## 读者会得到什么

本篇把五类扩展映射到各自的运行层。Agent 定义模型、提示、模式与权限；Task Tool 为 Subagent 创建或复用子会话。Skill 是可发现并按 Agent Permission 过滤的指令资源。Plugin 可以贡献 Tool、Auth、Provider 和 Hook，直接改写运行表面。MCP 连接远端或本地服务，把 Tool、Prompt、Resource 与 Resource Template 转换为当前实例能力。LSP 则按文件与项目根启动语言服务器，提供诊断、定义、引用与符号信息。

这些能力不应被压成一个「插件系统」。Skill 内容进入提示上下文但通常不直接获得进程能力；Plugin 代码运行在宿主进程边界，风险更高；MCP Tool 跨协议调用外部服务；LSP 是独立子进程和协议客户端。Agent/Subagent 又引入新的会话、模型和 Permission Scope。安装、发现、连接、模型可见与成功执行是五个不同状态。

Subagent 权限尤其需要精确理解。锁定实现从父 Session 继承 Deny 与 External Directory 规则，再由子 Agent 自身权限决定能力，并在未显式允许时追加 TodoWrite 与 Task Deny。Task 调用本身还需权限检查和深度限制。父 Agent 的全部 Allow 并不会被无条件复制给子会话；反过来，子 Agent 自身规则也不能越过继承的关键拒绝项。

## 真实输入与输出

### 输入

```json
{"agent":"主智能体定义","subagent":"子智能体类型","skills":["本地","外部拉取"],"plugins":["工具与钩子"],"mcp":["本地或远端服务"],"file":"等待语言诊断的源码文件"}
```

### 输出

```json
{"child_session":"独立会话与权限范围","prompt_resources":"许可后可用技能","runtime_mutations":"插件钩子与工具","remote_capabilities":"已连接 MCP 表面","code_intelligence":"LSP 诊断与导航"}
```

## 调用链

![OpenCode 以项目实例和会话为核心，Agent 与 Subagent、Skill、Plugin、MCP 和 LSP 分别影响提示、权限、工具、远端能力与代码智能的中文扩展架构图](../../../assets/diagrams/opencode/05-agents-skills-plugins-mcp-lsp.svg)

Claim: opencode.extensions.change-runtime-surfaces

Claim: opencode.subagent.permission-is-scoped

1. Config 与目录发现装入 Agent、Skill、Plugin 和 MCP 定义，LSP Server Catalog 按环境解析可用实现。
2. Agent Service 合并默认与用户规则，确定 Primary/Subagent/All 模式、模型、提示和 Permission Ruleset。
3. Skill Service 从内建、项目、用户与允许的外部位置发现资源，同名本地 Skill 可覆盖内建项，Agent Deny 会过滤可用列表。
4. Plugin 初始化取得客户端、目录、工作树与服务输入，注册 Tool/Auth/Provider/Hook；Hook 可在系统提示、工具定义、文本完成和压缩等节点改写数据。
5. MCP Client 通过 Stdio、SSE 或 Streamable HTTP 连接，检查服务能力并分页读取 Tool、Prompt、Resource 与 Template。
6. MCP Tool 被命名空间化并转换成统一动态工具，调用时仍受超时、取消、协议错误和 Permission 约束。
7. Task Tool 检查调用权限与嵌套深度，创建带 Parent ID 的子会话，并派生关键拒绝与外部目录规则。
8. 文件被读取或编辑时，LSP 按文件寻找 Root/Server/Client，发送打开通知并等待诊断；结果进入工具或事件表面，而不是自动证明代码正确。

## 源码证据

子会话只继承父会话中的关键拒绝与外部目录规则，并为未显式允许的递归 Task/Todo 添加 Deny：

```source
packages/opencode/src/agent/subagent-permissions.ts:14-26
return [
  ...input.parentSessionPermission.filter(
    (rule) => rule.permission === "external_directory" || rule.action === "deny"
  )
]
```

Task Tool 另外执行背景功能开关、嵌套深度、调用 Permission、Agent 存在性和子 Session 创建检查：

```source
packages/opencode/src/tool/task.ts:90-170
if (depth >= (cfg.subagent_depth ?? 1)) return yield* Effect.fail(...)
const childPermission = deriveSubagentSessionPermission(...)
```

Skill 的发现结果并非全部交给每个 Agent；可用列表还要计算 `skill` Permission。

```source
packages/opencode/src/skill/index.ts:253-318
return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
```

MCP Catalog 根据服务能力分页读取资源，并把 Tool Schema 与 Call Tool 转成统一执行表面；连接存在不意味着某个 Capability 存在。

```source
packages/opencode/src/mcp/catalog.ts:38-155
if (!client.getServerCapabilities()?.resources) return Promise.resolve([])
return paginate((cursor) => client.listResources(...))
```

## 失败与限制

第一，发现不等于启用。Skill 可因外部发现开关或 Permission 消失；MCP 可停留在认证、客户端注册、失败或断开状态；LSP 可能找不到 Binary 或 Project Root。

第二，Plugin 是高信任代码。它能贡献工具并修改 Hook 输出，风险不止提示注入；来源、版本、安装脚本与运行权限都要审计。

第三，Subagent 是独立会话，不是普通函数。它可能选择不同模型、产生自己的工具副作用、上下文压缩和错误；父会话只收到结果投影，仍要保存 Child Session ID 与完整轨迹。

第四，背景 Subagent 受实验开关与并发协作约束。通知完成不能证明父子任务没有修改同一文件，也不能自动解决合并冲突。

第五，MCP Tool 的远端执行与本地 Permission 分属不同边界。允许调用只代表发出请求，远端服务的身份、数据保留、权限和副作用需独立核对。

第六，LSP Diagnostic 是语言服务器观点，可能过时、配置错误或只覆盖静态规则。零诊断不等于测试通过，更不等于行为正确。

## 验证方法

建立一个主 Agent 与两个 Subagent：一个显式允许 Task，一个没有。给父会话配置 External Directory Allow 与特定 Deny，启动子任务后读取 Child Session Permission，验证继承与默认拒绝；再测试深度上限、恢复 Task ID 和背景功能开关。

准备同名内建/项目 Skill、一个改写 Tool Definition 的测试 Plugin、一个提供 Tool/Resource 的本地 MCP Server，以及可控 LSP Fixture。分别记录发现列表、Agent 可用列表、模型最终 Tool Schema、MCP Status/Capabilities 和 LSP Client Root。

故障注入覆盖 Plugin Throw、MCP 认证失败与超时、资源分页失败、LSP Binary 缺失和 Child Session 工具失败。所有案例按扩展层保存错误，不用「扩展不可用」一个状态吞掉根因。

## 自检

### 问题 1

Skill、Plugin 和 MCP 有什么核心差异？

**答案：** Skill 主要提供指令资源，Plugin 在宿主内改写运行表面，MCP 通过协议连接外部能力。

### 问题 2

父 Agent 的 Allow 会全部复制给 Subagent 吗？

**答案：** 不会。实现重点继承 Deny 与 External Directory 规则，子 Agent 自身规则决定其能力，并追加必要默认拒绝。

### 问题 3

MCP 已连接是否说明 Tool、Prompt 和 Resource 全部存在？

**答案：** 不说明。每种能力由服务器 Capability 声明和列表请求分别决定。

### 问题 4

LSP 零诊断能否作为发布门禁唯一依据？

**答案：** 不能。它只是静态代码智能信号，还需构建、测试、产物和独立任务评分。

