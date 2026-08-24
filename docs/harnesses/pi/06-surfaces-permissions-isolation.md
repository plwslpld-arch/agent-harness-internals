# CLI、TUI、JSON、RPC 与真实权限边界

[返回 pi 课程地图](README.md)

pi Coding Agent 可以运行在 Interactive TUI、Print、JSON 和 RPC 模式。它们共享 Agent Session，却拥有不同 I/O 契约。更重要的是，pi 默认继承启动进程的文件、网络、子进程与凭据权限；项目 Trust 和工具提示不是 OS Sandbox。

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

JSON 和 RPC 都可能逐行输出 JSON，但语义不同：JSON 是单向 Agent Events，RPC 是双向 Command/Response/Event 协议，消费者不能混用 Parser。

### 产品表面改变交互，不改变环境事实

Interactive 模式可以弹出确认，Print 模式可能需要预设策略，RPC 模式可以把问题交给远端客户端。这些差异决定「谁回答批准请求」，却不会自动改变 Bash 最终运行在哪台机器、以哪个用户身份运行。权限模型必须跨表面保持同一语义，否则同一工具从 TUI 和 RPC 调用会获得不同的安全边界。

## TUI Render 不是 Agent Event 计数器

TUI 每次先渲染 Components 与 Overlays，再决定全量重绘或差分写入。终端行数、Spinner 停止和「Done」卡片都是 UI 投影，不等于模型采样次数或任务验收。

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

Project Trust 控制是否自动加载仓库提供的 Context、Extension 或其他资源，减少打开恶意项目即执行代码的风险。它不会限制用户主动调用 Bash/Write 后进程能访问的路径。

默认情况下，工具以 pi 进程权限运行。真实隔离需要外部容器或 Sandbox Extension，并明确哪些工具被重定向、哪些仍在宿主执行。

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

Example 展示了扩展能力，不代表默认启用。平台不支持、依赖缺失、初始化失败或用户关闭时都可能回到宿主执行；日志必须把实际路径写清楚。

## 容器化也要说明挂载和网络

Plain Docker、Gondolin、OpenShell 等方案的威胁模型不同。宿主工作区若以读写方式挂载，容器仍能改文件；只重定向 Bash 不能约束 Extension 自己的 Node API；网络网关能限制出站，却不自动保护挂载的凭据。

## 回到运费任务

TUI 中的「允许编辑」表示产品批准本次 Tool Call；真正的写入可能仍由宿主 Node 进程完成。若启用 Sandbox Extension，还要确认 `edit` 与 `bash` 是否都被重定向、工作区如何挂载，以及初始化失败时是否回退本地。只有 Trace 记录实际执行路径，用户才能知道这次修改究竟发生在哪里。

## 练习：识别危险回退

日志只写「Sandbox 初始化失败，继续执行」，随后测试正常通过。为什么这不能被视为安全降级？

<details>
<summary>查看核对要点</summary>

因为继续执行可能已经切换到拥有更大权限的本地 Bash。安全系统应让回退策略显式可配置，并在事件中标出实际执行器、挂载和网络边界；高风险场景通常应失败关闭，而不是静默获得宿主权限。

</details>

下一篇：[Telemetry、Evals 与证据边界](07-telemetry-evals-boundaries.md)。
