---
sources: [{"repo":"deepseek-harness","path":"packages","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"},{"repo":"acp-typescript-sdk","path":".","commit":"e1054d0122e844cca9f1016a598a1da06f78ccef"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"}]
last_verified: 2026-08-13
status: stale
depth: L2
evidence: [code, official-doc, inference]
---

# 协议实现对照研究

研究基线为 Harness `47f943859bef…` 与 V4 模型仓库 `7872f01b1d1f…`。

| 问题 | 代码证据 | 结论 |
| --- | --- | --- |
| 在线 DeepSeek 请求是否发送 DSML 文本 | Harness `llm-deepseek/src/serialize.ts` 与模型 `encoding_dsv4.py` | 两者服务不同部署面：Chat Completions wire 与本地模型 prompt 编码，不能混为一种协议 |
| MCP 能力范围 | `mcp-client/src/{transport,tools,index}.ts` 及 README/tests | 当前只桥接 tools；资源/提示词不应列为已实现能力 |
| ACP 是否等于产品 UI | `acp/src/index.ts`、`examples/acp-agent` | 只暴露窄自动化面；Web 承担交互、完整展示与设置 |
| SDK JSON-RPC 是否兼容 ACP | `sdk/protocol/src/types.ts`、ACP codec | 都用 JSON-RPC 但 method/生命周期/事件语义不同，是两套协议 |
| 权限由协议还是工具执行 | ACP permission bridge 与 core tools pipeline | ACP 只承载一次性请求/回答；最终结算仍走工具流水线 |

### DeepSeek adapter 的关键行为

[code] adapter 只发 streaming request，SSE parser 要求完成标志；reasoning 仅在带 tool calls 的 assistant 回合回传，不带调用的旧 reasoning 会省略。空 assistant content 保持空字符串；`max_tokens` 是 wire 字段；unknown finish、缺完成、malformed JSON、idle timeout、auth/quota/rate/context/server/transport 各自分类。

[inference] 因此通用 OpenAI-compatible adapter 即使“能返回文本”，仍需对 reasoning replay、并行 tool delta、usage/cache 和错误 taxonomy 做专门等价测试。

### MCP 的代际更新

[code] 工具公开名由 server/raw name 决定，重新发现不会因顺序漂移。发现失败保留旧一代，注册冲突回滚本次一整代；崩溃恢复成功后替换旧代，预算耗尽则注销。

[test gap question] 生产接入还需验证恶意 schema、工具列表大规模变化、HTTP 鉴权过期、stdout 污染与 prompt-injection 输出；代码存在的重连不等于远端服务可信。

### ACP/SDK 生命周期差异

[code] ACP 一个连接拥有多个新会话，连接清理会 drain 自有可继续后代；SDK runtime 更像一个由外部进程管理的无人值守组合。ACP prompt 返回 stop reason，SDK prompt 先返回持久入队 message id，再靠 event/status 判定活动。

[inference] benchmark 采集优先 SDK full events；编辑器/父 Agent 互操作优先 ACP。不得用一个 client 的成功用例为另一套 wire 背书。
