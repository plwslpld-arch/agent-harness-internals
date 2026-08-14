---
sources: [{"repo":"deepseek-harness","path":"packages","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"acp-typescript-sdk","path":".","commit":"01010146a731212fbbb677d6055e0b7bf183b288"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 协议边界与转换链

## MCP 工具调用的端到端转换

1. MCP client 发现远端工具，保留原始名，并注册公开名 `mcp__<server>__<tool>`。
2. Harness 工具注册表把公开名、描述和输入 schema 纳入模型请求。
3. DeepSeek adapter 将 provider-neutral history/tools 转成 Chat Completions wire；本地推理则可按官方 DSML 编码参考构造 prompt。
4. 模型的 reasoning、文本、tool-call delta 被 adapter 组装为 `StreamChunk`。
5. agent loop 经统一工具流水线调用公开工具；MCP bridge 映射回原始名，执行 `tools/call`。
6. MCP 完整 JSON blocks 留给程序化调用方；模型侧当前只收到文本拼接和非文本占位符。
7. 调用与结果写入 append-only session log；下一步按 DeepSeek 规则回传带工具调用轮次的 reasoning。

因此存在至少三份互相关联的真源：MCP schema、Harness session-event vocabulary、DeepSeek provider wire。任何一份变化都可能造成兼容性回归。

## DSML：模型级序列化

V4 模型仓库不提供 Jinja chat template，而提供 Python encoder/parser。DSML 把 OpenAI 形状工具渲染进提示词，以 `tool_calls / invoke / parameter` 表示调用，区分原始字符串与 JSON 参数，并将结果放入后续 user 消息的 `<tool_result>`。

它不是 Harness 在线请求“直接发送的 XML”。原生 adapter 调用 Chat Completions SSE，在 serializer/translator 中处理 role、reasoning、tool calls、finish 和 usage。DSML 主要用于理解模型训练/自托管编码约定与构建 golden compatibility tests。官方 parser 只面向格式良好输出；生产实现还必须处理畸形/截断输出。

## MCP：外部能力进入 Harness

当前只桥接 tools，不消费 resources/prompts。公开名是 `(serverName, rawName)` 的确定函数；规范化或截断会加 hash。重复 serverName、重复原始名或外部注册冲突会拒绝/回滚一整代，避免半套工具残留。

`callTool` 有 timeout/abort；list_changed 和重连按整代替换注册。stdio 崩溃由 supervisor 指数退避，预算耗尽会注销工具；HTTP 不可达更多表现为逐请求失败，不能把 stdio 的 spawn/reconnect 语义外推给 HTTP。

## ACP：Harness 作为自动化 Agent server

ACP bridge 占用 stdin/stdout，stdout 必须协议纯净。一个连接可拥有多会话；`session/new` 需要绝对 cwd，当前拒绝非空 additional directories 和 MCP servers。

公开面有意较窄：文本 prompt、已提交 assistant 文本、一次性权限应答、取消和连接级清理。不公开完整 reasoning/tool/plan/title/transcript，也不支持 load/list/fork/delete 与单会话 close。`end_turn` 表示桥接拥有的活动已停稳，不应解释成某个底层 turn 的精确 finish reason。

ACP SDK `01010146a731...` 的 v2 实现新增了对内置 response parser 的统一校验、batch response mapper 前校验，以及未识别协议方法/扩展方法的类型区分。这让“协议能连上”更接近“双方 message shape 被验证”，但仍不等于 Harness 暴露了完整会话管理、完整 transcript 或 UI 能力。

## SDK JSON-RPC：仓库自有 wire

`JsonRpcLineTransport` 每行一个 JSON-RPC 2.0 frame。非法 JSON 行被忽略；缺失方法返回 `-32601`，handler 异常为 `-32603`。业务方法包括 initialize、session/prompt、shutdown 与 session event/status、subagent 通知。

它流完整 session-event envelope；客户端自己组合“prompt 已持久入队”和“Agent idle”。当前没有协议版本协商、单轮取消和 session close，因此 protocol types、TS client、Python SDK 与 server 应作为原子兼容集升级。

## 选型与门禁

| 目标 | 选择 |
| --- | --- |
| 给 Harness 加外部工具 | MCP |
| 编辑器/父 Agent 驱动 Harness | ACP |
| Python 批处理、采集完整轨迹 | SDK JSON-RPC |
| 自托管 V4、验证 chat template | DSML encoding |
| 浏览器交互产品 | Web/API surface |

门禁：记录双方 SHA/包版本/config hash；真实入口而非手挂插件；stdout 零污染；覆盖非法 frame、断流、timeout、abort、重连；权限拒绝/取消/错误产生唯一可审计结果；工具 schema 变化不能静默改名或部分注册。
