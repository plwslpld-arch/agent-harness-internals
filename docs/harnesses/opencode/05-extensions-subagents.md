# Agents、Skills、Plugins、MCP 与 LSP 扩展哪一层

[返回 OpenCode 课程地图](README.md)

OpenCode 的扩展入口看起来都在为 Agent 增加能力，但它们接入系统的位置并不相同。Agent 定义模型、Prompt 与 Permission，Task Tool 负责创建子 Session，而 Skill 提供经过权限过滤的指令资源。再往外看，Plugin 可以贡献 Tools、Auth、Provider 和 Hooks，MCP 暴露远端 Tools、Prompts 与 Resources，LSP 则专门回答代码语义问题。

## 子 Agent：继承拒绝边界，不复制父权限全集

### 第 1 站：子 Session 权限从父端提取关键限制

源码：[查看子 Agent 权限派生](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/agent/subagent-permissions.ts#L14-L26)

```typescript
return [
  ...input.parentSessionPermission.filter(
    (rule) =>
      rule.permission === 'external_directory' ||
      rule.action === 'deny',
  ),
]
```

- **调用者**：Task Tool 创建子 Session。
- **输入**：父 Session Permission 与目标 Agent 配置。
- **状态变化**：保留外部目录与拒绝规则，并为递归 Task/Todo 加安全默认值。
- **返回**：Child Session Ruleset。
- **下一站**：Session Create 与子 Prompt Loop。

父端已经允许的能力不该自动全部下放，因为子 Agent 换了 Persona 之后，仍然必须受父 Session 设下的禁止边界约束。Deny 必须随行。

### 第 2 站：Task Tool 在创建前检查深度和 Agent

源码：[查看 Task Tool](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/tool/task.ts#L90-L170)

```typescript
if (depth >= (cfg.subagent_depth ?? 1)) {
  return yield* Effect.fail(...)
}

const childPermission = deriveSubagentSessionPermission(...)
```

- **调用者**：父模型调用 Task Tool。
- **输入**：Agent 名、Prompt、父 Session/Message 与当前深度。
- **状态变化**：验证功能开关、深度、Permission 和 Agent 存在性；创建或复用子 Session。
- **返回**：子任务结果投影与 Child Session ID。
- **下一站**：父 Prompt Loop 把结果作为 Tool Result 继续。

子 Session 拥有自己的 Messages、Compaction 和副作用，而父端拿到的结果只是这段执行过程的投影，所以调试时必须保留 Child Session ID，才能回到真正发生工作的那条历史。

### 子 Agent 为什么不能只是一次嵌套函数调用

子任务一旦进入多轮模型调用，就可能继续执行工具、触发压缩，也可能在中途被单独取消或失败，因此一次普通的嵌套函数调用装不下这些状态变化。独立 Session 为子任务保留完整历史和恢复边界，而父 Session 只接收投影后的 Tool Result，不必把内部对话全部塞进自己的 Context。隔离不是免费的——跨 Session 的权限、成本与 Trace 关联都必须显式处理。

## Skill：发现后还要按 Agent Permission 过滤

源码：[查看可用 Skill 列表](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/skill/index.ts#L253-L318)

```typescript
return list.filter((skill) =>
  Permission.evaluate('skill', skill.name, agent.permission).action !== 'deny',
)
```

- **调用者**：Prompt/Skill Tool 为当前 Agent 列出资源。
- **输入**：发现的 Skills 与 Agent Permission。
- **状态变化**：过滤明确拒绝的 Skill。
- **返回**：该 Agent 可见的 Skill Catalog。
- **下一站**：模型选择读取 Skill 正文。

## Plugin 是高信任进程代码

Plugin 能注册 Tool、Provider、Auth 和 Hook，而且它直接以 OpenCode 进程权限运行，所以风险远高于普通 Prompt 文件。在启用一个 Plugin 之前，需要分别审计签名、来源、版本与安装脚本，而当 Hook 会改写模型输入或 Tool Result 时，还应保留改写前后的值，给后续解释留下证据。

## MCP：连接存在不等于服务提供每种能力

源码：[查看 MCP Catalog 能力检查](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/mcp/catalog.ts#L38-L155)

```typescript
if (!client.getServerCapabilities()?.resources) {
  return Promise.resolve([])
}

return paginate((cursor) => client.listResources(...))
```

- **调用者**：MCP Client 连接成功后的目录发现。
- **输入**：Server Capabilities 与分页 Cursor。
- **状态变化**：只请求声明支持的 Tools/Prompts/Resources/Templates。
- **返回**：可转成 OpenCode Registry 项的目录。
- **下一站**：Tool/Skill/Resource 表按当前 Agent 过滤。

## LSP：按文件和项目根选择语言服务器

LSP 提供 Diagnostics、Definition、References 和 Symbols，但只有 Binary 存在、Root 探测成功且文件语言匹配时，这些查询才真的可用。仓库里出现 `package.json`，并不等于 TypeScript Server 已经启动。

## 回到运费任务

父 Agent 可以把「检查相关测试覆盖」委托给子 Agent，但父端禁止编辑测试的 Deny 必须继续生效。在执行过程中，Skill 可以告诉子 Agent 项目测试命令，LSP 可以定位 `shippingFee` 引用，而 MCP 可以提供外部资源。Plugin 则是最需要审计的进程内代码。这些机制扩展的是不同层，不能统称为「插件」。

## 练习：一项能力为什么目录可见却不能使用

如果 Skill 已被发现但当前 Agent 看不到，MCP 已连接却没有 Resource，或者 LSP 配置存在却查不到 Definition，分别应该从哪一层开始检查？

<details>
<summary>查看核对要点</summary>

可以依次检查 Agent 对 `skill` 的 Permission、MCP Server 声明的 Capabilities 与分页结果，以及 LSP Binary、Root 和文件语言是否匹配。因为发现、授权、服务能力和运行依赖是四道不同门槛，所以通过前一道并不能证明后一道也已就绪。

</details>

下一篇：[Server、Protocol 与多产品表面](06-server-protocol-surfaces.md)。
