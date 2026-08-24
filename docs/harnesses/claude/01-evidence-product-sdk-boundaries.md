---
title: Claude 产品、SDK 与许可证证据边界
article_type: harness
harness: claude
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"claude-agent-sdk-python","path":"LICENSE","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-python","path":"src/claude_agent_sdk/query.py","commit":"542fefb3b94be87760b2513fff889b91bb5b6672"},{"repo":"claude-agent-sdk-typescript","path":"README.md","commit":"48275071e804139579fabada9bb8d90cfe02b062"},{"repo":"claude-agent-sdk-typescript","path":"CHANGELOG.md","commit":"48275071e804139579fabada9bb8d90cfe02b062"},{"repo":"claude-agent-sdk-typescript","path":"LICENSE.md","commit":"48275071e804139579fabada9bb8d90cfe02b062"},{"type":"official-doc","title":"Agent SDK 总览","url":"https://code.claude.com/docs/en/agent-sdk/overview","accessed":"2026-08-24"}]
---

# Claude 产品、SDK 与许可证证据边界

## 读者会得到什么

读完后，你可以给 Claude 相关结论标出准确来源层：官方产品文档、Python SDK 源码、Python 上游测试、TypeScript 公开 API、TypeScript 锁定仓库材料、可复现树清单或课程推断。这个分层不是学术装饰，而是避免把「SDK 这样连接 CLI」写成「Claude Code 内部一定这样调度」的最低条件。

官方 Agent SDK 总览说明 SDK 提供 Claude Code 的工具、智能体循环与上下文管理，也明确区分 Agent SDK、终端 CLI、直接 Client SDK 和 Managed Agents。它能证明产品公开定位和能力承诺，不能证明闭源产品内有哪些类、数据库表、队列、缓存或调度算法。

Python SDK 锁定仓库提供完整主体源码和测试。我们可以检查入口怎样选择 Transport、控制请求怎样配对、消息怎样解析、Session Store 怎样材料化和清理。这些是 Python SDK 实现事实；即便文件名包含 `Query` 或 `session`，也不能把对象所有权迁移到 Claude Code 产品内部。

TypeScript SDK 的证据形态不同。锁定 Git 树只有 33 个文件：README、CHANGELOG、LICENSE、工作流、脚本以及 PostgreSQL、Redis、S3 的 Session Store 示例。它没有 SDK Runtime 的主体源码目录和包入口文件，所以课程只能使用官方 API 参考和真实可见材料描述公开契约。缺失结论只约束这个 Commit，不外推 npm 包、私有仓库或未来版本。

证据强弱取决于问题，不取决于厂商名字。

## 真实输入与输出

### 输入

把要判断的句子连同证据来源提交给边界分类器。这里的「分类器」是课程中的审计方法，不是仓库运行时功能。

```json
{"statement":"TypeScript SDK 内部使用与 Python 相同的 Query 控制器","sources":["TypeScript README","Python _internal/query.py"]}
```

### 输出

两个来源都不能证明该句。Python 文件只约束 Python 实现；TypeScript README 只约束公开契约。正确处置是把实现同构标为未知，并给出可验证条件。

```json
{"disposition":"unsupported","known":["两个 SDK 都公开 query 表面"],"unknown":["TypeScript Runtime 内部控制器"],"requiredEvidence":["同版本 TypeScript Runtime 源码或官方明确实现说明"]}
```

同名表面不是同构实现。

## 调用链

![Claude 官方产品契约、Python SDK 源码、TypeScript 公开材料、许可证和课程推断逐层约束结论的中文证据边界图](../../../assets/diagrams/claude/01-evidence-product-sdk-boundaries.svg)

Claim: claude.evidence.closed-product-not-inferred-from-sdk

Claim: claude.evidence.typescript-runtime-source-unavailable

1. 先写出最小可证伪句子，标明对象是 Claude Code 产品、Python SDK、TypeScript SDK、外部环境还是 Eval。
2. 若句子描述产品能力或公开 API，就寻找 Anthropic 官方文档，并记录页面标题、HTTPS URL 与访问日期；文档更新后旧结论不能自动保持当前性。
3. 若句子描述 Python 进程、类、分支或清理顺序，就绑定 Python 锁定 Commit、真实路径、行号摘录和上游测试；Mock 条件必须一起保留。
4. 若句子描述 TypeScript 表面，就使用同版本官方 API、README、CHANGELOG 和示例；先运行锁定树清单，避免引用不存在的 Runtime 路径。
5. 若要跨层综合架构，必须明确写出 inference 和限制，使用 D 级；没有证据的内部机制使用 U 或 unknown，不能用熟悉的设计模式补齐。
6. 最后独立核对许可证。每个仓库的条款只约束自己的内容；产品服务、模型 API 和其他组件仍按各自条款处理。

## 源码证据

Python 入口的真实源码证明 `query()` 委托给 `InternalClient`，而不是公开 Claude Code 内部循环：

```source
src/claude_agent_sdk/query.py:118-126
if options is None:
    options = ClaudeAgentOptions()
client = InternalClient()
async for message in client.process_query(...):
    yield message
```

Python LICENSE 明确是 MIT License，并要求在复制或实质部分中保留版权与许可文本。这个文件不包含 TypeScript 仓库，也不包含 Claude Code 产品源码。

```source
claude-agent-sdk-python/LICENSE:1-13
MIT License
...
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
```

TypeScript 锁定仓库的许可证只有一行，指向 Anthropic 商业条款；不能用 Python MIT 许可证替代它。

```source
claude-agent-sdk-typescript/LICENSE.md:1
© Anthropic PBC. All rights reserved. Use is subject to Anthropic's Commercial Terms of Service.
```

可复现实验 `claude-typescript-tree-inventory` 对锁定提交执行 `git ls-tree -r --name-only`，得到 33 个文件和空的 Runtime 主体目录集合。这个阴性证据比「我没找到源码」更强，因为它绑定完整树和提交；但它仍不证明其他分发渠道没有实现文件。

许可证边界和实现边界必须同时成立。

## 证据分级与可写结论

| 证据 | 可以写 | 不可以写 |
| --- | --- | --- |
| 官方产品文档 | 公开能力、表面差异、使用约束 | 闭源内部类、算法、存储布局 |
| Python 源码 | Python SDK 控制流、类型与资源生命周期 | Claude Code 内部实现、TypeScript 同构 |
| Python 上游测试 | 锁定夹具下的可重复行为 | 线上模型、真实工具或生产部署 |
| TypeScript 官方 API | 类型、参数、返回值和公开语义 | Runtime 进程管理与私有实现 |
| TypeScript 锁定仓库 | README、CHANGELOG、许可证、示例行为 | 不存在的 SDK 主体源码行号 |
| 树清单实验 | 该 Commit 的文件全集与缺失目录 | npm 包、私有仓库和未来版本 |
| 课程推断 | 明示前提的责任图和风险模型 | 伪装成上游原话或实现事实 |

一句结论可以同时引用多个层，但不能借此抹平层级。例如「Python SDK 默认启动 CLI，官方说 SDK 提供 Claude Code 能力」支持一张外部责任图，却仍不支持「CLI 内部复用 Python Query 类」。

## 许可证不是能力证明

MIT 允许在满足保留通知等条件下使用和分发 Python 仓库代码，但不证明代码安全、完整、适合生产，也不证明 Anthropic 为本课程背书。许可证解决法律许可的一部分，不解决实现真实性和运行质量。

TypeScript 仓库的商业条款引用也不能被改写成开源许可证。公开可读取不等于允许任意再分发；本知识库只记录元数据、分析、短摘和路径，不复制上游主体内容。

官方总览说明具体组件可能由各自 LICENSE 覆盖。这正是为什么要逐仓记录：统一的产品条款与组件级许可证可以并存，不能用其中之一消灭另一个。

条款决定可做什么，证据决定能说什么。

## 失败与限制

第一，公开 API 可能比锁定仓库更新。官方文档访问日期是 2026-08-24，而两个仓库绑定各自提交；出现字段差异时必须把「当前文档」和「锁定实现」并列，不用一个覆盖另一个。

第二，目录缺失是阴性证据。树清单能证明该提交没有匹配文件，却不能证明代码从未存在、没有发布在包中或没有私有实现。课程使用 `unavailable`，不使用「TypeScript SDK 没有实现」。

第三，上游命名可能引导错误归属。Python `_internal` 只表示该 Python 包内部模块，不表示 Claude Code 内部；`Session Store` 示例只证明适配器契约可映射到某类存储，不证明产品实时状态就在该 Store。

第四，许可证解释不是法律意见。本课程核对文件内容和再分发策略，只用于仓库治理；涉及商业集成、品牌、终端用户或二次分发时应由适格人员审阅最新条款。

第五，产品行为观察不能代替源码。一次 CLI 输出、界面截图或会话经验可以形成实验 Artifact，但只能约束观察到的版本、平台与配置，不能自动揭示内部算法。

边界缺失时，结论应缩小，而不是证据被放大。

## 验证方法

运行来源门禁确认两个 Checkout 正好位于锁定 Commit；分别读取 `LICENSE` 与 `LICENSE.md`，计算文本哈希并保留仓库归属。再对 TypeScript 锁定树执行清单命令，核对 33 个路径和 Session Store 示例根目录，搜索 `src`、`package.json` 与包入口候选是否存在。

对每条 Claim 运行锚点验证：源码摘录必须出现在声明行号内，官方文档必须有访问日期，实验 ID 必须指向真实记录。任何 U 级结论不得伪造源码证据，D 级结论必须写明推断桥梁。

做一次反向归属审计：把文章中的所有类名和文件名列出，确认它们只出现在所属 SDK 框；把所有「内部」「默认」「同样」「完整」等词逐句检查，要求版本、表面和条件。

最后检查公开树不包含上游主体复制、绝对路径、凭据或私有会话。通过这些门禁只证明证据治理自洽，不证明产品安全、生产就绪或课程结论永不漂移。

能复核，才可发布。

## 自检

### 问题 1

官方说 Agent SDK 提供 Claude Code 的智能体循环，为什么仍不能画出 Claude Code 内部类？

**答案：** 官方说明的是能力和产品契约，没有公开内部类与源码；具体内部结构仍是未知。

### 问题 2

TypeScript 锁定树没有 Runtime 主体源码，最准确的表述是什么？

**答案：** 该 Commit 的 Runtime 主体源码不可用；不能扩大为 TypeScript SDK 没有实现或其他分发渠道也没有源码。

### 问题 3

Python MIT License 能否覆盖 TypeScript 仓库？

**答案：** 不能。两个仓库分别提供许可证文件，MIT 只覆盖 Python 仓库对应内容，TypeScript 仓库遵循自己的条款。

### 问题 4

上游单元测试通过后能否把结论升级为生产验证？

**答案：** 不能。测试只约束锁定夹具和 Mock 条件；线上模型、真实工具、平台与部署仍需独立证据。
