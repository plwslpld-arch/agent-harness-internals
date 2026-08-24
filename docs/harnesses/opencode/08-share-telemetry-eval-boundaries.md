---
title: OpenCode 分享、遥测与独立评测边界
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/share/session.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/share/share-next.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/session/llm.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/share/share-next.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 分享、遥测与独立评测边界

## 读者会得到什么

本篇把五类经常混在一起的对象拆开：分享副本回答「怎样让他人查看一次会话」，遥测回答「运行时发生了什么」，上游测试回答「锁定夹具下某段代码是否满足断言」，评测回答「固定任务上的产物是否正确」，训练与发布则分别回答「怎样改变候选模型」和「候选版本能否进入目标环境」。它们可以复用同一批运行证据，却不能相互替代。

OpenCode 的 Share 不是只能手动触发。Session Share Service 会读取配置：`disabled` 拒绝分享，`auto` 或运行标志会在根会话创建后异步创建分享，普通策略下仍可手动 Share。ShareNext 随后把 Session、Message、Part、Model 和 Session Diff 同步到外部服务，并保存远端 ID、Secret 与 URL；Unshare 会调用删除端点并清理本地索引。

OpenTelemetry 也是可选运行能力。模型流只有在实验配置开启且注入 Tracer 时才建立追踪，并给 Span 加入 Session ID；传给模型开发包的遥测元数据还包含函数标识、用户和会话。Span 成功只说明某个被观测操作完成，不包含任务 Rubric、正确答案、发布阈值或错误成本。

本篇后半段给出本仓库建议的 Eval Harness 契约。它不是 OpenCode 已内置的发布系统，而是利用 OpenCode 可导出的消息、工具状态、差异、文件产物、配置和测试结果，构造可复核 Artifact，再交给版本化外部 Scorer。证据边界必须保留：能采集不等于已评分，单次评分不等于统计稳定，训练奖励不等于独立发布授权。

## 核心概念

Share、Telemetry、Test、Eval、Training 和 Release 是六条职责链。Share 向外部服务复制会话投影，Telemetry 记录运行 Span，Test 验证锁定代码或产品断言，Eval 在固定 Trial 上调用 Scorer，Training 消费适配后的奖励，Release 使用独立 Holdout 作决策。它们可以共享 Run ID 和 Artifact，却不能共享决策权限。

Share Policy 有 disabled、manual 与 auto 等有效状态。自动分享可在根会话创建后发生，运行标志也可能参与决策；ShareNext 同步 Session、Message、Part、Model 与 Diff，并保存远端 Secret/URL。Unshare 是一次远端删除请求和本地索引清理，不足以证明缓存、日志和已下载副本全域擦除。

Trial 是不可变统计单位，Attempt 是恢复历史。产品失败不能创建新 Attempt 反复采样到成功，基础设施失败可按预注册预算恢复但保留全部记录。Scorer 输出 Score/Reason/Evidence 或 unscored；RewardAdapter 只有语义完整时才把它转换成 DPO、GRPO 或 RFT 信号。

| 对象 | 主要职责 | 典型输出 | 不能授权 |
| --- | --- | --- | --- |
| Share | 复制会话投影到外部服务 | 远端 ID、Secret、URL | 数据全域删除证明 |
| Telemetry | 记录模型和运行 Span | Trace、Attribute、Status | 任务分数 |
| Upstream Test | 验证锁定夹具的代码行为 | pass/fail 与断言 | 真实部署可用性 |
| Eval Harness | 固定 Dataset、Target 与 Trial | Trace、Artifact、Outcome | 自动发布 |
| Scorer | 按版本化 Rubric 判断 Artifact | Score、Reason、Evidence | 修改原运行证据 |
| RewardAdapter | 映射评分为训练信号 | 偏好对或标量奖励 | 独立发布评测 |
| Checkpoint Selector | 在开发选择集挑候选 | Checkpoint Decision | 使用 Holdout 调参 |
| Release Gate | 独立 Holdout 与风险门槛 | approve/reject/inconclusive | 被训练分数替代 |

## 为什么这样设计

分享与遥测服务于协作和观测，不应偷偷拥有质量结论。Share 可以让人查看会话，Span 可以解释延迟与错误；两者都可能缺失、延迟或失败。独立 Artifact 保存原始消息、补丁和测试，才能让 Scorer 不依赖外部链接或遥测后端长期可用。

Trial/Attempt 分离防止选择性重试。固定分母后，基础设施恢复不会美化成功率，产品错误也不会被「再跑一次」删除。Canonical Attempt 选择规则、租约、幂等提交和 Artifact 哈希共同防止并发运行相互覆盖。

训练与发布隔离是为了避免评测泄漏。RewardAdapter 影响模型或策略，开发集参与 Checkpoint 选择，这些数据都不能再声称独立。Release Holdout 使用未参与训练和选择的 Case，并执行正确性、安全、成本、延迟和回归门槛。

分享策略单独治理数据出站，是因为自动模式可能不需要每次点击。有效配置、运行标志、远端组织、Secret、删除与保留政策都要审计；敏感任务默认禁用分享，不能因 URL 私密就假定合规。

追加式质量记录还能支持重评。Rubric 更新时生成新 Score，旧分数与原 Artifact 保持不变；发布 Gate 明确引用采用的版本，避免后续覆盖让历史决策失去依据。

## 实现思路

教学质量链采用追加式记录，每个阶段只读前序 Artifact 并新增带版本的结果。以下结构是本仓库建议契约，不冒充 OpenCode 内置发布系统。

Artifact 提交必须幂等并具备唯一 canonical 选择。并发 Attempt 可以完成，但只有符合预注册规则且哈希已固化的提交进入 Scorer；迟到结果留作诊断，不覆盖决策依据。

```ts
interface QualityChain {
  trialId: string;
  attempts: Array<{ id: string; outcome: string; artifactDigest?: string }>;
  canonicalAttemptId?: string;
  score?: { rubric: string; value?: number; reason: string; evidence: string[] };
  rewardAdapter?: { capability: "full" | "partial" | "unavailable"; version: string };
  release?: { holdout: string; decision: "approved" | "rejected" | "inconclusive" };
}
```

1. 固定 Dataset、Case、Target Surface、Commit、Effective Config、Provider/Model、随机种子与预算，生成 Trial ID。
2. 每次执行分配 Attempt ID。只有预注册的基础设施故障允许恢复；产品失败直接进入 Trial 结果。
3. Artifact Writer 保存 Message/Part/Event、工具权限、工作树、测试、环境与遥测关联，计算不可变哈希并幂等提交。
4. Share 依据最终 Policy 独立执行，上传前做数据分类与脱敏；分享链接只作为辅助引用，不是 Artifact 存储。
5. Telemetry 开关、Tracer、采样与导出器分别记录；Span 缺失不自动等于功能未运行，Status ok 不自动等于任务通过。
6. 外部 Scorer 盲读 Artifact，输出版本、分数、理由、证据和 unscored。Summary 不补造缺失分数。
7. RewardAdapter 声明分数范围、缺失、拒绝、截断和聚合语义，再连接 DPO/GRPO/RFT；能力不足标 partial/unavailable。
8. Selector 使用开发评测选候选，Release Gate 在独立 Holdout 执行预注册阈值和置信区间，输出可审计决策。

数据删除也要追加证明。Unshare Response、本地索引清理、远端保留政策和访问副本分别记录；无法验证的范围明确写 unknown，不把 API 200 写成全域擦除。

敏感字段脱敏采用结构化规则并版本化。密钥正文删除，路径和源码按授权最小化；Scorer 所需事实若因脱敏不可用，应返回 unscored，不能用缺失数据猜测通过。

## 贯穿案例

假设候选模型修复一个解析器错误。有效配置误设为 auto share，第一次 Attempt 因遥测导出器中断但 Agent 已完成错误补丁；运行者想重试。案例要求同时处理数据出站、观测失败、产品失败和发布分母。

```json
{
  "trial":"parser-17@candidate-b@repeat-1",
  "sharePolicy":"auto",
  "attempt1":{"agent":"idle","telemetry":"export-failed","tests":"failed"},
  "attemptBudget":2,
  "rubric":"patch-tests-api-v2"
}
```

1. 根 Session 创建后 auto policy 触发 ShareNext，远端收到 Session/Message/Part/Diff。数据出站与任务质量无关，审计立即记录 URL 类别和敏感字段检查。
2. Telemetry 导出失败不改变 Agent 结果。Artifact 仍从本地 Session、补丁和测试构建，Span 缺失标为 observability-degraded。
3. 测试失败属于产品错误，Attempt 1 不能按基础设施恢复重试成通过；Trial 直接保留失败。若 Telemetry 在 Agent 启动前阻断才按预注册规则判断基础设施故障。
4. Scorer 读取补丁和测试给 0 分及证据引用；Share 链接和模型自述不参与判定。
5. 该分数若进入训练，RewardAdapter 声明映射并只在训练数据使用；Checkpoint 选择与 Release Holdout保持隔离。
6. 用户执行 Unshare，系统保存删除响应和本地清理，同时把服务端缓存/下载副本标为未验证。

```json
{
  "share":{"created":"auto","unshareRequest":"succeeded","globalErasure":"unknown"},
  "telemetry":{"export":"failed","taskImpact":"none"},
  "trial":{"attempts":1,"productFailure":true,"score":0},
  "training":{"adapter":"versioned"},
  "release":{"decision":"rejected"}
}
```

故障变体把分享同步队列置为失败。本地仍保存 URL，但远端对象可能只同步部分消息；Artifact 不引用它作为唯一证据。另一个变体删除 Score，Summary 必须报告 missing-score，Release Gate 不能从测试进程零退出或 Span ok 猜测通过。

案例最终证明：数据已分享、运行可观测、上游测试通过、模型已训练和版本可发布可以同时得到不同真假值。只有每个角色在自己的证据范围内下结论，仓库才不会把「有记录」包装成「质量已证明」。

## 真实输入与输出

### 输入

```json
{"分享策略":"手动、自动或禁用","会话":"根会话标识","模型流":"提示、工具与响应事件","遥测配置":"是否启用及追踪器","工作区":"文件与差异"}
```

### 输出

```json
{"试验单元":{"任务":"固定数据集条目","目标":"锁定的 OpenCode 表面","尝试":"恢复记录"},"产物":{"来源提交":"固定","有效配置":"已归档","消息与工具":"原始证据","文件与测试":"结果"},"外部评分":{"评分器版本":"固定","分数":"带理由"},"决策":{"训练奖励":"可选","候选检查点":"独立选择","发布留出集":"最终门禁"}}
```

这里的 Trial 是统计分母，一个任务与目标配置对应一个不可变 Trial。Attempt 只是同一 Trial 下的恢复尝试，网络中断或基础设施故障可以生成新 Attempt，但产品性失败不能靠重复尝试变成多个样本，也不能挑选最好一次冒充 Trial 通过。Canonical Attempt 的选择规则必须预先声明并留下租约、幂等与提交证据。

Artifact 至少应保存来源 Commit、OpenCode 版本、有效配置摘要、Provider/Model、Prompt、工具与权限决策、原始 Message/Part/Event、工作树补丁、最终文件、测试输出、遥测关联标识和失败分类。敏感字段要做受控脱敏，但不能只保存一段经过格式化的终端文本，否则评分者无法复核工具参数、拒绝原因和实际文件副作用。

## 调用链

![OpenCode 会话按策略产生外部分享副本并记录可选遥测，运行证据进入不可变试验产物，再由外部评分、训练适配、候选选择和独立发布留出集分责处理的中文数据流图](../../../assets/diagrams/opencode/08-share-telemetry-eval-boundaries.svg)

Claim: opencode.share.policy-controls-external-copy

Claim: opencode.telemetry-and-tests-are-not-release-eval

1. 运行入口创建或恢复根 Session；配置和运行标志共同决定是否自动分享，手动命令仍可创建或取消分享，禁用策略必须阻断请求。
2. ShareNext 创建远端对象并保存 ID、Secret、URL，首次全量发送 Session、Message、Part、Model 和 Diff；后续监听事件，把同类更新排队同步。
3. 模型流在可选 OpenTelemetry 配置下生成 Span，以 Session ID 关联调用；消息、工具、权限、文件差异和测试输出仍分别保留原始证据。
4. Eval Runner 从固定 Dataset 创建 Trial，锁定 Target Surface、来源提交、配置和模型，并把每次恢复执行登记为 Attempt，而不是新 Trial。
5. Artifact Writer 选择规范 Attempt，保存运行协议、文件、测试、失败分类和血缘；分享链接或遥测查询地址只能作为引用，不能成为唯一证据。
6. 独立 Scorer 读取 Artifact，按版本化 Rubric 输出 Score、Reason、证据引用和不可判定状态；评分进程不依赖被测智能体的自我陈述。
7. RewardAdapter 只有在语义声明完整时，才把 Scorer 输出转换成 DPO 偏好对或 GRPO/RFT 可验证奖励；训练集、调参与评测留出集隔离。
8. Checkpoint Selector 在开发评测上选候选，独立 Release Eval 再对未用于训练和选择的 Holdout 运行；只有预注册阈值、置信区间和风险门槛都满足时才形成发布建议。

## 源码证据

分享入口明确区分禁用、手动与自动策略。自动分支只作用于根会话，并异步调用同一个 Share 操作。

```source
packages/opencode/src/share/session.ts:26-45
if (conf.share === "disabled") throw new Error("Sharing is disabled in configuration")
if (!(flags.autoShare || conf.share === "auto")) return result
```

ShareNext 监听会话、消息、部件、差异和删除事件；首次全量同步也包含这些对象及模型描述。这证明 Share 是向外部服务复制一组会话投影，而不是只生成本地书签。

```source
packages/opencode/src/share/share-next.ts:179-200
yield* watch(MessageV2.Event.Updated, ...)
yield* watch(MessageV2.Event.PartUpdated, ...)
yield* watch(Session.Event.Diff, ...)
```

创建和取消分享分别调用远端创建、同步与删除端点，并维护本地分享表。同步返回错误只写告警，因此本地会话与远端副本存在暂时不一致的可能。

```source
packages/opencode/src/share/share-next.ts:310-358
const result = yield* HttpClientRequest.post(...)
yield* full(sessionID).pipe(...)
yield* HttpClientRequest.delete(...)
```

模型流的 OpenTelemetry 是条件性注入；Session ID 被写入 Span，模型开发包收到函数、用户和会话元数据，但没有 Rubric、Score 或 Release Decision 字段。

```source
packages/opencode/src/session/llm.ts:208-218
const tracer = cfg.experimental?.openTelemetry ? ... : undefined
span.setAttribute("session.id", input.sessionID)
```

```source
packages/opencode/src/session/llm.ts:344-352
experimental_telemetry: {
  functionId: "session.llm",
  metadata: { userId: ..., sessionId: input.sessionID }
}
```

上游分享测试验证创建请求、数据库记录、删除调用和差异合并。它们提供锁定 Commit 的可执行证据，但测试夹具中的模拟服务与断言范围不能外推为生产分享后端、安全治理或任务正确率。

```source
packages/opencode/test/share/share-next.test.ts:138-209
it.live("create posts share, persists it, and returns the result", ...)
it.live("remove deletes the persisted share and calls the delete endpoint", ...)
```

## 失败与限制

第一，分享是数据出站。自动策略可能在用户没有再次点击按钮时发生，部署者要审计合并后的有效配置、运行标志、企业地址、认证组织和环境禁用开关，不能只看某一份配置文件。公开 URL、Secret 和远端删除语义也需要单独威胁建模。

第二，Unshare 不等于可证明的全域擦除。本地代码会调用远端删除并清理索引，但缓存、日志、被访问者下载的内容和服务端保留政策不由该调用本身证明。敏感任务应默认禁用分享，并在接入外部服务前完成数据分类。

第三，遥测缺失既可能是功能未执行，也可能是开关关闭、Tracer 未注入、导出失败、采样或后端丢弃。反过来，Span 状态正常只描述观测操作，不保证文件内容正确、权限合规或用户意图满足。

第四，上游测试使用固定夹具与模拟 Provider/HTTP 服务。通过这些测试能支持「锁定实现满足特定代码断言」，不能支持「所有真实模型稳定可用」「企业分享已合规」或「该智能体适合生产发布」。

第五，外部 Scorer 也可能有偏差、提示泄漏、非确定性和不可判定样本。必须版本化 Rubric 与依赖，保存评分理由和证据引用，对主观任务进行复评与一致性分析，并把基础设施失败与产品失败分开统计。

第六，RewardAdapter 不是通用数值转换器。DPO 需要可比较偏好对，GRPO/RFT 需要声明奖励范围、聚合、缺失值、拒绝和截断语义；若 Scorer 只给自然语言反馈或语义不完整，适配能力应标为部分可用或不可用。

第七，Checkpoint 在开发集领先可能来自过拟合或选择偏差。训练 Reward、开发评测和独立发布评测必须使用隔离数据与不同职责；最终 Gate 还要结合安全、成本、延迟、回归和置信区间，而不是只取平均分最高者。

## 验证方法

先在隔离环境分别设置手动、自动和禁用策略，创建根会话与子会话，观察是否发出创建请求；随后更新消息、部件和文件差异，核对远端同步的数据类型、Secret 使用和错误日志。执行 Unshare 后同时检查远端删除响应、本地分享表和 Session Share 字段，主动模拟网络失败验证不一致是否可见。

再分别在遥测关闭、开启但无 Tracer、开启且有导出器三种条件下运行同一任务，检查 Span、函数标识和 Session ID。把消息、事件、差异、最终文件与测试输出归档到同一 Artifact，确认遥测查询结果只是关联证据之一，而不是 Artifact 的替代品。

最后建立一个包含成功、产品失败、可恢复基础设施失败和不可判定样本的小型固定 Dataset。每个条目只创建一个 Trial，故障恢复登记 Attempt；让外部 Scorer 盲评 Artifact，随后验证 RewardAdapter、Checkpoint 选择与独立 Holdout 使用不同数据和明确阈值。故意重试产品失败，门禁应拒绝把最好一次挑成通过结果。

## 自检

### 问题 1

OpenCode 分享是否只能由用户手动开启？

**答案：** 不是。锁定实现支持手动、自动和禁用策略，根会话还可能因运行标志自动分享；必须核对最终有效配置。

### 问题 2

分享链接能否作为完整评测 Artifact？

**答案：** 不能。它是外部会话投影，可能同步失败、被删除或受服务策略影响；Artifact 还要保存锁定配置、原始协议、文件、测试和血缘。

### 问题 3

OpenTelemetry Span 成功是否证明任务成功？

**答案：** 不证明。Span 描述被观测操作和元数据，没有任务 Rubric、正确性评分或发布阈值。

### 问题 4

上游测试全部通过是否等于可发布？

**答案：** 不等于。它们证明锁定夹具的代码性质；真实任务还需要固定 Trial、外部 Scorer、统计门槛和独立 Holdout。基础设施恢复可以新增 Attempt，但产品失败不能靠重试变成通过；训练奖励、开发选择与发布门禁也必须使用隔离数据和分别声明的职责。
