# 编排、Skills、Plugins、MCP 与产品表面如何分类

[上一篇：权限、状态与恢复](03-permissions-state-recovery.md) · [返回课程总目录](../README.md) · [下一篇：可观测性与独立 Eval](05-observability-eval-deployment.md)

Agent 生态常把 Agent、Sub-Agent、Skill、Plugin、Hook、MCP、Protocol、Server 和 UI 都称为「扩展能力」。它们实际介入的是不同层：有的改变模型输入，有的增加工具，有的创建新循环，有的只把同一 Session 暴露给另一个客户端。本篇先按责任分类，再比较六套 Harness 的代表机制。

![编排、协议与产品表面的层次](../../assets/diagrams/comparisons/04-orchestration-protocol-surfaces.svg)

## 先按责任分类

| 类别 | 改变什么 | 是否拥有独立 Loop | 典型风险 |
| --- | --- | --- | --- |
| Agent/Preset | 模型、Prompt、工具和权限组合 | 可能 | 配置身份混淆 |
| Sub-Agent/Task | 创建另一项受控任务 | 是 | 权限升级、上下文泄漏、递归爆炸 |
| Skill/Context | 给模型增加按需知识或流程 | 否 | 提示注入、过期指令 |
| Tool/MCP | 增加观察或动作接口 | 否 | 远端副作用、能力声明与现实不一致 |
| Plugin/Extension/Hook | 修改装配、调用前后或 Context | 通常否 | 进程内高权限、不可见改写 |
| Protocol/Server | 让外部 Client 控制 Session | 否 | 身份、重连、事件重复与版本错配 |
| CLI/TUI/Web/Desktop/IDE | 展示和采集用户交互 | 否 | 把 UI 状态误当核心状态 |

同一个项目名词可能跨两类。例如一个 Plugin 既注册 Tool 又安装 Hook；分析时仍应把两个作用分别写清楚。

## 六条课程的代表机制

| 课程 | 编排与扩展 | 协议或表面 | 最值得核对的边界 |
| --- | --- | --- | --- |
| DeepSeek Harness | Bundle、Preset、扩展与子任务 | CLI、ACP 等表面 | 多包装配如何仍保留单一运行主链 |
| Codex | 子代理、任务编排、扩展与 Code Mode | CLI、exec、IDE、app-server 协议 | Thread/Turn 事件如何被多个表面投影 |
| Gemini CLI | Agents、Hooks、Skills 与 MCP | CLI 输出和协议表面 | 扩展介入 Turn/Scheduler 的哪个阶段 |
| Claude | SDK Hooks、MCP、Agents 与 Skills 的公开契约 | Python/TypeScript SDK 与 CLI 边界 | 公开控制协议不能补全闭源内部实现 |
| pi | Resource Loader、Extensions、Coding Agent | TUI、Print、JSON、RPC、Protocol Server/Client | 最小 Agent Core 如何被逐层组合而不是复制 |
| OpenCode | Agent、Task、Skill、Plugin、MCP、LSP | Server、Protocol、TUI、Web、Desktop、ACP | 服务端 Session 是共享真值，客户端只持有投影 |

详细证据分别见六条课程的扩展和产品表面章节。比较页只建立坐标，不替代上游源码站点。

## 子 Agent 是另一条任务链

子 Agent 不只是「调用另一个模型」。它至少需要：

- 独立或可区分的 Session/Task 身份；
- 明确的输入投影，而不是无边界复制父 Context；
- 权限派生规则；
- 深度、并发、预算和取消限制；
- 返回父 Agent 的结果投影；
- 父子 Trace 关联。

OpenCode 通过 Task Tool 创建子 Session，并保留父端 Deny 与外部目录限制；Codex 课程展示子代理与编排；DeepSeek Harness 通过其装配和任务机制扩展运行。pi 的 Follow-up 不是子 Agent，因为它仍在同一 Agent Run 内处理追加消息。

运费任务可以把「检查回归测试范围」交给子 Agent，但禁止修改测试的父约束不能因为换了 Agent 名称而消失。父端也不应只收到「完成」，而应拿到 Child Session ID 和可核对结果。

## Skill 不是 Tool，MCP 也不是单一能力

Skill 通常提供模型可读的流程和知识，是否加载会改变 Context；Tool 提供可调用接口，执行会产生观察或副作用。MCP Server 可以分别声明 Tools、Prompts、Resources 或 Templates，连接成功不代表每种能力都存在。

因此要分开检查：

1. 资源有没有被发现；
2. 当前 Agent 是否有权看见；
3. 能力是否进入本轮输入；
4. 调用时是否还需要批准；
5. 远端 Server 实际能否执行；
6. 返回结果怎样关联到 Session。

把「已连接 MCP」显示成一个绿色状态，会掩盖至少五个后续门槛。

## Plugin 与 Extension 是高信任代码

Prompt、Skill 和 Tool Schema 主要影响模型观察；进程内 Plugin/Extension 可以直接读文件、发网络请求、注册 Provider、改写 Tool Result，甚至绕过正常权限入口。项目 Trust 只能决定是否加载，不能在加载后自动降低它的宿主权限。

安全审计应记录来源、版本、安装脚本、加载顺序和所有 Hook 介入点。调用前阻断与调用后改写必须分别留证，Context Transform 最好保存安全脱敏的前后摘要。

## 多客户端只共享核心事实

一个 Session 可以同时被 CLI、Web、Desktop、IDE 或 RPC Client 观察，但共享的应是服务端事件、消息和状态，而不是界面控件。可靠协议至少需要：

- Server/Project/Session 身份；
- 请求与响应关联；
- Event Cursor 或 Revision；
- 重连基线与去重规则；
- 取消和权限问题的路由；
- 版本或能力协商。

pi Protocol 用 Frame/CBOR/Schema 和 Attach Lease 控制远程 Session；OpenCode 用 HTTP/Event 服务和 History/Cursor；Codex 用协议与 app-server 服务多个表面。界面出现「Done」只表示其投影收到某种终态，仍需回到核心事件理解语义。

## 设计取舍：进程内组合还是服务化核心

pi 展示从轻量进程内 Agent Core 到 Protocol Server 的渐进组合；OpenCode 从服务化 Session 出发，多客户端天然共享核心；Codex 的 Rust Core 与协议支持多种产品表面；DeepSeek Harness 通过 Bundle 组合多包能力。没有一种形态在所有场景更好：

- 进程内组合部署简单、延迟低，但客户端与运行时耦合更紧；
- 服务化核心便于共享 Session 和远程控制，但必须解决身份、并发和重连；
- 闭源产品 + 公开 SDK 给出稳定契约，却限制了内部实现可核对深度。

比较时应从任务需要出发，而不是把「支持更多表面」当成更强 Harness。

## 练习：给六个对象分类

选择任意一条课程，找出一个 Agent/Preset、一个 Tool、一个 Skill/Context 来源、一个 Hook/Extension、一个 Session 协议对象和一个 UI 表面。分别写出它改变模型输入、控制流、环境还是展示中的哪一层。

<details>
<summary>查看核对标准</summary>

一个对象可以跨层，但必须逐项说明。例如 Plugin 注册 Tool 时改变能力表，安装 Hook 时又改变控制流；不能只写「它扩展了 Agent」。若所选项目没有某一类公开机制，写明不可用或当前来源不可核对即可。

</details>

[下一篇：运行证据怎样进入独立 Eval](05-observability-eval-deployment.md)
