---
title: OpenHands Agent Canvas：多后端控制平面与仓库边界
article_type: sample
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"openhands","path":"src/api/agent-server-client-options.ts","commit":"861e9ef501730e3b194cb0345a1ae2b04cfe68f1"},{"repo":"openhands","path":"README.md","commit":"861e9ef501730e3b194cb0345a1ae2b04cfe68f1"}]
---

# OpenHands Agent Canvas：多后端控制平面与仓库边界

## 样本定位

当前锁定的 OpenHands 仓库自述为 Agent Canvas：一个面向编码 Agent 与自动化的自托管控制中心。它可以启动会话、登记和切换后端，并把不同 Agent Server 投影到统一界面。这个定位与早期常见的「OpenHands 单体 Agent 仓库」印象不同，所以本专题首先固定仓库责任，不用项目名推导当前源码一定包含 Agent Loop、工具实现或沙箱运行时。

Agent Canvas 的独特价值在于展示控制平面怎样把多个 Agent 后端组织成可操作产品。它可以连接本地、远端、云端或 ACP 兼容 Agent，但这些名称只是连接类别。真实后端是否存在、运行在哪里、具有何种隔离和版本能力，都需要从有效配置、网络探测、服务信息与部署证据逐层确认。

![OpenHands Agent Canvas 多后端控制平面](../../assets/diagrams/samples/openhands-agent-canvas.svg)

## 独特机制

Canvas 调用 Agent Server 时不是使用一个永久写死的全局地址。`getAgentServerClientOptions` 每次读取有效本地后端，并允许当前调用以 host、conversationUrl、sessionApiKey、apiKey、workingDir 和 timeout 覆盖。没有后端且没有显式地址时抛出 `NoBackendAvailableError`，避免悄悄落到未知目标。Claim: openhands.canvas.active-backend-builds-client-options。

地址与凭证的优先级体现了控制平面需求：会话级密钥优先于调用级密钥，再优先于登记后端密钥；显式 host 或 conversation URL 可以覆盖后端地址；工作目录来自调用覆盖或 Agent Server 配置。这里的 workingDir 只是发送给后端的运行参数，不能从字符串存在推断后端使用了容器挂载、路径白名单或文件系统隔离。

仓库 README 进一步给出多仓库责任表。当前仓库负责 Agent Canvas 前端、用户控制中心、后端选择和本地栈编排；`software-agent-sdk` 负责 Python SDK、Agent Server、Agent、工具、会话、工作区和事件；`automation` 负责自动化定义、计划、Webhook、运行历史与派发。Claim: openhands.canvas-repository-is-control-plane。

因此自动化链要拆成「何时运行」与「运行什么」。Automation Server 根据计划或事件决定派发时机，Agent Server 与 SDK 决定会话和 Agent 执行；Canvas 提供配置和观察入口。若只看到 Canvas 页面成功创建一条自动化，最多证明控制对象被登记，不能证明计划器触发、派发成功、Agent 完成或下游集成收到正确结果。

## 源码入口

先读 `source:openhands:README.md:139` 到 `150`，把仓库责任写成边界表。然后读 `source:openhands:src/api/agent-server-client-options.ts:42` 到 `80`，核对 host、apiKey、workingDir 与 timeout 如何组合。两者配合可以防止最常见的误读：把客户端路由代码当成 Agent 内核，或把「支持某后端」当成后端已经部署。

继续分析时可沿 `backend-registry` 查看后端登记和活动选择，再沿具体 API service 查看客户端参数何时构造。每个能力应记录四个对象：Canvas 中的配置记录、最终请求地址、Agent Server 返回的版本与能力、实际会话产物。任何一项缺失都应标为部分可用或不可核对。

## 实现接缝

后端登记与客户端构造之间的接缝是当前有效 Backend 加调用覆盖。构造器每次请求都解析 host、conversation URL、会话密钥、API Key、工作目录和超时，并保存来源优先级；没有可用地址就明确失败。实现不应把上次活动后端缓存成永远有效，更不能在会话切换时复用错误主体的密钥。

Canvas 与 Agent Server 的接缝是一份版本化客户端协议。连接成功后先读取服务信息与能力，再创建或恢复会话；事件、Artifact 和终态都归后端 Session，Canvas 只维护投影与局部界面状态。workingDir 是请求参数，服务端还必须自行解释和约束路径；客户端不能用一个字符串替后端证明挂载或沙箱。

Automation 与 Agent Server 的接缝则由派发记录连接。计划或 Webhook 产生 dispatch ID，派发创建具体 Session，后端结果再回到运行历史。创建自动化、派发成功、会话结束和任务通过是四个状态。教学测试应在每个边界注入失败，确保控制平面不会用绿色配置卡片掩盖未触发或错误产物。

## 运行链

1. 用户或配置注册一个后端，Canvas 保存地址、类别和所需认证信息。
2. 当前界面选择有效后端；会话也可以携带独立地址、密钥和工作目录覆盖。
3. 客户端参数构造器按优先级产生 host、apiKey、workingDir 与 timeout。
4. TypeScript 客户端调用 Agent Server，服务端创建或恢复会话并运行具体 Agent。
5. 事件和状态返回 Canvas；自动化服务则可以从计划或 Webhook 独立派发会话。
6. 外部验证读取服务端产物与目标系统状态，而不是只读取 Canvas 的成功提示。

ACP 兼容 Agent 同样遵循这个责任链。协议兼容描述的是客户端和 Agent 进程能够交换初始化、提示、工具与会话事件，不保证每个 Agent 暴露相同工具、权限模型、上下文恢复或终止语义。对 Claude Code、Codex、Gemini 等名称的展示应当作可选适配表面，实际能力按各自锁定版本和后端配置验证。

## 与一级主线的关系

OpenHands Agent Canvas 作为扩展样本，补充六条一级主线中的「多后端控制平面」视角。Codex、Gemini CLI、Claude、pi 与 OpenCode 的一级文档从各自可核对源码解释核心循环与表面；Canvas 重点展示一个产品怎样把多个异构 Agent 放到统一入口，而不会被提升为第七条全面主线。

这个视角也强化 Eval 的横切定位。Canvas 可以收集会话、事件与自动化运行历史，但这些记录仍是评测输入。独立 Eval Harness 必须冻结任务、目标后端、有效配置、Agent 版本与产物，区分客户端错误、后端不可达、Agent 产品失败和评分器失败。控制中心的绿色状态不能代替独立发布留出集。

## 适用边界

Agent Canvas 适合组织多个异构后端、提供用户入口、切换会话和观察自动化；当团队需要统一身份、配置和运行历史时，控制平面具有独立价值。单一离线 Agent 或完全嵌入式库可能不需要这层服务化成本，也不能因没有 Canvas 就判为能力不足。

本样本只证明锁定仓库的控制平面责任与客户端参数优先级。后端名称、下拉框或 server info 不证明 Agent、工具、隔离、认证和生产可用性；这些结论要落到 software-agent-sdk、真实部署与受控 Trial。多后端比较必须固定版本和环境，不能把控制中心的一致界面误写成后端语义一致。

## 失败与限制

第一类误判是仓库身份漂移。若不读当前 README 的责任表，就可能把 Canvas 的 API 调用和后端选择描述成 OpenHands Agent 内部决策。第二类误判是部署推断：后端类型为 Docker、VM、remote 或 cloud，只表示登记或选择信息，不证明对应实例正在运行，更不证明隔离配置符合安全要求。

第三类误判是客户端成功等于任务成功。HTTP 请求返回、会话创建、事件流结束或自动化显示完成，都可能发生在任务产物错误的情况下。还要注意多后端之间的版本、认证、工作目录和工具能力并不天然一致；切换后端可能改变模型输入、权限请求与可见工具，需要把有效参数纳入试验血缘。

## 验证方法

控制平面验证至少包含三类实验。无后端实验确认没有地址时明确失败；覆盖优先级实验为登记后端和会话设置不同地址与密钥，检查最终客户端参数；真实后端实验调用 server info、创建受控会话并验证产物。若研究自动化，再单独固定触发事件、派发记录、会话 ID 和下游结果。

安全验证要落到真实部署。记录进程或容器身份、挂载、网络策略、工作目录解析和凭证作用域；不要用 Canvas 下拉框文字充当证据。评测验证则以 Trial 为统计单位，基础设施错误可以创建 Attempt 恢复，Agent 给出错误结果不能靠重新派发从分母中删除。

## 自检

### 问题 1

当前仓库是否包含完整 OpenHands Agent Loop？

**答案：** 不能这样声称。锁定仓库明确把 Agent 与规范服务端实现归到 software-agent-sdk。

### 问题 2

选择 Docker 后端是否证明容器隔离？

**答案：** 不证明。必须检查真实进程、容器配置、挂载和网络边界。

### 问题 3

Canvas 会话结束是否就是任务通过？

**答案：** 不是。结束属于客户端和服务端生命周期，任务结果仍由冻结契约和独立评分器判定。

### 问题 4

为何仍值得收录？

**答案：** 它提供了多后端控制平面、仓库分责和自动化派发边界，是六条一级主线之外的重要机制样本。
