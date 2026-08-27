# Claude 源码课程

[返回学习入口](../../00-start-here.md)

读 Claude 课程时，你要先守住一条特殊的证据边界：Claude Code 是闭源产品，公开 Agent SDK（智能体开发工具包）能让你看到应用进程里的 API、Transport（传输层）、消息、控制协议、权限回调和 Session Store 接口，却没有交出 Claude Code 内部的运行时源码。这条边界别越过。

课程会一直标清结论来自「官方公开契约」、「Python Agent SDK 源码」还是「TypeScript Agent SDK 可见内容」，凡是当前来源无法核对的产品内部机制，就直接留白。

![Claude 公开证据与系统边界](../../assets/diagrams/claude/system-architecture.svg)

## 锁定来源与可见范围

Python Agent SDK 锁定在提交 `542fefb3b94be87760b2513fff889b91bb5b6672`：

- [公开 query 入口](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/query.py)
- [内部 Client 控制层](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py)
- [Query 控制协议](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py)
- [Subprocess Transport](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py)

TypeScript Agent SDK 锁定在提交 `48275071e804139579fabada9bb8d90cfe02b062`。你可以用这份来源核对 README、CHANGELOG、公开类型说明和 Session Store（会话存储）示例，但仓库里没有 SDK 主体的运行时源码：[查看公开 README](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/README.md)。

要核对产品公开承诺了什么、API 字段表示什么，就读官方文档：[Agent SDK 总览](https://code.claude.com/docs/en/agent-sdk/overview)。它能解释对外行为和语义边界，但你仍然无法由此画出闭源实现的内部调用图。

## 先看一项任务

Python 应用调用 `query()` 或创建 `ClaudeSDKClient` 之后，SDK 会先准备 Options，再让 Transport 启动 CLI 子进程或连上已有进程。CLI 返回的消息会组成异步流，如果运行还需要双向控制，Query 控制层就会继续处理初始化、权限回调、Hook、MCP 和中断请求。

```text
Python 应用
  → query() / ClaudeSDKClient
  → Options 与 Transport
  → Claude Code CLI（闭源产品边界）
  → 消息流与控制请求
  → SDK 类型、回调和 Session Store
```

![Claude Agent SDK 端到端任务流程](../../assets/diagrams/claude/end-to-end-task.svg)

这条流程到 CLI 边界就停下。公开 SDK 能证明传输、消息和控制请求是怎样运作的，但它不会告诉你闭源产品内部选了哪种 Agent Loop（智能体循环）。

图里一旦走到产品边界，就不能再像读开源模块那样往内展开，因此后面的课程只会继续追踪公开协议和 SDK 代码真正能到达的地方。

## 仓库地图

| 区域 | 能核对什么 |
| --- | --- |
| `query.py` | 一次性查询 API 怎样创建 Client 并返回消息 |
| `_internal/client.py` | 双向 Client 怎样连接 Query 与 Transport |
| `_internal/query.py` | 控制请求、回调、Hook 和 MCP 消息怎样分派 |
| `_internal/transport` | 应用与 CLI 子进程之间的输入输出 |
| `types.py` | 消息、Options、权限和 Hook 的公开数据形状 |
| `tests` | SDK 层可观察行为和错误路径 |
| TypeScript 示例 | Session Store 等公开扩展契约 |

第一遍读时，凡是公开来源没有入口的 Claude Code 内部循环，都先跳过，别用猜测补上。

## 三层读法

- **Starter**：先读证据边界、Python 入口和消息生命周期，分清应用进程与 CLI 边界。
- **Builder**：继续追踪工具可见性、动态权限、Hooks、Session 和 MCP 控制请求。
- **Maintainer**：对照 TypeScript 公开契约、错误表面和测试，检查哪些结论只能写成产品承诺。

## 阅读顺序

1. [产品、文档与 SDK 的证据边界](01-evidence-product-sdk-boundaries.md) 先从边界开始。分清 Claude 模型、Claude Code、Agent SDK 和应用，确定哪些结论能由锁定来源支持；边界画清后，才能进入 Python 的真实入口而不把 SDK 调用链误写成闭源产品内部结构。
2. [Python 入口、Transport 与控制连接](02-python-entry-transport-control.md) 接住这条证据边界，沿 `query()`、InternalClient、Transport 和 Query 追踪公开链路。连接建立之后，下一步就要分辨其中流动的消息、控制帧与结束信号。
3. [消息流与生命周期](03-messages-stream-lifecycle.md) 再看数据面。从双向连接继续读取类型化消息，区分 Assistant 停止、Result、响应结束、断开和 Eval；消息中的 ToolUse 只是请求，要判断它能否出现和执行，还得回到配置层。
4. [工具可见性：模型能看到什么](04-tool-visibility.md) 承接 ToolUse，把工具集合、静态权限、动态权限、Hooks 与系统能力拆成不同层。分层之后，才能准确追问静态规则没有直接决定时，`can_use_tool` 处理什么。
5. [动态权限决策：`can_use_tool` 何时运行](05-permission-decisions.md) 动态询问由此展开。沿这条路径核对回调，避免把它当成每次工具调用的总开关；需要覆盖每次匹配调用的策略时，问题会自然转向 `PreToolUse` Hook。
6. [Hooks 生命周期：注册、匹配与回调](06-hooks-lifecycle.md) 接着追踪 Hook 的注册、回调 ID、控制请求和返回结果，厘清它与权限回调的分工。单次运行中的策略点明确后，课程再把视野移到跨轮次状态。
7. [Session、Resume 与 Store](07-sessions-resume-store.md) 再进入跨轮次状态。从生命周期进入会话标识、恢复、分叉和外部 Store，区分本地 Transcript 与镜像适配层；状态怎样保存清楚之后，才能判断 MCP、Agent 与 Skill 分别扩展运行的哪一部分。
8. [MCP、Agents 与 Skills](08-mcp-agents-skills.md) 承接 Session 上下文，拆开协议能力、委派角色和按需说明三种扩展机制。它们的公开边界明确后，跨语言对照也必须继续服从同一套证据规则。
9. [TypeScript 契约与差异](09-typescript-contract-parity.md) 跨语言对照到这里。以 SessionStore 示例和测试为落点，对照 Python 源码与 TypeScript 锁定树能支持的不同结论；契约相符不等于实现同构，这项区分会成为最后设计错误分类和 Eval 的证据基础。
10. [产品表面、错误与 Eval 接缝](10-surfaces-errors-eval-design.md) 最后回到 Eval。接住跨语言证据边界，把启动、协议、权限、工具、运行与任务质量分层记录；至此，前九篇的外部链路才能汇入独立 Eval，而不会越过公开 SDK 虚构 Claude Code 内部实现。

## 用贯穿任务复盘

复盘时，可以让一个 Python 应用提交「修复运费问题」这个目标，然后一步步问：`query()` 或 `ClaudeSDKClient` 怎样准备 Options，Transport 怎样连接 CLI，消息和控制请求如何流动，`can_use_tool`、Hooks、MCP 与 Session Store 又分别在 SDK 边界的什么位置出现。每走一步，都标清它是「源码事实」、「官方文档契约」，还是「当前不可核对」。

复盘做到最后，不要强行画出 Claude Code 内部的 Agent Loop，而要准确停在公开边界上：SDK 能观察和控制哪些外显行为，哪些产品内部决策还没有公开源码支持。能停准位置就算读懂了。

## 完成课程后应该能回答

- `query()` 与 `ClaudeSDKClient` 分别适合什么控制方式；
- Transport 怎样承载消息与控制请求；
- SDK 在哪里处理权限回调、Hook 和 MCP；
- Session 恢复和自定义 Store 的公开契约是什么；
- 哪些结论属于 Python 源码事实，哪些只来自官方文档；
- 为什么不能用 Agent SDK 反推 Claude Code 内部实现。

[从第一篇开始：产品、文档与 SDK 的证据边界](01-evidence-product-sdk-boundaries.md)
