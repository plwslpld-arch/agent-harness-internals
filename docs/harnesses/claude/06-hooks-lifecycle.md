# Hooks 生命周期：在工具调用前后插入可核对的策略点

[返回 Claude 课程地图](README.md)

`can_use_tool` 只能接到权限规则留下的询问，没法替每次调用都跑一遍策略。要覆盖更多事件，就得看 Hook 怎样注册，运行时怎样分派，以及回调结果怎样编码后写回。

权限回调只处理需要询问的调用，Hooks（钩子集合）却能插进更多生命周期节点：工具执行前检查策略，成功后改写送回模型的结果，失败后补充 Context，也能观察 Prompt 提交、压缩和子 Agent 等事件。

先看一个调用前 Hook：

```python
from claude_agent_sdk import HookMatcher

async def protect_env_file(input_data, tool_use_id, context):
    target = str(input_data.get("tool_input", {}).get("file_path", ""))
    if target.endswith(".env"):
        return {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": "禁止读取环境变量文件",
            }
        }
    return {}

hooks = {
    "PreToolUse": [HookMatcher(matcher="Read", hooks=[protect_env_file])]
}
```

这段代码的意思是「每个匹配的 Read 在执行前都要经过策略函数」，并非「等权限系统想询问时再来调用我」。两条链路不同。

## Hook 由事件、匹配器、回调和输出组成

| 部件 | 作用 |
| --- | --- |
| 事件名 | 确定生命周期位置，如 `PreToolUse`、`PostToolUse` |
| `matcher` | 在该事件内筛选工具或对象 |
| 回调列表 | 一个匹配器可关联多个 Python 异步函数 |
| 通用输出 | 控制是否继续、停止原因、展示信息 |
| 特定输出 | 按事件允许决策、改写输入、补充上下文或替换结果 |

Hook 不能随手返回任意对象，因为公开类型同时约束了输入和输出，而且事件不同，回调能用的字段也不同。

### 第 1 站：事件类型定义了可观察的生命周期

源码：[查看 Hook 事件与工具输入类型](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L262-L339)

```python
HookEvent = (
    Literal["PreToolUse"]
    | Literal["PostToolUse"]
    | Literal["PostToolUseFailure"]
    | Literal["UserPromptSubmit"]
    | Literal["Stop"]
    | Literal["SubagentStop"]
    | Literal["PreCompact"]
    | Literal["Notification"]
    | Literal["SubagentStart"]
    | Literal["PermissionRequest"]
)

class PreToolUseHookInput(BaseHookInput, _SubagentContextMixin):
    tool_name: str
    tool_input: dict[str, Any]
    tool_use_id: str
```

- **调用者**：业务代码用这些类型构造 `hooks` 配置，运行时由 CLI 触发相应事件。
- **输入**：事件名、工具名、工具输入、调用 ID，以及可能存在的子 Agent 信息。
- **状态变化**：类型声明本身不执行回调，只规定协议两端都能理解的数据形状。
- **返回**：强类型的 Hook 输入联合类型供回调消费。
- **下一站**：`HookMatcher` 把事件下的匹配条件与 Python 回调组合起来。

`tool_use_id` 把同一次工具调用的前置、成功和失败事件串起来，遇到子 Agent 时，还可以用 `agent_id` 和 `agent_type` 继续区分。工具并发执行后，这些标识远比「消息出现的先后顺序」可靠。

## 不同时间点能做的事情不同

- `PreToolUse`：在执行前给出权限决定、改写输入或增加上下文。
- `PostToolUse`：拿到成功结果后增加上下文，或者用符合工具输出 Schema 的值替换结果。
- `PostToolUseFailure`：观察错误和中断信息，为后续推理提供上下文。
- `PreCompact`：在上下文压缩前记录或协调外部状态。
- `SubagentStart`、`SubagentStop`：观察子 Agent 生命周期。

源码：[查看 Hook 特定输出](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L415-L495)

用 `PostToolUse` 改写输出时尤其要小心：给内置工具换上的值必须符合它的输出 Schema，形状对不上，系统就会拒绝替换并保留原结果。Hook 绕不过这份数据契约。

### 第 2 站：公开配置先转换成 Query 可消费的形状

源码：[查看 Hook 配置转换](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1922-L1937)

```python
for event, matchers in hooks.items():
    internal_hooks[event] = []
    for matcher in matchers:
        internal_matcher = {
            "matcher": matcher.matcher,
            "hooks": matcher.hooks,
        }
        if matcher.timeout is not None:
            internal_matcher["timeout"] = matcher.timeout
        internal_hooks[event].append(internal_matcher)
```

- **调用者**：Client 在创建 Query 时调用 `_hooks_to_internal_format()`。
- **输入**：按事件组织的 `HookMatcher` 列表。
- **状态变化**：Dataclass 配置被转成内部字典，但回调函数仍只是进程内对象。
- **返回**：Query 接受的事件、匹配器、回调和超时结构。
- **下一站**：初始化控制协议为每个回调分配 ID，不能把 Python 函数对象直接发送给 CLI。

这里也能看清超时由谁控制：它写在 matcher 配置里，Hook 函数不能在内部随意决定。

### 第 3 站：初始化时把函数换成回调 ID

源码：[查看 Query 初始化 Hook](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L231-L280)

```python
for callback in matcher.get("hooks", []):
    callback_id = f"hook_{self.next_callback_id}"
    self.next_callback_id += 1
    self.hook_callbacks[callback_id] = callback
    callback_ids.append(callback_id)

hook_matcher_config = {
    "matcher": matcher.get("matcher"),
    "hookCallbackIds": callback_ids,
}
```

- **调用者**：Client 启动 Query 后调用 `initialize()`。
- **输入**：内部 Hook 配置和本地 Python 回调对象。
- **状态变化**：Query 在 `hook_callbacks` 映射中保存函数，并给每个函数分配稳定的进程内 ID。
- **返回**：初始化请求只携带 matcher、回调 ID 和超时，不携带 Python 函数本身。
- **下一站**：CLI 在事件发生时，通过控制协议带着某个回调 ID 请求 Python 执行。

跨进程时，Claude Code CLI 不会直接「调用 Python 函数」，而是先发一条协议消息。Query 收到消息后按 ID 找回函数，执行完再把结果写回去。

### 第 4 站：收到 `hook_callback` 后执行并编码结果

源码：[查看 Hook 回调分派](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L532-L546)

```python
callback_id = hook_callback_request["callback_id"]
callback = self.hook_callbacks.get(callback_id)
if not callback:
    raise Exception(f"No hook callback found for ID: {callback_id}")

hook_output = await callback(
    request_data.get("input"),
    request_data.get("tool_use_id"),
    {"signal": None},
)
response_data = _convert_hook_output_for_cli(hook_output)
```

- **调用者**：Query 的控制消息循环处理 `hook_callback` 子类型。
- **输入**：回调 ID、强类型事件输入、可选工具调用 ID 和上下文。
- **状态变化**：本地异步函数运行；Python 保留字安全字段会转换为 CLI 协议字段。
- **返回**：Hook 输出被包装进成功控制响应。
- **下一站**：CLI 使用结果继续、阻止、改写输入或把附加上下文送入后续流程。

Python 类型把字段写成 `async_`、`continue_`，线上协议则写成 `async`、`continue`。如果绕过 SDK 转换，直接手写协议字典，字段名很容易在这里对不上。

## 并发不是注册顺序

公开 Options 的注释写明，CLI 会并发分派同一事件上的多个匹配器，所以你不能假定「先注册的 Hook 先改状态，后注册的 Hook 再读取」。顺序靠不住。每个 Hook 都应当独立并保持幂等，记录之间则用 `tool_use_id` 或 `agent_id` 关联。

反例：

```python
# 不要假设 hook_a 一定先把全局变量设好，hook_b 才开始读取。
hooks = {
    "PreToolUse": [
        HookMatcher(matcher="Bash", hooks=[hook_a]),
        HookMatcher(matcher="Bash", hooks=[hook_b]),
    ]
}
```

如果几条策略必须合成一个确定结论，最好只注册一个负责编排的回调，让它明确收集各条规则的结果，并规定冲突时谁优先。

## `PreToolUse` 与 `can_use_tool` 怎样配合

你可以把两者分成两个阶段：

1. `PreToolUse` 负责每次匹配调用的通用策略、审计和输入检查。
2. 若前置 Hook 没有直接形成允许决定，权限规则仍可能让调用进入 `can_use_tool` 询问。

公开类型的注释指出，只要 `PreToolUse` 给出允许决定，运行时就会跳过 `can_use_tool`。两层不能混用。最好让前置 Hook 执行覆盖全部调用的硬规则，再把剩下的交互式决定交给动态权限回调。

## 可观测性应记录什么

要让一条 Hook 记录以后还能复盘，至少要写下这些内容：

- `session_id`、`tool_use_id`、`agent_id`；
- Hook 事件与 matcher；
- 原始工具名和输入摘要；
- Hook 开始、结束、超时或异常；
- 返回的决定、改写字段和理由；
- 后续工具成功、失败或未执行。

别把敏感文件内容、完整环境变量或密钥直接写进记录。为了看清运行过程，也不能无边界地复制输入输出。

## 证据边界

沿着 Python Agent SDK 的源码，你可以核对它怎样公开 Hook 类型、转换配置、注册回调 ID，以及怎样分派控制请求并返回响应。至于 Claude Code 何时在内部构造事件、怎样计算权限规则、怎样调用闭源 Sandbox，这个仓库都拿不出源码证据，只能按官方契约描述，不能凭空补出源码站点。

Hook 已经能把一次运行里的事件和具体工具调用对应起来，下一篇再越过单次运行，看 Session 怎样恢复，以及 Transcript 怎样在外部 Store 中保留副本。

下一篇进入跨轮次状态：[Session、Resume 与 Store](07-sessions-resume-store.md)。
