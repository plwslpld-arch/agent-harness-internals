# Claude 源码课程

[返回学习入口](../../00-start-here.md)

Claude 课程首先教你处理一条特殊证据边界：Claude Code 是闭源产品，公开 Agent SDK 可以展示应用进程中的 API、Transport、消息、控制协议、权限回调和 Session Store 接口，却不能替代 Claude Code 内部运行时源码。

课程会把「官方公开契约」「Python Agent SDK 源码」「TypeScript Agent SDK 可见内容」和「无法由当前来源核对的产品内部机制」分开书写。

![Claude 公开证据与系统边界](../../../assets/diagrams/claude/system-architecture.svg)

## 锁定来源与可见范围

Python Agent SDK 锁定在提交 `542fefb3b94be87760b2513fff889b91bb5b6672`：

- [公开 query 入口](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/query.py)
- [内部 Client 控制层](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py)
- [Query 控制协议](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py)
- [Subprocess Transport](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/transport/subprocess_cli.py)

TypeScript Agent SDK 锁定在提交 `48275071e804139579fabada9bb8d90cfe02b062`。该来源可以核对 README、CHANGELOG、公开类型说明和 Session Store 示例，但锁定仓库不包含 SDK 主体运行时源码：[查看公开 README](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/README.md)。

官方文档用于解释产品承诺和 API 语义：[Agent SDK 总览](https://code.claude.com/docs/en/agent-sdk/overview)。文档能够说明公开行为，不能展示闭源实现的内部调用图。

## 先看一项任务

Python 应用调用 `query()` 或创建 `ClaudeSDKClient`，SDK 准备 Options 并通过 Transport 启动或连接 CLI 进程。消息以异步流返回；需要双向控制时，Query 控制层还会处理初始化、权限回调、Hook、MCP 和中断等请求。

```text
Python 应用
  → query() / ClaudeSDKClient
  → Options 与 Transport
  → Claude Code CLI（闭源产品边界）
  → 消息流与控制请求
  → SDK 类型、回调和 Session Store
```

![Claude Agent SDK 端到端任务流程](../../../assets/diagrams/claude/end-to-end-task.svg)

流程在 CLI 边界处有意停止。公开 SDK 能证明传输、消息和控制请求怎样工作，不能证明闭源产品内部采用了哪一种 Agent Loop。

图中产品边界不是一个可以继续展开的开源模块。课程只在公开协议和 SDK 代码能够到达的地方继续追踪。

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

首次阅读跳过所有无法从公开来源进入的 Claude Code 内部循环猜测。

## 三层读法

- **Starter**：先读证据边界、Python 入口和消息生命周期，分清应用进程与 CLI 边界。
- **Builder**：继续追踪工具可见性、动态权限、Hooks、Session 和 MCP 控制请求。
- **Maintainer**：对照 TypeScript 公开契约、错误表面和测试，检查哪些结论只能写成产品承诺。

## 阅读顺序

1. [产品、文档与 SDK 的证据边界](01-evidence-product-sdk-boundaries.md)
2. [Python 入口、Transport 与控制连接](02-python-entry-transport-control.md)
3. [消息流与生命周期](03-messages-stream-lifecycle.md)
4. [工具可见性：模型能看到什么](04-tool-visibility.md)
5. [动态权限决策：`can_use_tool` 何时运行](05-permission-decisions.md)
6. [Hooks 生命周期：注册、匹配与回调](06-hooks-lifecycle.md)
7. [Session、Resume 与 Store](07-sessions-resume-store.md)
8. [MCP、Agents 与 Skills](08-mcp-agents-skills.md)
9. [TypeScript 契约与差异](09-typescript-contract-parity.md)
10. [产品表面、错误与 Eval 接缝](10-surfaces-errors-eval-design.md)

## 用贯穿任务复盘

让一个 Python 应用提交运费修复目标：`query()` 或 `ClaudeSDKClient` 怎样准备 Options，Transport 怎样连接 CLI，消息和控制请求怎样流动，`can_use_tool`、Hooks、MCP 与 Session Store 在 SDK 边界哪里出现。每走一步都标注「源码事实、官方文档契约或当前不可核对」。

复盘的正确终点不是画出 Claude Code 内部 Agent Loop，而是准确停在公开边界：SDK 可以观察和控制哪些外显行为，哪些产品内部决策没有公开源码证据。

## 完成课程后应该能回答

- `query()` 与 `ClaudeSDKClient` 分别适合什么控制方式；
- Transport 怎样承载消息与控制请求；
- SDK 在哪里处理权限回调、Hook 和 MCP；
- Session 恢复和自定义 Store 的公开契约是什么；
- 哪些结论属于 Python 源码事实，哪些只来自官方文档；
- 为什么不能用 Agent SDK 反推 Claude Code 内部实现。

[从第一篇开始：产品、文档与 SDK 的证据边界](01-evidence-product-sdk-boundaries.md)
