# pi 课程：论断与上游证据台账

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

提交 `c1279a65b3ef6b0b19950ed1771d5933241c240f`。

| 编号 | 课程论断 | 正文位置 | 上游锚点 | 期望片段 | 状态 |
| --- | --- | --- | --- | --- | --- |
| pi-01 | 共同类型保留统一字段和 Provider 身份 | [01-layers-provider-stream](../docs/harnesses/pi/01-layers-provider-stream.md) | [types.ts#L372-L467](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/ai/src/types.ts#L372-L467) | `export interface ToolResultMessage` | passed |
| pi-02 | 模型目录、Provider 实现和认证缺一不可 | [01-layers-provider-stream](../docs/harnesses/pi/01-layers-provider-stream.md) | [models.ts#L628-L679](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/ai/src/models.ts#L628-L679) | `const requestOptions` | passed |
| pi-03 | 两个队列拥有独立 Drain 语义 | [02-agent-loop-tools](../docs/harnesses/pi/02-agent-loop-tools.md) | [agent.ts#L125-L177](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent.ts#L125-L177) | `class PendingMessageQueue` | passed |
| pi-04 | 双层循环定义了输入插入点 | [02-agent-loop-tools](../docs/harnesses/pi/02-agent-loop-tools.md) | [agent-loop.ts#L169-L274](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/agent-loop.ts#L169-L274) | `const executedToolBatch` | passed |
| pi-05 | 装配先建立服务，再加载资源快照 | [03-coding-agent-extensions](../docs/harnesses/pi/03-coding-agent-extensions.md) | [sdk.ts#L171-L186](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/sdk.ts#L171-L186) | `createAgentSession` | passed |
| pi-06 | System Prompt 根据活动工具生成 | [03-coding-agent-extensions](../docs/harnesses/pi/03-coding-agent-extensions.md) | [system-prompt.ts#L79-L119](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/system-prompt.ts#L79-L119) | `const guidelinesList` | passed |
| pi-07 | 活动路径与模型 Context 分开构造 | [04-session-compaction-storage](../docs/harnesses/pi/04-session-compaction-storage.md) | [session-manager.ts#L334-L469](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/core/session-manager.ts#L334-L469) | `export function sessionEntryToContextMessages` | passed |
| pi-08 | JSONL Repo 处理尾部损坏和追加队列 | [04-session-compaction-storage](../docs/harnesses/pi/04-session-compaction-storage.md) | [repo.ts#L109-L177](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/agent/src/harness/session/jsonl/repo.ts#L109-L177) | `export class JsonlSessionRepo` | passed |
| pi-09 | Frame Boundary 与 Message Codec 分两层 | [05-protocol-server-client](../docs/harnesses/pi/05-protocol-server-client.md) | [codec.ts#L64-L113](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/protocol/src/codec.ts#L64-L113) | `export function encodeClientMessage` | passed |
| pi-10 | Prompt 前必须先 Attach | [05-protocol-server-client](../docs/harnesses/pi/05-protocol-server-client.md) | [sessions.ts#L47-L117](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/server/src/sessions.ts#L47-L117) | `Attach` | passed |
| pi-11 | 产品模式由参数和 TTY 条件选择 | [06-surfaces-permissions-isolation](../docs/harnesses/pi/06-surfaces-permissions-isolation.md) | [main.ts#L110-L119](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/src/main.ts#L110-L119) | `stdoutIsTTY` | passed |
| pi-12 | Sandbox Extension 存在明确本地回退 | [06-surfaces-permissions-isolation](../docs/harnesses/pi/06-surfaces-permissions-isolation.md) | [index.ts#L1-L260](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/coding-agent/examples/extensions/sandbox/index.ts#L1-L260) | `Extension` | passed |
| pi-13 | Telemetry 接口没有 Score 语义 | [07-telemetry-evals-boundaries](../docs/harnesses/pi/07-telemetry-evals-boundaries.md) | [index.ts#L14-L22](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/telemetry/src/index.ts#L14-L22) | `export interface TelemetryContext` | passed |
| pi-14 | Eval Harness 负责运行和留证 | [07-telemetry-evals-boundaries](../docs/harnesses/pi/07-telemetry-evals-boundaries.md) | [pi-harness.ts#L109-L218](https://github.com/earendil-works/pi/blob/c1279a65b3ef6b0b19950ed1771d5933241c240f/packages/evals/src/pi-harness.ts#L109-L218) | `Eval` | passed |

## 这张表不能证明什么

锚点成立只说明那段代码在锁定提交里是这样写的。它不证明真实运行一定走到这条分支，
不证明其他版本有同样行为，也不证明这些位置覆盖了对应机制的全部路径。正文里凡是
超出锚点内容的说法，都应当写成机制解释，并在这张表里保持 blocked，而不是借一条
邻近的锚点冒充证据。
