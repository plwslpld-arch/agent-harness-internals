# 六套 Harness 怎样形成一次模型输入

[返回课程总目录](../README.md) · [下一篇：Agent Loop、工具与执行](02-loop-tools-execution.md)

模型不会直接读取整个仓库。每一次采样之前，Harness 都要把用户目标、系统指令、项目规则、历史消息、工具定义和运行状态投影成一个有界请求。本篇不比较谁「提示词更强」，而是追踪六套实现怎样回答三个问题：输入来自哪里，谁决定最终顺序，哪些状态根本没有进入模型。

![六套 Harness 的模型输入路径](../../assets/diagrams/comparisons/01-runtime-config-model-input.svg)

## 先用运费任务建立问题

用户说：「修复订单金额为 100 元时仍收取运费的问题，并运行测试确认。」模型第一轮至少需要看见用户目标和可用工具；它未必需要立刻看见全部源码。读取工具返回 `shipping.ts` 后，第二轮输入又多出真实文件内容。若项目规则写着「禁止修改测试」，这条约束必须在编辑决定之前可见或被权限层强制。

因此，「模型输入」不是启动时生成一次的字符串，而是每轮重新计算的观察：

```text
稳定前缀：系统指令、项目规则、工具定义
任务输入：用户目标、补充约束
运行历史：模型消息、工具调用、工具结果
动态状态：工作目录、活动 Agent、剩余预算、压缩摘要
```

不同 Harness 对这些部分的命名和持久化方式不同，但都必须把它们变成 Provider 能理解的消息与 Tool Schema。

## 共同调用链

```text
配置与项目身份
  → 选择模型、Agent/Preset 和工具集合
  → 加载项目指令、Skill 或 Context 文件
  → 选择 Session 的有效历史
  → 应用压缩、Hook 或 Context Transform
  → 转换为 Provider 消息和 Tool Schema
  → 发起本轮模型请求
```

这条链上任何一步都可能造成「模型为什么没看见」：配置来自另一个目录、工具在投影时被过滤、历史不在当前分支、压缩摘要遗漏事实，或 Provider 转换丢失了某类消息。

## 六条主线的真实切入点

| 课程 | 输入装配的主要入口 | 值得学习的差异 | 继续阅读 |
| --- | --- | --- | --- |
| DeepSeek Harness | Preset、Bundle、Prompt 与 Context/Cache 包 | 能力通过多包装配；Prompt、KV Cache 和 Code Mode 共同影响请求 | [Prompt、Context 与 Cache](../harnesses/deepseek-harness/02-prompt-context-cache.md) |
| Codex | Config、项目指令、Thread/Turn 与请求构造 | 强类型事件和项目指令进入同一 Thread；稳定前缀还影响缓存 | [配置、项目指令与模型输入](../harnesses/codex/01-config-prompt-context.md) |
| Gemini CLI | Config、Prompt、Turn 与 Core | 当前 Turn/Scheduler 主链要与 Legacy Agent Session 分开 | [配置、Prompt 与 Context](../harnesses/gemini-cli/01-config-prompt-context.md) |
| Claude | Agent SDK Options、Transport 参数和公开消息类型 | SDK 能证明应用侧输入与控制协议，不能展开闭源 CLI 内部装配 | [Python 入口、Transport 与控制连接](../harnesses/claude/02-python-entry-transport-control.md) |
| pi | Resource Loader、System Prompt、活动工具和 Session Context | 资源先形成一致快照；完整 Session Tree 与模型投影明确分开 | [Coding Agent、Prompt 与 Extensions](../harnesses/pi/03-coding-agent-extensions.md) |
| OpenCode | Project/Config、Session Prompt、有效历史与 Provider 转换 | 服务端 Directory 决定项目身份；数据库历史、有效历史和 Provider 消息是三种视图 | [Runtime、Project、Config 与 Provider](../harnesses/opencode/01-runtime-config-provider.md) |

这张表不是接口对照表。例如 Claude 的公开 SDK 边界与其他五个开源运行时不同，不能因为都有 `messages` 字段就假设能够核对同样深度的内部行为。

## 配置合并为什么是输入问题

配置不仅选择模型，还可能决定项目指令、Tool Allowlist、Permission、Hook、Extension 和压缩阈值。最后写入的值是否覆盖之前值，取决于各项目真实合并语义：标量可能覆盖，数组可能拼接，管理员配置可能在项目配置之后再次收口。

对新人最实用的排查方法是记录 Provenance：

| 最终字段 | 最终值 | 来源 | 为什么胜出 |
| --- | --- | --- | --- |
| Model | 具体 Provider/Model | 用户或 Agent 配置 | 显式选择覆盖默认 |
| Instructions | 多段项目规则 | 全局 + 仓库 | 按各项目顺序合并 |
| Tools | 本轮可见集合 | Preset/Agent/Feature | 注册表经过投影 |
| Permission | 有效规则集 | 用户 + 项目 + 管理策略 | 按真实优先级求值 |

没有来源信息时，「最终 JSON 看起来正确」仍不足以解释为什么另一个目录、客户端或 Session 得到不同请求。

## Tool Schema 和自然语言指南必须一致

模型通常同时看到两种工具信息：结构化 Tool Schema 告诉它名称、参数和描述；System Prompt 或项目指南告诉它什么时候使用。二者若来自不同资源快照，就会出现工具可调用但模型不知道，或 Prompt 推荐一个已经删除的工具。

DeepSeek Harness 通过 Preset/Bundle 装配，pi 通过 Resource Loader 和活动工具生成 Prompt，OpenCode 在 Session Prompt 前投影 Registry，Codex 与 Gemini CLI 也会根据策略和运行配置形成实际工具集合。比较时应检查「本轮发给模型的最终工具表」，而不是只看源码中注册过哪些工具。

## Session 中有记录，不代表这一轮可见

至少有四种常见过滤：

1. 当前只选择 Session Tree 的一个活动分支；
2. Compaction Summary 替换了旧前缀；
3. UI 或审计 Entry 不属于模型消息；
4. Provider Adapter 对角色、Tool Result 或附件做了再次转换。

pi 明确区分完整 Entry Tree、活动路径和 Context Entries；OpenCode 区分数据库记录、压缩后的有效历史和 Provider Messages；Codex 的 Rollout/Compaction、Gemini CLI 的历史压缩、DeepSeek Harness 的 Session/Context 也体现同样问题。调试时要抓取真正进入 Provider 的安全脱敏请求，而不是只打开 Session 文件。

## 用同一个故障排查法

当模型说「我看不到测试文件」时，按下面顺序排查：

1. **项目身份**：当前 Server/CWD/Project 是否真指向目标仓库；
2. **能力装配**：读取工具是否注册并进入本轮可见集合；
3. **Prompt 与 Schema**：文字说明和 Tool Schema 是否来自同一快照；
4. **历史投影**：读取结果是否写入正确 Session、Call ID 和活动分支；
5. **压缩变换**：摘要或 Hook 是否丢掉路径和工具结果；
6. **Provider 转换**：最终消息是否仍保留 Tool Result；
7. **证据边界**：公开来源是否真的能观察到该阶段。

这个顺序先检查确定性系统事实，最后才怀疑模型「忘了」。很多所谓模型问题，实际是 Harness 把错误观察交给了模型。

## 设计取舍：稳定、完整和有界不可能同时最大化

输入越完整，Token 和延迟越高；压缩越激进，遗漏未完成事项的风险越大；动态插入越多，稳定前缀和缓存命中越差。好的 Harness 不追求把一切都塞进 Context，而是明确哪些信息必须精确、哪些可以摘要、哪些应在需要时通过工具重新读取。

对于运费任务，用户目标、禁止修改测试的约束和最新测试失败必须精确保留；整份仓库目录可以按需读取；很久以前的无关探索可以摘要。这个分类比简单按消息时间截断更接近任务语义。

## 练习：为一次模型请求画输入清单

任选两条课程，假设 Agent 已读取 `shipping.ts` 但尚未编辑。分别列出：项目身份、系统/项目指令、用户目标、工具定义、历史消息、读取结果和动态状态落在哪个对象或函数附近。若某项公开源码无法核对，也要明确写出边界。

<details>
<summary>查看核对标准</summary>

答案不要求字段名相同，但必须指向两条真实调用链，并区分「存储里存在」与「本轮进入 Provider」。Claude 课程应在公开 SDK/CLI 边界处停止，不能用其他项目实现补全闭源产品。

</details>

[下一篇：六套 Harness 怎样完成模型—工具闭环](02-loop-tools-execution.md)
