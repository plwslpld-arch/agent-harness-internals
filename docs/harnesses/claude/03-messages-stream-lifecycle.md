# 消息流、Result 与生命周期边界

[返回 Claude 课程地图](README.md)

Transport 和 Query 已经把普通消息、控制帧和清理步骤接了起来，这一篇顺着数据往下看，弄清 CLI 吐出的字典怎样变成可以评测的类型化轨迹。

SDK 输出的远不只一段 Assistant 文本，一次运行里还可能出现用户消息、Assistant 内容块、系统事件、增量事件、Hook 事件和 Result。如果你把它们全部交给 `str(message)` 打印，然后丢掉原有类型，工具调用、错误、成本、权限拒绝和会话标识就会散成很难复盘的日志碎片。类型不能丢。

## 先区分「消息结束」和「任务正确」

下面几个结束信号经常同时出现，但含义不同：

| 信号 | 表示什么 | 不表示什么 |
| --- | --- | --- |
| Assistant 的 `stop_reason` | 一次模型生成停止 | 工具副作用完成 |
| `ResultMessage` | CLI 为当前响应发布结果帧 | 用户目标一定正确 |
| `receive_response()` 结束 | 便利迭代器已经产出第一个 Result | Client 已断开 |
| `disconnect()` 完成 | SDK 开始并完成连接清理 | Eval 已通过 |
| 独立 Eval 通过 | 产物满足预先定义的检查 | 协议过程没有异常 |

例如 Result 的 subtype 虽然显示成功，Agent 却忘了修改文件，这时协议可以完整结束，任务仍然是失败的。反过来，文件即使碰巧改对了，只要控制通道异常退出，你就不该把这次运行记成干净成功。这两件事不能混。

### 第 1 站：原始字典先经过统一解析器

源码：[查看消息解析入口](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/message_parser.py#L50-L76)

```python
def parse_message(data: dict[str, Any]) -> Message | None:
    if not isinstance(data, dict):
        raise MessageParseError(...)

    if data.get("type") == "system" and data.get("subtype") in (
        "hook_started",
        "hook_response",
    ):
        ...
```

- **调用者**：`ClaudeSDKClient.receive_messages()` 和一次性查询内部消费原始帧时调用解析器。
- **输入**：Query 数据面产出的单个字典。
- **状态变化**：解析器不修改会话，只校验结构并选择具体消息类型。
- **返回**：类型化 `Message`，某些可忽略帧返回 `None`，非法结构抛 `MessageParseError`。
- **下一站**：应用按消息子类型处理文本、工具块、系统事件或 Result。

解析器会先处理 Hook 事件，然后才走普通 SystemMessage 分支，这个顺序告诉你，只按顶层 `type=system` 分类会丢掉更具体的事件含义。可靠的消费者应该优先匹配 SDK 已经提供的类型，不要再自己发明一套字符串判断。

## AssistantMessage 是内容块容器

一条 Assistant 消息可能同时装着文本块和工具调用块，而模型提出 ToolUse 时，只是在「请求执行」，还不能证明权限已经放行，更不能证明工具执行成功。应用要想完成最终审计，就得靠关联字段把 ToolUse、后续的工具结果、权限轨迹和副作用接起来。关联字段不能丢。

### 第 2 站：解析器保留消息关联字段

源码：[查看 AssistantMessage 构造](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/message_parser.py#L210-L224)

```python
return AssistantMessage(
    content=content_blocks,
    model=data["message"]["model"],
    parent_tool_use_id=data.get("parent_tool_use_id"),
    error=data.get("error"),
    usage=data["message"].get("usage"),
    message_id=data["message"].get("id"),
    stop_reason=data["message"].get("stop_reason"),
    session_id=data.get("session_id"),
    uuid=data.get("uuid"),
)
```

- **调用者**：`parse_message()` 的 `assistant` 分支。
- **输入**：CLI 消息中的 model、content、usage、ID 和停止原因。
- **状态变化**：原始 content 字典已经先被转成不同内容块；这里封装消息级字段。
- **返回**：强类型 `AssistantMessage`。
- **下一站**：业务消费者遍历 `content`，并用 ID 与工具结果、子 Agent 或会话事件关联。

`parent_tool_use_id` 能告诉你这条消息是否从某个工具或子流程中派生，`session_id` 和 `uuid` 可以持久保存后继关联，`stop_reason` 则解释模型响应为什么停下。它们各自记录不同的事，不能全部压成一条展示文本。

## 增量事件和完整消息不要重复计数

开启部分消息后，应用可能同时收到 `StreamEvent` 和完整的 `AssistantMessage`。前者适合实时 UI 和计算首字延迟，后者则适合保存最终 Transcript（对话记录）并用于评测。如果你先拼上所有增量，后面又追加完整消息，统计程序就会把文本和 Token 算两遍。

常见策略有两种：

1. UI 使用增量渲染，但最终持久化以完整消息为准；
2. 同时保存两套流，用消息 ID 建立关联，统计时明确选择其中一种投影。

网络或进程异常时，你可能只拿到一部分增量，始终等不到完整消息，这时 Artifact（产物）应该标成 incomplete，不能把拼出来的那点文本伪装成正常完成的响应。轨迹并不完整。

### 第 3 站：Result 保留协议终态信息

源码：[查看 ResultMessage 构造](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/message_parser.py#L308-L337)

```python
return ResultMessage(
    subtype=data["subtype"],
    duration_ms=data["duration_ms"],
    duration_api_ms=data["duration_api_ms"],
    is_error=data["is_error"],
    num_turns=data["num_turns"],
    session_id=data["session_id"],
    total_cost_usd=data.get("total_cost_usd"),
    permission_denials=data.get("permission_denials"),
    errors=data.get("errors"),
    terminal_reason=data.get("terminal_reason"),
)
```

- **调用者**：`parse_message()` 的 `result` 分支。
- **输入**：CLI 发布的时延、轮数、成本、错误、拒绝和终止信息。
- **状态变化**：解析器把可选的 deferred tool use 等嵌套字段转成对应类型。
- **返回**：`ResultMessage`，缺少必需字段时抛解析错误。
- **下一站**：便利消费者结束当前响应，长连接 Client 仍可发送下一条查询；Artifact 构造器保存终态事实。

Result 适合回答「这次协议跑了多少轮、有没有报错、为什么停下」，却不会替你检查仓库文件是否正确。所以 Eval 还得跳出 Result，另外读取工作区差异、测试输出和约束违规。协议终态不等于 Eval。

## `receive_messages()` 与 `receive_response()` 的区别

`receive_messages()` 会一直从连接上取出各类型化消息，`receive_response()` 则只为收取单次响应提供便利：它一看到 `ResultMessage` 就结束这次迭代，但 Client 并没有断开。

### 第 4 站：便利方法在第一个 Result 后返回

源码：[查看 `receive_response()`](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/client.py#L532-L571)

```python
async for message in self.receive_messages():
    yield message
    if isinstance(message, ResultMessage):
        return
```

- **调用者**：需要「发送一条查询，然后收完这条响应」的长连接应用。
- **输入**：底层 `receive_messages()` 的类型化消息流。
- **状态变化**：方法本身不关闭 Transport，只结束当前异步迭代器。
- **返回**：从响应开始到包含第一个 Result 的消息序列。
- **下一站**：调用方可以处理 Result、发送下一条 Query，或显式 Disconnect。

因此，下面这种用法是合法的：

```python
async with ClaudeSDKClient() as client:
    await client.query("先检查测试失败")
    first = [m async for m in client.receive_response()]

    await client.query("再修复第一个失败")
    second = [m async for m in client.receive_response()]
```

如果你看到第一个 `receive_response()` 结束，就以为连接也已经关闭，后面很可能会把第二轮错放进新 Session 或新进程。迭代结束了，连接还在。

## 建议的 Artifact 结构

如果你只保存最后那段文字，到评测时就再也还原不了中间发生过什么，因此一份最小可评测产物至少可以保存以下内容。

```json
{
  "sessionId": "...",
  "messages": ["类型化消息或可还原摘要"],
  "toolCalls": ["请求、决定、结果与 tool_use_id"],
  "results": ["所有 ResultMessage"],
  "transportError": null,
  "workspaceDiff": "...",
  "testResult": "..."
}
```

前三项是协议轨迹里的事实，工作区差异和测试结果则要去执行环境里取。Scorer（评分器）必须同时读到这两类信息，才能分清下面几种情况：

- 模型没有提出正确动作；
- 权限拒绝了正确动作；
- 工具执行失败；
- 文件修改成功但逻辑错误；
- 协议异常导致轨迹不完整。

## 最小消费器示例

```python
from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock, ToolUseBlock

async for message in client.receive_response():
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock):
                print(block.text)
            elif isinstance(block, ToolUseBlock):
                record_tool_request(block.id, block.name, block.input)
    elif isinstance(message, ResultMessage):
        record_protocol_result(message)
```

这个示例只演示了怎样按类型分流，要做成完整审计器，还差不少工作。真实系统必须把 ToolResult、Hook、权限决定、异常和工作区副作用关联起来，并对其中的敏感内容做脱敏。

顺着类型化轨迹看到这里，已经可以确定 ToolUse 只是一条执行请求。下一篇回到 Options，看模型能看见哪些工具，以及某个工具最后是否真能执行。

下一篇从消息里的 ToolUse 回到配置层：[工具可见性：模型能看到什么](04-tool-visibility.md)。
