# OpenCode 课程：论断与上游证据台账

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

提交 `3a31c4ea801915c0b050df4b3842997ea62b6e93`。

| 编号 | 课程论断 | 正文位置 | 上游锚点 | 期望片段 | 状态 |
| --- | --- | --- | --- | --- | --- |
| op-01 | Config Merge 还会处理数组和来源范围 | [01-runtime-config-provider](../docs/harnesses/opencode/01-runtime-config-provider.md) | [config.ts#L351-L429](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/config/config.ts#L351-L429) | — | passed |
| op-02 | Provider 先受白名单和黑名单过滤 | [01-runtime-config-provider](../docs/harnesses/opencode/01-runtime-config-provider.md) | [provider.ts#L1420-L1427](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/provider/provider.ts#L1420-L1427) | — | passed |
| op-03 | 查到 Model 后还要解析具体 SDK | [01-runtime-config-provider](../docs/harnesses/opencode/01-runtime-config-provider.md) | [provider.ts#L1843-L1900](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/provider/provider.ts#L1843-L1900) | `getModel` | passed |
| op-04 | 有 Tool Calls 时不能只看 Provider Finish | [02-session-llm-processor](../docs/harnesses/opencode/02-session-llm-processor.md) | [prompt.ts#L1081-L1130](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/prompt.ts#L1081-L1130) | — | passed |
| op-05 | Processor 把流归约成三个控制信号 | [02-session-llm-processor](../docs/harnesses/opencode/02-session-llm-processor.md) | [processor.ts#L630-L681](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/processor.ts#L630-L681) | — | passed |
| op-06 | Tool 与 Step 事件写入不同事实 | [02-session-llm-processor](../docs/harnesses/opencode/02-session-llm-processor.md) | [processor.ts#L331-L483](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/processor.ts#L331-L483) | — | passed |
| op-07 | 工具目录在交给模型前仍会过滤 | [03-tools-permission-patch](../docs/harnesses/opencode/03-tools-permission-patch.md) | [registry.ts#L256-L339](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/tool/registry.ts#L256-L339) | — | passed |
| op-08 | Permission 使用最后匹配规则 | [03-tools-permission-patch](../docs/harnesses/opencode/03-tools-permission-patch.md) | [index.ts#L28-L38](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/permission/index.ts#L28-L38) | — | passed |
| op-09 | Ask 会等待 Deferred，不会隐式允许 | [03-tools-permission-patch](../docs/harnesses/opencode/03-tools-permission-patch.md) | [index.ts#L67-L105](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/permission/index.ts#L67-L105) | — | passed |
| op-10 | 有效历史可能不是时间顺序 | [04-storage-compaction-revert](../docs/harnesses/opencode/04-storage-compaction-revert.md) | [message-v2.ts#L521-L598](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/message-v2.ts#L521-L598) | — | passed |
| op-11 | 保留尾部按 Token 预算倒推 | [04-storage-compaction-revert](../docs/harnesses/opencode/04-storage-compaction-revert.md) | [compaction.ts#L223-L263](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/compaction.ts#L223-L263) | — | passed |
| op-12 | Revert 同时恢复文件和 Session 控制状态 | [04-storage-compaction-revert](../docs/harnesses/opencode/04-storage-compaction-revert.md) | [revert.ts#L38-L126](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/revert.ts#L38-L126) | — | passed |
| op-13 | 子 Session 权限从父端提取关键限制 | [05-extensions-subagents](../docs/harnesses/opencode/05-extensions-subagents.md) | [subagent-permissions.ts#L14-L26](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/agent/subagent-permissions.ts#L14-L26) | — | passed |
| op-14 | Task Tool 在创建前检查深度和 Agent | [05-extensions-subagents](../docs/harnesses/opencode/05-extensions-subagents.md) | [task.ts#L90-L170](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/tool/task.ts#L90-L170) | — | passed |
| op-15 | Protocol 定义 API Group 和中间件位置 | [06-server-protocol-surfaces](../docs/harnesses/opencode/06-server-protocol-surfaces.md) | [api.ts#L25-L64](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/protocol/src/api.ts#L25-L64) | — | passed |
| op-16 | Session Prompt 与 Events 是不同返回形态 | [06-server-protocol-surfaces](../docs/harnesses/opencode/06-server-protocol-surfaces.md) | [session.ts#L140-L173](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/server/src/handlers/session.ts#L140-L173) | — | passed |
| op-17 | 分享策略区分禁用、手动和自动 | [07-share-telemetry-eval](../docs/harnesses/opencode/07-share-telemetry-eval.md) | [session.ts#L26-L45](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/share/session.ts#L26-L45) | — | passed |
| op-18 | Share 是会话投影的持续复制 | [07-share-telemetry-eval](../docs/harnesses/opencode/07-share-telemetry-eval.md) | [share-next.ts#L179-L200](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/share/share-next.ts#L179-L200) | — | passed |
| op-19 | OpenTelemetry 是条件性注入 | [07-share-telemetry-eval](../docs/harnesses/opencode/07-share-telemetry-eval.md) | [llm.ts#L208-L218](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/llm.ts#L208-L218) | — | passed |

## 这张表不能证明什么

锚点成立只说明那段代码在锁定提交里是这样写的。它不证明真实运行一定走到这条分支，
不证明其他版本有同样行为，也不证明这些位置覆盖了对应机制的全部路径。正文里凡是
超出锚点内容的说法，都应当写成机制解释，并在这张表里保持 blocked，而不是借一条
邻近的锚点冒充证据。
