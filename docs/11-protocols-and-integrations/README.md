---
sources: [{"repo":"deepseek-harness","path":"packages","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"acp-typescript-sdk","path":".","commit":"e1054d0122e844cca9f1016a598a1da06f78ccef"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 11｜协议与集成入口

本章不按缩写罗列功能，而按“谁和谁通信、模型看到什么、权限在哪里执行、失败如何跨边界传播”理解协议。

| 协议面 | Harness 角色 | 传输 | 用途 | 不是 |
| --- | --- | --- | --- | --- |
| DSML | 编解码参与者 | 模型提示词/补全文本 | V4 工具 schema、调用、结果与 thinking 编码 | 网络 RPC、安全边界 |
| MCP | client | stdio / Streamable HTTP | 外部 server tools 注册为 Harness 工具 | ACP；当前也不是资源/提示词桥 |
| ACP | server | JSON-RPC over stdio | 编辑器/父 Agent 创建会话、提示、取消与权限应答 | 完整 Web UI 或 transcript 协议 |
| SDK JSON-RPC | server + SDK client | 每行一个 JSON-RPC 2.0 frame | Python/TS 无人值守驱动与事件采集 | ACP；当前无版本协商与单轮取消 |

读 [协议边界与转换链](protocol-boundaries.md) 后，再对照锁定源码：

- MCP：`packages/mcp/mcp-client/src/{transport,connection,tools,index}.ts`
- ACP：`packages/acp/acp/src/{codec,index}.ts`
- SDK wire：`packages/sdk/protocol/src/{transport,types}.ts` 与 server/client/Python SDK
- DeepSeek：`packages/llm/llm-deepseek/src/{serialize,sse,translate,adapter}.ts`
- DSML：模型仓库 `encoding/encoding_dsv4.py` 与 golden cases

协议验收必须分开报告握手、能力发现、执行、取消、权限、重连、持久化和业务 E2E；任何一层成功都不能替代其他层。
