# 消息流、Result 与生命周期边界

[返回 Claude 课程地图](README.md)

Transport 与 Query 已经把普通消息、控制帧和清理顺序接起来——下一步要看数据面产出的字典怎样变成可评测的类型化轨迹。

SDK 输出的不只是一段 Assistant 文本；一次运行中可能出现用户消息、Assistant 内容块、系统事件、增量事件、Hook 事件和 Result。若把它们全部 `str(message)` 打印后丢掉类型，工具调用、错误、成本、权限拒绝和会话标识都会变成难以复盘的日志碎片。类型不能丢。

## 先区分「消息结束」和「任务正确」

下面几个结束信号经常同时出现，但含义不同：

| 信号 | 表示什么 | 不表示什么 |
| --- | --- | --- |
| Assistant 的 `stop_reason` | 一次模型生成停止 | 工具副作用完成 |
| `ResultMessage` | CLI 为当前响应发布结果帧 | 用户目标一定正确 |
| `receive_response()` 结束 | 便利迭代器已经产出第一个 Result | Client 已断开 |
| `disconnect()` 完成 | SDK 开始并完成连接清理 | Eval 已通过 |
| 独立 Eval 通过 | 产物满足预先定义的检查 | 协议过程没有异常 |

比如 Result 的 subtype 是成功，但 Agent 忘记修改文件，协议可以完整结束，任务仍然失败。反过来，文件可能碰巧正确，但控制通道异常退出，运行也不应被记成干净成功。这两者不能混淆。

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

Hook 事件先于普通 SystemMessage 分支处理，说明只按顶层 `type=system` 分类会丢失更具体语义。可靠消费者应该优先匹配 SDK 类型，而不是自己重新发明一套字符串判断。

## AssistantMessage 是内容块容器

一条 Assistant 消息可能同时包含文本块和工具调用块，而模型提出 ToolUse 只代表「请求执行」——不代表权限已允许或工具已经成功。最终审计需要把 ToolUse 与后续工具结果、权限轨迹和副作用关联起来。关联字段不能丢。

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

`parent_tool_use_id` 可以表示这条消息从某个工具或子流程派生。`session_id` 与 `uuid` 适合持久化关联，`stop_reason` 用来解释模型响应为什么停止，因此不要把这些字段都压缩成一条显示文本。

## 增量事件和完整消息不要重复计数

开启部分消息后，应用可能同时收到 `StreamEvent` 和完整 `AssistantMessage`。前者适合实时 UI 和首字延迟，后者适合最终 Transcript 与评测；如果先拼接所有增量，再追加完整消息，文本和 Token 统计会重复。重复就在这里发生。

常见策略有两种：

1. UI 使用增量渲染，但最终持久化以完整消息为准；
2. 同时保存两套流，用消息 ID 建立关联，统计时明确选择其中一种投影。

网络或进程异常时，可能只有部分增量而没有完整消息；此时 Artifact 应标记 incomplete，不能把已拼接文本伪装成正常完整响应。轨迹并不完整。

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

Result 很适合回答「这次协议运行消耗多少轮、是否报告错误、为什么终止」，但它没有检查仓库文件是否正确；正确的 Eval 应在 Result 之外读取工作区差异、测试输出和约束违规。协议终态不是 Eval。

## `receive_messages()` 与 `receive_response()` 的区别

`receive_messages()` 持续产出连接上的全部类型化消息，而 `receive_response()` 是单响应便利层，它看到 `ResultMessage` 后立即结束本次迭代，但没有因此断开 Client。

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

如果把第一个 `receive_response()` 结束误认为连接已关闭，第二轮逻辑就会被错误地放到新 Session 或新进程。连接仍然存在。

## 建议的 Artifact 结构

不要只保存最后一段文字。一个最小可评测产物可以包含以下内容。

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

前三项来自协议轨迹；工作区差异和测试结果来自执行环境。Scorer 同时读取它们，才能区分：

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

这个示例只展示类型分流，不等于完整审计器。真实系统还需要关联 ToolResult、Hook、权限决定、异常和工作区副作用，并对敏感内容脱敏。

类型化轨迹明确了 ToolUse 只是执行请求；下一篇回到 Options，拆开模型可见的工具集合与真正的执行权限。

下一篇从消息里的 ToolUse 回到配置层：[工具可见性：模型能看到什么](04-tool-visibility.md)。
