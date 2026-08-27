# Server、Protocol 如何同时服务 TUI、Desktop、Web 与 ACP

[返回 OpenCode 课程地图](README.md)

OpenCode 的 TUI（终端用户界面）、Web、Desktop、SDK 和 ACP（Agent 客户端协议）各有自己的使用场景，却都连到同一套 HTTP/Event 服务核心。

Protocol（协议）Package 先规定 Endpoint 的 Schema、错误和 Middleware 放在哪里，Server 再接入 Session Location、Authorization 与业务 Handler，因此这些产品表面都要经过协议访问 Session，谁也不会直接拿到内部对象。

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

Schema 只能检查请求和响应长什么样，即使 Session 刚刚通过 Location Lookup，它随后仍可能被移走、删掉或转入 Busy 状态，所以 Handler 还得捕捉这些变化，并返回对应的业务错误。

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

事件连接随时可能断开，因此客户端得保存 Cursor（游标），还要能处理重复事件和已经过期的 History。先订阅再发送 Prompt，确实可以缩小竞态窗口，但只要连接中断过，客户端仍得重新取得一份基线，才能补回这段时间发生的事实。

### 多客户端共享的是服务事实，不是界面状态

Server 负责保存 Session 和事件，TUI、Web 与 Desktop 则各自记住用户选中的面板、滚动位置和还没提交的输入。界面状态留在本地。协议不能拿某个 UI 展示出来的内容充当 Session 真值，也不能逼着每个客户端理解服务内部对象，真正能在它们之间共享的只有稳定的 Endpoint Schema，以及可以重放的 Event Cursor。

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

Idle 只说明控制流程已经停下来，Session 眼下没有工作可做。至于结果对不对，它不管。

## Web/Desktop 与 Server State 分开

App 会先根据 Server Identity 挂载 SDK/Sync Provider，然后在 Directory Scope 里管理 Project 和 Session 数据。Desktop 复用这套 App 时，还会接上本地或 WSL 连接，并补充原生能力。切换 Server 时一定要重建数据 Provider，因为如果只改 URL，旧服务留下的数据仍会挂在新连接下面。

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

ACP 把编辑器送来的 Session、Prompt 和 Permission 转给 OpenCode Service，再由适配层统一整理错误，但它对外给出的内容只截取了内部 Event Log 的一部分。

## 回到运费任务

Web 提交 Prompt 后即使断了线，Session 仍会留在 Server 上继续运行，因此 Desktop 重新连上时，应该先取得 History 或 Snapshot（快照），再从 Cursor 指向的位置续订后面的事件。如果客户端只等新事件，断线期间做过的编辑和测试就不会出现在界面上。可要是它从头应用所有事件，工具结果又可能显示两遍。

## 练习：设计一次安全重连

请给出重连的最小顺序。

<details>
<summary>查看核对要点</summary>

客户端先核对 Server Identity 和 Directory Scope，然后读取当前 Session 的 History 或 Snapshot，并记下服务端返回的 Cursor 或 Revision，做完这些才订阅后续事件。收到事件后要按 ID 去重，一旦发现 Cursor 已经过期，就重新建立基线。各家 API 可以不同，但恢复流程不能把希望全押在 TCP 连接永不断开上。

</details>

下一篇：[Share、Telemetry 与 Eval 边界](07-share-telemetry-eval.md)。
