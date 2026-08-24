# Agents、Skills、Plugins、MCP 与 LSP 扩展哪一层

[返回 OpenCode 课程地图](README.md)

OpenCode 的扩展来源很多：Agent 定义模型、Prompt 与 Permission；Task Tool 创建子 Session；Skill 提供按权限过滤的指令资源；Plugin 可贡献 Tools、Auth、Provider 和 Hooks；MCP 提供远端 Tools/Prompts/Resources；LSP 提供代码语义查询。

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

不是所有父端 Allow 都应自动下放。显式保留 Deny 可防子 Agent 因切换 Persona 获得父端禁止能力。

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

子 Session 拥有自己的 Messages、Compaction 和副作用。父端结果只是投影，调试要保留 Child Session ID。

### 子 Agent 为什么不能只是一次嵌套函数调用

子任务可能进行多轮模型调用、工具执行和压缩，还可能被单独取消或失败。独立 Session 让它拥有完整历史与恢复边界；父 Session 只接收经过投影的 Tool Result，避免把全部内部对话塞进父 Context。代价是跨 Session 的权限、成本和 Trace 关联必须显式处理。

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

Plugin 能注册 Tool、Provider/Auth 和 Hook，风险远高于普通 Prompt 文件。它以 OpenCode 进程权限运行；签名、来源、版本与安装脚本需要单独审计。Hook 改写模型输入或 Tool Result 时，也应保存前后值以便解释。

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

LSP 提供 Diagnostics、Definition、References 和 Symbols。Binary 不存在、Root 探测失败或文件语言不匹配时，功能不可用；它不会因为仓库有 `package.json` 就自动保证 TypeScript Server 已启动。

## 回到运费任务

父 Agent 可以把「检查相关测试覆盖」委托给子 Agent，但父端禁止编辑测试的 Deny 必须继续生效。Skill 可以告诉子 Agent 项目测试命令，LSP 可以定位 `shippingFee` 引用，MCP 可以提供外部资源；Plugin 则是最需要审计的进程内代码。它们都扩展不同层，不能统称为「插件」。

## 练习：一项能力为什么目录可见却不能使用

Skill 已被发现但当前 Agent 看不到，MCP 已连接但没有 Resource，LSP 配置存在却无 Definition。分别应该检查什么？

<details>
<summary>查看核对要点</summary>

依次检查 Agent 对 `skill` 的 Permission、MCP Server 声明的 Capabilities 与分页结果、LSP Binary/Root/文件语言匹配。发现、授权、服务能力和运行依赖是不同门槛。

</details>

下一篇：[Server、Protocol 与多产品表面](06-server-protocol-surfaces.md)。
