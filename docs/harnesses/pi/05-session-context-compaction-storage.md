---
title: pi Session、Context、Compaction 与存储
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/coding-agent/src/core/session-manager.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/core/compaction/index.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/test/compaction.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/src/harness/session/types.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/src/harness/session/jsonl/repo.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/test/harness/session/jsonl.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi Session、Context、Compaction 与存储

## 读者会得到什么

本篇区分四个常被混成「历史」的对象：持久 Session Tree、当前 Branch Path、送入模型的 Context Projection，以及 Compaction Summary。它们相互关联，但信息量和用途不同。

现行 Coding Agent Session 使用追加式 JSONL Entry，每个 Entry 以 `parentId` 组成树，Leaf 决定活动分支。Message、Model Change、Thinking Level、Compaction、Branch Summary 与 Custom Entry 都可以存在文件中；只有部分 Entry 会投影成 LLM Message。

`buildSessionContext()` 从活动 Leaf 逆向找根，恢复沿途模型与推理设置，再把最新 Compaction、保留区间和其后 Entry 投影为消息。普通 Custom Entry 被忽略，Summary 则成为特殊 Message。于是「文件中存在」不等于「模型当前看见」。

Compaction 保留原 Session Entry，同时为后续 Context 选择最新 Summary 和 `firstKeptEntryId` 之后的消息。Summary 是有损模型生成物；它可能漏掉文件名、失败原因或约束，不能替代原始事件作审计证据。

锁定树还包含 AgentHarness v2 的 Session Abstraction、Memory Backend 与 JSONL v4 Backend。JSONL 有尾行恢复、持久前缀校验、分支与 Lane 测试。源码没有 SQLite Backend；接口允许未来 Backend 扩展，不应写成当前已支持 SQLite。

Session Repo 的注释要求 open 获取后端 Writer Claim，但锁定 JSONL Repo 展示的是同进程 Create/Fork 目标预留与追加队列，并非跨进程数据库租约。Writer Claim 只能协调写入所有权，不能让 Summary 变成无损记录。

## 真实输入与输出

### 输入

上游测试构造两轮旧消息、一次 Compaction、再加一轮新消息：

```json
{"entries":["用户一","助手一","用户二","助手二","压缩摘要","用户三","助手三"],"firstKept":"用户二"}
```

### 输出

Context 由摘要、被保留的第二轮和压缩后的第三轮组成；原 JSONL 仍保留旧 Entry：

```json
{"contextRoles":["compactionSummary","user","assistant","user","assistant"],"durableEntryCount":7}
```

JSONL 恢复测试还向文件尾追加半行 JSON。重新打开时 Backend 截断损坏尾行、保留合法前缀，并让下一条 Entry 使用连续 Sequence。

## 调用链

![pi 会话从追加式树与活动叶节点投影到模型上下文，压缩摘要缩短上下文但不删除原始历史，存储后端区分已实现与未实现能力的中文数据流图](../../../assets/diagrams/pi/05-session-context-compaction-storage.svg)

Claim: pi.session.context-is-derived-projection

Claim: pi.session.sqlite-backend-is-unavailable

1. Session 追加 Entry，并把新 Entry 的 Parent 指向当前 Lane Leaf。
2. Branch 只移动 Leaf；后续追加形成新子树，不覆盖原分支。
3. Context Builder 沿当前 Leaf 到根建立活动 Path，同时解析 Model 与 Thinking Level 的最近值。
4. 没有 Compaction 时，Path 中可参与上下文的 Entry 直接转换为 Message。
5. 有 Compaction 时，只采用最新 Compaction Summary、它标记的保留 Entry 和压缩后 Entry。
6. Agent 把 Context Projection 交给模型；完整 Tree 继续用于导航、审计和重新投影。
7. JSONL Backend 追加 Header、Entry、Lane 和 Record；重新打开时验证合法前缀并处理可恢复尾部。
8. Eval 从原始 Entry、工具 Artifact 和最终产物取证，Summary 仅作为辅助视图。

## 源码证据

Context Builder 明确先构造活动路径，再单独选择上下文 Entry：

```source
packages/coding-agent/src/core/session-manager.ts:334-469
const path = buildSessionPath(entries, leafId, byId);
const messages = buildContextEntries(entries, leafId, byId).flatMap(sessionEntryToContextMessages);
return { messages, thinkingLevel, model };
```

`sessionEntryToContextMessages()` 只转换 Message、Custom Message、Branch Summary 和 Compaction；普通 Custom Entry、Label 与其他状态 Entry 返回空数组。上游测试确认没有压缩时加载所有消息，单次压缩时首条是 Compaction Summary，多次压缩只采用最新 Summary。

AgentHarness Session Interface 把 Tree Entry 与运行 Record 分开，并定义 Lane、Branch Query、Open Operation 和全局 Name/Label。`SessionRepo.open()` 的契约提到 Writer Claim，具体 Backend 仍需证明如何实现。

锁定的 `JsonlSessionRepo` 实现 Create、Open、List、Delete 和 Fork。同进程 Destination Set 防止相同 `{cwd,id}` 的 Create/Fork 竞态；JSONL 测试覆盖缺失换行修复、损坏尾行截断、非法中间行拒绝和追加失败后队列可继续。

在 `packages/agent/src/harness/session` 导出树中可以找到 Memory 与 JSONL，没有 SQLite 模块、导出或测试。因此 SQLite 状态为 unavailable，不从设计接口推断存在。

## 失败与限制

第一，Summary 可能语义丢失。即使 Token 显著减少且测试通过结构断言，也不能证明所有约束保真。

第二，JSONL Parser 对现行 Coding Agent 的损坏行处理与 AgentHarness v2 JSONL v4 Backend 不完全相同；分析时必须注明所处模块，不能混写成一套实现。

第三，Tail Repair 只处理可识别的尾部损坏。中间行损坏会拒绝打开，人工修复必须保留原文件副本与校验值。

第四，同进程 Destination Reservation 不等于跨进程 Writer Lease。两个进程、网络文件系统和异常退出需要额外一致性测试。

第五，Session Resume 证明上下文可重建，不证明外部 Tool Side Effect 可重放。文件、命令和远端请求需要独立幂等记录。

第六，SQLite 在锁定版本中不可用。若未来加入，仍需迁移、事务、并发、损坏恢复和 JSONL Parity 证据。

## 验证方法

构造带两条 Branch 的 Session Tree，分别选择不同 Leaf，保存 Context Entry ID、模型消息角色和完整 Tree Entry 数。确认切换分支不会删除另一分支。

对 Compaction 做信息保真测试：在旧消息中放入文件路径、禁止项、未决错误和验收标准，生成 Summary 后逐项断言。结构可加载只是最低门槛，关键事实缺失应判失败。

对 JSONL 使用临时目录注入缺失尾换行、半行 JSON、非法完整尾部、中间损坏与追加失败。每次恢复后比较合法前缀哈希、Sequence 连续性和后续追加能力。

并发实验至少用两个进程同时 Open/Append；在没有真实跨进程 Claim 证据前，把结果标记为未验证。Eval 使用 Trial ID 关联原始 Session、Attempt、Artifact 和最终 Gate，不以 Summary 作为唯一输入。

## 自检

### 问题 1

Session 文件中有一条 Entry，模型是否一定能看见？

**答案：** 不一定。模型只看到活动 Branch、最新 Compaction 规则和 Entry-to-Message 转换共同产生的 Context Projection。

### 问题 2

Compaction 会删除旧历史吗？

**答案：** 现行追加式 Session 保留旧 Entry；Compaction 改变后续送模投影，用 Summary 代替被压缩区段。

### 问题 3

为什么 Writer Claim 不能证明 Summary 无损？

**答案：** Claim 协调谁能写；Summary 是否遗漏事实是内容语义问题，两者属于不同层。

### 问题 4

锁定 pi 是否支持 SQLite Session Backend？

**答案：** 没有可核对的模块、导出或测试；当前状态是 unavailable，只确认 Memory 与 JSONL 路径。

