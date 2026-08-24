---
title: 六类 Harness 的编排、扩展、协议与产品表面
article_type: comparison
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/plan/plan-mode/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"codex","path":"codex-rs/skills/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"gemini-cli","path":"packages/core/src/utils/extensionLoader.ts","commit":"5411f113cafae26161b4969b0237b8e1e024e2c2"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"pi","path":"packages/coding-agent/src/core/extensions/loader.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"opencode","path":"packages/opencode/src/skill/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# 六类 Harness 的编排、扩展、协议与产品表面

## 比较问题

当一次任务需要子任务、专用说明、远端工具或多个客户端时，Harness 会增加新的控制层。Agent/Subagent 可能创建独立会话，Skill 把说明放进上下文，Plugin/Hook 改写行为，MCP 连接外部能力，服务协议把核心暴露给终端、网页、桌面或编辑器。它们都叫「扩展」，风险和生命周期却完全不同。

本篇用六个状态判断扩展：是否被发现、是否被启用、是否连接成功、是否对模型可见、是否得到权限、是否实际执行成功。协议和客户端再增加第七个问题：呈现出的状态是否只是核心事实的投影。比较重点落在边界与失败归属，不统计插件数量。

![六类 Agent Harness 的子任务、技能、插件、钩子、模型上下文协议与客户端表面围绕共享任务核心扩展，并经过发现、启用、连接、可见、获批和执行六个阶段的中文架构图](../../assets/diagrams/comparisons/04-orchestration-protocol-surfaces.svg)

## 共同抽象

扩展能力先按责任形态分类，再按生命周期比较。Subagent 改变任务与状态所有权，Skill 改变模型上下文，Plugin/Hook 在宿主内执行代码，MCP 通过协议连接外部能力，客户端协议则投影核心状态。它们可以在同一个产品设置页出现，却不能共享一条「已启用」语义。

生命周期使用六级状态：`discovered` 表示找到声明，`enabled` 表示当前配置选择，`connected` 表示进程或远端握手成功，`visible` 表示能力进入当前模型或客户端视图，`authorized` 表示本次调用获准，`executed` 表示真实结果已产生。每一级都保存主体、作用域和失败原因；前一级成功不能推出后一级成功。

编排关系用父子血缘描述。父任务派生子任务时要记录 Parent/Child ID、上下文选择、模型与预算、权限派生、取消传播和结果 Artifact。父任务中的摘要是对子轨迹的投影，不能成为唯一证据。函数式子任务也可以使用同一记录方式，只是隔离和恢复能力可能更弱。

多客户端使用「核心事实、协议投影、局部状态」三层。服务端 Message、Part、Session 与 Artifact 属于核心事实；ACP、SDK 或事件流把它们映射为协议对象；Tab、窗口、草稿和选中项属于客户端局部状态。比较协议可靠性时检查快照、Cursor、重连和去重，不要求局部状态在客户端间复制。

## 控制变量

比较固定一个父任务和一个只读子任务。子任务只能读取指定目录并返回结构化摘要；外部工具由同一个本地测试服务提供；客户端分别记录进程内、远端服务和编辑器协议三种连接。每方保存 Parent/Child ID、模型、上下文、权限、工具 Schema、协议版本、事件序列与最终文件。

扩展类型不能混测。Skill 实验只观察提示资产是否被发现和注入；Plugin/Hook 实验记录进程权限与改写点；MCP 实验区分配置、认证、连接、能力枚举和调用；Subagent 实验核对独立 Session、取消、预算和结果投影。把它们放进一个「扩展已启用」布尔值会失去诊断价值。

客户端比较需要同一个服务端 Project/Session。终端、网页、桌面和编辑器协议都连接该会话，随后检查服务端 Message/Part 与文件是否一致，同时保留各自的 Tab、窗口、格式、选中项、草稿和协议 Mode。共享核心不要求客户端局部状态同步。

## 对照证据

机器矩阵位于 `evidence/matrices/04-orchestration-protocol-surfaces.yml`。主 Claim 表达扩展如何改变运行表面，正文链接补充协议与客户端证据。

| 主线 | 编排与扩展中心 | 表面与边界 | 主 Claim |
| --- | --- | --- | --- |
| DSH | Goal、Todo、Subagent、Workflow、Skill、MCP、代码运行时 | Web、Host、ACP、SDK 复用核心但适配不同 | `deepseek-harness.orchestration.extensions-share-core-loop` |
| Codex | Skill、Hook、MCP、Connector、Code Mode、Subagent | CLI、TUI、App Server、Cloud、SDK 为协议投影 | `codex.extensions.capabilities-are-dynamically-assembled` |
| Gemini CLI | Agent、Hook、Skill、MCP 与 Extension Loader | CLI、IDE、Headless 输出拥有不同交互责任 | `gemini-cli.extensions.capabilities-are-dynamically-assembled` |
| Claude | MCP、Agent、Skill 配置与 Python SDK MCP Bridge | Query、Client、CLI 和闭源产品不能互换 | `claude.extensions.configuration-is-not-execution` |
| pi | Extension 可改变 Prompt、工具与事件 | Protocol、Server、Client、TUI 跨进程投影 | `pi.extensions.can-change-runtime-surfaces` |
| OpenCode | Agent、Skill、Plugin、MCP、LSP | Server/Protocol/SDK 支撑 TUI、Web、Desktop、ACP | `opencode.extensions.change-runtime-surfaces` |

DSH 的 Plan/Goal/Todo/Subagent 与 Workflow 都围绕核心 Agent Loop 组合，Skill、MCP、Extension 和 Code Runtime 再改变上下文与能力。ACP、Web、Host 和 SDK 需要保持协议适配边界，见 [DSH 编排与扩展](../harnesses/deepseek-harness/06-orchestration-extensions.md)。

Codex 将 Subagent 作为线程作用域对象，Skill 与动态能力装配会改变模型可见表面，Code Mode 还会重组工具入口。CLI/TUI/App Server/Cloud/SDK 共享部分核心与协议，却不拥有完全相同的交互和权限语义，见 [Codex 扩展和 Code Mode](../harnesses/codex/06-extensions-code-mode.md)。

Gemini CLI 的 Agent、Hook、Skill 和 MCP 经配置、加载与策略层进入运行时。CLI、IDE 与 Headless 输出分别处理确认、展示和结构化协议；同一事件在不同表面可被格式化成不同结果，见 [Gemini CLI 扩展](../harnesses/gemini-cli/06-agents-hooks-skills-mcp.md)。

Claude 需要区分闭源产品配置和 SDK 实现。Python SDK 的 MCP Bridge 可以核对进程内工具调用，Agent/Skill/MCP 的产品行为按官方契约说明；配置声明不证明服务在线、能力枚举成功或实际执行。见 [Claude MCP、Agent 与 Skill](../harnesses/claude/06-mcp-agents-skills.md)。

pi 的 Extension Loader 能修改 Prompt、工具、事件和产品行为，因此扩展是高权限运行代码，不等同于纯说明 Skill。Protocol/Server/Client 与 TUI 再把核心状态投影到进程边界之外，见 [pi 编码 Agent 与扩展](../harnesses/pi/04-coding-agent-prompt-extensions.md) 和 [pi 协议](../harnesses/pi/06-protocol-server-client.md)。

OpenCode 把 Agent/Subagent、Skill、Plugin、MCP 和 LSP 分成不同服务；Server-first 核心通过 Protocol 与 SDK 被多个客户端使用。ACP 事件是适配投影，Desktop/Web 的局部状态也不属于服务端会话事实，见 [OpenCode 扩展编排](../harnesses/opencode/05-agents-skills-plugins-mcp-lsp.md)。

## 差异解释

编排差异首先体现在子任务是否拥有独立状态。独立 Session 便于取消、预算、审计和并行，却需要父子血缘、权限派生和结果归属；进程内函数式子任务更轻，但隔离与恢复边界较弱。无论采用哪种形式，父任务收到的摘要都不能替代子任务完整轨迹。

扩展差异来自执行权限。Skill 通常改变模型输入，Plugin/Hook 可能在宿主进程内运行，MCP 跨协议触达外部服务，LSP 启动语言服务器。发现一个目录、解析一份配置或列出一个工具，只代表链路中的早期状态。产品 UI 应把认证失败、连接失败、权限拒绝和执行错误分开呈现。

协议差异决定多客户端一致性。类型化 Schema 可以稳定请求和事件形状，但无法保证服务端副作用与任务正确。客户端需要初始快照、Cursor、重连、去重和作用域过滤；如果只订阅增量，会漏掉连接前状态。多个表面共享 Session 时，用户还需要知道自己连接的是哪个服务端目录。

这里也没有按扩展数量选赢家。可扩展性越强，供应链、宿主权限、协议漂移和可观察性负担越大；内建能力越集中，治理容易，但定制空间有限。适用性取决于团队能否审核扩展代码、运行远端服务并维护协议兼容。

## 失败与限制

源码发现 Extension、Plugin 或 Skill 入口只证明系统存在加载能力。具体扩展是否安装、签名、受信、与锁定版本兼容以及是否默认启用，必须从部署 Artifact 取得。示例扩展也不能被写成内建安全保证。

MCP 连接可能停在配置、认证、传输、初始化、分页枚举或单次调用任一阶段。远端服务还拥有独立数据保留和权限边界。连接成功不证明返回内容可信，更不证明任务完成。

Subagent 的预算、模型和权限继承规则可能因配置变化。父会话取消后，子进程或远端任务是否停止需要实测；单纯收到取消确认无法证明外部副作用消失。

多客户端实验没有覆盖所有断网、乱序和版本漂移组合。闭源 Claude Code 内部扩展调度仍不可见，本篇只能比较公开表面。不同协议版本之间的字段映射需单独兼容测试。

## 验证方法

先为每方建立同名 Skill、宿主扩展和本地 MCP 工具，逐步关闭发现开关、制造认证失败、返回非法 Schema、拒绝权限与注入执行错误。记录失败发生在哪个状态，并确认 UI 不会把「已配置」显示成「可调用」。

再创建父任务与只读子任务，中途取消、断开并恢复。核对 Parent/Child ID、权限规则、模型、预算、工具副作用和完整子轨迹；父任务摘要中的每个关键结论都应能回到子 Artifact。

最后让两个客户端连接同一服务端会话。一个客户端执行受控工具，另一个从初始快照和事件流合并状态；断线重连后检查重复、漏事件和作用域。Tab、窗口和编辑器 Mode 保持各自局部，不得写入共享任务结论。

## 迁移练习

选择一个支持两种以上扩展形态的新 Harness，分别建立一项纯说明 Skill、一个能观察工具调用的宿主扩展和一个本地 MCP 只读工具。对三者逐级记录发现、启用、连接、可见、获批、执行；让 MCP 在认证、初始化和单次调用三个位置分别失败，确认状态不会从「已配置」直接跳成「可用」。

随后创建父任务和只读子任务。限制子任务只能访问一个 fixture 目录，中途取消并恢复父任务，核对子任务是否继续、权限是否扩大、预算是否独立以及父摘要能否回到子 Artifact。再让两个客户端连接同一 Session，一个执行工具，另一个断线后从快照和 Cursor 恢复；重复事件必须去重，局部草稿不能进入服务端事实。

交付物包括扩展六级状态表、父子血缘图、两份客户端状态快照和失败注入日志。验收者应能分辨说明注入、宿主代码、远端能力和协议投影的信任域，并能指出取消确认不等于外部副作用停止。练习不按扩展数量打分，只评价边界是否可观察、失败是否可归属。

## 自检

### 问题 1

扩展被发现是否意味着模型能够调用？

**答案：** 不意味着。还要经过启用、连接、能力枚举、模型可见、权限和真实执行等状态。

### 问题 2

Skill 与 Plugin 为什么不能放在同一安全等级？

**答案：** Skill 主要进入提示上下文，Plugin/Hook 往往运行代码并继承宿主能力，副作用和供应链风险不同。

### 问题 3

多个客户端连接同一 Session，会共享所有状态吗？

**答案：** 不会。服务端消息和产物可共享，Tab、窗口、格式、草稿和协议模式等客户端状态具有独立生命周期。

### 问题 4

父任务收到子任务摘要后还要保存什么？

**答案：** 保存子会话标识、完整轨迹、权限、工具副作用和产物血缘；摘要只是投影，不能独占证据。
