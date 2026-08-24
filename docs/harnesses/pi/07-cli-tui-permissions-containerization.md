---
title: pi CLI、TUI、权限与隔离边界
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/coding-agent/src/main.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/modes/print-mode.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/modes/rpc/rpc-mode.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/tui/src/tui-main-screen.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"README.md","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/docs/containerization.md","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/examples/extensions/sandbox/index.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi CLI、TUI、权限与隔离边界

## 读者会得到什么

本篇把 pi 的产品表面与安全边界分开。Interactive TUI、单次 Print、JSON Event Stream 和 JSONL RPC 共用 Coding Agent Session，却采用不同输入输出协议；界面差异不应被误写成 Agent Core 能力差异。

`resolveAppMode()` 先尊重 RPC 与 JSON 参数，再根据 Print Flag、stdin/stdout 是否是 TTY 选择 Print 或 Interactive。管道输入会把原本交互模式切到 Print。RPC 使用 stdin/stdout 逐行 JSON Command，Print JSON 输出 Session Event；两者协议不同。

TUI 将 Session Event 转换成 Component Tree，再 Render 为终端行。Main Screen 保留 Previous Lines，宽高变化、内容缩短或特殊终端情况可能触发 Full Redraw；普通更新走 Differential Compare。差分渲染是表现层优化，不改变 Session Transcript 与 Tool Result。

权限方面，上游 README 明确说明默认没有内建 Permission System，进程继承启动用户对文件、进程、网络和凭据的权限。Project Trust 决定是否装载项目级设置、Extension 和 Skill，不限制已启用 Bash、Read、Edit 或 Write 的操作系统权限。

仓库给出四类可选边界：Sandbox Extension、Gondolin 微型虚拟机、Plain Docker 和 OpenShell。它们的覆盖面不同。Sandbox Example 主要替换 Bash 与 `!` Command，而且未初始化、禁用或平台不支持时回退 Local Bash；容器化整个进程才覆盖内建 Tool 与 Extension Tool，但挂载目录和注入密钥仍会暴露相应资源。

## 核心概念

产品表面决定用户怎样输入目标、怎样观察事件，不决定 Agent Core 拥有哪些控制逻辑。Interactive TUI、Print Text、Print JSON 和 RPC 都可以创建 Coding Agent Session，但输入协议、输出投影和生命周期不同。比较模式时应固定 Session 配置和模型夹具，再检查同一消息与 Tool Result 如何被投影，不能用屏幕刷新次数代替 Agent Turn。

Project Trust、交互确认与操作系统隔离也属于不同层。Trust 决定项目级 Extension、Skill 或设置是否装载；确认对话允许人在某次动作前作决策；隔离边界则由进程权限、容器、虚拟机或策略网关强制限制文件、进程、网络和凭据。前两者能降低风险，却无法约束已经获准或绕过交互表面的进程能力。

隔离方案必须用能力矩阵描述。Sandbox Extension 主要接管 Bash 路径，并存在本地回退；Gondolin、Docker 和 OpenShell 对文件系统、网络、挂载、密钥与 Extension 的覆盖方式不同。所谓「在沙箱里运行」只有在实际启动拓扑、策略、拒绝探针和失败模式都留证后才有意义。

| 概念 | 负责什么 | 不负责什么 | 验证信号 |
| --- | --- | --- | --- |
| Interactive TUI | 编辑、组件、Overlay 与事件呈现 | Agent 决策与工具权限 | 组件状态和渲染快照 |
| Print Text | 单次运行的最终文本投影 | 完整中间事件 | 最终 stdout 与退出状态 |
| Print JSON | 单次运行的 Session Event 流 | 双向远程控制 | 逐行事件 Schema |
| RPC | stdin/stdout Command、Response、Event | 网络级授权与任务评分 | 请求关联和会话状态 |
| Project Trust | 是否加载项目资源 | 限制已启用工具的 OS 权限 | 装载清单与诊断 |
| Confirmation Hook | 人工允许、拒绝或改写动作 | 强制隔离和无人模式覆盖 | 决策记录与调用关联 |
| Sandbox / Container | 强制副作用可达范围 | 自动保证配置最小权限 | 允许与拒绝探针 |
| TUI Differential Render | 减少终端重绘 | 改变 Transcript 或 Turn | 行差异与全量重绘计数 |

## 为什么这样设计

多表面复用同一 Session，可以让交互用户、脚本和外部控制器共享模型、工具与持久化语义。TUI 适合持续观察与人工 steering，Print 适合流水线，JSON 适合消费事件，RPC 适合双向控制。表面分离避免 Core 为终端布局或 stdin 细节承担责任，也让自动化可以绕过图形交互而不重写 Agent。

TUI 的差分渲染是性能与体验选择。组件树先生成完整行，再比较 Previous Lines；Overlay、宽度变化或特殊终端状态可能触发全量重绘。终端写入与 Session Event 不是一一对应，因此调试时既要看 UI 快照，也要看底层事件，才能区分「Agent 没输出」和「输出未正确呈现」。

默认继承宿主权限使本地工具简单、兼容且可组合，也把安全责任明确交给部署者。pi 不假装一个 Prompt 或 Trust 对话能限制操作系统；需要强制边界时，用户可以选择适合威胁模型的外部方案。这个取舍允许轻量本地使用，但公开课程必须醒目标出默认能力范围。

提供多种隔离方案而非单一「安全模式」，是因为威胁模型不同。只想限制 Shell 的用户可能接受 Extension；要求全部工具与扩展隔离的场景需要容器或虚拟机；需要集中网络策略的场景可能使用网关。选择方案时应依据覆盖矩阵和 Fail-open/Fail-closed 行为，而非方案名称。

## 实现思路

教学实现先把 Mode Resolution 与 Session Creation 分开，再为每种表面实现 Adapter。所有 Adapter 消费同一 Session Event，但只输出各自协议允许的投影。安全配置作为独立 Deployment Snapshot 绑定运行，避免界面选项被误当成隔离状态。

Adapter 还要声明输入所有权和关闭语义。Interactive 模式拥有终端 Raw Mode 与编辑器状态，Print 模式通常在一次 Run 后退出，RPC 则可能跨多个 Prompt 持续存活。收到 Ctrl-C、stdin EOF 或 Agent Abort 时，各模式应明确是取消当前 Run、关闭 Session 还是终止进程，避免同一信号在不同表面产生不可解释的副作用。

```ts
type AppMode = "interactive" | "print-text" | "print-json" | "rpc";

function resolveMode(args: Args, io: IOState): AppMode {
  if (args.rpc) return "rpc";
  if (args.json) return "print-json";
  if (args.print || !io.stdinTTY || !io.stdoutTTY) return "print-text";
  return "interactive";
}
```

1. 解析参数与 TTY 状态，明确 RPC 和 JSON 优先级；管道导致的模式变化写入启动诊断，避免脚本意外进入交互等待。
2. 用同一工厂创建 Model Runtime、Resource Loader、Session 和 Agent Core。模式 Adapter 不得私自增加高权限工具。
3. Interactive Adapter 将事件映射为组件树，Render 完整行后再做差分；宽度、Overlay 与 Unicode 场景保存可视快照。
4. Print Text 只在终态写最终文本，Print JSON 逐行输出事件；两者都要定义 stderr、退出码和中断行为，不能让日志破坏 stdout 协议。
5. RPC 逐行解析 Command，分别输出 Response 与 Event，并实施请求预算和 EOF 清理。JSON 外观相似也不得复用 Print Event Decoder。
6. 建立 Deployment Snapshot，记录宿主用户、工作目录、挂载、网络、环境变量类别、隔离方案、策略版本与失败回退。
7. 对每项能力运行允许/拒绝探针：工作区内外读写、子进程、外网、环境变量、Socket 和密钥文件。预期拒绝却成功时立即失败。
8. 将表面测试、隔离探针和产品 Eval 分开出结论。UI 正确、边界正确、任务正确必须分别通过。

强隔离模式要明确 Fail Closed。Sandbox 初始化失败若回退 Local Bash，适合优先可用性的交互场景，却不满足强制策略；部署包装器应检测状态并阻止 Session 启动，或选择覆盖整个进程的隔离方案。

能力探针应同时包含正向与反向用例。只验证「工作区文件可读」无法说明外部目录被阻止，只验证「网络失败」也可能只是测试地址不可达。为每个能力准备可控目标：工作区哨兵应成功，外部哨兵应被策略拒绝；本地允许端点和明确禁止端点分别测试网络规则。拒绝原因还要来自预期隔离层，普通 ENOENT 或 DNS 故障不能冒充策略生效。

部署记录需要保存实际入口，镜像名称远远不够。容器内用户、工作目录、只读根文件系统、Bind Mount 读写属性、网络命名空间、环境变量注入和宿主 Socket 都会改变边界。Extension 运行在容器内时继承容器能力；若挂载了宿主高权限 Socket，容器外观仍可能无法提供预期隔离。

## 贯穿案例

假设同一「读取两个文件并生成摘要」任务分别经 Interactive、Print JSON 和 RPC 运行，模型与只读工具都使用确定性夹具。部署要求只能读取临时工作区，禁止访问外部目录和网络。目标是同时验证表面等价性与隔离边界，而不是比较终端输出长短。

每种模式使用全新 Session，避免前一次运行的 Compaction、缓存或 follow-up 影响结果；三次运行共享同一 Case ID，但具有不同 Trial ID。比较时采用规范化消息和 Tool Result，而不是字节级比较 TUI 控制序列、JSON 行和 RPC Envelope，因为这些投影按设计就不同。

实验输入如下：

```json
{
  "task":"读取工作区内两个文件并生成摘要",
  "modes":["interactive","print-json","rpc"],
  "policy":{"workspaceRead":true,"outsideRead":false,"network":false},
  "provider":"faux"
}
```

1. 三种模式都创建同一配置的 Session，保存 Active Tools、Prompt 哈希和模型夹具 ID。Interactive 通过编辑器提交，Print JSON 从参数或管道提交，RPC 发送 Prompt Command。
2. 将底层 Session Event 按 ID 对齐。TUI 可能多次差分重绘，Print JSON 输出多行事件，RPC 先有 Response 再有 Event；模型消息与 Tool Result 应保持一致。
3. 只读工具访问工作区文件应成功，访问外部哨兵文件应拒绝，网络探针应失败。拒绝由实际隔离层产生，不能只让模型在 Prompt 中承诺不访问。
4. 若使用 Sandbox Extension 并模拟初始化失败，观察到 Local Bash 回退后，强隔离运行立即判失败；不能因为任务摘要正确而放行。
5. 最终 Eval 对三种模式的摘要内容做相同断言，TUI 另做视觉快照，隔离另做能力矩阵。三份结论独立保存。

结果记录示例：

```json
{
  "sessionSemantics":{"messagesEqual":true,"toolResultsEqual":true},
  "presentation":{"interactive":"passed","printJson":"passed","rpc":"passed"},
  "isolation":{"workspaceRead":"allowed","outsideRead":"denied","network":"denied","fallback":"none"},
  "productEval":"passed"
}
```

实验还要核对取消路径。Interactive 中断、Print 进程信号和 RPC Abort Command 都应让当前 Run 收敛，并检查已开始工具的真实状态。若文件写入已提交，界面显示「已取消」不能把副作用视为回滚；Trace 要记录开始、提交和检查结果。

如果 TUI Unicode 行错位而 Session Event 正确，应判表现层失败；如果 Sandbox 回退导致外部文件可读，应判隔离失败；如果三种表面都正常但摘要内容错误，应判产品失败。这个拆分让「看起来完成」「协议完成」「边界生效」和「目标正确」不再相互遮盖。

## 真实输入与输出

### 输入

同一个 Prompt 可以经四种表面进入：

```json
{"interactive":"终端编辑器","print":"参数或管道","json":"事件流","rpc":"逐行命令"}
```

### 输出

它们共享 Session Message 与 Tool Event，但投影不同：Interactive 更新组件，Print Text 只给最终文本，JSON 输出全部事件，RPC 输出 Command Response 与 Event。

```json
{"shared":"AgentSession","projections":["组件树","最终文本","事件对象","命令响应"]}
```

## 调用链

![pi 编码智能体会话分别投影到交互终端、单次文本、事件流和远程命令表面，默认宿主权限与多种可选隔离边界分层展示的中文架构图](../../../assets/diagrams/pi/07-cli-tui-permissions-containerization.svg)

Claim: pi.tui.differential-rendering-is-presentation

Claim: pi.security.examples-are-not-default-boundaries

1. CLI 解析参数、TTY 与 Pipe 状态，确定 Interactive、Print、JSON 或 RPC。
2. 四种模式创建同类 Resource、Model、Session 与 Agent Core。
3. Agent Event 在 Interactive 模式更新消息组件、状态栏、Overlay 和 Editor。
4. TUI Render 生成新行，先合成 Overlay，再比较 Previous Lines；必要时 Full Redraw。
5. Print Text 订阅事件但只输出最终文本；JSON Print 将事件转为结构化行。
6. RPC 解析 stdin Command、调用 Session API，并向 stdout 写 Response 与 Event。
7. 无论表面如何，Tool 默认在宿主进程权限下执行。
8. 显式启用外部隔离后，副作用边界由 Sandbox、VM、Container 或 Policy Gateway 决定。

## 源码证据

模式选择是产品入口逻辑：

```source
packages/coding-agent/src/main.ts:110-119
if (parsed.mode === "rpc") return "rpc";
if (parsed.mode === "json") return "json";
if (parsed.print || !stdinIsTTY || !stdoutIsTTY) return "print";
return "interactive";
```

TUI Main Screen 先 Render 全部 Component 与 Overlay，再决定 Full Render 或差分更新。首次渲染、宽度变化和部分高度变化触发 Full Redraw；因此终端写入次数不能直接当 Agent Turn 数。

```source
packages/tui/src/tui-main-screen.ts:180-273
let newLines = this.render(width);
if (this.hasOverlayEntries) newLines = this.compositeOverlays(...);
if (widthChanged) { fullRender(true); return; }
```

README 对默认安全边界给出直接声明：pi 没有用于限制文件系统、进程、网络或凭据的内建权限系统，默认继承启动进程权限。这个结论比「出现 Trust Prompt」更强，因为 Trust 只治理项目资源加载。

Containerization 文档列出 Gondolin、Plain Docker 与 OpenShell；Sandbox Extension 源码则显示 `sandboxEnabled` 或 `sandboxInitialized` 为 false 时调用 Local Bash。Example 可用不等于默认强制。

## 失败与限制

第一，JSON Print 与 RPC 都使用逐行 JSON 外观，但语义不同。前者是 Agent Event 输出，后者包含双向 Command/Response；消费端不能混用 Decoder。

第二，TUI 显示 Done 或停止 Spinner 只说明界面状态。最终文件、测试和发布 Gate 仍需独立核验。

第三，Project Trust 不是 OS Sandbox。它减少未信任项目资源自动执行风险，却不约束用户主动启用的工具和 Extension。

第四，Sandbox Example 回退 Local Bash 是可用性选择，也是安全降级。要求强隔离时，初始化失败必须 Fail Closed，而非静默回退。

第五，Docker Bind Mount 会把宿主目录直接暴露给容器；把 Provider Key 注入容器也扩大凭据面。容器存在本身不代表最小权限。

第六，OpenShell 与 Gondolin 属于外部系统。仓库文档证明集成方案存在，不证明本地环境已经部署或策略正确。

## 验证方法

用同一 Faux Provider 和临时目录分别运行四种模式，按 Session ID 对齐 Event，确认模型消息与工具结果一致，同时记录表面特有输出。不要用屏幕行数推断 Turn。

TUI 测试注入宽度变化、Overlay、长输出、Unicode 与图像占位，记录 Full Redraw Count 和 Differential Write；目标是表现正确，不是 Agent 正确。

安全实验先建立能力矩阵：文件读写、子进程、网络、环境变量、宿主 Socket 与挂载。分别在默认宿主、Sandbox Example、Gondolin、Docker 和 OpenShell 中执行无破坏探针；失败回退必须显式记录。

发布 Gate 要求隔离配置 Artifact、实际探针结果和目标产物测试都通过。Prompt 中的安全文字、Trust Decision 或容器进程启动成功都不能单独放行。

## 自检

### 问题 1

Print JSON 与 RPC 有什么不同？

**答案：** Print JSON 是单次运行的事件输出；RPC 是双向逐行 Command、Response 与 Event 协议。

### 问题 2

差分渲染失败是否一定意味着 Agent Loop 失败？

**答案：** 不一定。它属于表现层；Session 与工具可能正常，但用户看到的行不正确，仍是产品缺陷。

### 问题 3

项目已被 Trust 后是否获得隔离？

**答案：** 没有。Trust 允许加载项目资源；工具仍继承宿主权限，除非另行启用并验证隔离边界。

### 问题 4

怎样验证容器化而不是只证明容器启动？

**答案：** 对文件、网络、进程、凭据和挂载逐项做允许与拒绝探针，并保存实际策略与结果。
