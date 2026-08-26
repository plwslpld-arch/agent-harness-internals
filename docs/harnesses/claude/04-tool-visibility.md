# 工具可见性：模型能看到什么，不等于什么都能执行

[返回 Claude 课程地图](README.md)

消息消费器已经能从类型化消息中分流 `ToolUse`，但看见工具请求还不等于知道它为何可用。现在回到配置层，沿工具集合、权限规则和系统能力逐层判断。

假设你正在做一个代码审查 Agent，只希望 Claude 读取文件和搜索文本，不希望它修改文件。最直接的配置是：

```python
from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(tools=["Read", "Glob", "Grep"])
```

这段配置解决的是「给模型提供哪些内置工具」，还没有回答「调用时需不需要批准」「工具进程能访问哪些目录」「命令能不能被操作系统执行」；这几个问题如果混在一起，权限设计几乎一定会出错。

## 先建立五层判断框架

一次工具调用至少经过五层：

| 层次 | 要回答的问题 | Claude Agent SDK 中可见的入口 |
| --- | --- | --- |
| 工具集合 | 模型本轮能否选择这个工具 | `tools` |
| 静态权限规则 | 这次调用是否直接允许或拒绝 | `allowed_tools`、`disallowed_tools`、`permission_mode`、Settings |
| 动态权限 | 静态规则给出「询问」时由谁决定 | `can_use_tool` |
| 生命周期策略 | 调用前后是否要检查、改写或补充上下文 | `hooks` |
| 系统能力 | 进程最终能否读文件、联网或启动程序 | Claude Code 进程、Sandbox 与操作系统 |

可以把它想成进办公楼：工具集合是「楼层目录」，静态权限是「门禁白名单」，动态权限是「前台电话确认」，Hook 是「进出楼时触发的审计流程」，操作系统能力则是那扇门背后的房间是否真的存在——目录上有一个房间，不代表你已经获准进入；门禁放行，也不代表房间里的设备一定可用。

## `tools` 与 `allowed_tools` 的根本区别

下面两种配置表达的是不同意思：

```python
# 模型只能看到这三个内置工具。
ClaudeAgentOptions(tools=["Read", "Glob", "Grep"])

# Read 调用不再进入交互式批准；其他工具是否可见由 tools 或默认预设决定。
ClaudeAgentOptions(allowed_tools=["Read"])
```

`tools=[]` 明确关闭所有内置工具；`tools=None` 则表示没有通过这个字段覆盖基础集合。`allowed_tools=[]` 只是没有额外的自动放行规则，不等于关闭全部工具。

### 第 1 站：公开 Options 先把两个概念写成两个字段

源码：[查看 `ClaudeAgentOptions` 的工具字段](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1940-L1965)

```python
@dataclass
class ClaudeAgentOptions:
    tools: list[str] | ToolsPreset | None = None
    allowed_tools: list[str] = field(default_factory=list)
```

- **调用者**：业务代码在构造 `ClaudeAgentOptions` 时填写这两个字段。
- **输入**：基础工具名或预设，以及需要自动放行的权限规则。
- **状态变化**：这里只生成配置对象，还没有启动 CLI，也没有执行工具。
- **返回**：一个供后续 Transport 消费的 Options 实例。
- **下一站**：`SubprocessCLITransport` 把配置翻译成 Claude Code CLI 参数。

这段源码的重要性不在于字段只有两行，而在于注释已经明确划界：`tools` 决定可用的基础工具集合，`allowed_tools` 决定哪些调用无需询问。课程后面看到「工具已允许」时，先问它说的是哪一层。

## 配置怎样变成进程参数

Python SDK 并不在 `ClaudeAgentOptions` 内部执行权限算法。它把可公开观察到的配置转换为 CLI 参数，然后启动或连接 Claude Code CLI。这里正好也是开源证据能够到达的产品边界。

### 第 2 站：Transport 把基础集合写成 `--tools`

源码：[查看命令构造](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py#L562-L598)

```python
if self._options.tools is not None:
    tools = self._options.tools
    if isinstance(tools, list):
        if len(tools) == 0:
            cmd.extend(["--tools", ""])
        else:
            cmd.extend(["--tools", ",".join(tools)])
    else:
        cmd.extend(["--tools", "default"])
```

- **调用者**：Transport 的连接流程调用 `_build_command()`。
- **输入**：上一站保存的 `options.tools`。
- **状态变化**：SDK 正在组装子进程命令数组，尚未运行具体工具。
- **返回**：包含 `--tools` 的命令参数列表。
- **下一站**：同一个函数继续加入允许和拒绝规则，再由 Transport 启动 CLI。

注意空列表的处理：实现会显式生成 `--tools ""`，不能把它理解为「省略参数」——这给了我们一个可以从公开源码核对的行为：关闭内置工具由明确参数表达，无须猜测默认值。

### 第 3 站：允许和拒绝规则走独立参数

源码：[查看允许与拒绝参数](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py#L593-L607)

```python
if effective_allowed_tools:
    cmd.extend(["--allowedTools", ",".join(effective_allowed_tools)])

if self._options.disallowed_tools:
    cmd.extend(["--disallowedTools", ",".join(self._options.disallowed_tools)])
```

- **调用者**：仍然是 `_build_command()`。
- **输入**：有效允许规则和 `disallowed_tools`。
- **状态变化**：命令行同时携带工具集合与权限规则，它们没有被折叠成一个字段。
- **返回**：完整度更高的 CLI 命令数组。
- **下一站**：CLI 根据这些规则处理模型提出的具体调用；若结果需要询问，才可能进入动态权限回调。

这里的「有效允许规则」不总等于用户原样填写的 `allowed_tools`。Skills 也可能补充规则。

## 为什么 Skills 会影响允许规则

当 `skills="all"` 时，Transport 会把裸 `Skill` 规则加入允许列表；当传入具体 Skill 名称时，会加入 `Skill(name)` 形式的规则。

源码：[查看 Skills 默认规则合成](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py#L519-L560)

```python
if skills == _SKILLS_ALL:
    if "Skill" not in allowed_tools:
        allowed_tools.append("Skill")
else:
    for name in skills:
        pattern = f"Skill({name})"
        if pattern not in allowed_tools:
            allowed_tools.append(pattern)
```

这说明排查权限时不能只打印调用方最初的 Options。真正传给 CLI 的是合成后的有效配置。后面的权限课程还会看到：裸 `Skill` 可能直接自动放行整个工具，从而让动态回调没有机会运行。

## 三个容易犯的错误

### 错误一：把 `allowed_tools` 当工具白名单

如果只写 `allowed_tools=["Read"]`，不能据此断言模型只看得到 `Read`。要限制可见集合，需要同时考虑 `tools` 或所用预设。

### 错误二：把「自动允许」当「系统一定执行成功」

即使权限规则放行，目标文件可能不存在，进程可能没有文件系统权限，命令也可能被 Sandbox 或操作系统拒绝。权限结论和执行结果必须分别记录。

### 错误三：从 SDK 参数反推闭源产品内部算法

公开源码能证明 SDK 生成了哪些参数，以及控制协议怎样收发请求；它不能证明 Claude Code 内部用什么类、按什么私有函数调用顺序求值。本文把这一段保持为产品边界，不补画虚构源码链路。

## 一个更安全的只读配置

```python
from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(
    tools=["Read", "Glob", "Grep"],
    allowed_tools=["Read", "Glob", "Grep"],
    disallowed_tools=["Bash", "Edit", "Write"],
)
```

它表达三层意图：模型只获得只读内置工具；这三类只读调用无需逐次询问；高风险工具另外给出拒绝规则。它仍然不是完整安全证明，因为 Settings、MCP 工具、Hook、Sandbox 和进程权限也会影响最终行为。

## 读完后怎样自查

看到任意「工具权限」配置时，按下面顺序问：

1. `tools` 最终给模型暴露了哪些工具？
2. `allowed_tools`、`disallowed_tools`、Settings 和 `permission_mode` 会怎样影响具体调用？
3. 哪些调用仍会落到动态询问？
4. Hook 是否还会在调用前后执行？
5. 系统能力是否真的支持这次操作？

下一篇继续追踪第 3 个问题：[动态权限决策：`can_use_tool` 何时真的会被调用](05-permission-decisions.md)。
