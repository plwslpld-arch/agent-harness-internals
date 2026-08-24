# 先画边界：我们能从 Claude Agent SDK 看见什么

[返回 Claude 课程地图](README.md)

学习 Claude Agent Harness 的第一个难点不是代码，而是「别把不同对象写成一个东西」。日常交流里，人们常把 Claude 模型、Claude Code、Agent SDK 和自己的 Python 应用统称为 Claude；做源码分析时，这种简称会直接制造错误结论。

## 四个对象分别是谁

```text
你的 Python 应用
  → Claude Agent SDK（本课程可读源码）
  → Claude Code CLI（公开产品，内部实现不在本仓库）
  → 模型服务与执行环境
```

- **Claude 模型**负责根据上下文生成文本或工具请求。
- **Claude Code**是承载 Agent 行为的产品运行时，包含 CLI 表面，但主体实现不是本课程锁定的开源源码。
- **Claude Agent SDK**让应用启动或连接 CLI，发送消息，接收类型化事件，并处理公开控制协议。
- **你的应用**决定怎样配置 SDK、实现权限回调和 Hooks、保存产物以及独立评测结果。

所以，「Python SDK 中有一个 `Query` 类」只能证明 Python SDK 的协议路由设计，不能证明 Claude Code 内部也有同名类；「官方文档说 SDK 提供 Agent Loop」也不能自动变成闭源循环的源码调用图。

## 两套 SDK 的证据并不对称

Python Agent SDK 锁定在提交 `542fefb3b94be87760b2513fff889b91bb5b6672`。该仓库包含 `query.py`、`client.py`、内部 Transport、消息解析、控制协议和测试，足以沿实际 Python 调用链阅读。

- [Python 公开入口](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/query.py#L11-L26)
- [Python 内部 Client](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/client.py#L73-L98)
- [Python 控制协议](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/query.py#L469-L580)

TypeScript Agent SDK 锁定在提交 `48275071e804139579fabada9bb8d90cfe02b062`。当前锁定仓库公开了 README、CHANGELOG、许可证和 Session Store 示例，却没有可供本课程追踪的 SDK 主体运行时源码。因此课程可以讲它公开承诺的 API 和可见示例，但不会假装已经读过其内部实现：[查看锁定 README](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/README.md#L1-L24)。

「没有看到源码」是有范围的结论：它只描述这个锁定 Git 树，不外推 npm 分发包、其他仓库、私有实现或未来版本。

## 怎样判断一句话能不能写进源码课程

先问一句话的主语，再选择证据：

| 句子想说明什么 | 首选证据 | 合理写法 |
| --- | --- | --- |
| 产品公开支持什么 | 官方文档和公开 API 契约 | 「官方文档说明……」 |
| Python SDK 在该版本怎样运行 | 锁定源码与测试 | 「Python SDK 在此提交中……」 |
| 某配置下实际发生什么 | 固定版本的复现实验 | 「在这些条件下观察到……」 |
| TypeScript 内部怎样实现 | 当前证据不足 | 明确未知和所需证据 |
| Claude Code 内部怎样调度 | 当前证据不足 | 保留产品边界，不补想象图 |

例如下面这句话不能直接发布：

> Python 与 TypeScript SDK 内部都由同一个 Query 控制器驱动 Claude Code。

它一次跨了三个对象。锁定 Python 源码只能证明 Python 入口委托给内部 Client；TypeScript 锁定树没有主体实现；Claude Code 内部又是产品边界。可以改成：

> 两套 SDK 都公开查询表面。Python 锁定源码可以核对其 Client、Transport 与控制协议链路；当前 TypeScript 锁定树无法证明内部实现与 Python 同构，也不能据此推断 Claude Code 内部对象图。

## 从最小入口练习边界判断

Python 的公开 `query()` 最后几行非常简单：

```python
if options is None:
    options = ClaudeAgentOptions()

client = InternalClient()
async for message in client.process_query(
    prompt=prompt, options=options, transport=transport
):
    yield message
```

源码：[查看完整入口](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/query.py#L117-L126)

这段代码可以支持三个结论：缺省 Options 在入口创建；入口实例化 `InternalClient`；消息从 `process_query()` 异步产出。它不能支持「这里已经实现了模型循环」「每条工具调用都由这个函数执行」或「CLI 内部也使用 `InternalClient`」。

源码导读的价值不在于给每行代码配一段赞美，而在于知道这几行改变了什么、下一步该去哪、哪些问题到这里仍没有答案。

## 官方文档与源码冲突时怎么办

在线文档描述当前公开契约，锁定源码描述某个历史提交。两者不一致时，不要强行选一个覆盖另一个：

1. 写明文档页面和访问日期；
2. 写明源码提交；
3. 判断差异是版本漂移、语言 SDK 差异，还是理解错误；
4. 在没有同版本证据前并列描述。

许可证也要按仓库分别处理。Python 仓库的 MIT 许可不能自动扩展到 TypeScript 仓库或 Claude Code 产品；技术接口相似，不代表材料授权相同。

## 本课程之后怎样标注边界

后续文章遵循三种明确语气：

- **源码事实**：给出锁定提交、文件和行号，追踪调用者、输入、状态变化、返回和下一站。
- **机制解释**：用课程自己的图或伪代码帮助理解，并明确它是抽象，不伪装成上游类图。
- **产品边界**：到公开 SDK 无法继续进入的地方停止，不用熟悉的设计模式填空。

下一篇开始走真实主链：[Python 入口、Transport 与双向控制](02-python-entry-transport-control.md)。
