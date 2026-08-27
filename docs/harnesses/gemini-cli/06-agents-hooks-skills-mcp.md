# Extensions 怎样刷新 Agents、Hooks、Skills 与 MCP

[返回 Gemini CLI 课程地图](README.md)

上一节看到 Compression 怎样替换正在使用的 Chat History，也分清了 GEMINI.md 和 Memory Service 该保存哪些跨会话知识。现在从运行时能力继续往下看：Gemini CLI 的 Extension 可以带来 MCP Server、Tool 排除项、Policy、Hook、Skill 和 Agent，安装目录只说明这些能力来自哪里，只有启用或停用 Extension 时同步刷新多个运行时 Registry（注册表），模型实际能用的能力才会跟着改变。

```text
Extension Manifest / 目录
  ├→ MCP Client Manager
  ├→ Tool Registry
  ├→ Hook System
  ├→ Agent Registry
  └→ Skill Manager
        ↓
   当前 Session 的 Prompt 与工具面
```

## 第 1 站：Extension 切换是一次多 Registry 更新

源码：[查看 Extension Loader 刷新流程](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/utils/extensionLoader.ts#L45-L126)

```typescript
await this.config.getMcpClientManager()!.startExtension(extension)
await this.maybeRefreshGeminiTools(extension)
await this.config.getHookSystem()?.initialize()
await this.config.getAgentRegistry().reload()
await this.config.reloadSkills()
```

- **调用者**：Extension Manager 启用、停用或重载某个 Extension。
- **输入**：Extension 描述、信任状态与有效配置。
- **状态变化**：连接 MCP，重算 Tools，重新初始化 Hooks、Agents 和 Skills。
- **返回**：刷新后的运行时能力集合。
- **下一站**：后续 Turn 构造新的 Prompt 与 Function Declarations。

只要其中一步失败，运行时就可能停在「一部分能力已经刷新、另一部分还是旧的」这种状态，因此实现既要写清更新顺序，也要处理怎么回滚或重新初始化。整轮刷新并不是一次原子替换。

## Hook：先匹配和去重，再决定整批执行方式

源码：[查看 Hook Planner](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/hooks/hookPlanner.ts#L25-L66)

```typescript
const matchingEntries = hookEntries.filter(...)
const deduplicatedEntries = this.deduplicateHooks(matchingEntries)
const sequential = deduplicatedEntries
  .some((entry) => entry.sequential === true)
```

- **调用者**：Hook System 在某个生命周期事件发生时。
- **输入**：事件、Matcher、来源 Extension 和 Hook 配置。
- **状态变化**：筛选、去重并生成执行计划；只要一项要求串行，整批按顺序执行。
- **返回**：Hook Plan 与后续结果集合。
- **下一站**：Executor 按事件契约合并允许、阻断或附加上下文。

「整批串行」能避免有先后依赖的 Hook（钩子）和其他 Hook 交错执行，可只要其中一个 Hook 很慢，后面的所有项都会被它堵住。因此你不能只核对单个 Hook 的配置，还要针对具体事件检查整批任务怎样超时、出错后又怎样收场。

## Skill：同名覆盖顺序和激活是两步

### 第 2 站：加载顺序决定同名 Skill 的最终定义

源码：[查看 Skill 发现优先级](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/skills/skillManager.ts#L36-L96)

```typescript
await this.discoverBuiltinSkills()
// extension skills -> user skills -> workspace skills
skillMap.set(newSkill.name, newSkill)
```

- **调用者**：启动和 Extension 刷新后的 Skill Manager。
- **输入**：Builtin、Extension、User 与 Workspace Roots。
- **状态变化**：按加载顺序写入 Map，后加载的同名 Skill 覆盖前者。
- **返回**：当前 Skill Catalog。
- **下一站**：模型或用户调用 Activate Skill。

源码：[查看 Skill 激活](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/activate-skill.ts#L106-L132)

```typescript
skillManager.activateSkill(skillName)
this.config.getWorkspaceContext()
  .addDirectory(path.dirname(skill.location))

llmContent: `<activated_skill ...>${skill.body}...`
```

只有激活 Skill（技能）以后，系统才会把正文送回模型，同时把 Skill 目录加入可读取的资源范围。因此，目录里能够列出某个 Skill，只能说明系统发现了它，不能说明它的正文已经进入 Context。发现不等于激活。

## MCP：发现前有信任与用户配置短路

### 第 3 站：连接成功后才把能力写入 Registry

源码：[查看 MCP Client Manager](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/mcp-client-manager.ts#L437-L508)

```typescript
if (!finalConfig.command && !finalConfig.url && !finalConfig.httpUrl) return
if (this.isBlockedBySettings(name)) return
if (await this.isDisabledByUser(name)) return
if (!this.cliConfig.isTrustedFolder()) return

await client.connect()
await client.discoverInto(this.cliConfig, targetRegistries)
```

- **调用者**：启动或 Extension 启用流程。
- **输入**：MCP Server Config、Blocklist、用户开关和目录信任。
- **状态变化**：通过前置门后建立连接，发现 Tools/Prompts/Resources 并写入目标 Registry。
- **返回**：活动 MCP Client 与发现结果。
- **下一站**：Tool Registry 过滤模型可见工具，调用时再次经过 Policy。

## Agent：本地与远程不是同一个执行器

Agent Registry 能发现 Agent Definition（智能体定义），Local Executor 则会在当前进程里创建子会话并配好工具，Remote A2A 路径通过协议交换 Message、Artifact、状态和取消请求。两条路径看起来都可以通过 Agent Tool 调用，可它们的身份归属、认证方式、超时处理和结果边界各不相同。

需要隔离 Context 或者把一段长任务单独跑起来时，创建子 Agent 很合适。如果只是批量读取文件，直接调用普通工具反而省事。父 Agent 收到结果以后，还得核对 Stop Reason 和 Artifact，不能看到一条完成通知就把子运行里的错误盖过去。通知不是结论。

到这里，你已经看过 Extension 按什么顺序刷新各项能力，Hook 怎样整批执行，同名 Skill 怎样覆盖又怎样激活，MCP 连接前要过哪些门，以及 Agent 在本地和远程分别怎么跑。不过，使用者最后能看到什么，还取决于交互 CLI、非交互输出、IDE 与 A2A 各自暴露哪些事件、怎样表示停止，下一篇就来逐项划清这些输出边界。

下一篇：[CLI、非交互输出、IDE 与 A2A](07-surfaces-output-protocol.md)。
