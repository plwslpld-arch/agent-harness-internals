# 工具可见性：模型能看到什么，不等于什么都能执行

[返回 Claude 课程地图](README.md)

消息消费器已经能从类型化消息里分出 `ToolUse`，但你看到了工具请求，还是不知道模型为什么能选这个工具。要回答这个问题，得回到配置里，逐层检查模型看到了哪些工具、权限规则怎样判断，以及系统最后是否真能执行。

假设你正在做一个代码审查 Agent，只希望 Claude 读取文件和搜索文本，不希望它修改文件。配置可以这样写。

```python
from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(tools=["Read", "Glob", "Grep"])
```

这段配置只告诉模型可以看到哪些内置工具，还回答不了调用时是否要批准、工具进程能访问哪些目录，以及操作系统到底会不会执行命令。这几个问题一旦混在一起，权限设计几乎一定出错。

## 先建立五层判断框架

一次工具调用至少要过五关。

| 层次 | 要回答的问题 | Claude Agent SDK 中可见的入口 |
| --- | --- | --- |
| 工具集合 | 模型本轮能否选择这个工具 | `tools` |
| 静态权限规则 | 这次调用是否直接允许或拒绝 | `allowed_tools`、`disallowed_tools`、`permission_mode`、Settings |
| 动态权限 | 静态规则给出「询问」时由谁决定 | `can_use_tool` |
| 生命周期策略 | 调用前后是否要检查、改写或补充上下文 | `hooks` |
| 系统能力 | 进程最终能否读文件、联网或启动程序 | Claude Code 进程、Sandbox 与操作系统 |

你可以把整个过程想成进办公楼：工具集合像楼层目录，静态权限像门禁白名单，动态权限像前台打电话确认，Hook 负责在进出时触发审计，而系统能力决定门后的房间和设备是否真的存在。这几层不能混。目录里有一个房间，不代表你已经获准进入，门禁即使放行，房间里的设备也不一定能用。

## `tools` 与 `allowed_tools` 的根本区别

下面两种配置说的不是一回事。

```python
# 模型只能看到这三个内置工具。
ClaudeAgentOptions(tools=["Read", "Glob", "Grep"])

# Read 调用不再进入交互式批准；其他工具是否可见由 tools 或默认预设决定。
ClaudeAgentOptions(allowed_tools=["Read"])
```

`tools=[]` 会明确关掉所有内置工具，`tools=None` 则表示这个字段不去改写基础集合。区别就在这里。再看 `allowed_tools=[]`，它只是没有额外加入自动放行规则，不会因此关掉所有工具。

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

这段源码虽然只有两行字段，注释却已经把边界划得很清楚：`tools` 决定模型能用哪些基础工具，`allowed_tools` 则决定哪些调用不必询问。后面再看到「工具已允许」时，你要先问清楚这句话指的是哪一层。

## 配置怎样变成进程参数

Python SDK 不会在 `ClaudeAgentOptions` 里面运行权限算法，它只把我们能观察的配置转成 CLI 参数，然后启动或连接 Claude Code CLI。开源证据走到这个交界处也就到头了，再往里便是产品边界。

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

实现遇到空列表时，会明确生成 `--tools ""`，所以你不能把这种情况理解成「省略参数」。源码已经给出可以直接核对的行为：SDK 用明确参数关闭内置工具，不必猜它会套用什么默认值。

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

这里所说的「有效允许规则」，不一定就是用户原样填进 `allowed_tools` 的内容，因为后面合成配置时，Skills 也可能往里补规则。

## 为什么 Skills 会影响允许规则

当 `skills="all"` 时，Transport 会把裸 `Skill` 规则加入允许列表，而当调用方传入具体 Skill 名称时，它会加入 `Skill(name)` 形式的规则。

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

排查权限时，只打印调用方最初填的 Options 不够，因为 CLI 真正收到的是合成后的有效配置。这一步别漏了。后面的权限课程还会看到，裸 `Skill` 可能直接自动放行整个工具，动态回调也就根本轮不到。

## 三个容易犯的错误

### 错误一：把 `allowed_tools` 当工具白名单

如果只写 `allowed_tools=["Read"]`，你还不能断定模型只看得到 `Read`，因为要缩小模型可见的工具范围，同时还得检查 `tools` 和当前使用的预设。

### 错误二：把「自动允许」当「系统一定执行成功」

权限规则即使放行了，目标文件仍可能不存在，进程也可能没有访问文件系统的权限，Sandbox 或操作系统还可能直接拒绝命令。这些失败发生在不同层，所以你必须分开记录权限怎样判断，以及工具最后执行得怎样。

### 错误三：从 SDK 参数反推闭源产品内部算法

公开源码能证明 SDK 生成了哪些参数，也能证明控制协议怎样收发请求，但它无法告诉你 Claude Code 内部用了什么类，又依次调了哪些私有函数。文章到这里就要停在产品边界上，不能补画一条无法核对的虚构源码链路。

## 一个更安全的只读配置

```python
from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(
    tools=["Read", "Glob", "Grep"],
    allowed_tools=["Read", "Glob", "Grep"],
    disallowed_tools=["Bash", "Edit", "Write"],
)
```

这段配置表达了三层意图：模型只能看到只读内置工具，调用这三类工具时无须逐次询问，高风险工具还会收到单独的拒绝规则。不过 Settings、MCP 工具、Hook、Sandbox 和进程权限都会影响最后发生的事，因此单凭这段配置还证明不了系统是安全的。

## 读完后怎样自查

看到任意「工具权限」配置时，按下面顺序问：

1. `tools` 最终给模型暴露了哪些工具？
2. `allowed_tools`、`disallowed_tools`、Settings 和 `permission_mode` 会怎样影响具体调用？
3. 哪些调用仍会落到动态询问？
4. Hook 是否还会在调用前后执行？
5. 系统能力是否真的支持这次操作？

下一篇继续追踪第 3 个问题：[动态权限决策：`can_use_tool` 何时真的会被调用](05-permission-decisions.md)。
