---
title: OpenCode 服务协议、处理器、开发包与事件流
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/protocol/src/api.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/server/src/api.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/server/src/routes.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/server/src/handlers/session.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/server/src/middleware/session-location.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/server/httpapi-exercise/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 服务协议、处理器、开发包与事件流

## 读者会得到什么

本篇解释 OpenCode 如何把同一服务核心暴露成可编程接口。Protocol Package 定义 API Group、Endpoint Schema、中间件位置与 OpenAPI 表面；Server Package 注入具体服务标识、Location/Session Location、Authorization 和 Handler；Routes 再组装应用服务并生成 Web Handler。客户端开发包消费的是这些协议契约，不是直接调用 Session 内部对象。

请求与事件承担不同职责。创建会话、提交 Prompt、切换 Agent/Model、压缩、等待、恢复和中断走请求响应；Session Events 与 Global Events 用流持续推送状态变化。客户端必须先取得初始快照或 History Cursor，再按 Event ID 续接并处理断线、重放和重复。只监听事件而没有基线，会漏掉订阅前状态；只做轮询，又会丢失细粒度 Tool/Permission/Question 转换。

HTTP 成功也不等于编码任务成功。`session.prompt` 可以成功接受并运行一次会话，但助手消息仍可能带 Error，文件可能错误，测试可能失败；`session.wait` 只表示运行不再活跃。服务器健康检查、Schema 解析和授权通过属于传输与服务门禁，最终任务 Verdict 仍需独立 Evaluator 读取会话轨迹与真实产物。

## 核心概念

Protocol Package 拥有路径、方法、Schema、错误和 Middleware Placement，Server Package 注入具体服务与 Handler，SDK 把协议包装成类型化调用。三者共享契约但责任不同：协议描述可交换的数据，Server 执行业务，SDK 管理调用体验。直接从 Handler 实现推断所有客户端行为，或从 SDK 类型推断 Server 当前部署能力，都会跨越版本边界。

请求响应与事件流提供互补视图。请求建立会话、提交 Prompt 或执行控制操作；Event 传播后续 Message、Tool、Permission 和状态变化。客户端先读取 Snapshot/History 基线，再从 Cursor 接续增量，才能覆盖订阅前状态和断线窗口。Event ID 用于幂等合并，不等于业务事务 ID。

Location 与 Session Location 把 HTTP 请求映射到正确项目实例和会话。Authorization、Schema 和定位都通过后，Handler 才调用 Session Service。HTTP 200 只证明这个命令边界成功返回；Agent、工具、文件和 Eval 仍可能失败。

| 概念 | 责任 | 成功信号 | 不能推出 |
| --- | --- | --- | --- |
| API Group | 组织 Location、Session、Event 等端点 | Group 可构建 | Handler 已部署 |
| Endpoint Schema | 约束 Path、Query、Payload 与结果 | 解码通过 | 业务状态正确 |
| Middleware Placement | 声明授权与定位位置 | 中间件执行 | 配置足够安全 |
| Server Handler | 调用具体 Session/Project 服务 | Effect 返回 | 用户任务正确 |
| SDK Method | 类型化请求与错误包装 | Promise 完成 | 服务端版本完全兼容 |
| Snapshot / History | 当前基线与历史窗口 | Revision/Cursor 可读 | 永久事件日志 |
| Event Stream | 持续状态增量 | Event Envelope 到达 | 无丢失、无重复 |
| Eval Verdict | 检查 Artifact 与业务断言 | passed/failed/unscored | HTTP 健康状态 |

## 为什么这样设计

契约与 Handler 分离，使客户端和服务端可以围绕同一 Schema 演进，也避免 Protocol 依赖具体 Core Service 身份。Middleware Placement 让横切规则进入契约结构，Server 再注入实现。版本漂移仍需 OpenAPI 摘要和兼容测试，类型共享不能消除部署差异。

事件流适合长生命周期 Agent。Prompt 请求无需一直携带所有中间状态，多个客户端也能订阅 Session 变化；History/Cursor 提供重连能力。代价是客户端必须处理重复、过期 Cursor、断线和背压，不能把 SSE 之类的长连接当可靠队列。

Location 中间件支持多项目服务，但也扩大串实例风险。目录、Workspace 与 Session ID 必须共同校验；Global Event 和 Session Event 保持作用域。只按 Session 名称合并事件，可能把另一项目的变化显示到当前视图。

传输成功与任务评分分离，让服务可以准确报告自身契约，同时由独立 Evaluator检查产品目标。一个自然结束但改错文件的 Prompt 在 HTTP 层仍可成功，Eval 则应失败；这不是接口矛盾，而是终态层级不同。

分层错误还支持有界重试。Schema 或 Authorization 失败不应自动重发，网络中断可按幂等条件恢复，Prompt 已提交但响应丢失时则先查询 Session。所有重试策略依赖命令是否可能产生副作用。

## 实现思路

教学客户端采用「基线 + 增量 + 对账」模型，并为每个命令保存 Request、Response、Event Cursor 与 Artifact 关联。以下状态结构不是 OpenCode 上游同名类型。

客户端 Replica 不是权威数据库。它可以为 UI 合并事件和离线展示，但发生 Cursor 过期、Digest 不一致或作用域错误时，必须回到 Server Snapshot；本地缓存不得覆盖服务端较新 Revision。

```ts
interface SessionReplica {
  workspace: string;
  sessionId: string;
  snapshotRevision: number;
  lastEventId?: string;
  appliedEventIds: Set<string>;
  stateDigest: string;
}
```

1. 从锁定 Protocol 生成或读取 OpenAPI，保存版本和 Schema 摘要；SDK 与 Server 启动时声明兼容版本。
2. 请求先过 Authorization 和 Schema，再由 Location/Session Location 解析 Instance 与归属。失败应标明 auth、schema、location 或 handler 阶段。
3. 客户端首次 Attach 读取 Snapshot 或 History，建立 Revision、Message/Part 和最新 Event Cursor。
4. 订阅 Event Stream，按 Workspace、Session 与 Event ID 验证作用域，重复事件幂等忽略，旧 Revision 不覆盖新状态。
5. 断线时持久化最后 Cursor，重连后请求缺失 History；Cursor 过期则重新读取完整基线并对账 Digest。
6. Prompt/Compact/Revert/Interrupt 等请求分别保存响应与后续事件。Response 完成不停止事件消费。
7. 对慢消费者设置缓冲预算和重建策略；超过预算时主动断开并从基线恢复，避免无界内存。
8. Agent Idle 后收集最终 Session、文件 Diff、测试和副作用，由 Evaluator 给出 Verdict。

部署证据还要包含监听地址、TLS/代理、Authorization 配置和日志脱敏。无密码本地服务只有在绑定与网络边界均受控时才可接受，localhost 名称本身也不能替代实际 Listener 检查。

请求幂等性按 Endpoint 分级。纯查询可安全重试，Create 需要客户端幂等键，Prompt/Compact/Revert 先查询现有 Session 状态，Interrupt 则允许重复但要记录目标 Run。SDK 不应给所有方法套用同一自动重试策略。

Event 消费还要处理背压和权限变化。连接建立后若凭据被撤销或 Workspace 权限变化，Server 应关闭或重新验证；长连接持续存在不能绕过新的授权决定。敏感 Event 字段进入日志前做脱敏。

## 贯穿案例

假设客户端为两个 Workspace 各打开一个 Session，在第一个会话发起修复 Prompt。事件流在工具执行中断开，重连时出现一个重复 Event；Prompt 最终 HTTP 200，但目标测试仍失败。案例验证作用域、Cursor 和任务终态分离。

实验给 Prompt 请求分配客户端操作 ID，并让 Server 测试夹具在提交业务后、发送响应前断线。客户端无法仅凭网络错误判断命令未执行，必须从 Session History 查询操作关联，避免再次提交相同 Prompt。

```json
{
  "request":{"workspace":"repo-a","session":"s1","command":"prompt"},
  "baseline":{"revision":12,"cursor":"e100"},
  "fault":"disconnect-after-e103",
  "otherWorkspace":{"workspace":"repo-b","session":"s2"}
}
```

1. SDK 请求先通过授权、Payload Schema 和 Session Location，确认 `s1` 属于 repo-a。用 repo-b Location 访问同一 ID 应被拒绝。
2. 客户端从 Revision 12 与 Cursor e100 建立基线，收到 e101-e103 后持久化 Cursor；每个 Event 同时校验 Workspace 和 Session。
3. 断线重连请求 after=e103，Server 重放 e103-e106。客户端用 Event ID 忽略重复 e103，应用其余增量并更新 Digest。
4. 若 Cursor 已过期，客户端重新读 History/Snapshot，不从缺口后的事件猜状态；对账失败时标为 stale。
5. Prompt Response 为 200，Session 随后 Idle。测试 Artifact 显示断言失败，Evaluator 判 Trial failed。
6. repo-b 的 Global Event 不得写入 s1 视图；若作用域缺失，客户端停止合并并报告协议错误。

```json
{
  "transport":{"status":200,"reconnected":true,"duplicateIgnored":1},
  "replica":{"workspace":"repo-a","latestRevision":16,"digest":"matched"},
  "session":{"idle":true},
  "eval":{"tests":"failed","verdict":"failed"}
}
```

再注入 SDK/Server 版本不匹配：新增 Event 字段若超出锁定 Schema，应形成兼容错误或按明确前向策略处理，不能静默丢失工具终态。服务可达、Replica 收敛和任务正确仍是三个独立验收项。

第二个变体撤销 Authorization 后保持旧 Event 连接。测试要求连接停止收到新事件，并在重连时被拒绝；若仍能读取，则部署安全失败，即使 Session 数据本身正确。

第三个变体让消费者处理速度低于事件生成速度。缓冲达到预算后客户端保存 Cursor、主动断开并重建基线，不得无限占用内存。重建后消息和 Tool Part Digest 与 Server 一致，才算 Replica 恢复。

最终发布证据同时保存 OpenAPI 摘要、SDK/Server 版本、监听与认证配置、重连记录、Session Artifact 和 Eval Verdict。任何一类缺失都只能证明局部链路，不能声称远程 Harness 已完整验证。

如果服务部署在反向代理之后，还要验证原始路径、流式缓冲、超时和断开传播。普通 JSON 请求成功不能证明 Event Stream 未被代理缓存；测试用持续事件和心跳检查真实行为。

审计日志将 Request ID、客户端操作 ID、Session ID 和 Event Cursor 关联，但不记录完整 Prompt、源码或认证正文。需要复盘内容时通过受控 Artifact 引用，兼顾可追踪与数据最小化。

对账结果必须保存服务端与客户端两个摘要，并记录比较时间和版本，避免后来状态覆盖当次验证证据。

证据长期保留。

## 真实输入与输出

### 输入

```json
{"request":{"method":"POST","path":"会话提示接口","payload":"用户消息"},"headers":{"authorization":"可选凭证","workspace":"实例定位"},"event_cursor":"最近已处理事件"}
```

### 输出

```json
{"response":{"status":200,"data":"会话或消息结果"},"stream":["连接事件","会话事件","工具与权限变化"],"task_verdict":"不由 HTTP 状态自动给出"}
```

## 调用链

![OpenCode 协议包定义分组与 Schema，服务包注入定位授权和处理器，开发包发出请求并订阅事件流，最终任务结论仍交给独立评测的中文时序图](../../../assets/diagrams/opencode/06-server-protocol-sdk-events.svg)

Claim: opencode.protocol.groups-separate-contract-from-handler

Claim: opencode.server.response-is-not-task-success

1. Protocol 以 Location、Agent、Session、Message、Model、Provider、Permission、File、Command、Skill、Event 等 Group 组合默认 API。
2. 每个 Group 声明路径、方法、Path/Query/Payload Schema、Success 与 Error Schema，并在需要时放置 Location 或 Session Location Middleware。
3. Server 使用同一 Protocol Factory 注入具体 Middleware Key，保持契约包不依赖下游 Core Service 身份。
4. Routes 提供 Handler、Authorization、Schema Error、Location、数据库、Session Execution 与事件服务，生成 HTTP Web Handler 和 OpenAPI。
5. 请求先经过授权与 Schema 解码，再由 Location/Session Location 找到正确项目实例和会话归属。
6. Session Handler 把列表、创建、Prompt、Compact、Wait、Revert、History、Events、Interrupt 与 Message 请求转给 Session Service。
7. 客户端开发包把协议操作包装成类型化调用；事件端点以服务端事件流持续返回 Event Envelope。
8. 调用方合并响应基线与增量事件，处理 Cursor、重连和幂等；独立 Evaluator 再检查任务产物与结果。

## 源码证据

Protocol 明确拥有 Middleware Placement，并把具体服务 Key 留给 Server 注入：

```source
packages/protocol/src/api.ts:25-64
return HttpApi.make("opencode")
  .add(makeSessionGroup(sessionLocationMiddleware))
  .add(eventGroup)
  .middleware(Authorization)
```

Server API 文件本身很薄，只用具体 Session Location Middleware 实例化默认协议；行为实现在各 Handler 与 Service。

```source
packages/server/src/api.ts:1-8
export const Api = makeDefaultApi({
  sessionLocationMiddleware: SessionLocationMiddleware,
})
```

Session Handler 把协议名称映射到业务服务，Prompt 与 Events 仍是两种不同返回形态：

```source
packages/server/src/handlers/session.ts:140-173
"session.prompt",
(ctx) => Effect.map(session.prompt(...), (data) => ({ data }))
```

```source
packages/server/src/handlers/session.ts:333-366
"session.history",
"session.events",
session.events({ sessionID: ctx.params.sessionID, after: ctx.query.after })
```

## 失败与限制

第一，Schema 契约只能保证解码形状与已声明错误，不证明业务状态没有竞态。Session 可在 Location Lookup 后被移动、删除或中断，处理器必须返回明确错误。

第二，Authorization 是否开启取决于服务器配置。无密码的本地服务若绑定到非预期网络接口，会扩大攻击面；部署时必须核对监听地址、反向代理和凭证策略。

第三，事件流会断开。客户端需要保存 Cursor、支持重连、处理重复事件和过期 History；不能把单一长连接当作可靠消息队列。

第四，Global Event 与 Session Event 的作用域不同。多项目客户端若丢失 Directory/Workspace/Session 关联，会把事件应用到错误视图。

第五，HTTP 200 可能只说明请求被处理。Prompt 返回的 Message、Tool Part、Error、Patch 和测试产物仍需分别判断；Wait/Idle 也只代表当前执行生命周期结束。

第六，开发包类型跟随锁定 Protocol 版本。服务端与客户端版本漂移、实验路由变化或未覆盖的 Event Definition 都可能产生兼容问题，应记录版本和 OpenAPI 摘要。

## 验证方法

从同一锁定提交生成或读取 OpenAPI，枚举每个 Group 的路径、Middleware 与 Success/Error Schema；启动测试服务器，通过真实 HTTP Client 验证健康、授权缺失、非法 Session ID、正确 Session Location 和 Schema Error。

建立会话后先读取 History，再订阅 Events，发起 Prompt 与 Tool Call。中途断开连接，保存最后 Event ID 后重连，核对事件没有永久缺失且重复可幂等消费。再用错误 Cursor、删除会话和移动实例制造边界情况。

最后准备两个 HTTP 200 案例：一个正确修改文件并通过测试，一个自然结束但产物错误。确认客户端传输层两者都成功，而独立 Evaluator 给出不同 Verdict，避免把服务可达性写成任务质量。

## 自检

### 问题 1

Protocol 与 Server Handler 为什么要分开？

**答案：** 前者拥有路径、Schema 与中间件位置，后者注入具体服务并实现业务行为，便于客户端共享稳定契约。

### 问题 2

只订阅事件流能否得到完整当前状态？

**答案：** 不能保证。应先读取快照或历史基线，再用 Cursor 合并后续增量。

### 问题 3

`session.wait` 成功意味着任务通过吗？

**答案：** 不意味着。它只表示执行生命周期不再活跃，产物与测试结果仍需独立检查。

### 问题 4

服务端没有配置密码时就一定安全吗？

**答案：** 不一定。还取决于监听接口、网络暴露、代理配置和宿主访问边界。
