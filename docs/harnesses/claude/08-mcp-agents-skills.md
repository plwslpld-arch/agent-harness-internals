# MCP、Agents 与 Skills：三种扩展机制不要混用

[返回 Claude 课程地图](README.md)

SessionStore 已经把外部记录材料化为 CLI 能恢复的 JSONL，并用 subpath 校验守住临时目录。恢复链路解决了历史怎样回来——现在该看能力怎样进入同一次运行了。

MCP、Agents 和 Skills 都能扩展一次 Claude 运行，但扩展的对象不同：MCP 增加协议化能力，Agent 增加可委派的角色与上下文，而 Skill 增加可发现的操作说明和资源。如果把三者都叫「插件」，权限、进程和生命周期差异就会被掩盖。

| 机制 | 主要增加什么 | 典型问题 |
| --- | --- | --- |
| MCP Server | Tools、Resources、Prompts 等协议能力 | 在哪运行，怎样授权，结果如何返回 |
| Agent Definition | 可由主 Agent 调用的子 Agent 配置 | 有哪些工具、使用什么 Prompt、如何归因 |
| Skill | 按需加载的说明、脚本和资源 | 从哪些设置源发现，允许哪些名称 |

## MCP 有外部 Server 与进程内 Server

外部 MCP Server 可以通过 stdio、HTTP 或其他公开配置连接，而 SDK MCP Server 则直接运行在 Python 应用进程中。后者省去了额外进程和 IPC，但工具函数也因此能直接访问应用内存，它的崩溃、阻塞和敏感状态暴露都与宿主进程同域。

### 第 1 站：`@tool` 把 Python 函数变成 SDK MCP 工具

源码：[查看 Tool 装饰器契约](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/__init__.py#L251-L283)

```python
def tool(
    name: str,
    description: str,
    input_schema: type | dict[str, Any],
    annotations: _McpToolAnnotations | None = None,
) -> Callable[..., SdkMcpTool[Any]]:
```

- **调用者**：应用开发者装饰一个异步 Python 函数。
- **输入**：稳定工具名、给模型看的描述、输入 Schema 和可选 MCP 注解。
- **状态变化**：函数被包装成 `SdkMcpTool`，还没有启动 Server，也没有暴露给模型。
- **返回**：可加入 SDK MCP Server 的工具对象。
- **下一站**：`create_sdk_mcp_server()` 把一个或多个 Tool 注册到进程内 Server。

描述和 Schema 都属于模型输入面，因为描述含糊会导致选择错误，Schema 过宽也会增加危险参数空间。`readOnlyHint`、`destructiveHint` 等注解只能用作提示，不应替代实际权限和输入校验。

### 第 2 站：进程内 Server 仍通过 MCP 协议连接

源码：[查看 SDK MCP Server 创建](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/__init__.py#L491-L516)

```python
def create_sdk_mcp_server(
    name: str,
    version: str = "1.0.0",
    tools: list[SdkMcpTool[Any]] | None = None,
) -> McpSdkServerConfig:
    ...
```

- **调用者**：业务应用完成 Tool 定义后创建 Server 配置。
- **输入**：Server 名称、版本和 Tool 列表。
- **状态变化**：构建普通 `mcp.server.Server` 实例并登记 Handler。
- **返回**：`type="sdk"` 的 `McpSdkServerConfig`，可放入 `ClaudeAgentOptions.mcp_servers`。
- **下一站**：InternalClient 识别 SDK 类型，把实例交给 Query；CLI 通过控制协议转发 MCP 消息。

「进程内」描述部署位置，不是绕开 MCP——请求仍有 Server 名称、JSON-RPC 消息、Tool Schema 和错误结果，只是传输由 SDK 与控制协议桥接。

### 第 3 站：Client 将不同配置送往不同路径

源码：[查看扩展配置装配](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py#L100-L147)

```python
for name, config in configured_options.mcp_servers.items():
    if isinstance(config, dict) and config.get("type") == "sdk":
        sdk_mcp_servers[name] = config["instance"]

agents_dict = {
    name: {k: v for k, v in asdict(agent_def).items() if v is not None}
    for name, agent_def in configured_options.agents.items()
}

query = Query(
    sdk_mcp_servers=sdk_mcp_servers,
    agents=agents_dict,
    skills=configured_options.skills,
    ...
)
```

- **调用者**：InternalClient 在 Transport 连接后装配 Query。
- **输入**：MCP 配置、Agent 定义和 Skill 选择。
- **状态变化**：进程内 MCP 实例保留在 Python；Agent 转成可序列化字典；Skill 作为初始化选择保存。
- **返回**：持有三类扩展信息的 Query。
- **下一站**：initialize 发送 Agent 和 Skill 配置；运行时 MCP 消息按 Server 名称回到本地实例。

这段代码正好证明三类扩展不共享同一执行路径：Agent Definition 不是 MCP Server，Skill 名称也不会变成 Python 回调函数。

### 第 4 站：MCP 请求通过控制协议回到 Python

源码：[查看 MCP 控制请求分支](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L548-L566)

```python
elif subtype == "mcp_message":
    server_name = request_data.get("server_name")
    mcp_message = request_data.get("message")
    mcp_response = await self._handle_sdk_mcp_request(
        server_name, mcp_message
    )
    response_data = {"mcp_response": mcp_response}
```

- **调用者**：CLI 发来 `mcp_message` 控制请求，Query 分派它。
- **输入**：Server 名称和 MCP JSON-RPC 消息。
- **状态变化**：对应进程内 Server 执行 Handler；通知类消息也会得到控制层确认。
- **返回**：MCP 响应被包装到 `control_response`。
- **下一站**：CLI 将 Tool 结果继续送入 Agent 运行；应用还应记录执行结果和副作用。

一旦 Python Tool 执行阻塞，控制协议也会跟着等待，所以高风险或不可信实现更适合隔离在外部 MCP Server 中，再使用进程、容器、网络和资源限额建立边界。

## Agent Definition 增加委派角色

`ClaudeAgentOptions.agents` 是名称到 Agent Definition 的映射，主运行可以通过 Agent 工具调用它，而一个定义通常包含描述、Prompt、工具限制和模型等配置。真正的风险来自新的调用主体，不只是多了一个 Prompt：

- 子 Agent 的 ToolUse 要用 `agent_id` 与主线程分开归因；
- 工具权限不能因为「来自内部子 Agent」就默认可信；
- 并行子 Agent 的 Hook 和消息会交错，不能靠输出顺序关联；
- 主 Agent 成功不代表所有子任务都成功，Artifact 要保留各自终态。

Agent 定义在 initialize 中发送，但这只能证明公开配置交付路径，不能从 SDK 源码推断 Claude Code 内部调度器的具体类或队列。

## Skill 增加按需知识与流程

公开字段 `skills` 有三种有意义的值：

- `None`：SDK 不做自动配置，但 CLI 默认仍可能发现 Skill；
- `[]`：显式不向列表暴露任何 Skill；
- `"all"` 或名称列表：启用全部或指定 Skill。

源码：[查看 Skills 语义](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L2230-L2244)

设置 Skills 时，SDK 还会补足对应的允许规则和 Settings 来源，这会影响前面工具可见性课程已经看到的有效 `allowed_tools`，进而可能遮蔽 `can_use_tool`。Skill 的启用行为会跨到发现与权限配置，它并非纯 Prompt 文件。

## 一项需求该选哪种机制

### 需求一：读取公司工单系统

优先考虑 MCP Tool，它有明确输入输出 Schema，可把认证与 API 调用隔离在 Server，并独立记录每次调用。

### 需求二：让专门的审查角色并行检查安全问题

考虑 Agent Definition，给它限定 Prompt 和工具，并用 Agent ID 收集独立轨迹与结果。

### 需求三：让 Agent 按团队发布流程操作

考虑 Skill，把说明、脚本与模板组织成可发现资源，但脚本本身仍需工具权限和系统隔离。

同一功能可以组合三者：Skill 教 Agent 何时执行发布，子 Agent 负责审查，而 MCP Tool 调用发布系统。组合后更要逐层记录权限和失败，不能用一个「插件执行失败」概括全部。

## 扩展安全清单

1. MCP Tool 使用最小 Schema，并在 Handler 内再次校验输入。
2. 进程内 MCP 只承载可信代码；不可信代码使用外部隔离。
3. Agent Definition 明确工具集合、成本与停止条件。
4. 子 Agent 事件保留 `agent_id`，不要按到达顺序归因。
5. Skill 来源和名称使用显式允许列表，避免无意加载项目外内容。
6. 三类扩展的失败分别进入 Artifact，再由独立 Eval 判断任务影响。

三类扩展的路径分清后，下一步要检查这些公开契约换到 TypeScript 时还能讲到哪一层，并把可见的对齐与不可见的内部实现分开。

下一篇：[TypeScript SDK：公开契约能讲到哪里](09-typescript-contract-parity.md)。
