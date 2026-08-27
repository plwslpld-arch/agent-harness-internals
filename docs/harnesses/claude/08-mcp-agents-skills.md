# MCP、Agents 与 Skills：三种扩展机制不要混用

[返回 Claude 课程地图](README.md)

SessionStore（会话存储）会把外部记录落成 CLI 能恢复的 JSONL（逐行 JSON），同时校验 subpath，免得恢复时越出临时目录。历史怎样回来已经说清了，这一篇改看各种能力怎样接入同一次运行。

MCP、Agents 和 Skills 都能给一次 Claude 运行加能力，但三者动的地方不同：MCP 通过协议接入工具等能力，Agent 定义新的角色和独立上下文，供主 Agent 委派任务，Skill 则收好操作说明和配套资源，让 Agent 按需发现和加载。要是统统叫成「插件」，你就看不出它们分别在哪个进程里跑、受哪层权限管，以及何时开始和结束。

| 机制 | 主要增加什么 | 典型问题 |
| --- | --- | --- |
| MCP Server | Tools、Resources、Prompts 等协议能力 | 在哪运行，怎样授权，结果如何返回 |
| Agent Definition | 可由主 Agent 调用的子 Agent 配置 | 有哪些工具、使用什么 Prompt、如何归因 |
| Skill | 按需加载的说明、脚本和资源 | 从哪些设置源发现，允许哪些名称 |

## MCP 有外部 Server 与进程内 Server

外部 MCP Server 可以按公开配置走 stdio、HTTP 等通道，SDK MCP Server 却直接跑在 Python 应用进程里。这样确实少了一个进程和一层 IPC，但工具函数也能直接碰到应用内存，所以它一旦崩溃或阻塞，宿主就会跟着受影响，敏感状态也留在同一个信任边界内。

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

模型会同时看到描述和 Schema，所以描述写得含糊，它就容易选错工具，而 Schema 放得过宽，它就可能填入更多危险参数。`readOnlyHint`、`destructiveHint` 这类注解只是提示，真正的权限判断和输入校验还得由执行端完成。

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

「进程内」只是在说 Server 部署在哪里，它没有绕过 MCP。请求照样带着 Server 名称、JSON-RPC 消息和 Tool Schema，失败也会返回协议化的错误结果，只是 SDK 会通过控制协议来回桥接这些消息。

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

这段代码把三条路分得很清楚：Agent Definition（智能体定义）不会被当成 MCP Server，Skill 的名称也不会转成 Python 回调，所以你不能用同一条执行链来解释它们。

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

Python Tool 如果卡住，控制协议就只能跟着等。因此，高风险或不可信的实现更适合放到外部 MCP Server，然后再用独立进程、容器、网络策略和资源限额给它划出清晰边界。

## Agent Definition 增加委派角色

`ClaudeAgentOptions.agents` 按名称收好每个 Agent Definition，主 Agent 再通过工具把任务交给它，而每份定义通常会写明描述、Prompt、可用工具和模型。这里真正要防的是多出一个能发起调用的主体，而不只是多了一段 Prompt：

- 子 Agent 的 ToolUse 要用 `agent_id` 与主线程分开归因；
- 工具权限不能因为「来自内部子 Agent」就默认可信；
- 并行子 Agent 的 Hook 和消息会交错，不能靠输出顺序关联；
- 主 Agent 成功不代表所有子任务都成功，Artifact 要保留各自终态。

initialize 会把 Agent 定义发送出去，这能证明公开配置是怎样交给 CLI 的，却不足以支持你去推测 Claude Code 内部用了什么调度器类或队列。

## Skill 增加按需知识与流程

公开字段 `skills` 有三种有意义的值：

- `None`：SDK 不做自动配置，但 CLI 默认仍可能发现 Skill；
- `[]`：显式不向列表暴露任何 Skill；
- `"all"` 或名称列表：启用全部或指定 Skill。

源码：[查看 Skills 语义](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L2230-L2244)

当你设置 Skills 时，SDK 还会补上相应的允许规则和 Settings 来源，因此前面课程追过的有效 `allowed_tools` 会跟着改变，`can_use_tool` 甚至可能被遮蔽。Skill 不只是一份 Prompt 文件，它一旦启用，就会同时影响能否发现对应内容，以及运行时怎样配权限。

## 一项需求该选哪种机制

### 需求一：读取公司工单系统

这类需求优先用 MCP Tool，因为它用 Schema 约清输入输出，还能把认证和 API 调用放在 Server 里隔离运行，并为每次调用单独留下记录。

### 需求二：让专门的审查角色并行检查安全问题

这时可以用 Agent Definition，但要给它限定 Prompt 和工具，再按 Agent ID 分别收集轨迹和结果，别把并行输出混在一起。

### 需求三：让 Agent 按团队发布流程操作

这种情况适合用 Skill，把说明、脚本和模板收成 Agent 能找到的资源，不过脚本真正运行时，仍然要受工具权限和系统隔离约束。

一项功能也可以同时用到三者：Skill 告诉 Agent 何时发布，子 Agent 专门做审查，MCP Tool 再去调发布系统。一旦这样组合，你就得分层记下权限决定和失败位置，因为一句「插件执行失败」根本说不清哪一层出了问题。

## 扩展安全清单

1. MCP Tool 使用最小 Schema，并在 Handler 内再次校验输入。
2. 进程内 MCP 只承载可信代码；不可信代码使用外部隔离。
3. Agent Definition 明确工具集合、成本与停止条件。
4. 子 Agent 事件保留 `agent_id`，不要按到达顺序归因。
5. Skill 来源和名称使用显式允许列表，避免无意加载项目外内容。
6. 三类扩展的失败分别进入 Artifact，再由独立 Eval 判断任务影响。

三条扩展路径现在已经分清，下一篇再换到 TypeScript，看这些公开契约还能追到哪里，以及哪些细节因为没有源码而必须留白。

下一篇：[TypeScript SDK：公开契约能讲到哪里](09-typescript-contract-parity.md)。
