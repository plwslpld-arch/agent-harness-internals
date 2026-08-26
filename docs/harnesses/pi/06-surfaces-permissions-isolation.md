# CLI、TUI、JSON、RPC 与真实权限边界

[返回 pi 课程地图](README.md)

pi Coding Agent 可以运行在 Interactive TUI、Print、JSON 和 RPC 模式，这些产品表面虽然共享同一个 Agent Session，却各自遵守不同的 I/O 契约。pi 默认会继承启动进程拥有的文件、网络、子进程与凭据权限。项目 Trust 和工具提示仍不是 OS Sandbox。

## 第 1 站：产品模式由参数和 TTY 条件选择

源码：[查看模式选择](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/main.ts#L110-L119)

```typescript
if (parsed.mode === 'rpc') return 'rpc'
if (parsed.mode === 'json') return 'json'
if (parsed.print || !stdinIsTTY || !stdoutIsTTY) return 'print'
return 'interactive'
```

- **调用者**：Coding Agent 进程入口。
- **输入**：CLI 参数与 stdin/stdout TTY 状态。
- **状态变化**：选择单次文本、事件 JSON、双向 RPC 或交互 UI。
- **返回**：对应 Surface Runner。
- **下一站**：Runner 创建 Agent Session 并连接输入输出。

JSON 和 RPC 都可能逐行输出 JSON，不过前者承载的是单向 Agent Events，后者使用的却是双向 Command/Response/Event 协议，所以消费者不能因为外观相似就混用 Parser。

### 产品表面改变交互，不改变环境事实

Interactive 模式可以在终端里弹出确认，Print 模式可能需要预设策略，RPC 模式则能把问题交给远端客户端回答，而这些差异决定的只是「谁回答批准请求」，不会自动改变 Bash 最终在哪台机器上运行，也不会改变执行它的用户身份。权限模型必须跨产品表面保持同一语义，否则同一个工具从 TUI 和 RPC 发起调用时，就会落入不同的安全边界。

## TUI Render 不是 Agent Event 计数器

TUI 每次更新时会先渲染 Components 与 Overlays，然后再根据屏幕状态选择全量重绘或差分写入，因此终端行数、Spinner 停止和「Done」卡片都只是 UI 投影，既不代表模型采样次数，也不能充当任务验收结果。

源码：[查看 TUI Main Screen](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/tui/src/tui-main-screen.ts#L180-L273)

```typescript
let newLines = this.render(width)
if (this.hasOverlayEntries) newLines = this.compositeOverlays(...)
if (widthChanged) {
  fullRender(true)
  return
}
```

- **调用者**：Terminal Event/Resize/Agent Event 触发 UI 更新。
- **输入**：组件状态、宽度和 Overlay。
- **状态变化**：更新屏幕缓存并写终端。
- **返回**：用户可见界面。
- **下一站**：用户输入继续驱动 Session。

## Project Trust 与 OS Sandbox 的区别

Project Trust 控制的是要不要自动加载仓库提供的 Context、Extension 或其他资源，从而降低一打开恶意项目就执行代码的风险，但它不会限制用户主动调用 Bash/Write 以后，进程究竟能访问哪些路径。

默认情况下，工具会直接使用 pi 进程的权限运行，如果需要真实隔离，就要引入外部容器或 Sandbox Extension，并明确区分哪些工具已经重定向到隔离环境，哪些工具仍然留在宿主执行。

## 第 2 站：Sandbox Extension 存在明确本地回退

源码：[查看 Sandbox Extension](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/examples/extensions/sandbox/index.ts#L1-L260)

```typescript
// sandboxEnabled 或 sandboxInitialized 为 false 时，
// Bash 调用回退到 localBash。
```

- **调用者**：Example Extension 注册的 Bash Tool Handler。
- **输入**：命令、Sandbox 开关和初始化结果。
- **状态变化**：选择隔离执行器或本地 Bash。
- **返回**：命令输出。
- **下一站**：Agent Core 接收 Tool Result。

Example 只是展示 Extension 能做到什么，并不代表 Sandbox 默认启用，而当平台不支持、依赖缺失、初始化失败或用户主动关闭时，工具都可能回到宿主执行。日志必须写清实际路径。

## 容器化也要说明挂载和网络

Plain Docker、Gondolin、OpenShell 等方案面对的威胁模型并不相同，如果宿主工作区以读写方式挂载，容器里的进程仍然能够修改文件，而只重定向 Bash 也约束不了 Extension 自己调用的 Node API。网络网关可以限制出站访问，却不会自动保护已经挂载进去的凭据。

## 回到运费任务

TUI 中的「允许编辑」只表示产品批准了这次 Tool Call，真正的写入仍然可能由宿主 Node 进程完成。即使启用了 Sandbox Extension，也要确认三件事——`edit` 与 `bash` 是否都被重定向、工作区采用什么挂载方式，以及初始化失败后会不会回退到本地，因为只有 Trace 记录了实际执行路径，用户才能判断这次修改究竟发生在哪里。

## 练习：识别危险回退

日志只写「Sandbox 初始化失败，继续执行」，随后测试正常通过。为什么这不能被视为安全降级？

<details>
<summary>查看核对要点</summary>

因为「继续执行」可能意味着工具已经切换到权限更大的本地 Bash，所以安全系统应该让回退策略显式可配置，并在事件中标明实际执行器、挂载方式和网络边界。高风险场景通常应当失败关闭，不能静默获得宿主权限。

</details>

下一篇：[Telemetry、Evals 与证据边界](07-telemetry-evals-boundaries.md)。
