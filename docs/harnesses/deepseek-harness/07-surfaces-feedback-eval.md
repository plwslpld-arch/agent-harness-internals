---
title: DSH 产品表面、反馈与评测接入
article_type: harness
harness: deepseek-harness
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"deepseek-harness","path":"packages/acp/acp/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/acp/acp/tests/turns.spec.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/bundle/headless/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"python/sdk/src/deepseek_harness/client.py","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/feedback/message-feedback/src/types.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"packages/feedback/command-feedback/src/index.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"apps/web/tests/message-feedback.e2e.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"},{"repo":"deepseek-harness","path":"apps/web/tests/feedback-command.e2e.ts","commit":"b150a551b8d465e31e418e1b2eaf5e79bbb7d28e"}]
---

# DSH 产品表面、反馈与评测接入

## 读者会得到什么

本篇从同一个 Agent Session 出发，比较 Web/Host、Headless、ACP、SDK、Python 与无人值守入口怎样驱动它、怎样投影事件、怎样表达停止。随后把消息反馈、Session 反馈、遥测与 Eval 分开，给出一条从可观测数据到独立发布评测的诚实接入路径。

课程锁定 DeepSeek Harness 提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。表面名称相同不保证协议语义相同；一条通道显示完整工具卡，另一条可能只发送已提交文本。调用方必须把入口、协议版本与停止映射写进运行记录。

先看谁驱动谁。

![DSH 多产品表面共享 Agent 核心，并将反馈、遥测与独立评测分层接入的中文架构图](../../../assets/diagrams/deepseek-harness/07-surfaces-feedback-eval.svg)

Claim: deepseek-harness.surfaces.protocol-adapters-not-identical

Claim: deepseek-harness.feedback.is-not-training-reward

上图中央只有一套 Agent、Session、工具与安全核心，周围却有不同宿主契约。Web 需要交互、回放与可视卡片；Headless 运行一次任务后按停止原因给进程退出码；ACP 通过标准输入输出上的 JSON-RPC 被客户端驱动；Python SDK 启动桥接进程，关联请求、通知和子 Session 树。

共享核心不等于共享结果语义。

投影不是事实。

## 真实输入与输出

### 输入

Web 的 Session 级反馈命令直接接收自然语言，不启动模型 Turn。上游浏览器端到端测试输入为：

```text
/feedback the diff view is unreadable
```

命令插件规范化文本后追加 `feedback/record`，再返回当前 Session ID、匿名用户标识和遥测共享状态。与此同时，消息级反馈走另一套请求，目标是特定 `messageId`：

```json
{
  "sessionId": "会话标识",
  "messageId": "助手消息标识",
  "rating": "negative",
  "note": "差异视图难以阅读",
  "ifVersion": null
}
```

`ifVersion` 是比较并交换令牌，避免两个界面静默覆盖同一条反馈。消息反馈只允许 `positive` 或 `negative`，备注还受非空和字节上限约束。

### 输出

Session 级命令的可见确认包含「已为某 Session 记录反馈」与共享披露；事件日志只保存反馈文本。消息级接口则返回带版本、创建时间和更新时间的 sidecar 项，并能在冷刷新后恢复、随后撤回。

```json
{
  "ok": true,
  "value": {
    "messageId": "助手消息标识",
    "rating": "negative",
    "note": "差异视图难以阅读",
    "version": "新版本令牌"
  }
}
```

这两个输出都没有分数标定、样本权重、RewardAdapter 版本、训练 Checkpoint 或发布阈值。它们是用户反馈记录，可以成为后续数据管道输入；在缺少清洗、归因、适配与独立评测时，不是训练奖励，也不是模型质量结论。

反馈不是判决。

记录也不是奖励。

## 调用链

1. Web 客户端通过 Host 暴露的服务操作 Workspace、Session、Agent 和命令；Host 将核心事件投影为消息、工具卡、审批对话、子 Agent 状态与历史列表。浏览器界面是消费者，不是 Session 的权威副本。
2. Headless bundle 创建一个新 Agent，记录任务前水位，投递一次用户消息，等待空闲并 flush Session；它打印水位之后最后一条非空助手文本，只有 `turn/end.reason.kind === completed` 才退出 0，其余情况退出 1。
3. ACP 作为自动化 Agent 端接受 `session/new`、`session/prompt` 与 `session/cancel`。它只向客户端发送已提交 assistant 文本，原始 chunk、reasoning、工具、计划与标题不进入自动化 wire；客户端传入非空 `mcpServers` 会被拒绝。
4. ACP 的 prompt 结果把内部停止原因映射成协议 `stopReason`。这个映射比 Session 原因更粗，某些非正常内部原因也可能成为 `end_turn`；因此 Eval 必须保留原始 `turn/end`，不能只看协议表面。
5. TypeScript 或 Python SDK 通过 JSON-RPC bridge 发起 `session/prompt`，按请求 ID 等待响应，同时订阅通知。Python 客户端还从子代理生命周期通知建立 parent map，让调用方筛选整棵 Session 子树。
6. MCP 在 DSH 中是外部能力接入方向：客户端插件把远端工具转为本地工具注册表项。它与 ACP `session/new` 的 `mcpServers` 参数不是同一条通道；后者在锁定 ACP server 中明确不支持。
7. Web 消息反馈服务把对单条助手消息的评价写入独立持久 sidecar；Session `/feedback` 命令把自由文本追加成 `feedback/record`。二者可与 Session Artifact 关联，却拥有不同身份、版本与删除语义。
8. Session Telemetry 从事件生成可观测记录，并按后端共享状态披露是否可能传出。遥测传输失败不应改变 Agent 任务结果；反馈命令测试甚至刻意连接不可达的本地端点，验证记录与披露仍可完成。
9. 真正 Eval 应从固定 Dataset 生成 Trial，调用明确 Target 表面，保存 Session、协议响应和外部 Artifact，再由独立 Scorer 判定。若要进入 DPO、GRPO 或 RFT，还需显式 RewardAdapter 把反馈或评分转成训练语义，并与发布评测隔离。

遥测不能代替评分。

退出码必须归一。

## 源码证据

ACP 源码明确把自动化通道限制为已提交助手文本：

```source
packages/acp/acp/src/index.ts:218-226
// Emit only committed assistant text/images. Raw chunks, reasoning, tools,
// plans, titles, and retry markers are presentation or trace data and stay
// off the automation wire.
if (event.type === 'assistant/message') { ... }
```

同一实现还拒绝客户端在 `session/new` 中传入 MCP server，并对停止原因进行协议映射。Headless 则直接按内部 completed 判断进程退出码：

```source
packages/bundle/headless/src/index.ts:127-133
await sessions.flush(agent.session)
const outcome = summarize(agent.session.events, firstSeq)
io.stdout.write(outcome.text + '\n')
io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)
```

两条表面消费同一类 Session，却输出不同粒度，所以多表面 Claim 使用 D 级。它是跨 ACP、Headless 和 SDK 的协议投影推断，不宣称所有入口在每个停止原因上都已做成一张完整等价表。

消息反馈的公共类型只定义二值评价、备注、版本和时间：

```source
packages/feedback/message-feedback/src/types.ts:13-32
export type MessageFeedbackRating = 'positive' | 'negative'
export interface MessageFeedbackItem {
  readonly messageId: MessageId
  readonly rating: MessageFeedbackRating
  readonly note?: string
  readonly version: MessageFeedbackVersion
}
```

Web 端到端测试冷刷新后重新读取 sidecar，再撤回评价；Session 反馈测试则确认命令不启动模型 Turn，只追加 `command/run`、`feedback/record`、`command/done`。这些证据能证明反馈持久与界面闭环，不能证明反馈已经训练模型。

## 失败与限制

第一，ACP 的 `end_turn` 不能直接换算成 Headless 退出 0。协议为了兼容自动化客户端压缩了内部原因；同一任务跨表面对比时，应以统一的原始停止分类和任务 Scorer 重新归一化。

表面不是事实源。

第二，Web 能显示并不意味着 ACP 或 SDK 收到了同样信息。工具卡、审批对话、reasoning、计划和 retry marker 可能只属于展示或 Trace；自动化消费者如果需要，必须读取 Session 事件或专门的查询接口。

第三，SDK 的请求成功只说明桥接调用结算。子进程退出、通知过滤、超时与 shutdown 都有独立失败面；订阅子树依赖生命周期通知建立 parent 关系，通知遗漏时不能假定树完整。

协议之间不能互证。

第四，消息点赞有选择偏差、位置偏差、用户差异和重复修改。二值 rating 没有任务难度、正确答案或反事实，直接当奖励会放大噪声。自由文本反馈还可能包含敏感信息与提示注入内容。

第五，Telemetry 是可观测通道，不是权威 Session。采样、脱敏、队列溢出、Exporter 不可达和共享模式都会改变可见记录；不能因后台没收到 Trace 就判 Agent 没执行，也不能因收到 Trace 就判任务成功。

第六，仓库中的性能 benchmark、浏览器回归或上游测试只证明各自约束。它们不是统一任务集，也没有自动形成独立发布门禁。名字里出现 `benchmark` 或 `e2e` 不足以升级证据等级。

第七，无人值守入口的审批必须显式定义。没有人在场时，询问通道不可用应失败关闭；不能为了跑批而把所有任务统一切到完全访问。Trial 还应记录权限模式与实际平台执行强度。

## 验证方法

先用同一固定任务分别跑 Web、Headless、ACP 和 SDK，保存原始 Session。注入 completed、max-tokens、cancelled、blocked 与 error，建立「内部原因—表面响应—进程退出码」表，发现信息损失就由 Eval Adapter 补齐，不能修改原始记录。

再验证消息反馈：对同一 `messageId` 新建评价、用旧版本并发更新、冷刷新、撤回。断言 target 必须是派生的追加型助手消息，version conflict 不会静默覆盖，Session 删除与 sidecar 生命周期按契约处理。

随后验证 Session 反馈和遥测：执行 `/feedback`，确认不产生新模型 Turn；分别在无遥测后端、本地不可达后端和可达测试后端下检查共享披露、队列与 Session 事件。外发内容必须经过脱敏审计。

最后建立独立 Eval：固定 Trial ID 与 Target surface，保存完整 Session、表面返回、退出码和产物哈希。Scorer 不读取点赞作为答案；若另有 RewardAdapter 使用反馈训练，版本化其清洗与聚合规则，并用不参与训练的 holdout 做发布判定。

先保存原始事件。

任何跨表面对比若没有同时冻结任务输入、源码版本、模型配置、工具权限、平台执行强度、停止原因归一规则和评分器版本，即使最终文本看起来相似，也只能作为调试线索，不能成为可复现的质量结论。

一个可核对的评测运行还要把消息反馈的版本冲突、会话反馈的原始文本、遥测是否成功外发、自动化协议丢弃了哪些事件、一次性进程采用什么退出规则、开发工具包是否完整接收子会话通知，以及独立评分器读取了哪些产物逐项登记；否则事后无法判断差异究竟来自模型、工具、权限、协议投影、数据缺失还是评分逻辑。

原始记录优先。

## 自检

### 问题 1

ACP 返回 `end_turn`，是否等于 Headless 会退出 0？

**答案：** 不等于。ACP 映射可能压缩多个内部原因；Headless 只在内部原因严格为 completed 时退出 0，应回到原始 Session 归一化。

### 问题 2

消息级差评为什么不是训练奖励？

**答案：** 它只记录用户对一条消息的二值判断、备注和版本，没有任务正确性、归因、尺度、聚合或 RewardAdapter 语义。必须经过独立设计才能进入训练。

### 问题 3

Web 能看到工具卡，Python SDK 为什么可能看不到？

**答案：** 不同表面选择不同事件投影。Web 面向交互展示，自动化协议可能只发送已提交文本；SDK 若需工具轨迹，应订阅相应通知或查询 Session。

### 问题 4

反馈、遥测和 Eval 的最短区别是什么？

**答案：** 反馈表达用户判断，遥测记录运行观察，Eval 用固定任务与 Scorer 产生可比较结论。三者可连接，但不能互相改名。
