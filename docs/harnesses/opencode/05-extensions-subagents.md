# Agents、Skills、Plugins、MCP 与 LSP 扩展哪一层

[返回 OpenCode 课程地图](README.md)

OpenCode 有好几条路可以给 Agent 增加能力，但每条路接入系统的位置都不一样。Agent 定义会选定模型、Prompt 和 Permission（权限），Task Tool 则负责创建子 Session，让父 Agent 能把一段工作交出去。

Skill（技能）经过权限过滤后才把指令资源交给 Agent，Plugin 却能直接向进程注册 Tools、Auth、Provider 和 Hooks。

再往系统外面看，MCP 暴露远端的 Tools、Prompts 与 Resources，LSP（语言服务器协议）只管回答代码语义问题。它们不能混着理解。

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

父 Session 已经放行的能力不会自动全部交给子 Agent，因为子 Agent 换了 Persona（角色设定）以后，仍得遵守父 Session 设下的禁止边界。Deny 必须跟过去。

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

子 Session 会保存自己的 Messages，也会独立触发 Compaction 并产生副作用，父端最后拿到的只是这段运行投回来的结果。调试时一定要留下 Child Session ID，你才能找到真正执行过工作的那条历史。

### 子 Agent 为什么不能只是一次嵌套函数调用

子任务一旦跑进多轮模型调用，就可能继续执行工具、触发压缩，也可能中途单独取消或失败，因此普通的嵌套函数调用根本装不下这些状态。独立 Session 会替子任务留住完整历史，也给它划出可以恢复的边界，父 Session 只收最终投回来的 Tool Result，不用把内部对话全塞进自己的 Context。这样做也有代价，跨 Session 的权限和成本要单独处理，Trace 也得明确关联起来。

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

Plugin 可以注册 Tool、Provider、Auth 和 Hook，还直接拿着 OpenCode 进程的权限运行，风险自然比普通 Prompt 文件高得多。启用之前，你得逐项检查它的签名、来源、版本和安装脚本，这道检查不能省。如果 Hook 还会改写模型输入或 Tool Result，就要把改写前后的值都留下，免得出问题时找不到证据。

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

LSP 可以查询 Diagnostics、Definition、References 和 Symbols，但它得先找到 Binary，正确识别 Root，还要确认文件语言匹配，查询才真的跑得起来。仓库里有 `package.json`，不代表 TypeScript Server 已经启动。

## 回到运费任务

父 Agent 可以把「检查相关测试覆盖」交给子 Agent，不过父端用 Deny 禁止编辑测试后，这条限制必须在子 Session 里继续生效。任务跑起来以后，Skill 可以告诉子 Agent 该用哪条测试命令，LSP 可以帮它找到 `shippingFee` 的引用，MCP 则能提供外部资源。Plugin 直接进入进程，最该仔细审计。它们改动的层次不同，不能全叫「插件」。

## 练习：一项能力为什么目录可见却不能使用

如果 Skill 已被发现但当前 Agent 看不到，MCP 已连接却没有 Resource，或者 LSP 配置存在却查不到 Definition，分别应该从哪一层开始检查？

<details>
<summary>查看核对要点</summary>

你可以依次检查 Agent 对 `skill` 的 Permission、MCP Server 声明的 Capabilities 和分页结果，再确认 LSP Binary、Root 与文件语言能不能对上。发现、授权、服务能力和运行依赖各管一道门，前一道已经通过，后一道仍可能卡住。

</details>

下一篇：[Server、Protocol 与多产品表面](06-server-protocol-surfaces.md)。
