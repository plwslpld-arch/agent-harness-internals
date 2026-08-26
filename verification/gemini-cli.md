# Gemini CLI 课程：论断与上游证据台账

课程正文用「第 N 站」逐段推进，每一站都是一条可以独立核对的机制论断。这张表把它们
连同锚点抽出来，回答的是「凭什么这么说」，而不是「这是什么」——所以它放在 `docs/` 之外，
不属于正文。

两道检查分工：`npm run check:anchors` 保证锚点指向的行区间在锁定 Checkout 里真实存在、
不是空行；`npm run check:claims` 进一步要求「期望片段」那一列声明的符号确实出现在区间内。
链接文字点名了符号的记录才能做后一种核对，其余只做前一种。

状态口径：
- **passed**：锚点区间存在且内容支持该论断；
- **partial**：锚点成立但只覆盖论断的一部分，正文需要相应收窄；
- **blocked**：上游没有可核对的位置，正文只能写成机制解释，不能声称已被验证。

## 锁定来源

提交 `5411f113cafae26161b4969b0237b8e1e024e2c2`。

| 编号 | 课程论断 | 正文位置 | 上游锚点 | 期望片段 | 状态 |
| --- | --- | --- | --- | --- | --- |
| ge-01 | 未受信工作区先被过滤，再参与合并 | [01-config-prompt-context](../docs/harnesses/gemini-cli/01-config-prompt-context.md) | [settings.ts#L253-L279](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/config/settings.ts#L253-L279) | — | passed |
| ge-02 | 原始文件与有效工作区分开保存 | [01-config-prompt-context](../docs/harnesses/gemini-cli/01-config-prompt-context.md) | [settings.ts#L313-L389](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/config/settings.ts#L313-L389) | `LoadedSettings` | passed |
| ge-03 | 按来源选择注入层 | [01-config-prompt-context](../docs/harnesses/gemini-cli/01-config-prompt-context.md) | [config.ts#L2573-L2613](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/config/config.ts#L2573-L2613) | — | passed |
| ge-04 | 路由是一组有顺序的 Strategy | [02-turn-scheduler-routing](../docs/harnesses/gemini-cli/02-turn-scheduler-routing.md) | [modelRouterService.ts#L35-L74](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/routing/modelRouterService.ts#L35-L74) | — | passed |
| ge-05 | Turn 只有看到真实 FinishReason 才发 Finished | [02-turn-scheduler-routing](../docs/harnesses/gemini-cli/02-turn-scheduler-routing.md) | [turn.ts#L380-L410](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/core/turn.ts#L380-L410) | — | passed |
| ge-06 | 工具请求优先于 Agent Session 结束 | [02-turn-scheduler-routing](../docs/harnesses/gemini-cli/02-turn-scheduler-routing.md) | [legacy-agent-session.ts#L241-L252](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/agent/legacy-agent-session.ts#L241-L252) | — | passed |
| ge-07 | Scheduler 维护显式调用状态机 | [02-turn-scheduler-routing](../docs/harnesses/gemini-cli/02-turn-scheduler-routing.md) | [types.ts#L18-L180](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/types.ts#L18-L180) | — | passed |
| ge-08 | Registry 保留被排除的已知工具 | [03-tools-lifecycle](../docs/harnesses/gemini-cli/03-tools-lifecycle.md) | [tool-registry.ts#L231-L282](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/tool-registry.ts#L231-L282) | — | passed |
| ge-09 | 所有公开查询经过活动过滤 | [03-tools-lifecycle](../docs/harnesses/gemini-cli/03-tools-lifecycle.md) | [tool-registry.ts#L546-L803](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/tool-registry.ts#L546-L803) | — | passed |
| ge-10 | 不存在与参数无效在副作用之前失败 | [03-tools-lifecycle](../docs/harnesses/gemini-cli/03-tools-lifecycle.md) | [scheduler.ts#L330-L420](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/scheduler.ts#L330-L420) | — | passed |
| ge-11 | Executor 把实现结果归约为统一终态 | [03-tools-lifecycle](../docs/harnesses/gemini-cli/03-tools-lifecycle.md) | [tool-executor.ts#L120-L190](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/scheduler/tool-executor.ts#L120-L190) | — | passed |
| ge-12 | 非交互默认拒绝，交互默认询问 | [04-confirmation-policy-safety-sandbox](../docs/harnesses/gemini-cli/04-confirmation-policy-safety-sandbox.md) | [policy-engine.ts#L290-L298](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/policy/policy-engine.ts#L290-L298) | — | passed |
| ge-13 | Message Bus 不自己发明授权 | [04-confirmation-policy-safety-sandbox](../docs/harnesses/gemini-cli/04-confirmation-policy-safety-sandbox.md) | [message-bus.ts#L104-L153](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/confirmation-bus/message-bus.ts#L104-L153) | — | passed |
| ge-14 | 只有启用 Sandbox 才选择平台后端 | [04-confirmation-policy-safety-sandbox](../docs/harnesses/gemini-cli/04-confirmation-policy-safety-sandbox.md) | [sandboxManagerFactory.ts#L31-L42](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/services/sandboxManagerFactory.ts#L31-L42) | — | passed |
| ge-15 | 运行时历史保留 Turn 身份，模型投影去掉它 | [05-session-history-compression-memory](../docs/harnesses/gemini-cli/05-session-history-compression-memory.md) | [agentChatHistory.ts#L19-L67](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/core/agentChatHistory.ts#L19-L67) | `AgentChatHistory` | passed |
| ge-16 | 显式 History 优先，恢复记录需要过滤 | [05-session-history-compression-memory](../docs/harnesses/gemini-cli/05-session-history-compression-memory.md) | [geminiChat.ts#L331-L358](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/core/geminiChat.ts#L331-L358) | — | passed |
| ge-17 | JSONL 逐行追加，写失败后关闭记录通道 | [05-session-history-compression-memory](../docs/harnesses/gemini-cli/05-session-history-compression-memory.md) | [chatRecordingService.ts#L559-L573](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/services/chatRecordingService.ts#L559-L573) | — | passed |
| ge-18 | 切分、摘要与核对是分开的步骤 | [05-session-history-compression-memory](../docs/harnesses/gemini-cli/05-session-history-compression-memory.md) | [chatCompressionService.ts#L323-L411](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/context/chatCompressionService.ts#L323-L411) | — | passed |
| ge-19 | 新历史由摘要握手和尾部组成 | [05-session-history-compression-memory](../docs/harnesses/gemini-cli/05-session-history-compression-memory.md) | [chatCompressionService.ts#L431-L480](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/context/chatCompressionService.ts#L431-L480) | — | passed |
| ge-20 | Extension 切换是一次多 Registry 更新 | [06-agents-hooks-skills-mcp](../docs/harnesses/gemini-cli/06-agents-hooks-skills-mcp.md) | [extensionLoader.ts#L45-L126](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/utils/extensionLoader.ts#L45-L126) | — | passed |
| ge-21 | 加载顺序决定同名 Skill 的最终定义 | [06-agents-hooks-skills-mcp](../docs/harnesses/gemini-cli/06-agents-hooks-skills-mcp.md) | [skillManager.ts#L36-L96](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/skills/skillManager.ts#L36-L96) | — | passed |
| ge-22 | 连接成功后才把能力写入 Registry | [06-agents-hooks-skills-mcp](../docs/harnesses/gemini-cli/06-agents-hooks-skills-mcp.md) | [mcp-client-manager.ts#L437-L508](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/tools/mcp-client-manager.ts#L437-L508) | — | passed |
| ge-23 | 公开事件集合小于 Core Agent Events | [07-surfaces-output-protocol](../docs/harnesses/gemini-cli/07-surfaces-output-protocol.md) | [types.ts#L29-L37](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/output/types.ts#L29-L37) | — | passed |
| ge-24 | 非交互消费者显式忽略部分事件 | [07-surfaces-output-protocol](../docs/harnesses/gemini-cli/07-surfaces-output-protocol.md) | [nonInteractiveCliAgentSession.ts#L675-L684](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/cli/src/nonInteractiveCliAgentSession.ts#L675-L684) | — | passed |
| ge-25 | 按文件路径等待编辑器接受或拒绝 | [07-surfaces-output-protocol](../docs/harnesses/gemini-cli/07-surfaces-output-protocol.md) | [ide-client.ts#L204-L278](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/ide/ide-client.ts#L204-L278) | — | passed |
| ge-26 | Decision 只描述授权动作 | [08-telemetry-errors-eval-design](../docs/harnesses/gemini-cli/08-telemetry-errors-eval-design.md) | [tool-call-decision.ts#L9-L30](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/telemetry/tool-call-decision.ts#L9-L30) | — | passed |
| ge-27 | 启用、目标与 Prompt 记录都由有效配置决定 | [08-telemetry-errors-eval-design](../docs/harnesses/gemini-cli/08-telemetry-errors-eval-design.md) | [config.ts#L47-L127](https://github.com/google-gemini/gemini-cli/blob/5411f113cafae26161b4969b0237b8e1e024e2c2/packages/core/src/telemetry/config.ts#L47-L127) | — | passed |

## 这张表不能证明什么

锚点成立只说明那段代码在锁定提交里是这样写的。它不证明真实运行一定走到这条分支，
不证明其他版本有同样行为，也不证明这些位置覆盖了对应机制的全部路径。正文里凡是
超出锚点内容的说法，都应当写成机制解释，并在这张表里保持 blocked，而不是借一条
邻近的锚点冒充证据。
