---
title: Claude Python 入口、Transport 与控制协议
article_type: harness
harness: claude
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/client.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/client.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/transport/subprocess_cli.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"tests/test_query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"tests/test_close_cancellation.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"}]
---

# Claude Python 入口、Transport 与控制协议

## 读者会得到什么

这篇沿着 Python SDK 中真实可见的主链，解释 `query()`、`ClaudeSDKClient`、`InternalClient`、`SubprocessCLITransport` 与 `Query` 各自拥有哪部分生命周期。核心结论是：Transport 不只是发送 Prompt 的薄层，它拥有 CLI 进程、标准流、环境、缓冲与关闭升级；Query 也不只是消息解析器，它同时维护 SDK 发起和 CLI 发起的控制请求。

`query()` 适合一次性或单向流式交互，连接管理由 SDK 完成；`ClaudeSDKClient` 提供可复用连接、后续消息、Interrupt 和更多交互方法。两者共享许多内部组件，却不共享完全相同的调用方责任。后续课程会细分消息与 Session；本文只回答从入口到协议通道怎样建立和关闭。

默认 Transport 会启动 Claude Code CLI 子进程。它优先使用包内捆绑 CLI，再搜索可执行路径和已知安装位置；显式 `cli_path` 则直接进入所给路径的验证和启动流程。这个选择影响 CLI 版本、平台兼容和关闭责任，必须写进复现实验。

控制协议是双向的。SDK 为 initialize、Interrupt 等操作生成 `control_request` 并等待匹配响应；CLI 也会为权限、Hook 和进程内 MCP 发出 `control_request`，SDK 执行回调后写回 `control_response`。只读取普通 Assistant 消息而忽略控制帧会导致运行停住。

一条标准输入，承载两个方向的等待关系。

## 核心概念

理解这条主链，先把「入口」「连接」「协议路由」和「资源所有权」分开。`query()` 与 `ClaudeSDKClient` 是调用方表面，`InternalClient` 负责装配一次运行，Transport 负责字节通道与默认 CLI 进程，Query 负责协议相关性和内部任务。它们层层组合，但没有哪一个对象独自等于完整 Agent Loop。

| 概念 | 负责什么 | 生命周期 | 常见误解 |
| --- | --- | --- | --- |
| `query()` | 把一次 Prompt 交给内部客户端并产出消息 | 随迭代器开始与结束 | 它内部实现了完整循环 |
| `ClaudeSDKClient` | 保存可复用连接并暴露后续查询、中断等操作 | 由调用方 connect / close | 它只是 `query()` 的别名 |
| `InternalClient` | 选择 Transport、配置 Query、协调清理 | 单次处理或连接装配 | 它拥有默认 CLI 的全部进程细节 |
| Transport | 读写帧；默认实现还拥有 CLI 子进程与标准流 | connect 到 close | 只是发送 Prompt 的字符串封装 |
| Query | 配对控制请求、路由内部帧、产出普通消息 | 初始化后到关闭 | 只做 JSON 反序列化 |
| 控制请求 | 要求另一端完成初始化、权限、Hook、MCP 或中断动作 | 按 request ID 配对 | 和普通 Assistant 消息同一消费方式 |

### 数据面与控制面

普通用户、Assistant、系统和 Result 帧构成应用看到的数据面。initialize、权限回调、Hook、进程内 MCP 和 Interrupt 构成控制面。两类帧共享 Transport，却由 Query 分流：普通消息进入应用可迭代流，控制帧被内部处理或唤醒等待者。

这意味着标准输入不是「用户 Prompt 发完就可关闭」的单向管道。CLI 在模型运行中可能反向要求 SDK 执行权限回调，SDK 必须把控制响应写回同一输入通道。过早结束输入会让输出端仍在等待一个永远无法送达的决定。

### 连接、运行与关闭

构造 Transport 不等于已经查找或启动 CLI；默认实现把这些工作放到 `connect()`。初始化成功也不等于任务完成，它只说明双方协议能力已建立。Result 结束一个响应序列，但客户端连接、后台控制任务与子进程是否结束还取决于所用入口和关闭路径。

资源所有权应从创建点与清理点共同判断。默认 Transport 创建进程、保存标准流并执行 terminate / kill 升级，所以它拥有进程；Query 创建读取任务和在途控制处理任务，所以它负责取消与汇合。入口只是触发这些对象，不因处在调用栈顶部就拥有全部资源。

## 为什么这样设计

第一，SDK 需要同时支持一次性调用和交互式长连接。把调用表面与 Transport 分开，`query()` 可以自动管理一次运行，`ClaudeSDKClient` 可以复用同一连接，自定义 Transport 又能替换进程边界，而不要求上层重新实现消息和控制协议。

第二，控制请求必须与普通输出并发。权限提示可能在 Assistant 工具请求之后出现，Hook 或 MCP 回调又可能耗时；若读取循环等待应用消费完每条消息才处理控制帧，就会形成 CLI 等 SDK、SDK 等应用的死锁。独立读取任务和按 ID 配对让控制面持续前进。

第三，外层取消不能把子进程变成孤儿。异步任务一旦处于取消状态，普通 await 可能立即再次抛出取消；关闭流程因此需要在受控屏蔽区间内等待、终止或杀死默认 CLI。所有权集中在 Transport，才能让正常结束、异常和取消共享同一回收策略。

第四，协议边界需要把基础设施故障与模型结果分开。CLI 不存在、初始化超时、破损 JSON 和回调异常属于通道或控制面；Result 中的任务失败属于运行结果。分层后，重试与评测可以使用不同分类，而不是把任何异常都算成模型质量。

这套分工还限制了替换面的影响范围。更换自定义 Transport 时，协议路由和消息语义可以继续复用；更换一次性入口为长连接客户端时，底层帧格式不必随之改变。边界稳定，测试才能分别覆盖调用方责任、协议相关性和资源回收。

## 实现思路

下面是教学用的双向协议宿主蓝图，目的是复现责任结构，不是复制 Claude Code 内部实现。可以直接核对的是 Python SDK 的入口、Transport 和 Query 行为；状态机名称与 Artifact 字段是课程为实现与测试给出的抽象。

1. **选择入口语义。** 一次性任务创建自动关闭的运行上下文；多轮客户端显式保存 Transport、Query 和连接状态，并拒绝在未连接时发送。
2. **建立 Transport。** 在 connect 阶段解析 CLI 或自定义通道，构造受控环境、工作目录和三条标准流；任何部分失败都进入统一清理。
3. **先启动读取循环。** 创建有界普通消息流、控制等待表和在途处理表，启动唯一读取任务，然后发送 initialize 并按 request ID 等待。
4. **分流每个帧。** 普通消息交给应用；SDK 发起请求的响应唤醒等待 Event；CLI 发起的请求派生受控处理任务；取消帧只取消对应任务。
5. **维持相关性。** 请求登记、写出、超时清除和迟到响应处理都围绕同一 ID；失败响应转换成对应等待者异常，不污染其他请求。
6. **按所有权关闭。** 先阻止新请求，再取消并汇合 Query 子任务，结束输入，最后由 Transport 等待或升级终止进程，并清空活动集合。

```text
连接():
    transport.connect()
    query = Query(transport, 普通消息流, 控制处理器)
    启动 query.read_loop()
    await query.request("initialize", 超时=初始化超时)

read_loop():
    对每个 frame in transport.read():
        如果 frame 是 control_response: 唤醒 pending[request_id]
        否则如果 frame 是 control_request: 派生 handler[request_id]
        否则如果 frame 是 control_cancel_request: 取消 handler[request_id]
        否则: 发送到普通消息流

关闭():
    禁止新请求()
    query.cancel_and_join_handlers()
    transport.end_input()
    transport.wait_terminate_or_kill()
```

实现时要给等待表设置上限和超时，避免对端不响应导致内存永久增长；给普通消息流设置背压，避免应用消费过慢耗尽内存；给单帧设置大小和换行边界，避免无穷缓冲。每类限制产生不同错误码，便于判断能否安全重试。

关闭必须幂等。正常 Result、应用提前退出、回调异常和外层取消可能同时触发 finally；第二次 close 不应再次写入已关闭流或错误地终止其他进程。自定义 Transport 的合同只要求它履行自己的 close，不应假定存在 PID、stdin 或 kill。

## 贯穿案例

设想一个长连接客户端：应用连接一次，发送「读取报告并修正标题」，CLI 在执行 Edit 前向 SDK 请求权限，应用允许后得到 Assistant 与 Result，随后用户发送第二条查询，最后在运行中触发取消。这个案例同时覆盖两个方向的控制请求和连接所有权。

1. **连接与初始化。** 客户端创建默认 Transport。connect 解析实际 CLI、启动进程并建立标准流；Query 的读取任务先启动，再写出初始化请求。只有匹配响应回来，状态才从 `connecting` 进入 `ready`。
2. **发送用户消息。** 第一条用户帧写入数据面。应用开始迭代普通消息，但 initialize 和其他控制帧不会从这个迭代器泄漏出来。
3. **处理反向权限请求。** CLI 发出 `control_request(request_id=perm-1)`。读取循环派生权限处理器；应用回调返回 Allow，SDK 写回相同 ID 的成功响应，CLI 才继续执行 Edit。
4. **结束回合但保留连接。** Assistant 与 Result 进入普通消息流。Result 表示本轮协议终结，`ClaudeSDKClient` 仍为 ready，可接收第二条消息；此时关闭 stdin 会破坏复用语义。
5. **取消并关闭。** 第二轮运行中，客户端发送 Interrupt 控制请求；若调用方随后关闭，Query 汇合在途任务，Transport 在取消屏蔽区回收 CLI。Artifact 记录 Result、Interrupt 响应和最终进程状态。

```json
{"type":"control_request","request_id":"init-1","request":{"subtype":"initialize"}}
```

```json
{"type":"control_request","request_id":"perm-1","request":{"subtype":"can_use_tool","tool_name":"Edit","input":{"file_path":"report.md"}}}
```

```json
{
  "connection":"closed",
  "rounds":[{"result":"success"},{"result":"interrupted"}],
  "controlPairs":{"init-1":"success","perm-1":"allow","interrupt-2":"success"},
  "resourceChecks":{"readerJoined":true,"handlersRemaining":0,"childProcessAlive":false}
}
```

若权限回调抛异常，SDK 应向同一 `perm-1` 返回错误响应，而不是让读取循环退出并丢失全部会话；若响应迟到超过超时，等待表已清除，迟到帧只能被记录为不可配对，不能唤醒新请求。两种失败都不同于模型拒绝修改报告。

再把默认 Transport 换成内存 Mock：协议相关性仍应相同，但进程回收断言不再适用。这个变化验证了文章的条件限定——双向 Query 是共同责任，CLI 进程所有权只属于默认子进程分支。

## 真实输入与输出

### 输入

下面是 SDK 在 initialize 之后写入默认 Transport 的用户消息。真实运行还会在它之前出现带唯一 `request_id` 的初始化控制请求。

```json
{"type":"user","session_id":"","message":{"role":"user","content":"把结果写入报告"},"parent_tool_use_id":null}
```

### 输出

当 CLI 需要应用判断写文件权限时，它向 SDK 发出控制请求；上游测试用可编程 Transport 真实验证了 SDK 回写成功响应后，Assistant 与 Result 才继续出现。

```json
{"type":"control_response","response":{"subtype":"success","request_id":"perm_1","response":{"behavior":"allow","updatedInput":{"file_path":"/tmp/x","content":"hi"}}}}
```

测试中的路径和内容是夹具，不是生产授权建议。真正的权限回调必须检查工具名、输入、上下文与策略，不能固定全放行。

## 调用链

![Claude Python SDK 从入口、CLI 查找、子进程连接、双向控制、消息路由到取消屏蔽与进程回收的中文协议时序图](../../../assets/diagrams/claude/02-python-entry-transport-control.svg)

Claim: claude.python.transport-owns-cli-process

Claim: claude.python.control-protocol-is-bidirectional

1. `query()` 创建 `InternalClient`；`ClaudeSDKClient.connect()` 则在对象上保存 Transport 与 Query，以便后续多次发送和中断。
2. 默认路径构造 `SubprocessCLITransport`。若调用方未给 `cli_path`，连接阶段在线程中查找捆绑 CLI、系统命令和已知安装位置；构造对象本身不提前做文件系统搜索。
3. Transport 构造 `stream-json` 输入输出命令，合并受控环境、工作目录、stderr 目标和选项，再通过 AnyIO 创建子进程；标准输入、输出和错误流分别包装。
4. `InternalClient` 构造 Query，先启动 `_read_messages()`，再发 initialize。读取任务必须先运行，否则 SDK 会写出请求却无人接收对应响应。
5. Query 为 SDK 发起的控制请求生成唯一标识，登记 Event，写入标准输入并带超时等待；读取循环按标识填充结果并唤醒等待者。
6. CLI 发起的权限、Hook 或 MCP 控制请求走反方向：读取循环派生处理任务，回调完成后把成功或错误响应写回同一 Transport。取消帧会取消对应在途处理任务，而不是终止全部会话。
7. 普通消息进入内存流供应用消费；控制响应、控制请求与 Transcript Mirror 被内部路由，不作为普通 SDK Message 直接产出。
8. 关闭时 Query 先取消子任务并让 Transport 结束输入；Transport 在屏蔽取消的范围内等待、终止或杀死仍存活子进程。成功回收后从活动子进程集合移除；无法回收则保留给进程退出清理器。

## 源码证据

默认 Transport 的归属点位于 `InternalClient`，自定义 Transport 是显式分支：

```source
src/claude_agent_sdk/_internal/client.py:88-98
if transport is not None:
    chosen_transport = transport
else:
    chosen_transport = SubprocessCLITransport(prompt=prompt, options=configured_options)
await chosen_transport.connect()
```

Transport 在连接阶段创建子进程并保存三条标准流；这些资源属于 Transport，而不是入口函数的局部变量：

```source
src/claude_agent_sdk/_internal/transport/subprocess_cli.py:787-877
async def connect(self) -> None:
    ...
    self._process = await anyio.open_process(...)
    _ACTIVE_CHILDREN.add(self._process)
    self._stdout_stream = TextReceiveStream(self._process.stdout)
    self._stdin_stream = TextSendStream(self._process.stdin)
```

Query 的读取循环同时处理两个方向的控制帧。CLI 发来的请求会派生处理任务，SDK 发出的请求则由匹配 `request_id` 的响应唤醒：

```source
src/claude_agent_sdk/_internal/query.py:308-338,598-643
if msg_type == "control_response":
    event = self.pending_control_responses[request_id]
    event.set()
elif msg_type == "control_request":
    self._spawn_control_request_handler(request)
...
await self.transport.write(json.dumps(control_request) + "\n")
await event.wait()
```

上游权限测试建立了一个顺序约束：用户消息先写，CLI 才发权限请求；SDK 写回权限响应后，Transport 才产生 Assistant 和 Result。测试最终断言回调收到 `Write`、只有一个成功控制响应、普通消息按预期出现并最终结束输入。

```source
tests/test_query.py:1051-1065
assert state["callback_calls"] == ["Write"]
assert len(responses) == 1
assert responses[0]["response"]["response"]["behavior"] == "allow"
assert [type(m) for m in messages] == [AssistantMessage, ResultMessage]
assert state["ended"] is True
```

取消路径测试使用临时假 CLI 启动真实子进程，在外层取消已经生效时调用 `close()`，仍断言子进程退出且不再留在活动集合。它给进程所有权 Claim 提供 B 级行为证据，但只在测试平台和夹具范围内成立。

## Transport 的真实责任

Transport 负责把 `ClaudeAgentOptions` 投影成 CLI 参数，其中包括输出格式、输入格式、权限模式、模型、系统 Prompt、MCP 配置、Session 参数和额外目录。它还负责拒绝不安全或平台不兼容的可执行形式，例如 Windows 批处理脚本路径。

环境不是原样继承。源码从系统环境、调用方 `options.env` 和 SDK 默认值组合出子进程环境，并注入入口标识；调用方显式值可能覆盖部分默认项。复现实验应保存允许公开的有效键集合和 CLI 版本，不能保存密钥值。

stderr 可以继承、管道化或交给回调。错误流是否被消费会影响诊断和缓冲行为；「SDK 没有抛异常」不等于 stderr 为空。子进程退出码、最后一条错误 Result 和 JSON 解码错误也有不同映射，后续错误课程再展开。

读取端还要面对单行缓冲上限。超长 JSON、无换行输出、破损 UTF-8 或进程提前退出都可能中断协议；这些属于 Transport 故障，不应被重试成模型质量失败。

## 控制协议的配对规则

SDK 发起请求时，唯一 `request_id` 同时存在于写出的请求、待响应 Event 和结果表。收到错误 subtype 时，结果表保存异常；超时会清除两个待定表项。迟到响应不会重新创建已删除等待者。

CLI 发起请求时，SDK 按 subtype 分流到 `can_use_tool`、Hook 或 MCP。成功与失败都要保留原请求标识；`control_cancel_request` 只取消匹配的处理任务，避免一个慢回调拖住关闭。

控制帧不属于普通消息流。应用的 `async for message` 看不到 initialize 请求或权限响应；如果评测需要审计权限链，就必须在 Adapter 中额外记录回调输入、决定、耗时和匿名化错误，而不是期待 Result 还原全部控制轨迹。

控制成功只说明协议配对，不说明授权正确。

## 失败与限制

第一，捆绑 CLI 优先级可能让「系统 claude 版本」与真实运行版本不同。只执行系统命令的版本检查不足以复现 SDK；应记录 Transport 最终解析出的可执行文件版本，但公开 Artifact 不保存本机绝对路径。

第二，自定义 Transport 不归 `SubprocessCLITransport` 管理。它可以没有子进程、标准流或相同关闭升级；进程所有权 Claim 明确限定默认 Transport。

第三，初始化和普通运行使用不同超时语义。initialize 可能等待 MCP Server 启动，普通控制请求有自己的超时；把所有超时都分类成模型超时会误导恢复策略。

第四，外层取消不能省略资源回收。源码使用屏蔽取消的关闭区间，是因为取消状态会让普通 await 立即退出；测试覆盖了 POSIX 假 CLI，不代表所有 Windows 进程树和外部工具后代都已验证。

第五，允许回调的成功响应不等于工具执行成功。CLI 收到决定后还要继续自己的权限、工具和执行流程；SDK 只证明决定已交付。

资源归属必须跟着实际实现分支走。

## 验证方法

静态检查默认和自定义 Transport 分支，核对 CLI 查找顺序、命令参数、环境合并、标准流、活动子进程集合、缓冲上限和关闭升级。每条摘录必须绑定锁定 Commit 与行号。

运行不需要真实模型的上游测试：`test_transport.py` 核对命令构造与连接，`test_query.py` 核对双向控制顺序，`test_close_cancellation.py` 用假 CLI 核对取消下的进程回收。Windows 专属行为和 POSIX 专属行为必须分开报告。

注入失败：CLI 不存在、工作目录不存在、初始化响应丢失、控制响应迟到、回调抛异常、超长 JSON、stderr 大量输出、用户提前停止迭代和外层取消。记录哪个对象持有资源、哪个 finally 执行、是否仍有活动子进程以及错误怎样投影。

最后把协议证据接入 Eval Artifact：保存实际表面、CLI 版本、匿名化有效配置、消息类型序列、控制请求配对、退出状态和目标文件差异。基础设施故障与产品任务失败分开计数，Attempt 不改变 Trial 分母。

先证明通道收敛，再分析任务质量。

## 自检

### 问题 1

为什么默认 Transport 而不是 `query()` 拥有 CLI 子进程？

**答案：** Transport 创建并保存进程与标准流，也执行关闭和回收；`query()` 只创建 InternalClient 并迭代消息。

### 问题 2

控制协议为什么叫双向？

**答案：** SDK 会向 CLI 发 initialize 或 Interrupt 请求，CLI 也会向 SDK 发权限、Hook 和 MCP 请求；双方都要按标识返回响应。

### 问题 3

收到 Result 后是否总能立即关闭标准输入？

**答案：** 不能。若仍有后台任务，后续 Hook 或 MCP 控制响应还需写回；生命周期课程会进一步区分回合 Result 与运行结束。

### 问题 4

权限控制响应为 success 是否证明文件已正确写入？

**答案：** 不证明。它只证明决定已交付 CLI；工具执行、产物正确性和独立 Eval 仍是后续层。
