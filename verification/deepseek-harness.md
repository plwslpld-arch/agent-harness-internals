# DeepSeek Harness 课程：论断与上游证据台账

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

提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。

| 编号 | 课程论断 | 正文位置 | 上游锚点 | 期望片段 | 状态 |
| --- | --- | --- | --- | --- | --- |
| de-01 | Profile 清单保存有序 Bundle 列表 | [01-boot-preset](../docs/harnesses/deepseek-harness/01-boot-preset.md) | [profile.ts#L41-L94](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L41-L94) | `export interface DshProfileManifest` | passed |
| de-02 | 内置 Bundle 优先从当前安装解析 | [01-boot-preset](../docs/harnesses/deepseek-harness/01-boot-preset.md) | [profile.ts#L333-L355](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L333-L355) | `export function resolveBundleDir` | passed |
| de-03 | 加载失败要尽早暴露 | [01-boot-preset](../docs/harnesses/deepseek-harness/01-boot-preset.md) | [profile.ts#L371-L402](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L371-L402) | `loadProfile` | passed |
| de-04 | 最终 Entry 从空列表按层合成 | [01-boot-preset](../docs/harnesses/deepseek-harness/01-boot-preset.md) | [profile.ts#L405-L419](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L405-L419) | `export function composeEntries` | passed |
| de-05 | SystemPrompt Registry 保留结构化 Assembly | [02-prompt-context-cache](../docs/harnesses/deepseek-harness/02-prompt-context-cache.md) | [index.ts#L87-L120](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/system-prompt/src/index.ts#L87-L120) | `Assembly` | passed |
| de-06 | 同名 Scoped Section 可以覆盖全局项 | [02-prompt-context-cache](../docs/harnesses/deepseek-harness/02-prompt-context-cache.md) | [index.ts#L459-L539](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/system-prompt/src/index.ts#L459-L539) | `assemble` | passed |
| de-07 | 请求 Header 把会影响前缀的配置做成快照 | [02-prompt-context-cache](../docs/harnesses/deepseek-harness/02-prompt-context-cache.md) | [request-header.ts#L15-L68](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/request-header.ts#L15-L68) | `export function foldRequestHeader` | passed |
| de-08 | Loop 冻结最终 GenerateOptions | [02-prompt-context-cache](../docs/harnesses/deepseek-harness/02-prompt-context-cache.md) | [agent.ts#L426-L513](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L426-L513) | `buildRequest` | passed |
| de-09 | 真实 API 测试检查第二次以后命中 | [02-prompt-context-cache](../docs/harnesses/deepseek-harness/02-prompt-context-cache.md) | [request-cache.e2e.ts#L71-L100](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/tests/request-cache.e2e.ts#L71-L100) | `const finalText` | passed |
| de-10 | 外部输入先进入 Inbox | [03-loop-model-tool](../docs/harnesses/deepseek-harness/03-loop-model-tool.md) | [agent.ts#L108-L137](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L108-L137) | `send` | passed |
| de-11 | Turn 追加边界事件并逐 Step 推进 | [03-loop-model-tool](../docs/harnesses/deepseek-harness/03-loop-model-tool.md) | [agent.ts#L246-L323](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L246-L323) | `turn` | passed |
| de-12 | 流式 Chunk 先落事件，再合成 Assistant Message | [03-loop-model-tool](../docs/harnesses/deepseek-harness/03-loop-model-tool.md) | [agent.ts#L332-L409](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts#L332-L409) | `step` | passed |
| de-13 | 工具调用先解析，再按执行模式分组 | [03-loop-model-tool](../docs/harnesses/deepseek-harness/03-loop-model-tool.md) | [tool-calls.ts#L59-L100](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/tool-calls.ts#L59-L100) | `executeToolCalls` | passed |
| de-14 | Call 与 Result 用事件序号建立因果关系 | [03-loop-model-tool](../docs/harnesses/deepseek-harness/03-loop-model-tool.md) | [tool-calls.ts#L261-L288](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/tool-calls.ts#L261-L288) | `function appendToolResult` | passed |
| de-15 | 工具定义同时声明输入、输出和执行体 | [04-tools-security](../docs/harnesses/deepseek-harness/04-tools-security.md) | [index.ts#L211-L269](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L211-L269) | `export interface ToolOutputDefinition` | passed |
| de-16 | 注册与 Scope Restriction 是不同操作 | [04-tools-security](../docs/harnesses/deepseek-harness/04-tools-security.md) | [index.ts#L1031-L1080](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/index.ts#L1031-L1080) | `Restriction` | passed |
| de-17 | Approval 每次询问都写成一对 Session Event | [04-tools-security](../docs/harnesses/deepseek-harness/04-tools-security.md) | [index.ts#L250-L275](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/interaction/user-approval/src/index.ts#L250-L275) | `const session` | passed |
| de-18 | 提权参数必须成对并严格变宽 | [04-tools-security](../docs/harnesses/deepseek-harness/04-tools-security.md) | [escalation.ts#L22-L59](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/sandbox/sandbox/src/escalation.ts#L22-L59) | `export function validateEscalationArgs` | passed |
| de-19 | 授权发生在任何执行之前 | [04-tools-security](../docs/harnesses/deepseek-harness/04-tools-security.md) | [escalation.ts#L144-L187](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/sandbox/sandbox/src/escalation.ts#L144-L187) | `approveEscalation` | passed |
| de-20 | 恢复 Seed 先验证，再进入 Session | [05-session-compaction](../docs/harnesses/deepseek-harness/05-session-compaction.md) | [index.ts#L474-L547](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/index.ts#L474-L547) | `const restoredHeader` | passed |
| de-21 | Append 是内存提交点，不等待磁盘 I/O | [05-session-compaction](../docs/harnesses/deepseek-harness/05-session-compaction.md) | [index.ts#L569-L648](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/index.ts#L569-L648) | `append` | passed |
| de-22 | 模型历史从 Surface 增量派生 | [05-session-compaction](../docs/harnesses/deepseek-harness/05-session-compaction.md) | [index.ts#L704-L746](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/session/src/index.ts#L704-L746) | `deriveMessages` | passed |
| de-23 | Start/End 把异步摘要包进事务 | [05-session-compaction](../docs/harnesses/deepseek-harness/05-session-compaction.md) | [region.ts#L152-L249](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/compaction/compaction-basic/src/region.ts#L152-L249) | `Start` | passed |
| de-24 | 摘要消息替换旧 Surface，但保留因果 | [05-session-compaction](../docs/harnesses/deepseek-harness/05-session-compaction.md) | [region.ts#L429-L465](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/compaction/compaction-basic/src/region.ts#L429-L465) | `const callProvenance` | passed |
| de-25 | 创建子 Agent 之前冻结继承关系 | [06-orchestration-extensions](../docs/harnesses/deepseek-harness/06-orchestration-extensions.md) | [index.ts#L67-L147](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/subagent/subagent-in-process-driver/src/index.ts#L67-L147) | `startInProcessRun` | passed |
| de-26 | 结果、取消与释放是三件事 | [06-orchestration-extensions](../docs/harnesses/deepseek-harness/06-orchestration-extensions.md) | [index.ts#L150-L232](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/subagent/subagent-in-process-driver/src/index.ts#L150-L232) | `function drivePublishedRun` | passed |
| de-27 | 每个开始事件都有对应结束事件 | [06-orchestration-extensions](../docs/harnesses/deepseek-harness/06-orchestration-extensions.md) | [index.ts#L31-L100](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/workflow/workflow/src/index.ts#L31-L100) | `export type WorkflowEventName` | passed |
| de-28 | 观察器不能接管运行控制 | [06-orchestration-extensions](../docs/harnesses/deepseek-harness/06-orchestration-extensions.md) | [index.ts#L150-L186](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/workflow/workflow/src/index.ts#L150-L186) | `WorkflowEngine` | passed |
| de-29 | 内部调用复用 Registry 的执行与并发规则 | [06-orchestration-extensions](../docs/harnesses/deepseek-harness/06-orchestration-extensions.md) | [code-mode.ts#L296-L380](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/code-mode.ts#L296-L380) | `createRunCodeTool` | passed |
| de-30 | 程序只能绑定当前 Agent 真正可见的工具 | [06-orchestration-extensions](../docs/harnesses/deepseek-harness/06-orchestration-extensions.md) | [code-mode.ts#L604-L648](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/tools/src/code-mode.ts#L604-L648) | `const functions` | passed |
| de-31 | Headless 等待完整装配后才创建 Agent | [07-surfaces-feedback-eval](../docs/harnesses/deepseek-harness/07-surfaces-feedback-eval.md) | [index.ts#L90-L134](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/bundle/headless/src/index.ts#L90-L134) | `Headless` | passed |
| de-32 | 先预留 Prompt 槽位，再做异步接纳 | [07-surfaces-feedback-eval](../docs/harnesses/deepseek-harness/07-surfaces-feedback-eval.md) | [index.ts#L335-L422](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/src/index.ts#L335-L422) | `prompt` | passed |
| de-33 | 协议只发送已提交的 Assistant 消息 | [07-surfaces-feedback-eval](../docs/harnesses/deepseek-harness/07-surfaces-feedback-eval.md) | [index.ts#L218-L252](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/src/index.ts#L218-L252) | `const previous` | passed |
| de-34 | 权限响应只产生一次性决定 | [07-surfaces-feedback-eval](../docs/harnesses/deepseek-harness/07-surfaces-feedback-eval.md) | [index.ts#L268-L284](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/acp/acp/src/index.ts#L268-L284) | `requestPermission` | passed |
| de-35 | 消息反馈用 Revision 处理并发修改 | [07-surfaces-feedback-eval](../docs/harnesses/deepseek-harness/07-surfaces-feedback-eval.md) | [types.ts#L12-L76](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/feedback/message-feedback/src/types.ts#L12-L76) | `export interface MessageFeedbackDeleteRequest` | passed |
| de-36 | 错误必须标明哪个包违反了什么约束 | [08-verification-design-limits](../docs/harnesses/deepseek-harness/08-verification-design-limits.md) | [index.ts#L24-L66](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/runtime-diagnostics/invariants/src/index.ts#L24-L66) | `InvariantError` | passed |
| de-37 | 注册、筛选与生命周期由统一服务管理 | [08-verification-design-limits](../docs/harnesses/deepseek-harness/08-verification-design-limits.md) | [index.ts#L93-L197](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/runtime-diagnostics/invariants/src/index.ts#L93-L197) | `register` | passed |
| de-38 | 按测试拥有者选择 Companion | [08-verification-design-limits](../docs/harnesses/deepseek-harness/08-verification-design-limits.md) | [test-invariants.ts#L137-L157](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/scripts/test-invariants.ts#L137-L157) | `Companion` | passed |

## 这张表不能证明什么

锚点成立只说明那段代码在锁定提交里是这样写的。它不证明真实运行一定走到这条分支，
不证明其他版本有同样行为，也不证明这些位置覆盖了对应机制的全部路径。正文里凡是
超出锚点内容的说法，都应当写成机制解释，并在这张表里保持 blocked，而不是借一条
邻近的锚点冒充证据。
