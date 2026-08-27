# 编排、Skills、Plugins、MCP 与产品表面如何分类

[上一篇：权限、状态与恢复](03-permissions-state-recovery.md) · [返回课程总目录](../README.md) · [下一篇：可观测性与独立 Eval](05-observability-eval-deployment.md)

Agent 生态经常把 Agent、Sub-Agent、Skill、Plugin、Hook、MCP、Protocol、Server 和 UI 统称为「扩展能力」，但它们实际介入的层次并不相同。有的机制会改变模型输入，有的会增加工具，有的会创建一条新循环，还有的只是把同一 Session 暴露给另一个客户端。为了避免把这些边界混在一起，本篇会先按责任分类，再比较六套 Harness 的代表机制。

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

同一个项目名词可能跨越两类责任，例如一个 Plugin 既注册 Tool 又安装 Hook，所以分析时仍然要把这两个作用分开写清楚。

## 六条课程的代表机制

| 课程 | 编排与扩展 | 协议或表面 | 最值得核对的边界 |
| --- | --- | --- | --- |
| DeepSeek Harness | Bundle、Preset、扩展与子任务 | CLI、ACP 等表面 | 多包装配如何仍保留单一运行主链 |
| Codex | 子代理、任务编排、扩展与 Code Mode | CLI、exec、IDE、app-server 协议 | Thread/Turn 事件如何被多个表面投影 |
| Gemini CLI | Agents、Hooks、Skills 与 MCP | CLI 输出和协议表面 | 扩展介入 Turn/Scheduler 的哪个阶段 |
| Claude | SDK Hooks、MCP、Agents 与 Skills 的公开契约 | Python/TypeScript SDK 与 CLI 边界 | 公开控制协议不能补全闭源内部实现 |
| pi | Resource Loader、Extensions、Coding Agent | TUI、Print、JSON、RPC、Protocol Server/Client | 最小 Agent Core 如何被逐层组合而不是复制 |
| OpenCode | Agent、Task、Skill、Plugin、MCP、LSP | Server、Protocol、TUI、Web、Desktop、ACP | 服务端 Session 是共享真值，客户端只持有投影 |

详细证据还要回到六条课程各自的扩展和产品表面章节中查找，因为这个比较页只负责建立坐标——也就是各机制的责任位置——不能替代上游源码站点。

## 子 Agent 是另一条任务链

子 Agent 一旦开始承担任务，就不再只是「调用另一个模型」，因为这条任务链至少还需要：

- 独立或可区分的 Session/Task 身份；
- 明确的输入投影，而不是无边界复制父 Context；
- 权限派生规则；
- 深度、并发、预算和取消限制；
- 返回父 Agent 的结果投影；
- 父子 Trace 关联。

OpenCode 通过 Task Tool 创建子 Session，同时保留父端 Deny 与外部目录限制，Codex 课程展示了子代理与编排，而 DeepSeek Harness 会通过它的装配和任务机制扩展运行。pi 的 Follow-up 仍然在同一个 Agent Run 内处理追加消息，因此它不属于子 Agent。

运费任务可以把「检查回归测试范围」交给子 Agent，但父任务中禁止修改测试的约束，不能因为换了一个 Agent 名称就消失。子任务结束后，父端不应该只收到一句「完成」，还需要拿到 Child Session ID 和能够核对的结果。

## Skill 不是 Tool，MCP 也不是单一能力

Skill 通常提供模型可读的流程和知识，因此加载与否会改变 Context，而 Tool 提供的是可调用接口，它在执行时会产生观察或副作用。MCP Server 还可以分别声明 Tools、Prompts、Resources 或 Templates，所以连接成功只是建立了通道，无法证明每种能力都已经存在。

因此要分开检查：

1. 资源有没有被发现；
2. 当前 Agent 是否有权看见；
3. 能力是否进入本轮输入；
4. 调用时是否还需要批准；
5. 远端 Server 实际能否执行；
6. 返回结果怎样关联到 Session。

如果界面只把「已连接 MCP」显示成一个绿色状态，用户就很容易忽略后面至少五道门槛。

## Plugin 与 Extension 是高信任代码

Prompt、Skill 和 Tool Schema 主要影响模型能看到什么，但进程内 Plugin/Extension 可以直接读文件、发网络请求、注册 Provider、改写 Tool Result，甚至绕过正常权限入口。项目 Trust 只能决定要不要加载这段代码，一旦加载完成，它并不会自动降低这段代码的宿主权限。

安全审计需要记下来源、版本、安装脚本、加载顺序和所有 Hook 介入点，而调用前阻断与调用后改写还必须分别留证。如果使用 Context Transform，最好再保存安全脱敏的转换前后摘要。

## 多客户端只共享核心事实

同一个 Session 可以同时被 CLI、Web、Desktop、IDE 或 RPC Client 观察，但这些客户端应当共享服务端事件、消息和状态，不能把某个界面控件当成核心事实。要让这种共享可靠，协议至少需要：

- Server/Project/Session 身份；
- 请求与响应关联；
- Event Cursor 或 Revision；
- 重连基线与去重规则；
- 取消和权限问题的路由；
- 版本或能力协商。

pi Protocol 用 Frame/CBOR/Schema 和 Attach Lease 控制远程 Session，OpenCode 使用 HTTP/Event 服务和 History/Cursor，而 Codex 通过协议与 app-server 服务多个表面。界面上出现「Done」，只能说明这个投影收到了某种终态，要理解它的准确语义，仍然必须回到核心事件。

## 设计取舍：进程内组合还是服务化核心

pi 展示了从轻量进程内 Agent Core 到 Protocol Server 的渐进组合，OpenCode 从服务化 Session 出发，让多个客户端天然共享核心，Codex 则使用 Rust Core 与协议支持多种产品表面。DeepSeek Harness 通过 Bundle 组合多包能力，这些形态各有侧重，没有一种能在所有场景里胜出：

- 进程内组合部署简单、延迟低，但客户端与运行时耦合更紧；
- 服务化核心便于共享 Session 和远程控制，但必须解决身份、并发和重连；
- 闭源产品 + 公开 SDK 给出稳定契约，却限制了内部实现可核对深度。

因此，比较时应该从任务需要出发，不能把「支持更多表面」直接当成 Harness 更强的证明。

## 练习：给六个对象分类

选择任意一条课程，从中找出一个 Agent/Preset、一个 Tool、一个 Skill/Context 来源、一个 Hook/Extension、一个 Session 协议对象和一个 UI 表面，然后分别说明它改变的是模型输入、控制流、环境还是展示层。

<details>
<summary>查看核对标准</summary>

一个对象可以同时跨越多层，但答案必须逐项说明，例如 Plugin 注册 Tool 时改变能力表，安装 Hook 时又改变控制流，只写「它扩展了 Agent」还不合格。如果所选项目没有某一类公开机制，如实写明不可用或当前来源不可核对就可以。

</details>

[下一篇：运行证据怎样进入独立 Eval](05-observability-eval-deployment.md)
