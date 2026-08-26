# Protocol、Server 与 Client Lease 如何远程控制同一 Agent

[返回 pi 课程地图](README.md)

pi Protocol 把进程内的 Agent Session 变成了一个可以由外部 Client 驱动的状态机，而消息进入传输层以后，会先按 Frame 切分，再经过 CBOR 解码和 Schema 校验。Command/Response 负责同步控制，Event 传递运行中的进度，Attach/Detach Lease 则管理 Client 对 Session 的占用。

```text
Client Command
  ↓ Frame → CBOR → Schema
Server Coordinator → Attached Session → Agent
  ├→ Response：命令结算与 Snapshot
  └→ Event：模型、工具与状态进度
```

## 第 1 站：Frame Boundary 与 Message Codec 分两层

源码：[查看 Protocol Codec](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/protocol/src/codec.ts#L64-L113)

```typescript
const frame = encodeFrame(
  encodeCbor(validated, { maxByteLength: maxFrameLength }),
)

for (const frame of this.frames.push(chunk)) {
  messages.push(this.parse(
    decodeCbor(frame, { maxByteLength: this.maxFrameLength }),
  ))
}
```

- **调用者**：Client/Server Transport 收到任意大小 Byte Chunk。
- **输入**：部分 Frame、多个粘连 Frame 或待发送 Message。
- **状态变化**：Frame Decoder 缓冲 Header/Payload；完整后再解 CBOR 并做 Schema 校验。
- **返回**：一个或多个类型化 Protocol Messages。
- **下一站**：Request Router 或 Pending Request Map。

Frame 完整只能说明这一段字节的边界没有问题，接下来的 CBOR 解码和 Schema 校验仍然可能失败，而 `end()` 如果发现缓冲区里还留着半个 Frame，就应该报告截断错误。不能静默丢弃。

## Response 还要核对 Command 名称

Client 收到响应以后不只会按 Request ID 查找 Pending Promise，还会确认 Response Result 中的 Command 与原请求一致，因此即使服务端或连接层错配了 ID，另一种命令的 Payload 也不会被交给错误的 Decoder。

源码：[查看 Protocol Client](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/client/src/client.ts#L189-L318)

```typescript
// 按 requestId 找 Pending Request，
// 再验证 result.command 与原 Command Name 一致。
```

- **调用者**：Client Message Loop。
- **输入**：Response、Pending Request Table。
- **状态变化**：正确响应结算 Promise；错配使连接进入错误状态。
- **返回**：类型化 Command Result。
- **下一站**：SDK 调用者更新本地 Snapshot。

## 第 2 站：Prompt 前必须先 Attach

Server Session Coordinator 会在 Create 完成后自动 Attach，而在执行 Prompt、Steer 和 Abort 之前，都会先调用 `requireAttached()` 确认当前连接仍然占用 Session。命令结算时的 Snapshot 由同步 Response 携带，运行过程则通过 Events 持续推送。

源码：[查看 Session Coordinator](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/server/src/sessions.ts#L47-L117)

```typescript
// create -> attach
// prompt / steer / abort -> requireAttached()
// progress -> events；command completion -> response snapshot
```

- **调用者**：Server Command Router。
- **输入**：Session ID 与 Prompt/Steer/Abort Command。
- **状态变化**：验证当前连接拥有 Attachment，随后调用 Agent Session。
- **返回**：Command Result 和 Snapshot。
- **下一站**：Client 同时合并 Events 与 Response。

Event 与 Response 在网络上可能交错到达，所以 Client 应该依据 Revision 和 Session ID 合并状态，而不能把消息抵达本机的先后直接当成全局因果顺序。

### 为什么 Response 和 Event 必须共存

Prompt 命令可能运行很久，如果只在结束时返回 Response，客户端就无法及时显示模型增量、工具开始或权限请求，而如果只发送 Event，调用者又不知道某个命令何时正式结算，也无法判断失败属于哪次请求。两种消息各管一层——Response 给出请求级的完成语义，Event 提供运行中的观察窗口，但它们都要关联到同一个 Session 和 Revision。

## Shared 与 Exclusive Lease 解决同一 Client 内的所有权

同一个 Client 持有多个 Shared Lease 时，远端只需要 Attach 一次，等最后一个 Shared Lease 释放才会 Detach，而 Exclusive Lease 会与任何 Shared Lease 互斥。若 Detach 失败，显式释放可以把 Lease 恢复到 Active 状态以便重试，Dispose 则采用尽力清理语义。

这套 Lease 只处理同一个 Client 内部的所有权，并不会自动解决多个独立 Client 争用同一个 Server Session 的问题，因此跨 Client 的独占、断线超时和 Fencing 仍然要由 Server Runtime 定义。

## 回到运费任务

客户端 Attach 后提交 Prompt，随后可能先后收到「读取工具开始」与「读取完成」事件，直到最后才拿到 Prompt 命令的 Response Snapshot。一旦网络重连，Client 就不能把旧连接上迟到的事件直接应用到新 Snapshot，而要根据 Session ID、Revision 或服务端的重放规则判断这条事件是否仍然有效。

## 练习：不要用到达顺序重建状态

客户端先收到 Revision 12 的 Response，随后收到 Revision 11 的工具完成 Event。界面应否把状态退回 Revision 11？

<details>
<summary>查看核对要点</summary>

不应。到达顺序并不等于状态顺序，客户端应该丢弃旧 Revision、把它单独展示，或者按照协议规则合并，而不能用它覆盖更新的 Snapshot。若协议没有可以比较的 Revision，就必须另外定义重放和幂等策略。不能靠猜测。

</details>

下一篇：[CLI、TUI、权限与外部隔离](06-surfaces-permissions-isolation.md)。
