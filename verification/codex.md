# Codex 课程：论断与上游证据台账

课程正文里的每一条机制论断，都应该能落到锁定提交中的一段上游代码或测试。这张表是验收清单，不是正文的一部分——它回答的是「凭什么这么说」，而不是「这是什么」。

`npm run check:claims` 会逐条核对：锚点指向的行区间里，必须真的出现「期望片段」那一列声明的字符串。锚点漂移、行号写错、论断被改写却忘了换证据，都会在这里失败。

状态口径沿用严格定义，不允许含糊：

- **passed**：锚点区间内确实存在期望片段，且断言语义支持正文论断；
- **partial**：锚点成立，但只覆盖论断的一部分，正文需要相应收窄；
- **blocked**：上游没有提供可核对的测试，正文只能写成机制解释，不能声称已被验证。

一条论断标成 passed，意思是有人真的打开那几行读过，而不是链接能打开。

## 锁定来源

Codex 提交 `c9b19deb09c1841ce7acc33ddb96276030936a29`，全部锚点都指向 `codex-rs/core/tests/suite/` 下的上游测试。

| 编号 | 课程论断 | 正文位置 | 上游锚点 | 期望片段 | 状态 |
| --- | --- | --- | --- | --- | --- |
| codex-01 | 并发工具的完成顺序可以与写回模型历史的顺序不同，但所有 function_call 必须排在 output 之前，且两者按 call_id 一一对应 | [03 模型响应与工具循环](../docs/harnesses/codex/03-model-tool-loop.md) | [tool_parallelism.rs#L268-L298](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/tool_parallelism.rs#L268-L298) | `all function calls must come before outputs` | passed |
| codex-02 | 关闭细粒度 Sandbox 审批后，`RequireEscalated` 请求直接失败，而不是降级执行 | [04 执行策略、审批与 Sandbox](../docs/harnesses/codex/04-exec-policy-sandbox.md) | [approvals.rs#L1077-L1124](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/approvals.rs#L1077-L1124) | `SandboxPermissions::RequireEscalated` | passed |
| codex-03 | Windows 受限令牌路径无法兑现 Deny-Read 约束时返回错误，不会悄悄裸跑 | [04 执行策略、审批与 Sandbox](../docs/harnesses/codex/04-exec-policy-sandbox.md) | [windows_sandbox.rs#L176-L210](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/windows_sandbox.rs#L176-L210) | `refusing to run unsandboxed` | passed |
| codex-04 | 压缩不是只让 Token 数下降：assistant 历史被清空，Rollout 里留下可核对的 Compacted 记录 | [05 Rollout、历史、压缩与恢复](../docs/harnesses/codex/05-rollout-history-memory.md) | [compact.rs#L635-L697](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/compact.rs#L635-L697) | `assistant history should be cleared` | passed |
| codex-05 | Code Mode 宿主缺失时，是回退到直接工具还是直接失败，取决于配置模式——上游为两种模式各写了一个测试 | [06 扩展表面与 Code Mode](../docs/harnesses/codex/06-extensions-code-mode.md) | [code_mode.rs#L315-L387](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/code_mode.rs#L315-L387) | `missing_process_host_keeps_code_mode_only_and_fails_closed` | passed |
| codex-06 | 子 Agent 结束后父 Rollout 收到关联通知，子 Agent 自己的完整 transcript 另存一条 Rollout | [07 子代理与编排](../docs/harnesses/codex/07-subagents-orchestration.md) | [subagent_notifications.rs#L492-L516](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/subagent_notifications.rs#L492-L516) | `<subagent_notification>` | passed |

## 这张表不能证明什么

上游测试成立，只说明 Codex 在那个提交、那组固定输入下的行为符合断言。它不证明真实模型不会产生别的工具序列，不证明其他平台的 Sandbox 有同样语义，也不证明这些测试覆盖了对应机制的全部分支。正文里凡是超出锚点断言范围的说法，都应当写成机制解释，并在这张表里保持 blocked，而不是借一条邻近的测试冒充证据。
