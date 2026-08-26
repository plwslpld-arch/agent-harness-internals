# 动态权限决策：`can_use_tool` 不是每次工具调用的总开关

[返回 Claude 课程地图](README.md)

工具集合与静态规则已经分开，剩下的是上一章五层框架里的动态询问：一项调用何时才会交给业务代码决定，这个问题要沿 `can_use_tool` 的控制协议路径回答。

业务代码常常希望在运行时判断：「这条 Bash 命令可以执行吗？」Claude Agent SDK 虽然为此提供了 `can_use_tool` 回调，可它替代的只是一次本来需要交互询问的权限决定，并不会天然接管每一次工具调用。

```python
from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny

async def decide(tool_name, tool_input, context):
    if tool_name == "Bash" and tool_input.get("command") == "npm test":
        return PermissionResultAllow()
    return PermissionResultDeny(message="这里只允许运行测试")
```

如果静态规则已经自动允许 `Bash`，上面的回调可能根本收不到该调用——理解这一点，是写对权限策略的起点。

## 权限决策不是单个布尔值

公开契约不只给出一个布尔决定，因为允许结果还能携带改写后的工具输入和权限更新建议，而拒绝结果则能说明原因，并选择是否中断整个会话。

```python
@dataclass
class PermissionResultAllow:
    behavior: Literal["allow"] = "allow"
    updated_input: dict[str, Any] | None = None
    updated_permissions: list[PermissionUpdate] | None = None

@dataclass
class PermissionResultDeny:
    behavior: Literal["deny"] = "deny"
    message: str = ""
    interrupt: bool = False
```

源码：[查看权限结果类型](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L236-L259)

因此，权限层至少要保留四类信息：原始输入、决定、可能改写后的输入、决定理由。若只在日志里记一个 `true/false`，后续就无法解释实际执行的参数为什么和模型最初提出的不一样。

## 先看完整路径

```text
具体工具调用
  → Claude Code 的权限规则求值（闭源产品边界）
  → 已允许：继续，不调用 can_use_tool
  → 已拒绝：拒绝，不调用 can_use_tool
  → 需要询问：经控制协议发送 can_use_tool 请求
  → Python 回调返回 Allow 或 Deny
  → SDK 转成控制响应写回 CLI
```

在这张路径图中，开源 SDK 只能证明后半段控制协议，而内部规则求值仍要依据公开契约描述边界，不能伪装成已读到 Claude Code 内部实现。

### 第 1 站：配置阶段把询问通道切到标准输入输出

源码：[查看 `_configure_can_use_tool`](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1896-L1919)

```python
if not options.can_use_tool:
    return options
if options.permission_prompt_tool_name:
    raise ValueError(...)
_warn_if_can_use_tool_shadowed(options)
return replace(options, permission_prompt_tool_name="stdio")
```

- **调用者**：一次性 `query()` 和双向 `ClaudeSDKClient.connect()` 的内部流程都会调用它。
- **输入**：包含 `can_use_tool` 的 Options。
- **状态变化**：原对象不被原地修改；SDK 创建一个把权限询问路由到 `stdio` 的副本。
- **返回**：配置后的 Options，或在两种互斥提示机制同时存在时抛错。
- **下一站**：Client 用新 Options 创建 Transport 和 Query 控制层。

这里解决的是「权限询问怎样回到 Python 进程」，而不是「哪些工具应该询问」——后者仍由 CLI 的权限规则决定。

### 第 2 站：Client 把回调交给 Query 控制层

源码：[查看 Client 创建 Query](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py#L73-L148)

```python
configured_options = _configure_can_use_tool(options)
chosen_transport = SubprocessCLITransport(
    prompt=prompt,
    options=configured_options,
)
await chosen_transport.connect()

query = Query(
    transport=chosen_transport,
    is_streaming_mode=True,
    can_use_tool=configured_options.can_use_tool,
    ...
)
```

- **调用者**：公开查询入口最终进入 `_process_query_inner()`。
- **输入**：Prompt、Options，以及可选的自定义 Transport。
- **状态变化**：Transport 已连接；回调引用被保存到 Query 实例。
- **返回**：这个异步生成器随后会输出消息，而 Query 在后台处理控制请求。
- **下一站**：CLI 发来 `can_use_tool` 控制请求时，Query 找到并调用保存的回调。

这一步把 Transport 和权限决定器的职责分开了，因为 Transport 只负责搬运消息，真正把协议事件分派给 Python 回调的是 Query。

### 第 3 站：真正收到请求后构造上下文

源码：[查看 `can_use_tool` 请求分支](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L469-L506)

```python
if subtype == "can_use_tool":
    original_input = permission_request["input"]
    context = ToolPermissionContext(
        signal=None,
        suggestions=[...],
        tool_use_id=permission_request.get("tool_use_id"),
        agent_id=permission_request.get("agent_id"),
        ...
    )
    response = await self.can_use_tool(
        permission_request["tool_name"],
        permission_request["input"],
        context,
    )
```

- **调用者**：Query 的控制消息读取循环收到 CLI 请求后进入 `_handle_control_request()`。
- **输入**：工具名、工具输入、建议权限更新、`tool_use_id`、子 Agent 标识和展示信息。
- **状态变化**：SDK 将线上的字典重建为 `ToolPermissionContext`，然后暂停等待业务回调。
- **返回**：业务回调返回 `PermissionResultAllow` 或 `PermissionResultDeny`。
- **下一站**：Query 把 Python 类型编码为 CLI 认识的控制响应。

并发工具调用时，如果只按工具名关联审计记录，同名调用就可能串在一起，因此需要用 `tool_use_id` 区分每次调用，再用 `agent_id` 把主 Agent 与子 Agent 的权限请求分开归因。

### 第 4 站：允许可能改写输入，拒绝可能中断

源码：[查看权限结果编码](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L508-L530)

```python
if isinstance(response, PermissionResultAllow):
    response_data = {
        "behavior": "allow",
        "updatedInput": response.updated_input
        if response.updated_input is not None
        else original_input,
    }
elif isinstance(response, PermissionResultDeny):
    response_data = {"behavior": "deny", "message": response.message}
    if response.interrupt:
        response_data["interrupt"] = response.interrupt
```

- **调用者**：仍是 `_handle_control_request()`。
- **输入**：业务回调的强类型结果和原始工具输入。
- **状态变化**：Python 字段被转换为协议字段；未改写时显式回填原输入。
- **返回**：统一的 `control_response` 最终写回 Transport。
- **下一站**：CLI 根据响应继续或拒绝工具调用；这一执行分支属于产品边界。

这里还暴露一个可测试的不变量：业务回调必须返回两种规定类型之一，否则 SDK 抛出 `TypeError`，不会把任意字典静默当作权限决定。

## 为什么回调会「失踪」

SDK 专门检查两类明显的遮蔽配置：

- `permission_mode="bypassPermissions"` 会在回调前自动批准调用，但显式拒绝规则仍例外；
- `allowed_tools` 中允许整个工具的规则，如 `Read`、`Read()`、`Read(*)`，会让相应调用在到达回调前获批。

源码：[查看遮蔽警告](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1833-L1863)

带约束的规则与裸工具规则不同。例如 `Bash(npm test:*)` 只允许匹配调用，其他 Bash 输入仍可能进入询问。Settings 文件里的允许规则也可能遮蔽回调，但 SDK 在这段本地检查中未必能看见它们，因此没有警告不代表回调一定覆盖所有调用。

## 正确选择：权限回调还是 `PreToolUse` Hook

| 需求 | 更合适的机制 |
| --- | --- |
| 只处理原本需要用户确认的调用 | `can_use_tool` |
| 每次工具调用都要审计或策略检查 | `PreToolUse` Hook |
| 调用执行后清洗结果或补充上下文 | `PostToolUse` Hook |
| 彻底限制模型看见的工具集合 | `tools` |
| 约束文件、网络和子进程能力 | Sandbox 与操作系统策略 |

`PreToolUse` 也不是权限回调的同义词，它属于更通用的生命周期机制，能返回 `allow`、`deny`、`ask` 或 `defer` 等特定输出。下一篇再追踪注册、回调 ID 和响应路径。

## 最小验证实验

可以设计三组配置调用同一个 `Read`，观察回调计数：

1. 仅配置 `can_use_tool`，让权限规则产生询问；预期回调收到请求。
2. 再加入 `allowed_tools=["Read"]`；预期该调用被静态规则自动放行，回调计数不增加。
3. 移除裸允许规则，改加 `PreToolUse` Hook；预期每次匹配的 `Read` 都进入 Hook。

这个实验只验证公开回调语义，无法证明 Claude Code 的内部实现，所以测试证据应该记录 Options、工具输入、回调次数、决定与最终工具结果，而不能只看终端上「好像执行了」。

`can_use_tool` 的边界至此明确：它只接住需要询问的调用，而要覆盖每次匹配调用，还得继续追踪 Hook 的注册与响应路径。

下一篇：[Hooks 生命周期：注册、匹配、并发回调与结果改写](06-hooks-lifecycle.md)。
