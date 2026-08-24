---
title: Gemini CLI 配置、提示与上下文
article_type: harness
harness: gemini-cli
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"gemini-cli","path":"packages/cli/src/config/settings.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/cli/src/config/settings.test.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/config/config.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"gemini-cli","path":"packages/core/src/prompts/promptProvider.test.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"}]
---

# Gemini CLI 配置、提示与上下文

## 读者会得到什么

读完本篇，你应能从磁盘上的设置文件追到一次运行真正使用的有效配置，再追到模型可见的系统指令、首条用户上下文、工具结构和历史。你会知道为什么工作区设置不是简单覆盖用户设置，为什么系统策略仍可压过工作区，为什么未受信目录的设置应被过滤，以及为什么项目指令文件存在不等于内容已进入请求。

本篇使用锁定源码的 Settings 合并测试与 PromptProvider 测试。它们通过模拟文件系统和 Mock Config 锁定优先级、信任和提示渲染，不代表本机管理员策略、环境变量、线上模型或所有扩展已经验证。

先问：本轮真正生效的值来自哪一层？

## 真实输入与输出

### 输入

上游 `settings.test.ts` 同时模拟系统、用户和工作区三个设置文件。关键冲突如下：

```json
{"system":{"ui":{"theme":"system-theme"},"tools":{"sandbox":false},"mcp":{"allowed":["server1","server2"]}},"user":{"ui":{"theme":"dark"},"tools":{"sandbox":true},"context":{"fileName":"USER_CONTEXT.md"}},"workspace":{"tools":{"sandbox":false,"core":["tool1"]},"context":{"fileName":"WORKSPACE_CONTEXT.md"},"mcp":{"allowed":["server1","server2","server3"]}}}
```

另一个 PromptProvider 测试把项目指令文件名设为默认文件和 `CUSTOM.md`，记忆正文是 `Some memory content`。计划模式测试又提供四个当前活动工具：`glob`、`read_file`、`write_file`、`replace`。

### 输出

合并结果不是「最后读到的文件获胜」。单值主题由系统设置覆盖，工作区上下文文件名覆盖用户值，工作区贡献 `tool1`，系统允许的 MCP 服务又覆盖工作区扩大后的列表：

```json
{"ui":{"theme":"system-theme"},"tools":{"sandbox":false,"core":["tool1"]},"context":{"fileName":"WORKSPACE_CONTEXT.md"},"mcp":{"allowed":["server1","server2"]},"telemetry":{"enabled":false}}
```

PromptProvider 输出中出现 `Contextual Instructions`，同时列出默认文件和 `CUSTOM.md`；在计划模式下，它只根据当前 ToolRegistry 列出活动工具，并给写工具附加计划文件约束。测试断言的是生成后的提示片段，不是某个文件路径本身。

```text
Contextual Instructions (GEMINI.md, CUSTOM.md)
```

有效配置和模型可见请求是两个连续但不同的证据面。

## 调用链

![Gemini CLI 从分层设置、信任过滤、项目指令与当前工具到模型可见请求的中文上下文装配图](../../../assets/diagrams/gemini-cli/01-config-prompt-context.svg)

Claim: gemini-cli.config.layered-effective-settings

Claim: gemini-cli.context.gemini-md-is-bounded-input

1. CLI 定位 Schema 默认、系统默认、用户、工作区与系统设置文件，分别保留原始内容、解析结果、错误和来源路径。
2. `mergeSettings` 先按 Folder Trust 把未受信工作区替换为空设置，再按字段的 merge strategy 合并；单值顺序为 Schema 默认、系统默认、用户、工作区、系统覆盖。
3. `LoadedSettings` 同时保留各层文件、`merged` 和不可变快照；信任状态变化会重算工作区和有效设置，而不是修改原始工作区文件。
4. CLI 再把命令行选择、环境、远程管理项和合并设置转换成 Core `Config`。磁盘文件到有效 Config 之间仍可能发生校验、规范化、禁用和运行时覆盖。
5. MemoryContextManager 按来源加载项目指令：全局与用户项目记忆作为一级内容进入系统指令；扩展和当前项目内容带边界标记进入首条用户消息。
6. PromptProvider 读取审批模式、当前 ToolRegistry、项目根目录、会话状态和分层记忆，生成核心系统提示。计划模式的工具清单来自当前活动注册表，不是源码目录清单。
7. 模型客户端最终组合系统指令、会话级上下文、用户输入、历史和工具声明。真实执行仍由 Scheduler、Policy、Confirmation 和 Sandbox 决定，提示中出现工具名不产生权限。

## 源码证据

合并函数直接给出单值优先级，并先过滤未受信工作区：

```source
packages/cli/src/config/settings.ts:253-279
const safeWorkspace = isTrusted ? workspace : ({} as Settings);
return customDeepMerge(... schemaDefaults, systemDefaults, user,
  safeWorkspace, system);
```

`LoadedSettings` 保留原始工作区，并在信任切换时重建有效视图：

```source
packages/cli/src/config/settings.ts:313-389
this._workspaceFile = workspace;
this.workspace = isTrusted ? workspace : this.createEmptyWorkspace(workspace);
setTrusted(isTrusted) { ... this._merged = this.computeMergedSettings(); }
```

上游测试用相互冲突的真实字段验证系统、工作区和用户优先级：

```source
packages/cli/src/config/settings.test.ts:263-341
system taking precedence over workspace, and workspace over user
expect(settings.merged).toMatchObject({
  ui: { theme: 'system-theme' },
  context: { fileName: 'WORKSPACE_CONTEXT.md' }
});
```

Core 对项目指令实行分层注入，而不是全部拼进同一字符串：

```source
packages/core/src/config/config.ts:2573-2613
Global memory and user project memory go in the system instruction;
extension and project memory are placed in the first user message instead.
```

PromptProvider 测试锁定多文件名和当前工具渲染：

```source
packages/core/src/prompts/promptProvider.test.ts:154-206
should handle multiple context filenames in user memory section
should list all active tools from ToolRegistry in plan mode prompt
```

两个 Claim 都使用 B 级，因为源码定义了变换，上游测试又验证代表性行为。它们不证明所有字段都使用同一种合并策略，也不证明提示内容必然被线上模型完整消费。

## 失败与限制

第一，优先级不是一句「工作区覆盖用户」能概括。系统设置对单值拥有最高优先，列表字段可能连接、去重或按 Schema 使用其他策略，远程管理项还能在文件合并后覆盖。评审必须记录具体字段和 merge strategy。

第二，未受信工作区仍可在磁盘上有设置，但普通 `merged` 会忽略它。源码还提供「假设已信任」的查询，用于展示配置；展示结果不能冒充当前已启用能力，否则 MCP 列表和真实执行会产生矛盾。

第三，环境加载具有独立安全边界。未受信目录只允许白名单变量，认证方式又可能决定是否保留某些云项目变量。把 `.env` 内容直接当最终环境，会漏掉过滤、覆盖和恢复行为。

第四，项目指令文件不是无限 Memory。发现受文件名、目录边界、导入、忽略规则和信任影响；进入请求后还会受模型窗口、上下文管理、压缩和会话阶段限制。一级与二级内容位置不同，后续刷新语义也不同。

第五，Prompt 中出现工具名只证明模型可见。计划模式甚至会列出工具并同时添加只允许写计划文件的约束；ToolRegistry、Policy、Confirmation、参数校验和平台 Sandbox 仍可能拒绝真实调用。

第六，测试使用 Mock 文件系统和 Config。它能锁定合并与渲染逻辑，不能证明本机系统设置路径、文件权限、管理员远程控制或外部 MCP 服务配置正确。

文件存在不是生效证明。

## 验证方法

先建立配置来源表：为每个字段记录 Schema 默认、系统默认、用户、工作区、系统覆盖、远程管理和命令行值，并标注 merge strategy。分别在受信和未受信状态导出 `LoadedSettingsSnapshot` 与 Core Config，确认工作区原始内容不被误当成有效值。

再做冲突实验：复现主题、沙箱开关、核心工具、上下文文件名和 MCP allowlist 的上游夹具，再增加连接列表、空值、废弃字段、非法 JSON、只读系统设置和运行时信任切换。检查错误是否保留来源，不允许静默降级成另一个安全模式。

随后验证上下文：给全局、用户项目、扩展和项目目录写入可识别标记，捕获最终系统指令、首条用户消息、后续请求与加载路径。确认一级内容与二级内容位置正确，未受信或超出边界的文件不会进入请求。

最后核对能力：在普通模式和计划模式捕获 ToolRegistry、提示中的工具清单、模型工具声明、Policy 决定和真实执行器。若提示列出工具但执行被拒绝，测试应记录层级差异，而不是把它归为随机模型失败。

验证有效值，不只验证文件。

## 自检

### 问题 1

工作区设置为什么不一定覆盖用户设置？

**答案：** 未受信工作区会被过滤；即使受信，系统设置对单值仍可最高优先，不同字段还可能使用连接等合并策略。

### 问题 2

为什么项目指令不应全部拼进系统提示？

**答案：** 锁定实现把全局和用户项目记忆放入系统指令，把扩展与当前项目上下文放入首条用户消息；它们的来源、刷新和边界不同。

### 问题 3

计划模式提示列出了 `write_file`，是否表示可以任意写文件？

**答案：** 不表示。提示同时附加计划文件约束，真实调用还要经过注册、Policy、Confirmation、参数校验和 Sandbox。

### 问题 4

怎样证明某个设置真正影响了一次模型请求？

**答案：** 要同时保存原始来源、合并快照、Core Config 和最终请求，并用冲突值验证因果；只展示 settings.json 或提示文字都不足够。
