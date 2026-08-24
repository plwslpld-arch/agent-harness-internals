# Python 入口、Transport 与双向控制

[返回 Claude 课程地图](README.md)

第一次使用 Claude Agent SDK 时，最容易把 `query()` 理解成「发一个 HTTP 请求」。真实链路更像一个受控的子进程协议：SDK 默认启动 Claude Code CLI，通过标准输入写消息，通过标准输出读 NDJSON；运行期间 CLI 还可能反向请求 Python 执行权限回调、Hook 或进程内 MCP 工具。

## 先选择两种入口

```python
# 一次性或预先给定全部输入
async for message in query(prompt="解释这个项目"):
    ...

# 需要追问、中断或运行时修改配置
async with ClaudeSDKClient() as client:
    await client.query("解释这个项目")
    async for message in client.receive_response():
        ...
```

`query()` 是单向消费表面：调用方给出 Prompt 或输入流，然后迭代输出。`ClaudeSDKClient` 则保存连接，可以后续发送消息、调用 `interrupt()`、修改权限模式并接收下一轮响应。两者会复用内部组件，但调用方的生命周期责任不同。

```text
公开入口
  → InternalClient 组装运行
  → SubprocessCLITransport 连接 CLI
  → Query 启动读取任务与 initialize
  ↔ 普通消息 + 双向控制请求
  → 关闭 Query 和 Transport
```

### 第 1 站：`query()` 只做入口委托

源码：[查看公开 `query()`](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/query.py#L11-L26)

```python
async def query(
    *,
    prompt: str | AsyncIterable[dict[str, Any]],
    options: ClaudeAgentOptions | None = None,
    transport: Transport | None = None,
) -> AsyncIterator[Message]:
```

- **调用者**：批处理脚本、CI 作业或只需要一次响应的应用。
- **输入**：字符串或异步消息流、Options，以及可选自定义 Transport。
- **状态变化**：入口本身只补默认 Options 并创建内部 Client。
- **返回**：一个逐条产出类型化 `Message` 的异步迭代器。
- **下一站**：`InternalClient.process_query()` 选择 Transport、创建 Query 并协调清理。

源码注释把它称为 one-shot 或 unidirectional，并明确需要追问和 Interrupt 时应选择 `ClaudeSDKClient`。这不是性能提示，而是 API 所有权提示：一次性入口替调用方管理连接，长连接入口把更多控制权交给调用方。

## Transport 不只是「发字符串」

默认 `SubprocessCLITransport` 有四项责任：找到 CLI、构造参数和环境、拥有标准流、关闭子进程。自定义 Transport 可以替换字节通道，但仍要履行 `connect/read/write/close` 契约。

### 第 2 站：InternalClient 先配置，再连接 Transport

源码：[查看内部装配](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py#L73-L98)

```python
configured_options = _configure_can_use_tool(options)

if transport is not None:
    chosen_transport = transport
else:
    chosen_transport = SubprocessCLITransport(
        prompt=prompt,
        options=configured_options,
    )

await chosen_transport.connect()
```

- **调用者**：公开 `query()` 委托到 `InternalClient` 后进入这段逻辑。
- **输入**：Prompt、配置后的 Options 和可选 Transport。
- **状态变化**：默认路径创建子进程 Transport；自定义路径保留调用方提供的实现；随后真正连接。
- **返回**：连接成功的 `chosen_transport` 被继续交给 Query。
- **下一站**：Transport 的 `connect()` 查找 CLI、组装命令并打开进程标准流。

权限回调配置发生在连接前，因为它会影响 CLI 如何把权限请求路由回 SDK。Session 恢复也可能在这里材料化临时配置；因此「创建 Transport 前后」是重要生命周期边界。

### 第 3 站：默认 Transport 在 `connect()` 才启动进程

源码：[查看子进程连接](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py#L787-L879)

```python
if self._cli_path is None:
    self._cli_path = await anyio.to_thread.run_sync(self._find_cli)

cmd = self._build_command()
self._process = await anyio.open_process(
    cmd,
    stdin=PIPE,
    stdout=PIPE,
    stderr=stderr_dest,
    cwd=self._cwd,
    env=process_env,
)
```

- **调用者**：InternalClient 或 `ClaudeSDKClient.connect()`。
- **输入**：CLI 路径、Options、工作目录、环境和已经构造好的命令参数。
- **状态变化**：启动子进程，登记活动子进程，包装标准输入输出流，并把 Transport 标为 ready。
- **返回**：`connect()` 没有业务消息返回；成功后对象具备读写能力。
- **下一站**：Client 用该 Transport 创建 Query，启动后台读取任务并发送 initialize。

这里还做两件容易忽视的事：SDK 过滤继承环境中的 `CLAUDECODE`，避免子进程误认自己嵌套在另一个 Claude Code 中；如果调用方启用了 stderr 回调，Transport 会另外启动读取任务。复现实验应记录实际 CLI 版本、工作目录与关键 Options，而不是只记录 Python 包版本。

## 为什么协议必须双向

普通消息从 CLI 流向应用，但控制请求有两个方向：

- SDK 发起：`initialize`、`interrupt`、动态修改权限模式等；
- CLI 发起：`can_use_tool`、`hook_callback`、SDK 内 MCP 消息等。

如果应用只把 stdout 当成 Assistant 文本流，会在权限或 Hook 场景中卡住：CLI 正在等待 Python 回写控制响应，而 Python 却没有处理这类帧。

### 第 4 站：Client 先启动读取，再初始化

源码：[查看 Query 启动顺序](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py#L132-L170)

```python
query = Query(
    transport=chosen_transport,
    is_streaming_mode=True,
    can_use_tool=configured_options.can_use_tool,
    hooks=...,
)

await query.start()
await query.initialize()
```

- **调用者**：内部 Client 完成 Transport 连接后创建 Query。
- **输入**：已连接 Transport、权限回调、Hooks、MCP Server 和初始化选项。
- **状态变化**：`start()` 启动后台读循环；`initialize()` 随后发送控制请求并等待响应。
- **返回**：初始化结果保存到 Query，运行具备收发普通消息和控制帧的能力。
- **下一站**：Prompt 被写入 Transport，读循环按帧类型分流。

顺序不能随意交换。如果先发送 initialize 再启动读取任务，SDK 可能在等待响应时没有消费者处理 stdout。源码把读循环提前，正是为了解开这个等待关系。

### 第 5 站：读循环按请求 ID 配对控制响应

源码：[查看控制帧分流](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L308-L340)

```python
if msg_type == "control_response":
    request_id = response.get("request_id")
    if request_id in self.pending_control_responses:
        event = self.pending_control_responses[request_id]
        self.pending_control_results[request_id] = response
        event.set()
elif msg_type == "control_request":
    self._spawn_control_request_handler(request)
```

- **调用者**：Query 的唯一后台读取任务。
- **输入**：Transport 产出的反序列化帧。
- **状态变化**：响应唤醒对应等待者；反向请求派生受控处理任务；普通消息进入应用流。
- **返回**：读循环持续运行，直到 Transport 结束或发生错误。
- **下一站**：等待者继续 initialize 或 Interrupt；反向请求进入权限、Hook 或 MCP 分支。

请求 ID 是并发控制的基础。不能用「最后发出的请求」来猜响应归属，也不能让某个回调阻塞唯一读取任务，否则其他控制帧无法前进。

## 关闭为什么比启动复杂

结束一轮响应、关闭输入、关闭消息迭代器和终止 CLI 进程不是同一件事。默认 Transport 的 `close()` 会屏蔽 AnyIO 取消，先停止 stderr 读取和输入写入，再等待子进程优雅退出；超时后才升级终止。源码特别保留了一段等待，因为过早发送终止信号可能打断 Session 文件刷新。

源码：[查看 Transport 关闭策略](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py#L942-L1008)

这意味着调用方取消任务时仍应让 SDK 执行清理，而不是直接丢弃 Client 对象。长连接推荐使用 `async with ClaudeSDKClient()`，让正常结束和异常都进入同一关闭路径。

## 一次完整运行应该记录什么

为了能复盘「为什么卡住或退出」，至少保存：

- 入口类型：`query()` 或 `ClaudeSDKClient`；
- Python SDK 提交或版本、实际 CLI 版本；
- 关键 Options、工作目录和自定义 Transport 类型；
- 控制请求 ID、子类型、耗时和结果；
- 普通消息序列、最终 Result、异常；
- 关闭原因以及子进程是否回收。

这些信息能证明 SDK 协议和资源生命周期是否完整，但不能单独证明 Agent 已正确完成用户任务。正确性仍需要对最终文件、测试和约束做独立评测。

下一篇继续处理数据面：[消息流、Result 与生命周期边界](03-messages-stream-lifecycle.md)。
