# 动态权限决策：`can_use_tool` 不是每次工具调用的总开关

[返回 Claude 课程地图](README.md)

工具集合和静态规则已经分清了，上一章五层框架还剩动态询问这一层：业务代码什么时候才有机会判断某次调用，要顺着 `can_use_tool` 走过控制协议的过程来看。

业务代码常常要在运行时判断：「这条 Bash 命令能不能执行？」Claude Agent SDK 虽然提供了 `can_use_tool` 回调，但它只替用户回答原本需要交互询问的那一次权限问题，并不会自动接管每次工具调用。

```python
from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny

async def decide(tool_name, tool_input, context):
    if tool_name == "Bash" and tool_input.get("command") == "npm test":
        return PermissionResultAllow()
    return PermissionResultDeny(message="这里只允许运行测试")
```

如果静态规则已经自动放行 `Bash`，上面的回调可能根本收不到这次调用。这条边界很关键。写权限策略之前，你得先认清它。

## 权限决策不是单个布尔值

公开契约没有把决定压成一个布尔值，因为回调允许调用时，还可以改写工具输入并建议更新权限。拒绝也不只说「不行」，回调还能说明原因，并决定要不要中断整个会话。

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

所以权限层至少要记住原始输入、最终决定、改写后的输入和决定理由。日志里如果只留一个 `true/false`，以后就没法解释工具实际执行的参数为什么和模型最初给出的不同。

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

这张图的后半段可以从开源 SDK 里核对，前半段怎样在内部计算规则，却只能按公开契约来划定边界，不能写得像我们已经读过 Claude Code 的内部实现。

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

这里回答的是「权限问题怎样送回 Python 进程」，至于「哪些工具需要询问」，仍由 CLI 的权限规则来决定。这两件事不能混。

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

走到这一步，Transport（传输层）只负责搬运消息，Query 把协议事件交给 Python 回调，最后由回调决定是否放行，三者各自做什么也就分清了。

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

多个工具并发调用时，只按工具名去找审计记录，很容易把同名调用串到一起。调用身份不能丢。你要用 `tool_use_id` 分清每一次调用，再用 `agent_id` 判断权限请求来自主 Agent 还是子 Agent。

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

这里还能测出一条固定规则：业务回调只能返回规定的两种类型，否则 SDK 会抛出 `TypeError`，不会悄悄把任意字典当成权限决定。

## 为什么回调会「失踪」

SDK 专门检查两类明显的遮蔽配置：

- `permission_mode="bypassPermissions"` 会在回调前自动批准调用，但显式拒绝规则仍例外；
- `allowed_tools` 中允许整个工具的规则，如 `Read`、`Read()`、`Read(*)`，会让相应调用在到达回调前获批。

源码：[查看遮蔽警告](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1833-L1863)

带约束的规则和直接放行整个工具的规则并不一样。例如 `Bash(npm test:*)` 只放行匹配的调用，其他 Bash 输入仍可能触发询问。Settings 文件也可能写了允许规则并提前放行调用，但 SDK 做这段本地检查时未必看得到，所以没有警告也不能说明回调覆盖了所有调用。

## 正确选择：权限回调还是 `PreToolUse` Hook

| 需求 | 更合适的机制 |
| --- | --- |
| 只处理原本需要用户确认的调用 | `can_use_tool` |
| 每次工具调用都要审计或策略检查 | `PreToolUse` Hook |
| 调用执行后清洗结果或补充上下文 | `PostToolUse` Hook |
| 彻底限制模型看见的工具集合 | `tools` |
| 约束文件、网络和子进程能力 | Sandbox 与操作系统策略 |

`PreToolUse` 也不能和权限回调画等号，它介入的生命周期更广，还能返回 `allow`、`deny`、`ask` 或 `defer` 等特定输出。下一篇会顺着注册过程，看回调 ID 怎样生成，响应又怎样写回。

## 最小验证实验

你可以让三组配置都调用同一个 `Read`，再看回调各触发了多少次：

1. 仅配置 `can_use_tool`，让权限规则产生询问；预期回调收到请求。
2. 再加入 `allowed_tools=["Read"]`；预期该调用被静态规则自动放行，回调计数不增加。
3. 移除裸允许规则，改加 `PreToolUse` Hook；预期每次匹配的 `Read` 都进入 Hook。

这个实验只能验证公开回调表现，证明不了 Claude Code 内部怎样实现。因此测试时要记下 Options、工具输入、回调次数、回调决定和最终工具结果，不能只凭终端上看起来「好像执行了」就下结论。

边界到这里就清楚了。`can_use_tool` 只接住需要询问的调用，如果你想覆盖每次匹配的调用，还得继续看 Hook 怎样注册、怎样返回响应。

下一篇：[Hooks 生命周期：注册、匹配、并发回调与结果改写](06-hooks-lifecycle.md)。
