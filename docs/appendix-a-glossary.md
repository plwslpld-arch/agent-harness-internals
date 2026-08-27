# 术语表：同一个词在六套 Harness 中可能不是同一对象

[返回学习入口](00-start-here.md)

这份词表先说明一个术语在不同项目间共享的大致含义，再提醒你各项目可能怎样使用它。它只是入口。遇到具体行为时，仍要回到对应课程和锁定源码逐项核对。

## 完整术语对照

正文保留英文术语，因为它们要和源码里的标识符对得上。这张表给出每个词的中文译名和
它在本仓库里的具体所指，正文每篇第一次出现某个术语时也会在括号里带上译名。
下面按主题分的几节讲的是同一个词在六套实现之间的差异，那是另一层问题。

| 英文 | 中文译名 | 在本仓库中的含义 |
| --- | --- | --- |
| ACP | Agent 客户端协议 | 连接编辑器等客户端与 Agent 进程的开放协议，规定会话、消息、工具和权限请求的交互方式。 |
| ACP/A2A/RPC | 外部客户端或 Agent 间协议 | 协议投影不等于完整内部事件 |
| AbortSignal | 中止信号 | 在模型、工具和压缩链路中传播取消请求的标准信号，接收方仍需在安全边界响应它。 |
| Adapter | 适配器 | 把某个模型、协议、工具或存储实现转换成 Harness 统一接口的组件。 |
| Agent | 智能体 | 接收目标并通过模型、工具和状态管理持续推进任务的执行主体，不等同于单次模型调用。 |
| Agent Core | Agent 核心 | 承担模型调用、工具执行、状态更新和循环控制的核心模块。 |
| Agent Definition | 智能体定义 | 描述可被主 Agent 委派的子 Agent 配置，通常包含说明、Prompt、工具限制和模型选择。 |
| Agent Harness | 智能体框架 | 位于模型之外，负责输入装配、循环、工具、权限、状态和产品表面的运行程序。 |
| Agent Loop | 智能体循环 | 在模型推理、工具调用、结果回填和结束判断之间反复运行的核心控制流程。 |
| Agent Run | Agent 运行 | Agent 从接收输入到控制循环收敛的一次运行，pi 用它覆盖内外两层循环，Cline 还将根 Agent Run 作为 Checkpoint 边界。 |
| Agent SDK | 智能体开发工具包 | 供应用创建会话、发送消息、接收事件和配置工具或权限的开发接口，不等同于闭源产品内部实现。 |
| Agent Scope | 智能体作用域 | DeepSeek Harness 中限定当前 Agent 的依赖解析、工具可见性和局部限制，作用域内定义可以遮蔽全局定义。 |
| Agent Server | 智能体服务器 | OpenHands 中实际创建或恢复会话并运行 Agent 的后端服务，与负责界面和后端选择的 Canvas 分开。 |
| Agent Session | 智能体会话 | 承载智能体运行状态、输入队列和历史的会话对象；Gemini CLI 的 Legacy Agent Session 与当前 Turn/Scheduler 主链不是同一代实现。 |
| Agents | Agent 集合 | 系统中已配置、注册或发现的多个 Agent，包括主 Agent、子 Agent 或专用角色。 |
| Allow | 允许 | Permission 或 Policy 对当前工具动作给出的放行决定，只代表应用层许可，不等于操作已在沙箱中安全执行。 |
| App Server | 应用服务器 | Codex 把核心 Thread、Turn 和 Event 暴露给 JSON-RPC 等多种传输入口的服务层。 |
| Approval | 审批 | 用户或策略对某次受限工具调用、命令执行或资源访问作出的允许决定。 |
| Approval Policy | 审批策略 | 决定遇到额外权限请求时能否询问用户，它不负责选择沙箱边界，也不等于请求已经获准。 |
| Approval/Confirmation | 用户或宿主对一次请求的决定 | 不证明用户理解全部副作用 |
| Architect | 架构师 | 负责分析代码结构并先产出实现方案的 Agent 角色，不等同于软件架构师职级。 |
| Artifact | 产物 | Agent 执行后留下的可交付对象，例如代码文件、补丁、报告、日志或评测记录。 |
| Ask | 询问 | Permission 或 Approval Policy 暂停当前动作并等待用户或 Answerer 决定的分支，其默认行为和授权范围随项目而异。 |
| Assistant | 助手 | 消息协议中代表模型输出的一方，不等同于包含工具和运行时的完整 Agent。 |
| Assistant Message | 助手消息 | 角色为 Assistant 的具体消息对象，可承载文本、工具调用或其他结构化内容。 |
| Attach | 附加 | 把客户端连接到已有运行边界的操作，pi 用它取得 Session 占用权，OpenCode 的远程 Attach 使用服务端目录。 |
| Attempt | 尝试 | 一个 Trial 内的一次运行尝试，只有未产生业务副作用的可恢复基础设施故障才适合自动重试，并且每次记录都要保留。 |
| Bash | Bash 命令行 | Harness 调用 shell 命令时常用的命令解释器，也是部分工具名称或执行环境。 |
| Builder | 构建者 | 教材中追踪配置或状态变量如何改变运行行为的进阶读者层级。 |
| Bundle | 打包包 | 把运行所需的代码、配置或资源组合成一个可加载或分发单元，不同项目的 Bundle 内容不同。 |
| CHANGELOG | 变更日志 | Claude TypeScript Agent SDK 课程用它核对版本声称新增或修复的行为，但不能据此推断未公开的运行时实现。 |
| Cache | 缓存 | 教材主要指 Provider 对稳定 Prompt 前缀的复用，不表示 Harness 在本地保存了一份模型 KV Cache。 |
| Call | 调用 | 模块向模型、工具或服务发起的一次请求，正文会根据调用对象区分 Model Call 和 Tool Call。 |
| Canvas | 画布 | 用于展示、编辑或承载 Agent 生成内容的可视区域，不同项目可能对应文档、代码或交互组件。 |
| Checkpoint | 检查点 | 在任务执行过程中保存的可恢复状态节点，可包含会话、工作区或消息状态。 |
| Chunk | 数据块 | 流式处理中分批到达的数据块，在模型层是增量响应，在协议传输层也可能只是任意大小的字节段。 |
| Client | 客户端 | 发起请求并消费 Agent、模型或工具服务响应的一侧，可能是 SDK、CLI 或图形界面。 |
| Code Mode | 代码模式 | 让模型生成并执行代码来编排多个工具或处理数据的运行方式，而不是逐个直接发起工具调用。 |
| Coding Agent | 编程智能体 | 面向代码仓库执行阅读、修改、测试和调试任务的 Agent，通常具备终端与文件工具。 |
| Command | 命令 | 在 pi Protocol 中是等待同步 Response 的控制请求，在 pi Extension 中也可指注册命令，而 Codex Hook 中则是程序配置。 |
| Compaction | 上下文压缩 | 上下文接近容量限制时，把较早内容整理成摘要或精简状态以便继续执行。 |
| Companion | 伴随组件 | DeepSeek Harness 中由各包提供的动态检查组件，负责安装该包特有的事件监听器和约束检查。 |
| Compression | 压缩 | 用摘要和保留尾部缩短模型可见历史的过程；Gemini CLI、pi、Codex 和 OpenCode 的持久化方式不同。 |
| Config | 配置 | 控制模型、工具、权限、路径和运行行为的配置对象或配置文件。 |
| Confirmation | 确认 | Agent 继续执行前向用户发起的是非确认，通常用于核对意图或高影响操作。 |
| Context | 上下文 | 当前模型请求能够看到的消息、工具结果、指令和运行状态，不同项目的拼装与截断规则不同。 |
| Context/Surface | 下一次模型实际可见的有界历史投影 | 不是完整审计记录 |
| Core | 核心层 | 各项目中承载主要状态与控制循环的核心模块，Gemini CLI、pi、Codex 和 Cline 对其边界与职责划分不同。 |
| Core Config | 核心配置 | Gemini CLI 在 CLI Settings 合并后接手系统指令、项目 Memory、工具声明和 Gemini Client 初始化的核心配置对象。 |
| Cursor | 游标 | 标记分页或事件流消费位置的续读凭据，重连时用于恢复增量并处理重复或过期事件。 |
| Deny | 拒绝 | 对权限请求或受限操作作出的不允许决定，Agent 应停止该操作或选择其他路径。 |
| Desktop | 桌面端 | 通过服务协议访问共享 Agent 核心的桌面应用表面，其窗口和选中状态不属于服务端 Session。 |
| Diff | 差异 | 文件修改前后的逐行对比，用来审查 Agent 实际新增、删除和替换了什么。 |
| Directory | 目录 | OpenCode 用它建立 Project/Instance 并划分配置、事件和会话，远程 Attach 时它指服务端路径。 |
| Driver | 驱动器 | DeepSeek Harness 唤醒 Agent、推进 Turn 并把运行状态收敛到 Idle 或错误终态的控制层。 |
| Editor | 编辑器 | 用户查看和修改代码的界面，也是部分 Harness 接收选区、文件状态和诊断信息的入口。 |
| Entry | 条目 | 表示集合中的一个记录；在 DeepSeek Harness 中可指 Cordis 挂载项，在 pi 中可指会话树节点。 |
| Environment | 运行环境 | Agent 执行时可见的工作目录、系统变量、运行时、依赖和权限边界。 |
| Error | 错误 | 记录模型、工具、权限、协议或基础设施失败的状态，不同来源必须保留各自阶段和语义。 |
| Escalation | 经策略允许后，以更宽权限重新尝试 | 不应被理解为永久授权 |
| Eval | 评测 | 用固定任务、运行轨迹和判定规则检查 Agent 是否完成目标，而不只比较模型回答文本。 |
| Eval Harness | 评测框架 | 在受控任务、配置和工作区中运行 Agent 并保存 Artifact 的框架，最终分数仍由外部 Scorer 产生。 |
| Evaluator | 评估器 | 根据预期结果、轨迹或评分规则判断一次 Agent 运行表现的组件。 |
| Event | 事件 | Agent 运行过程中发出的结构化通知，用来驱动界面更新、日志记录或后续处理。 |
| Event Log | 事件日志 | DeepSeek Harness 用它追加保存 Turn、Step、消息、工具、审批、压缩和错误，模型看到的 Surface 只是其有界投影。 |
| Event Log/Rollout | 追加式运行记录 | 比模型 Context 包含更多事实 |
| Events | 事件 | 运行过程中产生的状态变化记录；不同项目的核心事件、持久化事件和对外协议事件范围不同。 |
| Exec Policy | 执行策略 | Codex 对命令请求给出允许、询问或禁止判断的策略层，与用户审批和操作系统沙箱分开。 |
| Executor | 执行器 | Gemini CLI 的 Tool Executor 归约工具终态，Hook Executor 和 Local Executor 则分别执行 Hook 计划与本地子会话。 |
| Extension | 扩展 | 通过公开接口给 Harness 增加能力的模块，不同项目可能把工具、事件处理器或命令都称为 Extension。 |
| Extensions | 扩展 | 为 Harness 增加工具、Hook、Skill、Prompt 或产品能力的扩展机制，各项目的加载和信任边界不同。 |
| Feedback | 反馈 | 与消息或 Session 身份关联的用户评价信号，可以进入记录或训练管道，但不是任务正确答案。 |
| FinishReason | 结束原因 | Provider 对当前一次模型响应为何停止的标记，各家枚举和映射不同，也不能单独判定整个任务已经结束。 |
| Follow | 跟随 | 让读取或展示持续追随新产生的消息、事件或日志，具体跟随对象随项目而异。 |
| Fork | 从已有历史建立新分支身份 | 后续写入不应污染原会话 |
| Frame | 帧 | pi 协议中带 Header 和 Payload 的完整字节单元，传输层要先从 Byte Chunk 中拼出它，再进行 CBOR 解码和 Schema 校验。 |
| Function Call | 函数调用 | 模型响应中带名称、参数和调用标识的请求，Harness 会将它路由到工具处理器并按原标识写回结果。 |
| Future | 异步计算 | Codex 用它表示尚未完成的异步工作，既可控制 RunningTask，也可让工具并发推进后按原顺序写回结果。 |
| GEMINI | Gemini 项目指令文件 | 正文中的 GEMINI 指 GEMINI.md，它保存稳定的项目命令、目录约定和长期偏好，并在工作区受信且读取成功后进入新会话。 |
| Handler | 处理器 | 接收某类命令、消息、工具调用或事件并执行对应逻辑的入口函数或对象。 |
| Harness | 位于模型外部，负责输入装配、工具、权限、状态和产品表面的程序 | 不是模型本身，也不等于 Eval Runner |
| Header | 头部 | DeepSeek Harness 持久化影响请求前缀和恢复边界的配置快照，不等同于普通 HTTP 请求头。 |
| Headless | 无头模式 | 不启动交互界面的运行方式，DeepSeek Harness 用标准输出和退出码交付结果，并要求预先确定无人值守时的审批策略。 |
| History | 历史记录 | 会话中过去的消息和事件集合，用于恢复界面、构造上下文或继续运行。 |
| Holdout | 未用于训练和候选选择的隔离任务集 | 用于最终发布判断，防信息泄漏 |
| Hook | 钩子 | 挂在模型调用、工具执行或状态变化等节点上的扩展入口，用来观察、拦截或修改流程。 |
| Hooks | 钩子集合 | 一个项目公开的多个 Hook 入口及其处理函数，用来共同介入 Agent 的不同运行阶段。 |
| Host | 宿主 | 装载插件、注册全局能力并实际启动进程或服务的运行环境，与单个 Agent 的可见能力范围分开。 |
| IDE | 集成开发环境 | 承载代码编辑、诊断和 Agent 交互的开发工具，如 VS Code 或 JetBrains IDE。 |
| Idle | 空闲 | 表示会话当前没有继续推进的工作，不表示用户目标已经通过验证。 |
| Inbox | 收件箱 | DeepSeek Harness 接纳外部输入和工具结果的队列，并区分下一 Step 与下一 Turn 的投递边界。 |
| Interrupt | 中断 | 向活动运行发出取消信号；Codex 和 Claude 的具体入口不同，但都不会因此删除会话身份和已提交历史。 |
| Invocation | 调用实例 | Gemini CLI 将模型原始工具参数规范化并校验后生成的可执行调用对象。 |
| Item | 条目 | Codex 中既可指模型流里的响应条目，也可指 Rollout 的持久记录单元，后者还会保存上下文、压缩和控制事件。 |
| JSONL | 逐行 JSON | 每行保存一个独立 JSON 对象的格式，常用于记录事件流、会话和执行轨迹。 |
| LLM | 大语言模型 | Harness 实际构造请求并接收文本、工具调用和停止原因的模型服务。 |
| LSP | 语言服务器协议 | OpenCode 通过它查询诊断、定义、引用和符号，只有语言服务器存在、项目根识别成功且文件语言匹配时才可用。 |
| Legacy Agent | 旧版智能体 | Gemini CLI 中另一条可核对的旧版 Agent Session 路径，不能与当前 Turn/Scheduler 主链拼成同一套运行流程。 |
| LocalEnvironment | 本地环境 | mini-swe-agent 中直接在宿主机工作目录执行 Bash、继承进程环境并回传观察的实现，不提供容器或系统调用隔离。 |
| Loop | 循环 | 重复执行一组步骤直到满足退出条件的控制结构，正文中既可能指 Agent Loop，也可能指事件循环。 |
| Maintainer | 维护者 | 教材中核对失败路径、证据边界和结论能否持续复现的维护者层级。 |
| Manager | 管理器 | Context、Sandbox、MCP Client、Session 和 Skill Manager 分别管理不同状态或资源边界，不能把它们当成同一个模块。 |
| Map | 映射 | 源码中通常指键值映射，教材图示中的 Map 则指帮助定位模块和调用链的系统地图。 |
| Memory | 记忆 | 跨消息或跨会话保留并可再次取用的信息，可能存成摘要、文件、向量记录或结构化状态。 |
| Message | 消息 | 在用户、Assistant、模型和工具之间传递的结构化交互单元，各项目的字段和角色定义不同。 |
| Messages | 消息列表 | 按顺序保存并提交给模型或界面的一组 Message，通常构成当前对话上下文。 |
| Mode | 模式 | 决定 Agent 当前工作方式的一组行为规则，如规划、编辑或只读模式。 |
| Model | 模型 | Agent Loop 实际调用的推理模型，其能力、上下文窗口和工具协议由 Provider 适配。 |
| Model Router | 模型路由器 | Gemini CLI 为当前请求选择具体模型并记录回退原因的组件，不负责工具调度。 |
| Options | 选项 | 创建会话、启动运行或调用工具时传入的一组可选参数。 |
| Part | 消息片段 | 一条 Message 内的结构化内容单元，可表示文本、推理、工具调用或工具结果。 |
| Parts | 内容片段 | 组成消息或模型内容的结构化片段，OpenCode 将其持久化为 Message Parts，Gemini CLI 用它表示 Provider Content 的组成项。 |
| Patch | 补丁 | Agent 对现有文件提出或应用的一组局部改动，通常以统一 Diff 或结构化编辑操作表示。 |
| Pattern | 匹配模式 | 权限规则用它匹配规范化后的路径、命令或工具调用，OpenCode 由最后命中的规则决定结果。 |
| Permission | 权限 | 规定 Agent、工具或命令可以访问哪些资源以及允许执行哪些操作。 |
| Permission/Policy | 应用是否允许、拒绝或询问一次动作 | 不自动提供 OS 隔离 |
| Persona | 角色设定 | DeepSeek Harness 的 Agent Preset 用它装入角色和行为规则，创建子 Agent 时还可随继承配置单独指定。 |
| Plugin | 插件 | 按项目约定打包并安装的扩展单元，通常可以同时注册工具、命令、Hook 或 Provider。 |
| Plugin/Extension | 可贡献工具、Provider、Hook 等的能力容器 | 通常是高信任宿主代码 |
| Plugins | 插件 | 由宿主加载并可贡献工具、Provider、Hook 或其他运行能力的高信任代码扩展。 |
| Policy | 策略 | 控制模型选择、权限审批、工具使用或执行终止等决策的规则集合。 |
| Preset | 预设 | 一组可直接选用的模型、工具、权限或运行参数组合。 |
| Processor | 处理器 | 对消息、模型输出或事件流进行解析、转换和分发的组件。 |
| Profile | 配置档 | 一组具名的模型、提供商和运行设置；部分项目中也可能指用户资料。 |
| Project | 项目 | 一次 Agent 工作所关联的代码库、目录和项目级配置上下文。 |
| Prompt | 提示词 | 实际送入模型的指令与上下文组合，可能由系统规则、用户消息、工具说明和运行时状态共同组装。 |
| Prompt Loop | 提示词循环 | OpenCode 读取有效历史、驱动模型 Step，并根据工具结果决定继续、压缩或停止的会话主循环。 |
| Protocol | 协议 | 约定客户端、Agent 进程、模型和工具之间如何组织请求、事件与响应。 |
| Provider | 模型提供商 | 把统一的模型调用接口接到 OpenAI、Anthropic、Gemini 等具体模型服务的适配层。 |
| Pruning | 删除或缩短某个大结果/片段 | 不一定重写整段历史 |
| Query | 查询 | 交给模型、搜索组件或状态存储执行的一次检索请求，具体含义随调用对象变化。 |
| RPC | 远程过程调用 | 外部客户端通过 Command、Response 和 Event 双向驱动 Agent Session 的协议方式。 |
| Read | 文件读取 | 多套 Harness 中用于读取文件的工具名，它是否可见、是否免审批以及能否并行要按各项目配置判断。 |
| Recipe | 配方 | 把提示词、工具、模型和执行步骤组合成可复用任务流程的配置或示例。 |
| Registry | 注册表 | 按名称登记并查找工具、Provider、Skill 或扩展实现的集中索引。 |
| Repository Map | 仓库映射 | Aider 按符号、引用和 Token 预算生成的仓库上下文投影，不是完整源码，也不保证包含每项依赖。 |
| Response | 响应 | 一次模型或 API 调用返回的完整结果，可包含文本、推理、工具调用和用量信息。 |
| Result | 结果 | 某次调用或任务完成后返回给上层的输出，通常同时携带状态、数据或错误信息。 |
| Resume | 恢复 | 从已保存的会话或运行状态继续执行，而不是重新创建一段独立对话。 |
| Revert | 还原 | 把工作区或会话恢复到先前状态，不一定等同于执行 Git 回退。 |
| Revision | 修订版 | 内容或状态经过一次修改后形成的版本，在不同项目中可能对应消息、文件或共享内容的版本。 |
| Reward Adapter | 把原始信号转换成训练奖励的版本化规则 | 必须定义缺失、方向、范围和聚合 |
| Rollout | 运行轨迹 | Agent 针对一个任务从开始到结束的一次完整尝试，评测系统常对同一任务采样多条 Rollout。 |
| Router | 路由器 | 根据请求或标识选择目标处理器的控制组件；Tool Router 分派工具，Model Router 选择模型。 |
| Run | 运行 | Agent 从接收任务到完成、失败或取消的一次独立执行实例。 |
| Runtime | 运行时 | 实际执行 Agent 循环、工具和扩展代码的环境，不同项目可能是 Node.js、Python 或 Rust 进程。 |
| Sandbox | 沙箱 | 限制命令、文件和网络访问范围的执行环境，各项目的隔离强度和授权方式并不相同。 |
| Scheduler | 调度器 | 决定任务、步骤或并发工具何时开始、暂停和继续执行的组件。 |
| Scheduler/Router | 查找、排序和执行 Tool Calls 的控制层 | 可见性、Permission、Sandbox 通常在不同层 |
| Schema | 模式 | 约束消息、工具参数或配置数据结构的规则，常由 JSON Schema 或项目内类型定义表达。 |
| Score | 评分 | 独立 Evaluator 根据冻结测试、文件差异和任务约束给出的结果，而不是 Harness 的成功状态。 |
| Scorer | 评分器 | 在 Agent 运行之外读取 Trace、文件、测试和环境事实，并按固定规则产出判断或分数的组件。 |
| Scorer/Evaluator | 按固定规则读取 Artifact 并给判断 | 应位于 Harness 自述之外 |
| Section | 区段 | DeepSeek Harness 组装 System Prompt 时使用的有序内容单元，如 Persona、工具说明和项目指令。 |
| Serve Bridge | 服务桥接层 | Qwen Code 中把 Serve 工具请求接到 Daemon 会话控制 API，并用 allowGlobalScope 限制扩大自动批准和持久化设置。 |
| Server | 服务端 | 对外提供模型、工具或 Agent 能力的进程，在不同项目里可能指 MCP Server、HTTP Server 或后台守护进程。 |
| Session | 会话 | 一段可恢复的交互状态；有的项目指 CLI 进程生命周期，有的项目指跨多次启动保存的对话。 |
| Session Event | 会话事件 | DeepSeek Harness 追加保存 Turn、Step、消息、工具调用、结果和结束原因的耐久事件。 |
| Session Idle | 会话空闲 | Session 当前没有控制循环继续工作的状态，OpenCode 用它表示运行结算，DeepSeek Harness 还将它作为手动压缩的前提。 |
| Session Prompt | 会话提示词 | 创建会话时组装并注入的指令文本，用来设定角色、规则、工具和项目上下文。 |
| Session Store | 会话存储 | 基础章节用它泛指保存和恢复会话事件的文件、数据库或接口，在 Claude TypeScript SDK 中则特指宿主可实现的扩展契约。 |
| Session Tree | 会话树 | pi 用 Entry 组成的完整会话分支结构，可用于回看、压缩、恢复和从旧节点分叉。 |
| SessionStore | 会话存储 | 负责保存、读取、列出和恢复 Session 数据的存储组件。 |
| Settings | 设置 | 用户可调整并持久化的应用级或项目级行为选项。 |
| Share | 共享 | 把会话、运行结果或生成内容导出或发布给其他人查看。 |
| Skill | 技能 | 可按需加载的一组任务说明、脚本和参考资料，用来教 Agent 完成某类具体工作。 |
| Skills | 技能集合 | 当前环境中可发现和加载的多项 Skill，通常通过目录、清单或注册表统一管理。 |
| Snapshot | 快照 | 某一时刻工作区、会话或配置状态的固定副本，用于比较、恢复或复现。 |
| Snapshot/Patch | 可用于恢复工作树的一组文件事实 | 无法撤销网络和数据库副作用 |
| Starter | 入门者 | 教材中先沿完整任务链认识请求、模型流、工具执行和结果回填的入门读者层级。 |
| Steer | 中途引导 | 向正在运行的任务补充约束或改变方向，DeepSeek Harness 将它送到下一 Step，Codex 与 pi 的接入边界则不同。 |
| Steering | 转向 | pi 在运行过程中插入的新指令队列，使当前工具或模型循环从下一合适边界调整方向。 |
| Step | 步骤 | 一次可单独记录和判定的执行推进，可能对应模型请求、工具调用或工作流节点。 |
| Store | 存储 | 保存会话、消息、记忆或运行状态并向上层提供读写接口的组件，不限定具体数据库实现。 |
| Stream | 流 | 模型或服务持续产生文本、工具请求、状态和错误事件的异步输出序列。 |
| Subagent | 拥有独立上下文/Session 的子运行 | 父端摘要会丢子轨迹细节 |
| Success | 成功 | 表示某个工具调用或局部步骤正常结算，不表示整个会话目标已经完成。 |
| Summary | 摘要 | 压缩后替代一段模型可见历史的有损内容，不能替代完整事件记录或外部状态核对。 |
| Surface | 接口面 | 一个模块向用户或其他模块暴露的命令、API 和可观察行为范围。 |
| System | 系统 | 在模型请求中指 System Prompt 等系统级输入，在 Hook System 等名称中则指一套运行时子系统。 |
| System Prompt | 系统提示词 | 每次模型请求中装入角色、规则、项目指令和工具用法的系统级提示内容。 |
| TUI | 终端用户界面 | 直接运行在终端中的交互界面，用于输入任务、查看流式输出和处理审批。 |
| Task | 任务 | Agent 要完成的目标单元，可能来自用户请求，也可能由工作流拆分或调度器生成。 |
| Task Tool | 任务工具 | OpenCode 中由父模型调用、检查深度与权限后创建或复用子 Session，并把子任务结果投影回父会话的工具。 |
| Telemetry | 遥测 | Harness 为观察运行情况而采集的耗时、错误、Token 用量和执行事件等数据。 |
| Thread | 线程 | 一条可持续追加消息的对话分支；部分项目用它表示会话对象，并非操作系统线程。 |
| ThreadId | 线程 ID | Codex 用来持久定位 Thread 的稳定句柄，应用不应拿某个 JSONL 文件路径替代它。 |
| Token | 词元 | 模型计量文本、上下文和用量的基本单位；在认证代码中也可能指访问令牌。 |
| Tool | 工具 | Agent 可调用的外部能力，例如执行命令、读写文件、搜索内容或访问服务。 |
| Tool Call | 工具调用 | 模型请求运行某个工具并提供结构化参数的动作，执行结果随后会回填到上下文。 |
| Tool Calls | 工具调用 | 模型在一次响应中提出的一批工具请求，执行并回填结果后还可能继续请求模型。 |
| Tool Registry | 工具注册表 | 汇集工具定义并投影本轮可见 Schema 的注册中心，工具已注册不代表当前模型一定可见。 |
| Tool Result | 工具结果 | 工具执行后返回给 Agent Loop 的结构化输出，可能包含文本、数据、错误或产物引用。 |
| Tool Router | 工具路由器 | Codex 中把模型协议里的工具调用交给已注册 Handler 的分派层，审批、沙箱和工具语义由后续层处理。 |
| Tool Schema | 工具定义 | 用 JSON Schema 等结构描述工具名称、用途、参数和约束，供模型生成合法调用。 |
| ToolCall | 工具调用 | 源码类型或事件名中的单次工具请求，通常携带工具名、参数和 Call ID。 |
| ToolRuntime | 工具运行时 | DeepSeek Harness 中负责解析当前作用域的工具定义、执行策略链、调度工具并规范化结果的运行层。 |
| ToolUse | 工具使用 | Claude 类型化消息中的工具请求块，只说明模型提出了调用，不能证明权限已放行或工具已执行。 |
| Tools | 工具集合 | 当前 Agent 被允许发现和调用的全部 Tool，其范围还会受到配置、权限和沙箱限制。 |
| Trace | 执行轨迹 | 记录一次 Agent 运行中模型请求、工具调用、状态变化和结果的完整过程。 |
| Transcript | 对话记录 | 按时间顺序保存的用户消息、Assistant 输出和工具交互记录。 |
| Transport | 传输层 | 把 SDK 的请求送到 CLI 进程的那一层，默认实现在 connect() 才真正启动子进程。 |
| Trial | 评测试次 | 围绕同一业务任务、工作区基线、全部 Attempt、最终产物和独立评分组织的一次完整评测。 |
| Trust | 是否加载工作区提供的配置、指令或扩展 | 不是文件、网络和子进程 Sandbox |
| Turn | 回合 | 一次逻辑用户交互，内部可能包含多次模型请求，不能按 HTTP 请求数来数。 |
| Turn Context | 回合上下文 | Codex 为某个 Turn 保存的有效配置与运行语境快照，会进入任务、模型请求、压缩和 Rollout，不能用当前配置倒推。 |
| Usage | 用量 | 模型或工具上报的资源消耗记录，通常包含 Token、缓存命中、成本或耗时，各项目的字段并不相同。 |
| Web | Web 端 | 通过服务协议访问 Session 的浏览器产品表面，只保存界面局部状态而不拥有会话真值。 |
| Workflow | 用脚本或控制器编排多个调用/子运行 | 资源上限、结果身份和取消传播 |

## 运行与身份

| 术语 | 本仓库中的含义 | 容易混淆之处 |
| --- | --- | --- |
| Harness | 位于模型外部，负责输入装配、工具、权限、状态和产品表面的程序 | 不是模型本身，也不等于 Eval Runner |
| Session | 一段可继续的运行状态与历史身份 | OpenCode、Gemini CLI、Claude SDK 等字段范围不同 |
| Thread | 可持久引用或并行分支的会话身份 | Codex 把 Thread 与活动 Session/Turn 分开 |
| Turn | 一次逻辑用户交互，可包含多次模型请求 | 不能按 HTTP 请求数量计 Turn |
| Step | 一次模型采样及其工具结算附近的较小单位 | 不同项目是否公开 Step 类型并不一致 |
| Task | 驱动某类工作流或用户目标的对象 | Codex Task、A2A Task、普通「任务」不是同一类型 |
| Run | 一次可结算执行实例 | Subagent Run、Workflow Run、Eval Run 作用域不同 |

## 模型与工具

| 术语 | 含义 | 核对点 |
| --- | --- | --- |
| Provider | 把共同请求协议适配到某个模型服务 | 目录发现、实现加载、认证和真实请求分开看 |
| Model | Provider 下的模型标识与能力配置 | 保存实际路由结果，不只保存首选项 |
| Tool Schema | 模型可见的工具名、描述和参数约束 | 仓库中有实现不代表 Schema 已进入本轮请求 |
| Tool Call | 模型提出的一次带 Call ID 的工具请求 | 参数必须完整、规范化并与 Result 配对 |
| Tool Result | 工具协议结算后回给模型的观察 | Success 不等于用户目标完成 |
| Scheduler/Router | 查找、排序和执行 Tool Calls 的控制层 | 可见性、Permission、Sandbox 通常在不同层 |

## 安全

| 术语 | 含义 | 不代表什么 |
| --- | --- | --- |
| Permission/Policy | 应用是否允许、拒绝或询问一次动作 | 不自动提供 OS 隔离 |
| Approval/Confirmation | 用户或宿主对一次请求的决定 | 不证明用户理解全部副作用 |
| Sandbox | 操作系统、容器或远端环境对进程能力的强制约束 | 配置开启不等于后端成功执行 |
| Trust | 是否加载工作区提供的配置、指令或扩展 | 不是文件、网络和子进程 Sandbox |
| Escalation | 经策略允许后，以更宽权限重新尝试 | 不应被理解为永久授权 |

## 历史与恢复

| 术语 | 含义 | 边界 |
| --- | --- | --- |
| Event Log/Rollout | 追加式运行记录 | 比模型 Context 包含更多事实 |
| Context/Surface | 下一次模型实际可见的有界历史投影 | 不是完整审计记录 |
| Compaction | 用摘要替换一段模型可见历史 | 摘要有损，旧事实是否保留取决于记录层 |
| Pruning | 删除或缩短某个大结果/片段 | 不一定重写整段历史 |
| Resume | 继续原会话身份 | 不恢复外部世界到过去时刻 |
| Fork | 从已有历史建立新分支身份 | 后续写入不应污染原会话 |
| Snapshot/Patch | 可用于恢复工作树的一组文件事实 | 无法撤销网络和数据库副作用 |
| Memory | 跨 Session 提炼的长期信息 | 可能过时，不覆盖当前文件和新指令 |

## 扩展与产品表面

| 术语 | 含义 | 主要风险 |
| --- | --- | --- |
| Subagent | 拥有独立上下文/Session 的子运行 | 父端摘要会丢子轨迹细节 |
| Workflow | 用脚本或控制器编排多个调用/子运行 | 资源上限、结果身份和取消传播 |
| Skill | 按需加载的任务说明与资源 | 发现不等于正文已注入 |
| Hook | 生命周期事件上的附加处理 | 是否能阻断取决于事件契约 |
| Plugin/Extension | 可贡献工具、Provider、Hook 等的能力容器 | 通常是高信任宿主代码 |
| MCP | 连接外部 Tools/Resources/Prompts 的协议 | 连接成功不代表每项能力存在或获准 |
| ACP/A2A/RPC | 外部客户端或 Agent 间协议 | 协议投影不等于完整内部事件 |

## Eval 与训练

| 术语 | 含义 | 规则 |
| --- | --- | --- |
| Artifact | 一次运行留下的大对象与环境事实 | 应带 Hash、版本和血缘 |
| Trace | 带顺序和关联身份的运行事件 | 没有 Error 不等于任务正确 |
| Scorer/Evaluator | 按固定规则读取 Artifact 并给判断 | 应位于 Harness 自述之外 |
| Reward Adapter | 把原始信号转换成训练奖励的版本化规则 | 必须定义缺失、方向、范围和聚合 |
| Holdout | 未用于训练和候选选择的隔离任务集 | 用于最终发布判断，防信息泄漏 |

进一步阅读：[五篇基础导读](foundations/01-model-harness-environment.md) 与 [横向比较](comparisons/01-runtime-config-model-input.md)。
