# Extensions 怎样刷新 Agents、Hooks、Skills 与 MCP

[返回 Gemini CLI 课程地图](README.md)

上一节收在 Compression 替换活动 Chat History，以及 GEMINI.md/Memory Service 保存跨会话知识的边界。Gemini CLI Extension 则从运行时能力这一侧继续展开：它可以贡献 MCP Server、Tool 排除项、Policy、Hook、Skill 和 Agent，而安装目录只是来源。只有在启用或停用 Extension 后刷新多个运行时 Registry，模型能力才真正改变。

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

任一步失败都可能留下「部分能力已刷新」的状态，所以实现不仅要说明更新顺序，还要交代回滚或再次初始化的策略。能力刷新不是一次原子替换。

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

「整批串行」可以避免有顺序依赖的 Hook 与其他 Hook 交错，但它也会让慢 Hook 阻塞后续项，所以核对时不能只看单个 Hook 的配置，还要按具体事件检查整批执行的超时与错误策略。

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

只有激活才会把正文送回模型，并把 Skill 目录加入可读取资源范围，所以目录中可列出与正文已进入 Context 是两个状态。

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

Agent Registry 可以发现 Agent Definition，而 Local Executor 会在本进程创建子会话与工具集合，Remote A2A 路径则通过协议交换 Message、Artifact、状态和取消。两条路径虽然可以共享 Agent Tool 的外观，身份、认证、超时和结果边界却各不相同。

创建子 Agent 适合独立 Context 和长子任务，而如果只是批量读取文件，普通工具会更直接。父 Agent 收到子结果后仍要核对 Stop Reason 与 Artifact，不能用通知文本覆盖子运行错误。

前面依次核对了 Extension 的刷新顺序、Hook 的整批执行方式、Skill 的覆盖与激活、MCP 的连接前置门，以及 Agent 的本地与远程执行边界。这些能力怎样呈现给使用者，还取决于交互 CLI、非交互输出、IDE 与 A2A 各自选择的事件和停止语义——下一篇会逐一固定这些表面的输出边界。

下一篇：[CLI、非交互输出、IDE 与 A2A](07-surfaces-output-protocol.md)。
