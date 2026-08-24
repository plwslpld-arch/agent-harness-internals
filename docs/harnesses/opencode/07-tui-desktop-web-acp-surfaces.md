---
title: OpenCode 终端、桌面、网页与编辑器协议表面
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/cli/cmd/run.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/cli/cmd/tui.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/app/src/app.tsx","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/app/src/context/directory-sync.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/desktop/src/renderer/index.tsx","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/acp/agent.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/acp/service.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/cli/acp/prompt-content.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 终端、桌面、网页与编辑器协议表面

## 读者会得到什么

本篇比较 OpenCode 的多种使用表面，但不把界面差异误写成多套 Agent Runtime。非交互 Run、Mini 交互模式和 TUI 可以启动进程内服务，也可以 Attach 到已有 Server；App 以 Server/Directory/Session Scope 组织网页状态，Desktop Renderer 复用 App 并增加本地或 WSL 连接与原生能力；Agent Client Protocol Adapter 则把 OpenCode Session 映射为编辑器可消费的协议会话。

共享核心意味着这些表面可以指向同一 Server、Project 和 Session，读取相同持久消息与事件。它不意味着客户端状态完全共享。终端格式、TUI 选中项、网页 Tab/Draft/Comment、桌面窗口与 Server Connection、编辑器协议中的 Mode/Variant/Usage 都有独立生命周期。客户端断开或重启时，服务端 Session 可能继续存在，局部乐观状态则可能被丢弃或需要重新同步。

ACP 不是会话事件的透明转发。Adapter 实现 Initialize、New/Load/List/Resume/Close Session、Set Mode/Model、Prompt 与 Cancel，再把 OpenCode Message/Part/Tool/Permission 等事件转换成 Protocol Session Update。某个更新在编辑器中显示成功，只证明映射和传输完成；原始事件、服务端消息和文件产物仍是核对任务结果的来源。

## 核心概念

Surface 是共享服务核心的客户端投影。CLI Run、TUI、Web App、Desktop 和 ACP 可以操作同一 Project/Session，但它们不拥有另一套 Agent Loop。服务端 Message/Part、Tool 和文件状态是共享事实；Tab、Draft、选中项、窗口、终端行和协议 Mode 等属于客户端局部状态。复现问题时必须分别保存。

连接方式决定路径与生命周期语义。进程内模式启动本地 Server/Worker，Attach 模式连接现有地址，Desktop 还可能使用 WSL 或原生桥接，ACP 通常通过编辑器协议调用。Attach 的 Directory 按服务端文件系统解释，客户端显示同名路径并不证明本地可访问同一文件。

ACP 是语义 Adapter。它把 OpenCode Session、Message Part、Tool、Permission、Usage 和 Stop Reason 转成编辑器协议的 Session Update，并实现 New/Load/Resume/Cancel 等操作。协议没有对应字段时可能压缩或丢失私有 Metadata，因此 ACP Trace 要同时引用原始事件和映射结果。

| 表面 | 连接方式 | 本地状态 | 共享服务事实 |
| --- | --- | --- | --- |
| CLI Run | 进程内或远端 Attach | 输出格式、父子输出选择 | Project、Session、Message/Part |
| Mini/TUI | Worker Fetch/Event Source 或 Attach | 编辑器、选择、弹窗、终端尺寸 | Session Event 与工具状态 |
| Web App | Server SDK 与 Directory Scope | Route、Tab、Draft、Comment、缓存 | Server/Project/Session Snapshot |
| Desktop | Web UI 加原生/WSL 连接 | 窗口、连接配置、原生生命周期 | 所选 Server 的会话数据 |
| ACP | 编辑器协议 Transport | Mode、Variant、编辑器视图 | 映射后的 OpenCode Session |
| Event Subscription | 流式连接 | Cursor、重连与去重集合 | 服务端增量事件 |
| Client Cache | 乐观更新和快速展示 | 未确认投影 | 不能覆盖服务端 Revision |
| Product Eval | 独立 Artifact 检查 | 无界面偏好 | 最终文件、测试与副作用 |

## 为什么这样设计

复用服务核心能让终端、浏览器、桌面和编辑器共享 Session 与持久历史，也降低每个客户端重复实现 Agent Loop 的成本。表面只需实现输入、事件映射和交互状态；服务端负责配置、模型、工具和持久化。统一核心仍允许各表面针对使用场景优化体验。

客户端状态保持局部，可以避免一个窗口的 Draft 或选中项污染其他客户端。Web Tab、TUI Overlay 和 ACP Mode 的生命周期不同，强行全部持久到 Session 会让会话事实掺入表现细节。真正需要跨端共享的内容应通过明确的服务端 Message 或设置表达。

Adapter 而非透明转发，让 ACP 可以遵守编辑器协议的类型和生命周期，也能把复杂 Part 转成编辑器可理解的更新。代价是映射存在信息损失与版本兼容问题；课程要求保存映射表和未知事件诊断，不把编辑器显示当原始证据。

先订阅事件再发 Prompt 可以缩小竞态窗口，但无法消除断线和历史缺口。每个表面都需要基线、Cursor、重连和幂等合并；乐观更新只改善交互延迟，服务端确认和最终 Snapshot 才能使副本收敛。

把 Server Identity 纳入缓存键，是为了防止远端、WSL 和本地服务的同名 Directory/Session 相互污染。路径字符串和 Session ID 都只在服务端作用域内唯一，跨连接合并必须同时匹配 Server Key。

## 实现思路

教学实现为每个客户端维护 Surface Snapshot，并把服务端 Revision 与本地 Revision 分开。下面结构用于证据对齐，不是 OpenCode 上游同名类型。

Snapshot 还要记录客户端与协议版本。ACP、SDK 或 Web Schema 升级后，同一个原始 Event 可能得到不同投影；复现显示问题时必须知道映射版本，而不能只拿最终截图比较。

```ts
interface SurfaceSnapshot {
  surface: "run" | "tui" | "web" | "desktop" | "acp";
  connection: { serverId: string; mode: string; directory: string };
  sessionId: string;
  serverRevision: number;
  localStateDigest: string;
  lastEventId?: string;
  mappingVersion?: string;
}
```

1. 解析 Directory、Session、Continue/Fork、Attach、Model、Agent 和输出格式，明确本地启动还是连接远端 Server。
2. 连接后读取 Project/Session 基线，再订阅 Event Stream；服务端路径按连接目标解释，不用客户端路径自动替换。
3. CLI Run 订阅事件后提交 Prompt，按目标 Session 与父子关系过滤输出，在 Idle 时停止呈现但保留最终 Artifact 检查。
4. TUI 将统一事件转换为消息、工具、权限和弹窗组件；终端尺寸与选择只写本地状态，不修改 Session 事实。
5. Web App 以 Server Key 决定重挂载，以 Directory 建立 SDK/Sync Scope；乐观更新收到冲突时回滚并重读 Snapshot。
6. Desktop 将本地、WSL 或远端连接显式绑定 Server ID，记录原生桥接能力与权限；复用 Web UI 不代表相同安全边界。
7. ACP 为每类 Message/Part/Tool/Permission 事件定义转换与降级规则，未知字段保存诊断；Cancel 同时核对服务端 Run 与已开始工具状态。
8. 多表面实验按 Session ID、Event ID 和 Artifact Hash 对齐，独立 Eval 只看目标产物，不以某个客户端动画宣布成功。

局部缓存需要明确权威关系。断线、Event Gap 或 Digest 不一致时丢弃未确认投影并重建基线；客户端 Draft 可以保留，但必须标明尚未提交，不能出现在服务端会话审计中。

取消路径不能只更新 UI。客户端发 Cancel 后保存请求 ID，等待服务端 Run 状态与未完成 Tool Part 收敛；超时则标记 cancellation-unknown，并查询真实文件、子进程和远端调用。按钮变灰不构成副作用已停止的证据。

附件和路径要在连接边界显式转换。客户端本地文件若需发送到远端 Server，应上传内容或使用受控映射，不能把本地绝对路径当远端路径；WSL 与 Windows 路径转换也必须记录方向和失败。

## 贯穿案例

假设用户用 CLI Run 创建会话，Web App 与 ACP 随后连接同一远端 Server。CLI 在工具执行中断线，Web 继续显示进度，ACP 将 Tool Part 映射成编辑器更新；Desktop 通过 WSL 连接另一个 Server，恰好有同名路径。案例验证共享事实、局部状态和路径归属。

实验为每个连接生成 Server Key，并在本地缓存中故意预置同名 Session。正确实现只复用 Server A 的 `s1`；Server B 的记录即使 ID 相同，也属于不同命名空间。这个故障夹具能发现缓存键只使用 Session ID 的缺陷。

```json
{
  "serverA":{"id":"remote-a","directory":"/repo","session":"s1"},
  "clients":["cli-run","web","acp"],
  "serverB":{"id":"wsl-b","directory":"/repo","session":"s1"},
  "fault":"cli-disconnect-during-tool"
}
```

1. CLI 先订阅 Server A 事件，再提交 Prompt。Web 与 ACP 读取相同 Session 基线，各自保存 Tab/Draft 与 Mode，不把这些字段写入 Message。
2. Tool Call 开始后 CLI 断线，Server A 继续运行。Web 收到完成 Event，ACP 产生协议 Session Update；CLI 重连后用 Cursor 补齐事件。
3. 三个客户端按 Message/Part ID 核对服务端事实，格式化文本和协议 Content Block 允许不同；文件 Artifact Hash 必须一致。
4. ACP 无法表达某个私有 Metadata 时记录 mapping-loss，不从编辑器视图删除原始 OpenCode 事件。
5. Desktop 连接 Server B。尽管路径和 Session ID 字符串相同，Server ID 不同，客户端不得把 B 的事件合并到 A。
6. 用户从 Web Cancel 时，服务端 Run 收敛；所有表面重新读取状态，并检查工具副作用是否已提交。

```json
{
  "shared":{"server":"remote-a","session":"s1","artifactDigest":"matched"},
  "local":{"webDraft":"retained","tuiSelection":"not-shared","acpMode":"editor-local"},
  "mapping":{"acp":"partial-private-metadata-recorded"},
  "isolation":{"wslServer":"kept-separate"},
  "eval":"pending-final-tests"
}
```

若 Web 乐观显示 Tool completed 而服务端随后返回 error，客户端必须回滚；若 TUI Spinner 停止而 Session 仍 busy，则判表现层错误。最终测试失败时，所有表面即使正确同步也不能把任务标成通过。这个案例把连接成功、视图收敛、协议映射和产品正确拆成四项验收。

再让 ACP 收到未知 Part 类型。Adapter 应保留占位更新与原始事件引用，不能静默当作普通文本；若该 Part 影响工具终态，客户端将 Session 标为 partial，禁止宣布完成。

第二个变体从 Web 上传本地附件到远端。测试要求远端 Session 保存内容哈希和上传 Artifact，不尝试读取客户端路径；路径无法映射时返回明确错误。桌面 WSL 桥接按相同原则验证。

最后并发修改同一 Session：Web 提交 steering，TUI 同时 Cancel。服务端事件顺序成为权威，两个客户端重建后应收敛到同一 Message/Part Digest；各自 Draft 与选中状态仍独立。冲突可见性属于产品质量，不能靠最后写入覆盖隐藏。

该并发结果还要关联最终文件哈希和未决工具清单，避免客户端状态一致却共同遗漏后台副作用。

验证记录必须可追溯。

长期保存。

## 真实输入与输出

### 输入

```json
{"surface":"单次终端 | 交互终端 | 桌面 | 网页应用 | 编辑器协议","server":"进程内或远端","directory":"项目目录","session":"新建、继续或派生","prompt":"用户请求"}
```

### 输出

```json
{"shared":{"project":"服务端项目","session":"持久会话","events":"核心事件"},"local":{"view_state":"每个客户端独立","transport":"进程、HTTP 或标准输入输出"},"verdict":"仍需检查真实产物"}
```

## 调用链

![OpenCode 同一服务核心向单次终端、交互终端、网页应用、桌面应用和编辑器协议投影，各客户端拥有独立视图状态与传输边界的中文表面架构图](../../../assets/diagrams/opencode/07-tui-desktop-web-acp-surfaces.svg)

Claim: opencode.surfaces.project-shared-but-state-distinct

Claim: opencode.acp.events-are-projections

1. CLI 解析 Run/Mini/TUI 的 Directory、Session、Continue、Fork、Attach、Model、Agent 和输出格式。
2. 本地模式启动进程内 Server/Worker，Attach 模式连接已有地址；两者都通过客户端开发包操作 Session。
3. Run 创建或恢复会话，先订阅事件，再发 Prompt/Command；循环输出 Message Part、Tool、Error、Permission，并在 Session Idle 时结束。
4. TUI 通过 Worker Fetch 与 Global Event Source 构建交互客户端，维护选择、输入、弹窗、历史回放和终端尺寸等局部状态。
5. App 以 Server Key 决定重挂载边界，再按 Directory 建立 SDK/Sync Provider；Session、Draft、Tab 和 Comment 使用不同持久化键。
6. Desktop Renderer 提供本地与 WSL Server Connection，把原生生命周期和 Web UI 组合起来，但会话数据仍由所选服务端提供。
7. ACP Agent 接受编辑器请求，ACP Service 选择或创建 OpenCode Session，并启动 Event Subscription；核心事件被转换为 Session Update。
8. 每种客户端显示结果后，验证程序回到服务端消息、工作树、测试与 Artifact，避免用某个表面的动画或 Stop Reason 代替任务结论。

## 源码证据

Run 源码在文件头就区分单次、进程内交互和远端 Attach；事件循环追踪父会话与子会话，并以目标 Session Idle 结束输出。

```source
packages/opencode/src/cli/cmd/run.ts:693-835
for await (const event of events.stream) {
  if (event.type === "session.created" && event.properties.info.parentID) ...
  if (event.properties.status.type === "idle") break
}
```

TUI 的网络或进程内传输都被包装成 Fetch 与 Event Source，界面层消费统一事件而不是直接持有 Session Service。

```source
packages/opencode/src/cli/cmd/tui.ts:24-52
function createWorkerFetch(client: RpcClient): typeof fetch
function createEventSource(client: RpcClient): EventSource
```

App 明确以 Server Identity 控制 Provider Remount，再在 Directory Scope 建立数据同步；这说明 Server State 与 UI Route/Tab State 是不同层。

```source
packages/app/src/app.tsx:119-124
<ServerSDKProvider server={conn}>
  <ServerSyncProvider server={conn}>{props.children}</ServerSyncProvider>
</ServerSDKProvider>
```

ACP Agent 只是协议入口，所有方法继续委托 Service 并统一映射错误。

```source
packages/opencode/src/acp/agent.ts:26-89
newSession(params: NewSessionRequest) {
  return run(this.service.newSession(params))
}
prompt(params: PromptRequest) {
  return run(this.service.prompt(params))
}
```

## 失败与限制

第一，Attach 的 Directory 是远端服务端路径，不一定存在于客户端本机。显示相同字符串不能证明两端文件系统一致，尤其在 WSL、容器或远程主机中。

第二，事件先订阅再 Prompt 可以减少竞态，但断线仍需基线与重放。终端输出若只保留格式化文本，会丢失原始 Event ID、Tool Metadata 和 Error Shape。

第三，App 的乐观更新和客户端缓存用于交互速度，不是权威持久记录。多窗口或多客户端修改同一 Session 时要处理重复、乱序、归属和清理。

第四，Desktop 与 Web 复用 UI 不代表安全边界相同。Desktop 可拥有原生桥接、进程启动和本地文件权限；浏览器受 Origin、网络和服务端授权约束。

第五，ACP 的 Stop Reason、Tool Kind、Content Block 与 Usage 是协议投影。映射可能丢失 OpenCode 私有 Metadata，也可能因协议版本对新事件没有表达。

第六，不同表面可以使用相同 Session，却采用不同 Agent/Model/Variant 或本地输入附件。复现实验必须记录操作表面、连接方式和当时有效配置。

## 验证方法

启动一个测试 Server，分别用单次 Run、TUI Attach、App 和 ACP 连接同一 Directory。创建会话后从另一客户端恢复它，核对 Session ID、Message/Part 与文件产物一致，同时确认 Tab、选中项、窗口和协议 Mode 等局部状态不会互相冒充服务端事实。

在 Tool Call 中途断开 Run 与 ACP，随后重新连接并读取 History/Events。保存原始事件与各表面的呈现结果，对比文本、工具状态、权限请求、附件、Usage、Error 和 Stop Reason 映射。

再用本机路径、WSL 路径和远端路径测试 Directory Scope，确认客户端没有把本地路径错误发送给远端服务。最后让两个客户端并发操作同一会话，验证事件幂等、归属过滤和冲突可见性。

## 自检

### 问题 1

多个表面是否运行多套不同 Agent Loop？

**答案：** 通常不是。它们可共享服务端项目、会话和事件核心，但拥有不同传输与客户端状态。

### 问题 2

客户端 Tab 或 Draft 属于服务端 Session 事实吗？

**答案：** 不一定。它们多是界面局部或客户端持久状态，需与服务端消息分开。

### 问题 3

ACP Session Update 是原始 OpenCode Event 吗？

**答案：** 不是透明原样转发，而是 Adapter 对核心状态的协议投影。

### 问题 4

Attach 时 Directory 应按哪台机器解释？

**答案：** 按远端 Server 的文件系统解释，不能默认等同于客户端本地路径。
