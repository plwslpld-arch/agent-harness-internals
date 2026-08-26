# Server、Protocol 如何同时服务 TUI、Desktop、Web 与 ACP

[返回 OpenCode 课程地图](README.md)

OpenCode 的 TUI、Web、Desktop、SDK 和 ACP 虽然面向不同使用场景，却共享同一套 HTTP/Event 服务核心。Protocol Package 先定义 Endpoint Schema、错误和 Middleware 位置，Server 再注入 Session Location、Authorization 与业务 Handler，因此各个表面都通过协议访问 Session，不会直接拿到内部对象。

```text
TUI / Run / Web / Desktop / SDK / ACP
                 ↓ HTTP / Events / Adapter
            Protocol Schema
                 ↓
        Server Handler + Middleware
                 ↓
        Project / Session Services
```

## 第 1 站：Protocol 定义 API Group 和中间件位置

源码：[查看 Protocol API](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/protocol/src/api.ts#L25-L64)

```typescript
return HttpApi.make('opencode')
  .add(makeSessionGroup(sessionLocationMiddleware))
  .add(eventGroup)
  .middleware(Authorization)
```

- **调用者**：Server API 组装与 SDK/OpenAPI 生成。
- **输入**：Session Location Middleware 定义。
- **状态变化**：组合 Endpoint Groups、Schemas 和 Authorization 位置。
- **返回**：与具体业务实现分离的 API Contract。
- **下一站**：Server 为每个 Endpoint 注册 Handler。

Schema 只能验证请求和响应的形状，而 Session 即使刚通过 Location Lookup，也可能随后被移动、删除或进入 Busy 状态，所以 Handler 仍然必须把这些变化表达成业务错误。

## 第 2 站：Session Prompt 与 Events 是不同返回形态

源码：[查看 Session Handlers](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/server/src/handlers/session.ts#L140-L173)

```typescript
'session.prompt',
(ctx) => Effect.map(
  session.prompt(...),
  (data) => ({ data }),
)
```

源码：[查看 History 与 Event Handler](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/server/src/handlers/session.ts#L333-L366)

```typescript
'session.history'
'session.events'
session.events({ sessionID, after })
```

- **调用者**：HTTP/SDK Client。
- **输入**：Directory/Session Location、Prompt 或 Event Cursor。
- **状态变化**：Prompt 驱动业务；Event/History 只读取持久记录与流。
- **返回**：同步响应、历史页或可重连事件流。
- **下一站**：客户端更新自己的 UI State。

事件连接随时可能断开，因此客户端需要保存 Cursor，并能处理重复事件和过期 History。先订阅再发送 Prompt 可以缩小竞态窗口，但只要连接发生过中断，客户端仍要依靠重连基线恢复事实。

### 多客户端共享的是服务事实，不是界面状态

Server 保存 Session 与事件，TUI、Web 和 Desktop 则各自保存选中面板、滚动位置与临时输入。界面状态留在本地。协议不能把某个 UI 的投影当成 Session 真值，也不该要求每个客户端理解服务内部对象，而真正可以共享的边界只有两样——稳定的 Endpoint Schema 和能够重放的 Event Cursor。

## Run 与 TUI 也通过统一事件面

源码：[查看 Run 事件循环](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/cli/cmd/run.ts#L693-L835)

```typescript
for await (const event of events.stream) {
  if (event.type === 'session.created' && event.properties.info.parentID) {
    // 跟踪子 Session
  }
  if (event.properties.status.type === 'idle') break
}
```

- **调用者**：非交互 Run 或 Mini 交互模式。
- **输入**：Server Events 与目标 Session ID。
- **状态变化**：跟踪父子 Session，格式化消息/工具输出；目标 Session Idle 时结束。
- **返回**：终端文本/JSON 与进程状态。
- **下一站**：Shell 自动化或用户查看结果。

Idle 只表示 Session 已进入控制流程中的空闲状态。它不评价结果对错。

## Web/Desktop 与 Server State 分开

App 先以 Server Identity 挂载 SDK/Sync Provider，再在 Directory Scope 内管理 Project 与 Session 数据，而 Desktop 复用这套 App 之后，还会增加本地或 WSL 连接以及原生能力。切换 Server 时必须重建数据 Provider，因为只改 URL 文本会让旧服务的数据状态继续留在新连接下面。

## ACP 只是另一层协议适配

源码：[查看 ACP Agent 委托](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/acp/agent.ts#L26-L89)

```typescript
newSession(params) {
  return run(this.service.newSession(params))
}

prompt(params) {
  return run(this.service.prompt(params))
}
```

ACP 会把编辑器侧的 Session、Prompt 与 Permission 映射到 OpenCode Service，并在适配层统一错误，但它向外投影的内容并不是完整的内部 Event Log。

## 回到运费任务

Web 提交 Prompt 后即使断线，Session 仍可在 Server 继续运行，因此 Desktop 重新连接时应该先取得 History 或 Snapshot，再从 Cursor 续订后面的事件。如果只等待新事件，断线期间发生的编辑与测试就可能消失在界面上。但如果从头盲目应用全部事件，工具结果又可能重复显示。

## 练习：设计一次安全重连

请给出重连的最小顺序。

<details>
<summary>查看核对要点</summary>

客户端先确认 Server Identity 和 Directory Scope，再读取当前 Session History 或 Snapshot，并记下服务端返回的 Cursor 或 Revision，然后才订阅后续事件。应用事件时需要按 ID 去重，而一旦 Cursor 过期，就要重新建立基线。具体 API 可以不同，但恢复流程不能只依赖 TCP 连接一直存在。

</details>

下一篇：[Share、Telemetry 与 Eval 边界](07-share-telemetry-eval.md)。
