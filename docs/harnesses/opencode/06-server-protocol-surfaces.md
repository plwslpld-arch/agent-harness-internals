# Server、Protocol 如何同时服务 TUI、Desktop、Web 与 ACP

[返回 OpenCode 课程地图](README.md)

OpenCode 的多表面共享一套 HTTP/Event 服务核心。Protocol Package 定义 Endpoint Schema、错误和 Middleware 位置；Server 注入 Session Location、Authorization 与业务 Handler；TUI、Web、Desktop、SDK 和 ACP 通过协议访问 Session，而不是直接拿内部对象。

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

Schema 只能验证请求/响应形状。Session 在 Location Lookup 后仍可能移动、删除或 Busy，Handler 必须返回业务错误。

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

事件连接会断开，客户端需保存 Cursor、处理重复和过期 History。先订阅再 Prompt 能缩小竞态，但不能替代重连基线。

### 多客户端共享的是服务事实，不是界面状态

Server 保存 Session 与事件，TUI、Web 和 Desktop 各自保存选中面板、滚动位置和临时输入。协议不应把 UI 投影当作 Session 真值，也不应要求每个客户端理解内部对象。稳定的 Endpoint Schema 和可重放 Event Cursor 才是共享边界。

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

Idle 是 Session 控制状态，不是任务正确性评分。

## Web/Desktop 与 Server State 分开

App 以 Server Identity 挂载 SDK/Sync Provider，再在 Directory Scope 管理 Project/Session 数据；Desktop 复用 App，并增加本地/WSL 连接和原生能力。切换 Server 必须重建数据 Provider，不能只改 URL 文本。

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

ACP 把编辑器 Session/Prompt/Permission 映射到 OpenCode Service，并统一错误；它投影的内容不是完整内部 Event Log。

## 回到运费任务

Web 提交 Prompt 后断线，Session 仍可在 Server 继续运行；Desktop 重新连接时应先取得 History/Snapshot，再从 Cursor 续订事件。若只等待新事件，它可能看不到断线期间的编辑和测试；若从头盲目应用全部事件，又可能重复显示工具结果。

## 练习：设计一次安全重连

请给出重连的最小顺序。

<details>
<summary>查看核对要点</summary>

客户端先确认 Server Identity 和 Directory Scope，读取当前 Session History 或 Snapshot，记下服务端返回的 Cursor/Revision，再订阅之后事件；应用事件时按 ID 去重，并在 Cursor 过期时重新建立基线。具体 API 可不同，但不能只依赖 TCP 连接持续存在。

</details>

下一篇：[Share、Telemetry 与 Eval 边界](07-share-telemetry-eval.md)。
