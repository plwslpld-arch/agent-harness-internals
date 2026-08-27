# Python 入口、Transport 与双向控制

[返回 Claude 课程地图](README.md)

上一篇已经把 Python SDK、Claude Code 和产品内部那些无法核对的机制分开了，现在只沿着锁定源码进入 `query()`，看你的应用从公开入口出发后怎样接上 CLI。

第一次使用 Claude Agent SDK 时，你很容易把 `query()` 当成「发一个 HTTP 请求」，可真实链路走的是一套受控的子进程协议：SDK 默认启动 Claude Code CLI，往标准输入写消息，再从标准输出读取 NDJSON。整条链路还是双向的，因为 CLI 在运行期间可能回过头来，要求 Python 执行权限回调、Hook 或进程内 MCP 工具。

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

`query()` 只让调用方单向消费消息，你给出 Prompt 或输入流后，继续迭代输出就可以了。`ClaudeSDKClient` 会把连接保留下来，你因此能继续发消息、调用 `interrupt()`、修改权限模式，然后接收下一轮响应。两个入口虽然复用了内部组件，但调用方分别要管住哪一段生命周期，这件事完全不同。

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

源码注释把它称为 one-shot 或 unidirectional，还明确说明，需要追问或 Interrupt 时应该选 `ClaudeSDKClient`。这里提醒的是谁来控制 API：一次性入口替调用方管连接，长连接入口则把更多控制权交还给调用方。

## Transport 不只是「发字符串」

默认的 `SubprocessCLITransport` 要做四件事：找到 CLI，组好参数和环境，接管标准流，最后关掉子进程。你可以用自定义 Transport（传输层）替换默认字节通道，但底层无论怎样传输，都必须完成 `connect/read/write/close` 这组契约。

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

在连接建立之前，SDK 先配好权限回调，因为这份配置会决定 CLI 怎样把权限请求送回 SDK，恢复 Session 时也可能在此生成临时配置。所以，从创建 Transport 到真正连接的这一段就是生命周期边界，后面按什么顺序跑，在这里已经定下来了。

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

这里还做了两件容易漏看的事：SDK 会从继承的环境里过滤 `CLAUDECODE`，免得子进程误以为自己正嵌在另一个 Claude Code 里，而调用方一旦启用 stderr 回调，Transport 还会多启动一个读取任务。这些行为都取决于实际运行环境，因此复现实验时，你要记下 CLI 版本、工作目录和关键 Options，只记 Python 包版本远远不够。这些上下文不能省。

## 为什么协议必须双向

普通消息从 CLI 流向应用，但控制请求有两个方向：

- SDK 发起：`initialize`、`interrupt`、动态修改权限模式等；
- CLI 发起：`can_use_tool`、`hook_callback`、SDK 内 MCP 消息等。

如果应用只把 stdout 当成 Assistant 文本流，遇到权限或 Hook 就会卡住，因为 CLI 正等着 Python 写回控制响应，Python 却根本没有处理这类帧。这里必须双向处理。

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

这两步不能换顺序。如果 SDK 先发 initialize，再启动读取任务，它等响应时就可能还没有消费者去处理 stdout。源码把读循环放在 initialize 前面，正是为了避开这种僵局。这样双方就不会互相干等。

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

并发控制要靠请求 ID 把响应对回原请求，你不能用「最后发出的请求」去猜它属于谁，也不能让某个回调卡住唯一的读取任务，否则其他控制帧都走不下去。配对必须准确。

## 关闭为什么比启动复杂

一轮响应结束、输入关闭、消息迭代器退出和 CLI 进程终止，这四件事不在同一时刻发生。默认 Transport 的 `close()` 会先屏蔽 AnyIO 取消，停止 stderr 读取和输入写入，再等子进程自行退出，只有等到超时才升级终止手段。源码特意留出这段等待时间，因为太早发终止信号，可能会打断 Session 文件刷新。

源码：[查看 Transport 关闭策略](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py#L942-L1008)

所以调用方即使取消了任务，也要给 SDK 留出清理资源的机会，不能把 Client 对象一丢了事。清理不能省。对长连接来说，用 `async with ClaudeSDKClient()` 会更稳妥，因为正常结束和异常退出都会走同一条关闭路径。

## 一次完整运行应该记录什么

为了能复盘「为什么卡住或退出」，至少保存：

- 入口类型：`query()` 或 `ClaudeSDKClient`；
- Python SDK 提交或版本、实际 CLI 版本；
- 关键 Options、工作目录和自定义 Transport 类型；
- 控制请求 ID、子类型、耗时和结果；
- 普通消息序列、最终 Result、异常；
- 关闭原因以及子进程是否回收。

靠这些信息，你可以判断 SDK 是否跑完了协议，也可以检查资源是否经历了完整的生命周期，但这还不能证明 Agent 已经正确完成用户任务。你仍然得独立检查最终文件、测试结果和任务约束。

协议怎样收发已经理清，但数据里到底有什么还没展开，所以下一篇要分辨类型化消息、增量事件和 Result，免得把协议正常结束误写成任务已经做对。

下一篇继续处理数据面：[消息流、Result 与生命周期边界](03-messages-stream-lifecycle.md)。
