---
title: Qwen Code：Serve 回放与批准作用域
article_type: sample
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"qwen-code","path":"packages/acp-bridge/src/compactionEngine.ts","commit":"4d3f9ff5719157fda5e8b135ed5bc362d925bcf0"},{"repo":"qwen-code","path":"packages/sdk-typescript/src/daemon-mcp/serve-bridge/tools/workspaceWrite.ts","commit":"4d3f9ff5719157fda5e8b135ed5bc362d925bcf0"}]
---

# Qwen Code：Serve 回放与批准作用域

## 样本定位

Qwen Code 与 Gemini CLI 共享一些可辨认的结构和概念，但当前锁定仓库已经包含规模很大的 Serve、ACP Bridge、Daemon、SDK 与多客户端会话能力。本专题不做历史谱系考证，也不从相似目录推断行为等价，只选择当前源码中可直接核对的两个独特机制：按轮次压缩事件回放，以及通过 Serve Bridge 限制危险批准模式。

这两个机制说明 Agent Harness 在扩展到长驻服务和多个客户端后，会出现单进程 CLI 不突出的新问题。流式事件需要在内存与可恢复性之间取舍；会话批准模式可能由远端工具改变，必须限制作用域和持久化。它们是对六条一级主线的协议与会话补充，不把 Qwen Code 升为新的综合主线。

![Qwen Code Serve 回放与批准边界](../../assets/diagrams/samples/qwen-code-serve-boundary.svg)

## 独特机制

`TurnBoundaryCompactionEngine` 在 `turn_complete` 或 `turn_error` 处折叠当前轮次积累的事件。连续文本和思考块合并，工具调用序列归约到最终状态，瞬态信号被丢弃，不同事件类型的相对顺序保留。目标是让回放日志规模随对话轮次数增长，而不是随每个流式令牌增长。Claim: qwen-code.serve-compacts-at-turn-boundaries。

压缩解决内存与回放成本，却改变证据颗粒度。被丢弃的瞬态信号无法从压缩日志复原，工具调用只保留归约状态时也可能缺少中间转移。源码还设置回放字节、事件数、Journal 增长和截断锚点，说明长会话仍可能发生窗口淘汰。因此压缩日志适合客户端恢复和界面展示，不能自动替代高保真审计轨迹。

Serve Bridge 还暴露改变会话批准模式的工具。它允许 plan、default、auto-edit、auto 与 yolo 五种值，但在 `allowGlobalScope` 未开启时，明确拒绝 auto-edit、auto、yolo 和持久化变更。只有显式开放全局作用域，才把请求交给 DaemonClient。Claim: qwen-code.bridge-restricts-dangerous-approval-modes。

这一门禁控制的是远端 Bridge 表面的风险扩张。它防止普通桥接调用静默把会话切到更自动的执行模式，或把变化写入工作区设置影响后续会话。不过它不等于完整安全边界：直接 CLI、其他 API 表面、工具本身和沙箱仍有各自策略，开放全局作用域后更要记录调用者、会话和持久化范围。

## 源码入口

从 `source:qwen-code:packages/acp-bridge/src/compactionEngine.ts:232` 到 `301` 阅读类说明、预算字段、回放片段和截断锚点。继续到 ingest、轮次终止与 snapshot 时，应记录哪些事件被合并、哪些被丢弃、何时生成历史截断标记，以及客户端如何取得之前的记录。

批准作用域从 `source:qwen-code:packages/sdk-typescript/src/daemon-mcp/serve-bridge/tools/workspaceWrite.ts:81` 到 `115` 阅读。重点区分「允许的枚举值」「默认作用域允许的值」「是否持久化」和「最终会话 ID」。工具描述列出一种模式，不代表默认门禁会放行它。

## 运行链

1. Agent 运行产生文本、思考、工具调用、权限与轮次终止等流式事件。
2. ACP Bridge 在轮次进行中维护实时 Journal，并在完成或错误边界执行折叠。
3. 压缩片段进入受字节与事件预算约束的回放窗口，必要时保留截断锚点。
4. 终端、网页、协议客户端或 SDK 按会话订阅、重连并读取回放状态。
5. 若客户端通过 Serve Bridge 改批准模式，先经过全局作用域门禁，再调用会话控制 API。
6. 独立评测读取真实产物和所需原始证据，不把回放完成或批准变更当作任务通过。

为了可追溯，应把 session ID、事件 ID、轮次边界、压缩前后数量、截断计数、记录锚点、客户端订阅位置和批准模式变化放在同一血缘中。对高风险任务还应另存不可变原始工具调用与结果，因为客户端回放日志有意做了有损优化。

## 与一级主线的关系

Gemini CLI 一级主线只按锁定 Gemini 源码解释其配置、调度、工具和会话；Qwen Code 样本按自己的锁定 Commit 解释 Serve 扩展。两者可以共享比较维度，却不能因为包名、目录或早期关系就互相代替证据。任何「同源」描述都只用于定位，行为结论必须落到各自源码和测试。

对其他一级主线，这个样本提出两个通用问题：长驻 Harness 向多个客户端提供会话时，回放如何限界；权限模式能否被协议表面远程扩大。Codex、Claude、pi、OpenCode 和 DSH 需要按各自实现回答，不能直接套用 Qwen Code 的字段或默认值。

## 失败与限制

第一类风险是把压缩回放当成完整审计。相对顺序保留并不表示所有中间事件保留，截断窗口也可能淘汰旧轮次。第二类风险是把 Bridge 默认门禁当作全系统策略；它只覆盖这条 Daemon MCP Serve Bridge 工具路径，其他入口需单独检查。

第三类风险是同源即等价。即便仓库存在共同结构，独立演进会改变配置优先级、工具策略、协议事件和恢复语义。评测若混用两个 Harness 的默认值，会破坏可复现性。还要注意批准模式只是应用层控制，不能替代容器、进程权限、网络和凭证隔离。

## 验证方法

回放实验构造一个包含大量文本分片、思考分片和工具状态变化的轮次，在完成边界前后比较事件数与顺序，确认同类片段合并、工具状态归约且不同类型相对顺序保持。再降低窗口预算触发截断，验证客户端收到明确标记和分页锚点。

批准实验在默认 `allowGlobalScope=false` 下分别请求 plan、auto-edit、auto、yolo 与持久化 default，确认危险模式和持久化被拒绝；显式开放后再验证请求到达指定会话。实验不得把开放门禁理解为安全批准，仍要在受控工具和隔离环境中运行。

## 自检

### 问题 1

回放压缩是否无损？

**答案：** 不是。它合并片段、归约工具状态并丢弃瞬态信号。

### 问题 2

默认 Bridge 能否切到 yolo？

**答案：** 不能，除非显式开放全局作用域。

### 问题 3

该门禁是否覆盖所有 Qwen Code 入口？

**答案：** 不覆盖，Claim 只描述 Serve Bridge 工具路径。

### 问题 4

与 Gemini CLI 结构相似是否说明行为一致？

**答案：** 不说明，必须分别锁定源码、配置与运行证据。
