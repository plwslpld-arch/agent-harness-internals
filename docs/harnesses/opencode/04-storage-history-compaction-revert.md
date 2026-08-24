---
title: OpenCode 会话存储、历史投影、压缩与恢复
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/session/session.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/session/message-v2.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/session/compaction.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/session/revert.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/session/compaction.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/session/revert-compact.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 会话存储、历史投影、压缩与恢复

## 读者会得到什么

本篇区分四份经常被统称为「历史」的数据：数据库中的 Session/Message/Part 记录、按时间读取的完整会话流、经过压缩筛选后交给主循环的有效历史，以及最终转换成 Provider Model Messages 的请求上下文。它们服务于审计、界面、控制和推理等不同目的，顺序与内容不保证相同。

压缩不是删除整个旧会话。OpenCode 可以选择近期 Turn 作为保留尾部，把较老头部交给专用 Compaction Agent 生成 Summary，再用 Compaction Marker、Summary 与 Retained Tail 重建模型上下文。工具输出 Prune 又是另一条路径：达到阈值后标记较早、非保护工具结果为 Compacted，以减少后续上下文负担。原始消息记录、模型所见投影与摘要必须分别观察。

Revert 同时涉及会话逻辑位置和工作树 Snapshot。它定位目标 Message/Part，收集后续 Patch，恢复或反向应用文件变化，保存 Revert State 与 Diff；Cleanup 才移除目标之后的消息或部件。Unrevert 可以从保存的 Snapshot 恢复，但这仍不覆盖网络、数据库、项目外文件或后台进程等非工作树副作用。

## 核心概念

OpenCode 的持久历史由 Session、Message 和 Part 组成，模型上下文则是从这些记录派生的投影。完整流适合审计和界面，`filterCompacted()` 选择有效历史，`toModelMessagesEffect()` 再转换成 Provider 消息。数据库里存在一个 Part，不保证它进入下一次模型请求；模型看见一个 Summary，也不表示原始事实被替换或删除。

Compaction 与 Prune 解决不同容量问题。Compaction 选择旧 Head 生成 Summary，并保留近期 Tail；Prune 标记较老、可压缩的 Tool Result，减少大输出进入上下文。两者都会改变模型可见内容，原始 Session 仍是更强审计来源。摘要与工具压缩都可能丢失语义，关键事实应由结构化 Artifact 或重新读取权威文件补足。

Revert 包含逻辑截断和工作树恢复。Revert Point 说明会话准备回到哪里，Snapshot/Patch 处理受支持的文件变化，Cleanup 再移除后缀消息；Unrevert 使用保存锚点恢复。它没有分布式事务能力，不能撤销网络、数据库、外部目录或仍运行的子进程。

| 概念 | 保存或生成什么 | 主要消费者 | 不能替代 |
| --- | --- | --- | --- |
| Session | 会话元信息与当前状态 | 服务、界面、恢复器 | 完整模型请求 |
| Message | 用户/助手轮次和父关系 | 历史与主循环 | 原始 Provider Frame |
| Part | 文本、推理、工具、补丁和压缩状态 | 增量 UI 与审计 | 外部副作用账本 |
| Effective History | 压缩筛选后的消息集合 | Prompt Loop | 完整存储历史 |
| Model Messages | Provider 可消费的最终投影 | LLM 层 | 数据库原文 |
| Compaction Summary | 旧 Head 的生成式摘要 | 后续模型上下文 | 无损审计记录 |
| Retained Tail / Prune | 近期原文与旧工具输出治理 | 容量控制 | 所有关键事实保真 |
| Revert State | 逻辑位置、Snapshot 与 Diff | 文件恢复和界面 | 通用事务回滚 |

## 为什么这样设计

持久记录与模型投影分离，可以同时满足审计完整性和上下文窗口限制。Session 尽量保留行为事实，模型请求只携带当前推理所需内容；转换层还能处理附件和 Provider 格式。代价是调试必须知道究竟查看哪一层，不能用数据库数组顺序猜模型输入。

Summary 加 Retained Tail 比简单截断更能保留长期目标和近期操作。旧 Head 被概括，近期 Turn 仍以原文进入请求；连续压缩还可锚定 Previous Summary。不过模型摘要没有形式化保真保证，路径、否定约束和失败细节仍可能消失，因此课程加入 required-facts 检查但不冒充上游实现。

Tool Prune 单独存在，是因为大型命令输出常常比普通对话更快耗尽窗口。保护近期 Turn 和特定工具能降低误删关键反馈；达到阈值才标记 Compacted，避免每轮抖动。被压缩输出若仍重要，应保存 Artifact 引用，而非把全文永久塞回上下文。

Revert 以 Snapshot/Patch 为中心，适合编码 Agent 的工作树场景。会话后缀和文件变化可以有序恢复，用户也能查看 Diff。边界被明确限定在可追踪文件，防止一个「撤销」按钮暗示网络发布、数据库写入和后台进程都已回滚。

## 实现思路

教学实现为每次模型请求生成 Projection Manifest，为每次恢复生成 Revert Manifest。它们是课程证据结构，不是 OpenCode 上游同名接口；Manifest 只引用消息、摘要与 Artifact ID，敏感正文保存在受控 Session 中。

Manifest 还应记录选择理由。Tail Start 是因为 Turn 数、Token 预算还是媒体超限而确定，Prune 是因总输出阈值还是保护规则跳过，都要成为机器字段。只有结果 ID 而没有决策依据，版本漂移后难以解释投影变化。

```ts
interface ProjectionManifest {
  sessionId: string;
  sourceMessageIds: string[];
  compactionId?: string;
  summaryId?: string;
  retainedTailIds: string[];
  prunedToolPartIds: string[];
  modelMessageDigest: string;
}
```

1. 从数据库按会话读取 Message/Part 流，使用时间、ID 和状态函数确定最新完成状态，不能依赖重排后的数组末尾。
2. `filterCompacted()` 找到有效 Compaction Marker、Summary 和 Tail Start，生成 Summary + Retained Tail 的逻辑序列，并记录所有来源 ID。
3. `toModelMessagesEffect()` 将内部 Part 转为 Provider 消息，对压缩工具输出、附件和不兼容内容使用明确占位或引用。
4. 接近上下文阈值时，Selector 按模型限制、近期预算和 Tail Turns 从后向前选 Tail；Head 交给专用 Compaction Agent。
5. Summary 成功后运行关键事实检查，至少覆盖目标、禁止项、未决错误和验收标准。失败时保留旧投影或标记需人工处理。
6. Prune 扫描旧工具结果，跳过保护工具和近期 Turn，标记压缩时间并把原始输出 Artifact ID 留在 Part。
7. Revert 前确认 Session 非 Busy，冻结副作用检查，收集目标后的 Patch，以 Snapshot 恢复工作树并写入 Revert State 与 Diff。
8. Cleanup 或 Unrevert 作为独立操作留证；最后检查工作树、外部目录、网络服务、数据库和子进程，分别标为 reverted、retained 或 unknown。

投影与恢复都需要版本化。模型 Token 估算器、Compaction Prompt、Part 转换器和 Snapshot 实现变化，会让相同 Session 得到不同结果；Manifest 保存版本摘要，重放时不以「能加载」冒充语义相同。

压缩提交应是原子的：Summary、Marker 和 Tail 引用若只写入一部分，下一次筛选可能构造无效顺序。提交失败时保留旧有效投影，并把孤立记录标为不可采用；恢复工具不得自动猜测缺失关系。

Revert 也要划分准备、应用和发布三个阶段。准备阶段冻结目标和 Patch，应用阶段修改工作树，发布阶段写 Revert State。任何阶段中断都要通过文件哈希和 Session 状态判定，不能只根据最后一条日志决定重试。

## 贯穿案例

假设会话有四个 Turn：用户要求修复测试且禁止改公共 API；第一次编辑失败；工具输出包含精确错误；第二次方案通过部分测试。上下文接近上限后触发 Compaction，随后用户 Revert 到第一次编辑之前。案例同时检查摘要保真、工具 Prune 和外部副作用。

实验在压缩前保存完整投影哈希和四项事实的来源 Part ID。压缩后不仅搜索摘要文本，还检查每项事实是否仍可由 Summary、Tail 或 Artifact 引用到达；同义概括可以接受，但否定范围和精确验收项必须保持。

```json
{
  "requiredFacts":["禁止修改公共 API","失败测试名称","第一次失败原因","尚未通过的断言"],
  "tailTurns":2,
  "prune":true,
  "revertTarget":"first-edit",
  "sideEffects":["workspace-file","outside-cache","local-http-request"]
}
```

1. Selector 把较老 Head 交给 Compaction Agent，近期两个 Turn 保留原文。Projection Manifest 记录 Summary、Tail 与原 Message ID。
2. Summary 若漏掉「禁止修改公共 API」，required-facts 检查失败。结构完整和 Token 下降不能抵消语义缺失，系统保持旧投影或请求修复。
3. 旧测试输出达到 Prune 阈值后被标记 Compacted，但 Part 仍引用原 Artifact。模型需要精确错误时可重新读取，而不是相信模糊摘要。
4. Revert 前确认会话 Idle，保存当前 Snapshot，反向应用第一次编辑后的工作树 Patch，并记录 Diff。Cleanup 是否删除后缀作为单独动作执行。
5. 工作区文件恢复成功；项目外缓存和已发送 HTTP 请求仍存在。后台进程若状态不明，结果标为 unknown，禁止直接重跑。
6. Unrevert 使用保存锚点重建工作树，并再次比较哈希；Session 后缀、外部副作用和模型 Context 分别核对。

```json
{
  "projection":{"summaryFidelity":"failed-then-repaired","tail":"retained","toolArtifact":"referenced"},
  "revert":{"workspace":"reverted","sessionSuffix":"cleanup-recorded"},
  "external":{"cache":"retained","http":"irreversible","process":"unknown"},
  "taskVerdict":"由最终测试另行判断"
}
```

案例揭示四个独立结论：Session 可读取、Context 可生成、工作树可恢复、任务可通过。任何一个成功都不能替代其他结论。尤其是 Summary 保真和外部副作用必须有显式证据，不能被 Revert 成功界面遮盖。

再注入半提交压缩：Summary 已写入但 Marker 缺失。筛选器应继续使用上一份有效上下文或明确失败，不能把孤立 Summary 当最新历史。修复过程保存原数据库副本与记录哈希，防止人工清理破坏审计。

第二个故障在 Revert 应用文件后、写 Revert State 前中断。重新打开时工作树哈希与 Session 状态不一致，恢复器标为 needs-reconciliation，并要求核对 Snapshot；直接再次反向应用可能把文件改坏。

第三个故障让后台测试进程在 Revert 后继续写覆盖率文件。工作树 Patch 即使成功，该进程仍说明副作用未收敛。发布 Gate 要求子进程清单和最终文件静默期检查，不能看到 Revert API 返回就结束。

最后运行 Unrevert 并比较三个时间点的文件、Session 与外部状态。可逆性只对被 Snapshot 覆盖且没有并发写者的文件成立；所有例外进入限制清单，作为用户决定后续操作的依据。

若 Tail 选择点落在同一个工具 Turn 内，实验还要确认调用与结果不会被拆成无法解释的孤立消息。预算算法即使允许 Turn 内选择，也必须让 Provider 消息满足角色和工具关联约束；不合法时应扩大保留范围或触发更早压缩。

媒体附件采用独立预算。图片或二进制引用的估算可能与 Provider 实际计算不同，边界附近出现 Overflow 时记录估算值与服务结果，并回到压缩策略调整，不能宣称固定 Token 阈值适用于所有模型。

Cleanup 会改变用户可见的会话后缀，因此执行前导出不可变审计索引。公开历史可以隐藏已撤销分支，内部证据仍要能关联 Trial、Attempt、原 Message 和 Patch；否则 Revert 会意外成为删除失败证据的工具。

所有恢复操作完成后重新运行目标测试，并把结果绑定恢复后的文件哈希。界面 Diff 正确不代表构建缓存、生成文件和依赖状态已经一致。

恢复证据随 Session 一起归档。

## 真实输入与输出

### 输入

```json
{"stored_history":"消息与部件流","context_budget":"模型窗口与保留预算","compaction":{"tail_turns":2,"prune":true},"revert_target":"消息或部件标识"}
```

### 输出

```json
{"model_projection":["压缩标记","摘要","保留尾部","后续消息"],"storage":"仍可审计的会话记录","revert":{"snapshot":"工作树锚点","diff":"文件差异"},"external_side_effects":"不保证恢复"}
```

## 调用链

![OpenCode 持久会话历史经过压缩选择、摘要和近期尾部重排形成模型上下文，恢复流程另用快照和补丁处理工作树但不撤销外部副作用的中文数据流图](../../../assets/diagrams/opencode/04-storage-history-compaction-revert.svg)

Claim: opencode.history.model-messages-are-derived

Claim: opencode.compaction.summary-is-not-lossless-history

1. Session Service 持久化会话元信息，Message 与 Part 保存用户、助手、文本、工具、补丁、压缩和错误状态。
2. 会话读取形成完整消息流；`filterCompacted()` 从已完成摘要寻找 Compaction Marker 与 Tail Start。
3. 为模型消费时，函数可重排成 Compaction User、Summary Assistant、Retained Tail 与 Continue User，而不是简单按数组位置取最新。
4. `toModelMessagesEffect()` 再把内部 Part 转成 Provider 消息，截断或替换不适合直接发送的内容。
5. 达到上下文阈值时，Compaction Selector 按 Token Budget 和 Tail Turns 划分 Head 与 Tail，必要时在一个 Turn 内寻找可保留起点。
6. Compaction Agent 只总结 Head，并可锚定 Previous Summary；成功后主循环使用摘要与近期尾部继续。
7. Prune 扫描较早工具结果，跳过保护工具和近期 Turn，达到阈值才标记 Compacted。
8. Revert 以 Snapshot 和 Patch 恢复工作树并保存逻辑截断点；Cleanup 才清理后缀消息，独立审计仍要检查外部副作用。

## 源码证据

有效历史会发生有意重排，源码也明确警告数组位置不再等于时间顺序：

```source
packages/opencode/src/session/message-v2.ts:521-598
return [
  ...result.slice(compactionIndex, summaryIndex + 1),
  ...result.slice(tailIndex, compactionIndex),
]
```

压缩选择按近期预算从后往前保留 Turn，而不是固定删除多少条消息：

```source
packages/opencode/src/session/compaction.ts:223-263
const budget = preserveRecentBudget({ cfg: input.cfg, model: input.model })
if (total + size <= budget) keep = { start: turn.start, id: turn.id }
```

Revert 恢复 Snapshot、反向应用后续 Patch，并把 Revert Point 与 Diff 写回 Session；Cleanup 再清理消息后缀。

```source
packages/opencode/src/session/revert.ts:38-126
rev.snapshot = session.revert?.snapshot ?? (yield* snap.track())
yield* snap.revert(patches)
yield* sessions.setRevert({ sessionID: input.sessionID, revert: rev, summary: ... })
```

## 失败与限制

第一，Summary 是模型生成的有损表示。未解决约束、失败尝试、精确参数或细小文件语义可能被遗漏；Previous Summary 锚定能改善连续性，但不能恢复丢失事实。

第二，Retained Tail 受 Token 估算、模型限制、媒体大小和 Turn 划分影响。估算与真实 Provider 计费 Token 可能不同，边界附近仍会再次溢出。

第三，Prune 标记的是工具输出，不等于删除所有来源事实。若后续推理依赖被压缩的长输出，应保存 Artifact 引用或重新读取权威文件。

第四，模型上下文顺序可以为了摘要语义重排，因此不能用数组最后一项盲猜最新完成消息；源码提供 `latest()` 以时间与 ID 规则计算状态。

第五，Revert 期间会话必须非 Busy，否则并发模型流与工作树恢复会产生竞态。即便断言通过，也要考虑外部进程在恢复后继续写入。

第六，Snapshot Revert 不是通用事务。Git 忽略文件、项目外路径、网络和数据库副作用可能保持不变；Cleanup 删除消息后缀还会改变用户可见审计表面，应在执行前另存证据。

## 验证方法

创建至少四个 Turn，其中包含大工具输出、图片附件和文件补丁。记录完整 Message/Part 流、`filterCompacted()` 结果与最终 Model Messages；触发压缩后确认 Summary 只接收 Head，Tail 仍逐条存在，重复压缩只引用一次 Previous Summary。

调整 `tail_turns`、`preserve_recent_tokens`、模型 Context Limit 与 Prune 开关，覆盖无尾部、完整 Turn 尾部、Turn 内拆分和媒体超预算。每个案例核对 Tail Start、Summary Parent、工具 Compacted 时间和下一轮真实请求。

恢复实验同时修改工作树文件、项目外临时文件并调用本地 HTTP 服务。Revert、Unrevert 和 Cleanup 后分别读取三类结果，明确标注可恢复工作树、会话逻辑后缀和仍存在的外部副作用。

## 自检

### 问题 1

数据库中的消息顺序就是模型收到的顺序吗？

**答案：** 不一定。压缩筛选会重排摘要与保留尾部，随后还要转换成 Provider Model Messages。

### 问题 2

压缩摘要能否代替原始审计记录？

**答案：** 不能。摘要是有损生成结果，原始消息、工具输出和产物引用仍应保留。

### 问题 3

Prune 与 Compaction 是同一件事吗？

**答案：** 不是。前者主要标记旧工具输出，后者用摘要加近期尾部重建模型上下文。

### 问题 4

Revert 为什么不能视为完整回滚？

**答案：** 它主要恢复工作树与会话逻辑位置，无法保证撤销网络、数据库、外部目录和后台进程副作用。
