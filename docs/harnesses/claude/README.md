---
title: Claude Agent Harness 主线
article_type: harness
harness: claude
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/client.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/_internal/transport/subprocess_cli.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"tests/test_client.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-typescript","path":"README.md","commit":"48275071e804139579fabada9bb8d90cfe02b062"},{"type":"official-doc","title":"Agent SDK 总览","url":"https://code.claude.com/docs/en/agent-sdk/overview","accessed":"2026-08-24"},{"type":"official-doc","title":"Python Agent SDK 参考","url":"https://code.claude.com/docs/en/agent-sdk/python","accessed":"2026-08-24"}]
---

# Claude Agent Harness 主线

## 读者会得到什么

这条主线回答的不是「怎样调用 Claude API」，而是应用怎样通过 Agent SDK 驱动一个能读文件、执行命令、修改代码、维护 Session 并接受权限约束的 Agent Harness。官方把 Agent SDK 与直接 Client SDK 区分开：前者提供 Claude Code 的工具、智能体循环和上下文管理，后者要求应用自己实现工具循环。课程以这个公开产品契约为上界，再用锁定 Python SDK 的真实源码解释应用进程中可见的 Transport、控制协议、消息、Session Store、MCP 与回调。

Claude Code 是闭源产品，本课程只引用官方公开契约，不从 SDK 反推内部实现。图中不会虚构 Claude Code 内部的类、调度器、数据库表或工具注册算法；「CLI 接受请求并访问模型与工具」来自公开能力说明，而 SDK 只证明它怎样启动、连接和交换协议帧。

Python Agent SDK 提供可核对的主体源码与测试；本课程锁定提交 `542fefb3b94be87760b2513fff889b91bb5b6672`，可以逐行核对 `query()`、`ClaudeSDKClient`、`InternalClient`、`Query` 和 `SubprocessCLITransport`。TypeScript Agent SDK 的锁定仓库没有 SDK 主体源码，只能核对公开 API、README、CHANGELOG 与 Session Store 示例；锁定提交为 `48275071e804139579fabada9bb8d90cfe02b062`。相同的公开类型名不构成两个实现内部同构的证明。

两仓许可证也不同。Python 仓库的 MIT License 只覆盖该仓库内容；TypeScript 仓库使用自己的商业条款文件，官方总览还说明 SDK 使用通常受 Anthropic 商业条款约束。任何一个许可证都不能覆盖另一个仓库，更不能据此推导 Claude Code 产品源码的许可证。

先固定看得见的层，再讨论看不见的层。

## 核心概念

Claude 主线的第一张地图不是功能清单，而是责任与证据地图。应用、Python / TypeScript SDK、Claude Code CLI、闭源产品能力、模型与工具环境分别拥有不同状态；公开文档、源码、测试和实验也分别回答不同问题。

| 概念 | 课程中的责任 | 直接证据 | 不能外推 |
| --- | --- | --- | --- |
| Agent Harness | 组织输入、模型、工具、权限、会话和终态 | 官方产品契约与可观察运行 | 闭源内部类图 |
| Python SDK | 提供入口、Transport、控制协议和消息投影 | 锁定主体源码与测试 | TypeScript 内部实现 |
| TypeScript SDK | 提供公开 Query、类型和控制表面 | 官方参考、CHANGELOG、公开示例 | 锁定仓库中不可见的 Runtime |
| Claude Code 边界 | 承载公开工具、循环和上下文能力 | 官方文档与外部行为 | 私有调度器、存储和算法 |
| Session | 保存可恢复的对话轨迹 | 协议、Store 与材料化源码 | 文件系统快照 |
| Eval Adapter | 把运行事实变成独立评分 Artifact | 本课程规范与实验 | SDK 内置发布门禁 |

从一次任务看，SDK 是应用与 Claude Code 的协议桥，不是模型 Client 的简单包装。普通消息与双向控制帧共享 Transport；权限、Hook 和进程内 MCP 都可能要求应用在运行中回写。Session Store 又位于次级镜像边界，不能代替正在运行的 Context。

从证据看，Python 主线可以解释具体资源所有权，TypeScript 主线只能解释公开契约与版本变化。两侧能映射到共同概念，却必须保留证据等级和 unknown，不能为了画出对称架构而补齐不存在的源码。

## 为什么这样设计

第一，Claude Code 是闭源产品，课程必须在有用性与可核对性之间建立清楚边界。把产品画成不透明框仍能解释应用、SDK、工具和环境的责任；虚构内部模块反而让读者无法复查。

第二，权限、会话和扩展都跨越进程。双向协议让应用回调与进程内 MCP 可以参与运行，外部 Server 与 Sandbox 又拥有独立故障域。分层后，读者能判断配置已发送、能力已选择、权限已批准和副作用已发生分别需要什么证据。

第三，SDK Result 只报告协议终态。仓库把 Eval Adapter 放在 Harness 外侧，用固定 Trial、Artifact 与独立 Scorer 检查产物和安全，避免 Claude 自己的 success 成为发布证明。

第四，课程按证据边界、入口、消息、权限、Session、扩展、双 SDK 对齐与 Eval 排序。这个顺序让后文复用前文对象：先知道来源能证明什么，再沿运行链理解状态，最后才进行跨实现比较和评测。

第五，主线入口把跨篇对象固定下来，避免每篇文章重新发明 Session、Result、权限或执行成功的含义。读者可以沿同一任务从入口追到评测，也可以回到具体源码核对某个接缝；课程因此既能顺序学习，也能按问题查阅。

也便于发现主线之间的证据断点。

## 实现思路

如果要基于公开契约构建一个 Claude Agent Harness，建议先完成最小可观察闭环，再逐步加入权限、恢复和扩展。以下是宿主实现蓝图，不是 Claude Code 内部实现。

1. **锁定运行与证据。** 固定 SDK、CLI、模型、平台、设置来源和官方文档日期；记录选择 Python、TypeScript 还是 CLI 表面。
2. **建立消息与控制通道。** 先启动读取循环并完成 initialize，分别路由普通消息、SDK 发起的控制响应和 CLI 发起的权限、Hook、MCP 请求。
3. **接入权限与隔离。** 记录工具可见性、Hook、规则、模式、回调、最终参数和 Sandbox；任何 allow 都不能替代副作用观察。
4. **管理生命周期与 Session。** 区分回合 Result、在途任务、输入结束、Interrupt、Disconnect 与进程退出；外部 Store 记录镜像水位和恢复材料化。
5. **装配 MCP、Agent 与 Skill。** 为每项能力记录注册、发现、选择、批准、执行和完成，不把 initialize success 当成使用证据。
6. **输出独立 Eval Artifact。** 保存原始事件、权限链、产物、测试、费用与副作用，由独立 Scorer 判定 Trial。

```text
RunSpec -> SDK/CLI入口 -> Transport与双向控制 -> Claude Code公开边界
       -> 工具/Agent/Skill -> 权限与Sandbox -> 消息/Result/Session
       -> Artifact Builder -> 独立Scorer -> 训练或发布的隔离决策
```

每增加一个能力，都要同时增加失败路径与恢复定义。例如接入 Session Store 时，不只实现 append / load，还要记录尾部水位、临时凭据和工作树哈希；接入 MCP 时，不只看到工具名，还要验证 Handler 进入、身份和副作用。

宿主还需要一份统一事件 Schema，把 SDK 原始消息、控制帧、权限决定和外部副作用关联到 Run、Session、回合与调用 ID。Schema 可以增加新 subtype，但旧消费者必须保留未知事件，不能为了兼容而静默删除。

## 贯穿案例

假设用户要求「读取仓库报告、修正一个链接、运行检查，并在下一台主机继续」。应用选择 Python Client，以便处理中途 Edit 确认和显式 Session Store。

1. **初始化。** SDK 启动默认 CLI Transport，完成双向 initialize；Read、Edit、Bash 和一个进程内校验工具进入能力目录。
2. **执行与权限。** Read 自动批准但仍经过 Hook；Edit 流到 `can_use_tool` 获得单次批准；Bash 检查在受限 Sandbox 中运行。
3. **消息与终态。** 应用保留 Assistant、工具结果和所有 Result；若有后台任务，中间 Result 不结束输入。最终检查通过后独立 Scorer 核对文件与禁止副作用。
4. **镜像与恢复。** 本地转录先写，Store 镜像达到最终 UUID 后才标记跨主机可恢复；工作树快照与 Session ID 分开保存。
5. **第二台主机继续。** SDK 材料化临时配置，核对工作树哈希后 resume；完成后清理临时目录并再次评分。

```json
{"surface":"python-client","tools":["Read","Edit","Bash","mcp__local__validate"],"session":"s1","workspace":"H1"}
```

```json
{
  "result":"passed",
  "protocolTerminal":true,
  "artifact":{"linkFixed":true,"checksPassed":true,"forbiddenSideEffects":0},
  "resume":{"remoteTail":"u42","workspace":"H2","ready":true}
}
```

若 Result success 但检查失败，Trial 仍失败；若 Store 只镜像到 u40，运行可以成功但跨主机恢复未就绪；若第二台主机的工作树不是 H2，会话能加载却必须报告环境不一致。三个反例分别验证协议、持久化和文件状态不能相互替代。

学习者可以把案例切换成 TypeScript Query，重新执行相同任务契约。此时公开控制表面可以映射，但内部 Transport 仍保持 unknown；比较结果只覆盖消息、权限、产物与生命周期等可观察维度，不把 Python 源码复制到 TypeScript 侧。

最后再故意让进程内 MCP Handler 抛错，确认错误作为 ToolResult 反馈、主循环仍可调整，Artifact 同时保留 Handler 失败和最终任务结果。这样一条案例就把入口、控制、权限、扩展、Session 和 Eval 的责任真正串起来。

## 系统全景

![Claude 应用通过双 SDK 公开表面连接 Claude Code 闭源产品边界，并把工具副作用、会话存储和独立评测分开的中文系统架构图](../../../assets/diagrams/claude/system-architecture.svg)

Claim: claude.architecture.product-sdk-boundaries

应用层可以选择 Python 的 `query()`、`ClaudeSDKClient`，或 TypeScript 官方公开 API。Python 源码显示，默认路径会构造 `SubprocessCLITransport`；Python 包 README 说明 Claude Code CLI 默认随包捆绑，也可使用系统安装或 `cli_path` 指定版本。自定义 Transport 是另一条明确分支，不能用默认子进程行为描述所有运行。

SDK 内部有两条并行数据面。普通 NDJSON 帧承载用户消息、系统消息、Assistant 内容、流事件和 Result；`control_request` / `control_response` 则承载初始化、权限回调、Hook、进程内 MCP、Interrupt 等双向控制。`Query` 必须持续读取 CLI 标准输出，并在需要时向标准输入写回控制响应，所以「输入已发送」不等于标准输入可以立即关闭。

CLI 之后是闭源产品边界。官方文档说明 Agent SDK 提供与 Claude Code 相同的工具、智能体循环和上下文管理，但没有公开该边界内部的模块图。本课程因此只画一个不透明框：它与模型服务、文件系统、进程、网络和外部 MCP 发生公开可观察的交互；框内算法保持未知。

Session Store 位于应用可见的持久化边界。Python SDK 能把外部 Store 中的 Transcript 条目材料化到临时配置目录，并把运行中的 Transcript 增量镜像回 Store；这不意味着外部 Store 就是 Claude Code 的实时内存，也不表示恢复过程无损或无并发条件。独立 Eval 则消费固定 Trial 的输入、配置、消息、工具副作用与产物，由独立 Scorer 判断任务正确性。

架构图是证据分区，不是闭源实现猜测。

## 课程状态与顺序

<!-- course-navigation:start -->
| 顺序 | 模块 | 状态 | 先回答的问题 |
| ---: | --- | --- | --- |
| 00 | [主线入口](README.md) | 已复核 | 应用、双 SDK、CLI、工具、状态与 Eval 怎样形成责任链？ |
| 01 | [产品与 SDK 证据边界](01-evidence-product-sdk-boundaries.md) | 已复核 | 哪些结论来自官方契约、Python 源码或 TypeScript 公开材料？ |
| 02 | [Python 入口、Transport 与控制协议](02-python-entry-transport-control.md) | 已复核 | query、Client、CLI 子进程与控制帧怎样连接？ |
| 03 | [消息流与生命周期](03-messages-stream-lifecycle.md) | 已复核 | Result、输入结束、取消、关闭和进程退出分别结束哪一层？ |
| 04 | [工具、权限与 Hook](04-tools-permissions-hooks.md) | 已复核 | 工具可用、自动允许、询问、回调、Hook 与执行怎样分层？ |
| 05 | [Session、恢复与 Store](05-sessions-resume-store.md) | 已复核 | 恢复材料化、Transcript Mirror 和外部 Store 谁是权威？ |
| 06 | [MCP、Agent 与 Skill](06-mcp-agents-skills.md) | 已复核 | 进程内工具、外部 Server 与能力配置怎样装配？ |
| 07 | [TypeScript 契约与双 SDK 对齐](07-typescript-contract-parity.md) | 已复核 | 无主体源码时怎样诚实比较两个 SDK？ |
| 08 | [产品表面、错误与独立 Eval](08-surfaces-errors-eval-design.md) | 已复核 | SDK Result、反馈和产物怎样进入独立评分？ |
<!-- course-navigation:end -->

这张表已经在八篇正文、Claim、中文图和批量门禁全部完成后原子开放。以后任何一篇缺失、降级或移除链接，导航门禁都会让整条主线退出发布状态。

状态先于导航。

## 真实输入与输出

### 输入

最小入口把一个字符串目标和选项交给 Python `query()`。真实源码会在完成 `initialize` 后把字符串包装成用户 NDJSON 消息写入所选 Transport；以下只保留协议结构，不包含真实凭据和路径。

```json
{"type":"user","session_id":"","message":{"role":"user","content":"检查项目并说明测试失败原因"},"parent_tool_use_id":null}
```

### 输出

SDK 迭代器可能先后产生初始化系统消息、Assistant 内容、工具活动和 Result。上游 `test_client.py` 的锁定夹具让 Mock Query 只返回一个成功 Result，并断言等待 Result 与关闭输入的协程被作为后台任务启动，而不是在写入用户消息的主路径内阻塞。

```json
{"type":"result","subtype":"success","duration_ms":100,"duration_api_ms":80,"is_error":false,"num_turns":1,"session_id":"test"}
```

这个输出只证明 SDK 的协议投影。夹具没有连接真实模型、没有执行命令，也没有验证用户目标；`subtype: success` 不能替代产物检查。

## 调用链

![Claude Python SDK 从应用输入、会话材料化、Transport 连接、初始化、双向协议、消息产出到清理和独立评测的中文端到端任务流程图](../../../assets/diagrams/claude/end-to-end-task.svg)

Claim: claude.task.transport-control-loop

1. 应用调用 `query(prompt, options)`；公开函数创建 `InternalClient`，把字符串、选项和可选自定义 Transport 原样交给 `process_query()`。
2. `InternalClient` 先验证 Session Store 组合；若需要从外部 Store 恢复且未提供自定义 Transport，就把会话材料化到临时配置目录，并为所有退出路径登记清理。
3. 默认路径创建 `SubprocessCLITransport` 并连接 Claude Code CLI；自定义 Transport 路径则使用调用方提供的实现。这里证明的是 SDK 所选连接，不证明 CLI 内部结构。
4. SDK 构造 `Query`，装入权限回调、Hook、进程内 MCP Server、Agent、Skill 和初始化超时；随后先启动读取任务，再发送 `initialize` 控制请求。
5. 初始化完成后，字符串 Prompt 被包装为用户 NDJSON 帧写入标准输入。SDK 同时启动等待运行终结 Result 的后台任务，避免控制帧还需回写时提前关闭输入或阻塞消息读取。
6. Claude Code CLI 在闭源边界内与模型、工具和 Session 交互；它可向 SDK 发出权限、Hook 或 MCP 的 `control_request`，SDK 执行已登记回调并写回匹配的 `control_response`。
7. `Query.receive_messages()` 持续读取帧；`parse_message()` 把已知类型转换成 SDK Message，未知消息被跳过。应用得到的是协议投影，而非 CLI 内部状态对象。
8. 消费完成、异常或调用方提前退出时，`finally` 先关闭 Query 与子进程，再清除含凭据副本的临时配置目录。Eval Adapter 另行保存输入、选项、消息、工具副作用和目标产物，由独立 Scorer 判断。

## 源码证据

公开入口只做默认选项与委托，因此不能把 `query()` 本身写成完整 Agent Loop：

```source
src/claude_agent_sdk/query.py:118-126
if options is None:
    options = ClaudeAgentOptions()
client = InternalClient()
async for message in client.process_query(prompt=prompt, options=options, transport=transport):
    yield message
```

默认 Transport、初始化、字符串消息、输出解析和关闭顺序集中在 `InternalClient`：

```source
src/claude_agent_sdk/_internal/client.py:88-98,132-195
chosen_transport = transport or SubprocessCLITransport(...)
await chosen_transport.connect()
query = Query(...)
await query.start()
await query.initialize()
await chosen_transport.write(json.dumps(user_message) + "\n")
async for data in query.receive_messages():
    message = parse_message(data)
finally:
    await query.close()
```

更强的行为证据来自上游测试：它把 Transport 与 Query 替换成 Mock，安排一个 Result，并断言等待任务被后台调度。这证明了无死锁的装配意图，但仍不是 CLI、模型或工具的端到端测试。

```source
tests/test_client.py:204-257
def test_string_prompt_spawns_wait_for_result_as_task(self):
    ...
    mock_query.spawn_task.assert_called_once()
    assert not mock_query.wait_for_result_and_end_input.await_args_list
```

入口架构 Claim 使用 D 级，因为它综合官方产品契约、Python 实现和 TypeScript 分发边界形成责任投影。端到端任务 Claim 使用 B 级：源码直接定义流程，上游测试锁定后台等待行为；B 级仍受 Mock 和闭源边界限制。

## 失败与限制

第一，SDK 源码不是 Claude Code 源码。`InternalClient`、`Query` 与 `SubprocessCLITransport` 位于 Python 应用进程；把这些类画进 Claude Code 框会制造不存在的公开证据。官方「相同能力」描述也不能证明代码复用、存储同构或调度算法一致。

第二，TypeScript 仓库不是一份被删减目录的完整源码树。锁定树真实包含 README、CHANGELOG、许可证和 Session Store 示例，却没有 SDK Runtime 主体；因此课程可以核对公开 API 和示例行为，不能引用不存在的 `src/query.ts` 行号或声称已经审计 TypeScript 进程管理。

第三，Result success 只是一条协议终态。用户目标可能未完成、文件可能改错、测试可能没跑，甚至工具副作用可能违反策略。发布 Eval 必须检查产物与约束，不能把 Result、进程退出零、消息流结束或用户反馈直接当分数。

第四，默认捆绑 CLI 会随 SDK 构建和版本变化。锁定 Python SDK 提交不自动锁定一次外部安装、线上模型或未来包中的 CLI 二进制；复现实验必须另外记录实际 CLI 版本、平台、认证方式和有效配置。

第五，自定义 Transport 改变证据路径。外部 Transport 可能不使用子进程，也会跳过 SDK 的 Session Store 材料化；任何关于标准输入、临时目录或子进程关闭的结论都必须标注「默认 Transport」。

可见的协议，不等于完整的产品实现。

## 验证方法

先做静态核对：确认两个 Checkout HEAD 与课程锁定提交一致；列出 TypeScript 锁定树，确认没有 SDK 主体源码；分别读取两个许可证。随后逐行核对 Python `query.py`、`_internal/client.py`、`_internal/query.py` 和 `subprocess_cli.py`，记录默认与自定义 Transport 分支。

再运行上游的纯单元测试，重点保留 `test_string_prompt_spawns_wait_for_result_as_task`、初始化控制请求、权限回调和关闭消息流的断言。测试使用 Mock 时必须在证据记录中标明，不得升级为真实 CLI 或线上模型证明。

然后做受控集成实验：使用临时目录和最小权限，记录 SDK 版本、实际 CLI 版本、平台、环境变量白名单、完整 NDJSON 类型序列、控制请求与响应、stderr、退出状态和文件差异。凭据正文不得进入 Artifact。

最后建立独立 Eval：固定一次 Trial 的用户目标和初始仓库，Target 明确为 `query()` 或 `ClaudeSDKClient`，Artifact 保存协议轨迹与最终产物，Scorer 检查任务正确性、安全约束和不可接受副作用。重试只属于同一 Trial 的 Attempt，不能把失败样本从分母中删除。

先复现协议，再评价结果。

## 自检

### 问题 1

为什么 Python SDK 的 `Query` 类不能被描述为 Claude Code 内部控制器？

**答案：** 它是 Python SDK 可见源码中的应用进程对象，负责与 CLI 交换协议；Claude Code 内部实现闭源，课程没有证据把两者合并。

### 问题 2

TypeScript README 和官方 API 参考能证明 TypeScript Runtime 怎样启动进程吗？

**答案：** 不能。它们证明公开契约和用法；锁定仓库没有 Runtime 主体源码，进程实现必须标为不可用。

### 问题 3

为什么字符串 Prompt 写入后不能立即关闭标准输入？

**答案：** Hook、权限回调和进程内 MCP 可能在运行期间继续通过控制请求要求 SDK 写回响应；锁定源码和测试都为此保留后台等待与双向通道。

### 问题 4

Result 的 `subtype: success` 为什么不是 Eval 通过？

**答案：** 它只说明协议按该终态收敛，不证明目标产物正确或副作用合规；独立 Scorer 仍需检查固定 Trial 的 Artifact。
