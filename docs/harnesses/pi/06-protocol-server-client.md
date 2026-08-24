---
title: pi Protocol、Server 与 Client
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/protocol/src/framing.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/protocol/src/codec.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/protocol/src/schemas.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/protocol/test/protocol.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/server/src/server.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/server/src/sessions.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/client/src/client.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/client/test/sessions.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi Protocol、Server 与 Client

## 读者会得到什么

本篇解释 pi 怎样把进程内 Session Runtime 暴露成远程可控服务。链路分为长度 Framing、CBOR Codec、严格 Schema、Connection、Server Command Router、Session Runtime、Snapshot/Event 和 Client Lease；每一层解决不同问题。

Wire Frame 使用四字节大端长度前缀。Frame Decoder 能处理一个 Frame 被拆成多个 Chunk，也能从一个 Chunk 中还原多个 Frame，并对空 Frame、超长、截断和结束时残留做检查。Framing 只决定消息边界，不知道 Payload 语义。

Codec 把结构化 Envelope 编码为 CBOR，再封装 Frame；解码反向执行并用 TypeBox Schema 验证。JSON 形态适合日志和说明，但锁定的网络 Codec 是 CBOR，不应写成可任意切换的 JSON Wire Codec。

Schema 区分 Hello、Request、Response 与 Event。Request 有唯一 ID 和 Command；Response 必须回显同一 ID，并让 Result Command 与原 Command 匹配。Event 没有 Request ID，用于 Server Snapshot、Session Snapshot、Progress 和 Removal。

Server 要求首个 Frame 是版本 Hello，随后才执行 List、Create、Attach、Detach、Prompt、Steer、Abort、Set Model 和 Set Thinking。Session Command 需要 Connection 已 Attach；Response 说明 Command 被 Server 接受并返回 Snapshot，不证明 Agent 目标完成。

Client 的 Session Lease 进一步管理本地所有权。Shared Lease 可多实例共用，Exclusive Lease 与其他 Lease 互斥；最后一个 Shared Lease 释放后才发 Detach。Lease 解决本地协调，不是远端任务成功凭证。

## 核心概念

远程控制链路由多个彼此独立的契约组成。Framing 在无边界 Byte Stream 上恢复消息边界，Codec 在对象与 CBOR 之间转换，Schema 校验 Envelope 形状和字段语义，Connection 管理握手与请求关联，Server Router 决定命令是否允许，Session Runtime 才推进 Agent。把这些层拆开，错误才能准确归因，也能防止某一层成功被误写成整条链路成功。

Request/Response 与 Event 是两种通信模式。Request 具有唯一 ID，Response 必须回显 ID 并返回与原 Command 匹配的 Result；Event 没有 Request ID，用来报告后续进度、Snapshot 或 Removal。Prompt Response 可以先返回，模型和工具进度再持续到达，因此 Client 不能仅等待 Response 就停止观察 Session。

Snapshot 是某一 Revision 的状态投影，不是完整事件日志。Event 与 Response 可能因异步调度交错，Client 应根据 Session ID、Attachment 生命周期和 Revision 合并，而不是把网络到达顺序当作全局因果。Lease 则是 Client 侧对 Attach/Detach 的引用计数与互斥管理，它不能证明 Server 上只有一个操作者，更不能证明 Agent 任务正确。

| 概念 | 责任 | 典型失败 | 成功后仍待验证 |
| --- | --- | --- | --- |
| Length Frame | 用四字节长度划分 Payload | 空帧、超长、截断、残留 | CBOR 和业务语义 |
| CBOR Codec | 对结构化 Envelope 编解码 | 非法 CBOR、字节预算超限 | Schema 合法性 |
| Schema | 验证版本、类型、字段和 Command | 额外字段、错误版本、越界值 | 命令权限与业务执行 |
| Connection | Hello、Pending Request 和 Event 分发 | 首帧错误、ID 或 Command 不匹配 | Session 目标完成 |
| Server Router | 校验 Attach 并路由命令 | 未附着、未知 Session、运行时拒绝 | Agent 与工具结果 |
| Session Runtime | 执行 Prompt、Steer、Abort 和设置 | 模型、工具或状态错误 | 最终 Artifact 正确 |
| Snapshot / Event | 传播状态 Revision 与进度 | 乱序、漏接、旧 Revision | 完整审计历史 |
| Client Lease | 本地共享/独占所有权和 Detach | 冲突、释放失败、断线失效 | 远端全局独占和任务成功 |

## 为什么这样设计

长度前缀适合 Unix Byte Stream，因为一次读取可能只得到半个消息，也可能合并多个消息。Decoder 保留增量状态，可在任意 Chunk 切分下恢复同一 Frame 序列。四字节长度还允许在分配 Payload 前拒绝超长输入，形成最早的内存边界；它不理解内容，所以后续仍需 Codec 和 Schema。

CBOR 提供紧凑二进制表示，严格 Schema 则让协议演进可检查。二者分开后，编码正确但字段非法、字段合法但业务未授权都能形成不同错误。Request ID 与 Result Command 双重匹配，避免异步响应被交给错误调用者；只有 ID 相同但命令不同，也必须使连接失败。

Response 与 Event 分离，是因为长生命周期 Agent 无法把所有进度塞进一次同步调用。Response 确认命令边界已经处理，Event 传播后续状态；Snapshot 让新 Attach 的 Client 能得到当前投影，而不必重放所有事件。代价是 Client 必须处理交错、Revision 和断线，不能假设一个线性 RPC 就代表整个任务。

Lease 把同一 Client 进程内多个消费者的 Attach/Detach 合并，避免每个 UI 组件都重复占用远端 Session。Shared 适合多个只观察或协同表面，Exclusive 用于需要本地唯一控制的流程。它的作用域刻意有限：跨 Client 互斥、Server 端所有权和断线恢复应由更高层协议明确实现。

## 实现思路

课程实现应为每层定义输入、输出和预算，并确保错误携带层级标签。下面的伪代码展示增量接收路径；它不是上游源码复制。Decoder 只产出 Frame，Codec 和 Schema 逐层收窄合法集合，Router 最后才接触 Session Runtime。

发送侧同样需要背压。Frame 长度限制只能约束单条消息，无法阻止大量合法 Event 堆积；Connection 应限制 Pending Request、发送队列和慢消费者占用，并在超过预算时形成明确关闭原因。否则协议逐条合法，进程仍可能耗尽内存。

```ts
function onChunk(chunk: Uint8Array) {
  for (const frame of frameDecoder.push(chunk)) {
    const decoded = cborCodec.decode(frame);
    const envelope = protocolSchema.parse(decoded);
    connection.accept(envelope);
  }
}

function onEnd() {
  frameDecoder.end(); // 有残留 Header 或 Payload 时显式失败
}
```

1. Connection 建立后要求第一条 Envelope 为兼容版本 Hello；任何 Request 或 Event 抢在握手前到达都关闭连接并记录 protocol 阶段错误。
2. Client 为 Request 分配唯一 ID，先用 Schema 校验本地对象，再经 CBOR 和 Length Frame 编码。Pending Map 保存 ID、Command 和超时策略。
3. Server 的 Frame Decoder 在读取长度后先检查零值与最大值，再累积 Payload；连接结束时若有残留，返回截断错误。
4. Codec 解 CBOR，Schema 拒绝未知类型、额外字段、越界文本与版本不兼容。通过 Schema 只代表 Envelope 合法。
5. Router 对 Session Command 调用 `requireAttached()`，区分 Create/Attach/Detach 与 Prompt/Steer/Abort。业务错误封装为匹配 Request ID 和 Command 的 Response。
6. Runtime 状态变化发布带 Session ID 与 Revision 的 Event。Client 丢弃旧 Revision、更新 Snapshot，并只向有效 Lease 的 Listener 分发。
7. Client 收到 Response 时同时匹配 ID 和 Result Command，完成对应 Promise；不匹配视为连接级协议破坏，不能猜测修复。
8. Shared Lease 用引用计数合并 Attach，最后释放时 Detach；Exclusive 与任何现有 Lease 冲突。断线或 Removal 使全部相关 Lease 失效。

可观测记录至少包含 Connection ID、Request ID、Command、Session ID、Snapshot Revision、错误层级和终端状态。Payload 正文可能含代码与凭据，应采用脱敏字段或受控哈希，不把完整协议日志默认公开。

## 贯穿案例

假设两个本地面板共享观察同一 Session。第一个面板取得 Shared Lease，Client 发送一次 Attach；第二个面板取得 Shared Lease 时复用本地状态。随后用户从第一个面板发出 Prompt，Server 返回 Response，Agent 又陆续发出 Progress 与新 Snapshot。最后两个面板依次关闭。

测试为每条消息保存逻辑发送序号，并故意随机切分 Transport Chunk。逻辑序号只帮助核对夹具，不进入协议语义；真正的 Client 合并仍以 Request ID、Session ID 和 Snapshot Revision 为准，从而避免测试偶然依赖某种分块方式。

Prompt Envelope 的教学表示如下；线上 Wire 仍是 CBOR 加长度帧：

```json
{
  "type":"request",
  "id":"r-42",
  "request":{"command":"prompt","sessionId":"s-7","text":"运行测试并修复失败"}
}
```

1. 第一份 Shared Lease 触发 Attach，第二份只增加本地引用计数。若第二份请求 Exclusive，Client 在本地拒绝，不发送远端命令。
2. Prompt 被编码后可能被 Transport 拆成三个 Chunk。Frame Decoder 必须在最后一段到达后才产出 Payload；Schema 随后确认 Request 形状合法。
3. Server 验证 Connection 已 Attach 到 `s-7`，把命令交给 Runtime，并返回 ID 为 `r-42`、Command 为 `prompt` 的 Response。此时只证明命令边界成功。
4. Agent 执行期间发布 `session_progress`，随后 Snapshot Revision 从 8 变为 9。Client 即使先收到另一条旧 Revision 8，也不能覆盖新状态。
5. 工具测试失败时，Runtime 仍可能完成这次 Prompt。产品 Eval 读取测试结果并判失败，Protocol 层继续保持健康；错误被定位为工具或任务层，而非 Framing。
6. 第一份 Lease 释放时不 Detach，第二份仍活动；最后一份释放才发送 Detach。若 Detach 失败，显式释放路径保留可重试状态。

最终证据应把协议与任务结果并列：

```json
{
  "protocol":{"hello":"ok","requestId":"r-42","responseCommand":"prompt","latestRevision":9},
  "lease":{"attachRequests":1,"sharedConsumers":2,"detachRequests":1},
  "agent":{"terminal":"idle"},
  "eval":{"verdict":"failed","reason":"target tests still failing"}
}
```

若把 Response 中的 Command 改成 `steer`，即使 Request ID 相同，Client 也应让连接失败；若只截断最后一个 Frame，`end()` 应报告残留。案例由此验证每一层都拒绝自己的非法输入，同时展示协议健康、Agent 收敛和产品通过可以得到三个不同结论。

## 真实输入与输出

### 输入

Client 发出一个带 Request ID 的 Prompt Command，编码后经过 Unix Transport：

```json
{"type":"request","id":"request-7","request":{"command":"prompt","sessionId":"s-1","text":"检查测试"}}
```

### 输出

Server 先返回匹配 Response，运行时进度和更新后的 Session Snapshot 通过独立 Event 继续到达：

```json
{"response":{"id":"request-7","command":"prompt"},"events":["session_progress","session_snapshot"]}
```

Protocol 测试把两个 Frame 拆分、合并后喂入 Decoder，仍按顺序得到原消息；截断或超过最大 Frame 则抛出 Protocol Validation Error。

## 调用链

![pi 远程控制从客户端会话租约、命令封装、长度帧与二进制编码，经服务端连接和会话运行时，再以响应、事件和快照回流的中文时序图](../../../assets/diagrams/pi/06-protocol-server-client.svg)

Claim: pi.protocol.frame-codec-schema-are-distinct

Claim: pi.protocol.session-lease-is-not-task-success

1. Client Lease 检查本地 Attached 与 Active 状态，构造 Session Command。
2. Client 分配 Request ID，将 Envelope 先过 Schema，再编码 CBOR 和 Length Frame。
3. Transport 发送 Byte Stream；Server Connection 的增量 Decoder 恢复完整 Frame。
4. Codec 解 CBOR，Schema 拒绝额外字段、非法 Command、错误版本和越界值。
5. Server 将 Command 交给 Session Coordinator；Create/Attach 获得 Runtime，其他 Session Command 要求 Connection 已附着。
6. Runtime 执行 Prompt、Steer、Abort 或设置变更，Server 返回 Result Snapshot。
7. Runtime 后续 Progress 与状态变化形成 Event，广播给已附着 Connection。
8. Client State 合并 Snapshot Revision，并把 Session Event 分发给对应 Lease Listener。
9. 最终 Lease 释放触发 Detach；断线或 Session Removal 使相关 Lease 失效。

## 源码证据

Frame 与 Codec 是两层：

```source
packages/protocol/src/codec.ts:64-113
const frame = encodeFrame(encodeCbor(validated, { maxByteLength: maxFrameLength }));
for (const frame of this.frames.push(chunk)) {
  messages.push(this.parse(decodeCbor(frame, { maxByteLength: this.maxFrameLength })));
}
```

Frame Decoder 独立维护 Header、期望 Payload 长度与分块缓冲；`end()` 在残留不完整 Frame 时失败。Protocol Test 确认 Fragmented 与 Coalesced 输入可恢复，Schema-invalid CBOR、截断和超长会被拒绝。

Schema 将 Command Result 和原 Command 关联。Client 收到 Response 后不仅按 Request ID 查 Pending Request，还检查 `message.result.command` 与原 Command Name 一致；不匹配会使 Connection 失败，避免串错异步响应。

Server Session Coordinator 在 Create 后自动 Attach，Prompt/Steer/Abort 前调用 `requireAttached()`。Runtime Progress 走 Event，而同步 Response 只携带命令完成时 Snapshot。

Client Lease Test 证明多个 Shared Lease 只产生一次 Attach，最后释放才产生 Detach；Shared 存在时拒绝 Exclusive，Exclusive 存在时拒绝 Shared。Detach 失败时显式 Detach 可恢复 Active 以重试，Dispose 走清理语义。

## 失败与限制

第一，Frame 完整只证明 Byte Boundary 正确；CBOR 仍可能损坏，Schema 仍可能不匹配，Command 仍可能被业务拒绝。

第二，Response Success 不等于 Agent Success。Prompt Command 可被接受，模型随后仍可能 Error、Abort、工具失败或产生错误文件。

第三，Snapshot 是状态投影。Event 与 Response 可能交错，Client 要按 Revision 和 Attachment 生命周期合并，不能用到达顺序猜全局因果。

第四，Lease 主要是单个 Client 内的所有权协调。Server Runtime 的独占获取、跨 Client 竞争和断线恢复属于另外一层。

第五，Unix Transport 限制本机连接范围，但 Socket 文件权限、目录权限和同机用户模型仍需部署配置；Transport 本身不提供内容授权。

第六，最大 Frame 限制防止无界缓冲，却不能替代请求速率、事件背压、慢消费者断开和总体内存预算。

## 验证方法

对 Protocol 做性质测试：随机切分和合并同一 Byte Stream，确认消息序列不变；注入零长度、超长、截断、无效 CBOR、额外字段、错误版本和 Result Command Mismatch。

对 Server 用 Testing Service 验证 Hello 必须第一、未 Attach Command 被拒绝、Create 自动 Attach、Detach 后命令失败，以及 Runtime Error 会移除 Session。

对 Client 记录 Attach/Detach Request 数量，覆盖多个 Shared、Exclusive 冲突、Detach 失败重试、断线失效与 Reacquire。远程端到端测试必须同时保存 Request/Response、Event、Snapshot Revision 和最终 Session Artifact。

Eval 不把 Protocol 200 式成功作为评分。独立 Gate 读取目标文件、测试结果和业务断言；Protocol Trace 只帮助定位 Transport、Server、Agent 或 Tool 哪一层失败。

## 自检

### 问题 1

Framing、Codec 与 Schema 分别做什么？

**答案：** Framing 划分 Byte 消息边界；Codec 在结构与 CBOR 间转换；Schema 验证 Envelope 与字段语义。

### 问题 2

锁定 Protocol 是否提供 JSON Wire Codec？

**答案：** 没有。可读示例是 JSON 形态，实际 Codec 使用 CBOR 加四字节长度帧。

### 问题 3

Prompt Response 成功后为什么仍不能宣布任务完成？

**答案：** Response 只证明 Server 接受并执行了命令边界；Agent、工具和最终产物仍可能失败，后续状态还会通过 Event 更新。

### 问题 4

Shared Lease 何时发送 Detach？

**答案：** 同一 Session 的最后一个 Shared Lease 释放时；单个 Lease 释放不会影响仍活动的其他 Shared Lease。
