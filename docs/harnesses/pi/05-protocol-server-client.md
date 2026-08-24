# Protocol、Server 与 Client Lease 如何远程控制同一 Agent

[返回 pi 课程地图](README.md)

pi Protocol 把进程内 Agent Session 变成可被外部 Client 驱动的状态机。传输先切分 Frame，再解 CBOR 与 Schema；Command/Response 负责同步控制，Event 负责运行中进度，Attach/Detach Lease 管理 Client 对 Session 的占用。

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

Frame 完整只说明字节边界正确；CBOR 和 Schema 仍可能失败。`end()` 发现残留半帧时应报截断，而不是静默丢弃。

## Response 还要核对 Command 名称

Client 不只按 Request ID 查 Pending Promise，还检查 Response Result 中的 Command 是否与原请求一致。这样即使服务端或连接层错配 ID，也不会把另一种命令的 Payload 交给错误 Decoder。

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

Server Session Coordinator 在 Create 后自动 Attach；Prompt、Steer 和 Abort 前都调用 `requireAttached()`。同步 Response 携带命令结算时 Snapshot，运行过程通过 Events 推送。

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

Event 与 Response 可能交错，Client 应按 Revision 和 Session ID 合并，不能把网络到达顺序当全局因果顺序。

### 为什么 Response 和 Event 必须共存

Prompt 命令可能运行很久。若只在结束时返回 Response，客户端无法显示模型增量、工具开始或权限请求；若只有 Event，调用者又无法知道某个命令何时正式结算、失败属于哪次请求。Response 提供请求级完成语义，Event 提供运行中观察，两者需要共同关联到 Session 和 Revision。

## Shared 与 Exclusive Lease 解决同一 Client 内的所有权

多个 Shared Lease 只需要一次远端 Attach，最后一个释放时才 Detach；Exclusive 与任何 Shared 互斥。Detach 失败时，显式释放可以恢复 Active 状态以便重试，而 Dispose 走尽力清理语义。

这套 Lease 不自动解决多个独立 Client 竞争同一 Server Session。跨 Client 的独占、断线超时和 Fencing 仍要由 Server Runtime 定义。

## 回到运费任务

客户端 Attach 后提交 Prompt，随后可能先收到「读取工具开始」和「读取完成」事件，最后才收到 Prompt 命令的 Response Snapshot。若网络重连，Client 不能把旧连接迟到的事件直接应用到新 Snapshot；它需要 Session ID、Revision 或服务端重放规则判断事件是否仍有效。

## 练习：不要用到达顺序重建状态

客户端先收到 Revision 12 的 Response，随后收到 Revision 11 的工具完成 Event。界面应否把状态退回 Revision 11？

<details>
<summary>查看核对要点</summary>

不应。到达顺序不等于状态顺序。客户端应丢弃、单独展示或按协议规则合并旧 Revision，而不是覆盖更新的 Snapshot。若协议没有可比较 Revision，则必须明确重放和幂等策略，不能靠猜测。

</details>

下一篇：[CLI、TUI、权限与外部隔离](06-surfaces-permissions-isolation.md)。
