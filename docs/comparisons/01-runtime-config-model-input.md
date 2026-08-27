# 六套 Harness 怎样形成一次模型输入

[返回课程总目录](../README.md) · [下一篇：Agent Loop、工具与执行](02-loop-tools-execution.md)

模型不会直接读取整个仓库，因为每一次采样之前，Harness 都要先把用户目标、系统指令、项目规则、历史消息、工具定义和运行状态投影成一个有界请求。本篇关心的不是谁的「提示词更强」，而是六套实现如何回答三个具体问题：输入从哪里来，最终顺序由谁决定，以及哪些状态根本没有进入模型。

![六套 Harness 的模型输入路径](../../assets/diagrams/comparisons/01-runtime-config-model-input.svg)

## 先用运费任务建立问题

用户说：「修复订单金额为 100 元时仍收取运费的问题，并运行测试确认。」第一轮里，模型至少要看到用户目标和可用工具，但它还没必要立刻读完全部源码。等读取工具返回 `shipping.ts` 以后，第二轮输入才会带上真实的文件内容。如果项目规则写着「禁止修改测试」，那么这条约束必须在模型决定编辑之前可见，或者由权限层直接强制执行。

所以，「模型输入」会随着工具结果和运行状态在每一轮重新计算，它并非启动时只生成一次的字符串：

```text
稳定前缀：系统指令、项目规则、工具定义
任务输入：用户目标、补充约束
运行历史：模型消息、工具调用、工具结果
动态状态：工作目录、活动 Agent、剩余预算、压缩摘要
```

虽然各套 Harness 对这些部分的命名和持久化方式各不相同，但它们最终都得把这些信息转成 Provider 能够理解的消息与 Tool Schema。

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

只要这条链上有一步出错，就可能出现「模型为什么没看见」：配置读自另一个目录，工具在投影时被过滤，历史落在非活动分支，压缩摘要遗漏了事实，又或者 Provider 转换丢失了某类消息。

## 六条主线的真实切入点

| 课程 | 输入装配的主要入口 | 值得学习的差异 | 继续阅读 |
| --- | --- | --- | --- |
| DeepSeek Harness | Preset、Bundle、Prompt 与 Context/Cache 包 | 能力通过多包装配；Prompt、KV Cache 和 Code Mode 共同影响请求 | [Prompt、Context 与 Cache](../harnesses/deepseek-harness/02-prompt-context-cache.md) |
| Codex | Config、项目指令、Thread/Turn 与请求构造 | 强类型事件和项目指令进入同一 Thread；稳定前缀还影响缓存 | [配置、项目指令与模型输入](../harnesses/codex/01-config-prompt-context.md) |
| Gemini CLI | Config、Prompt、Turn 与 Core | 当前 Turn/Scheduler 主链要与 Legacy Agent Session 分开 | [配置、Prompt 与 Context](../harnesses/gemini-cli/01-config-prompt-context.md) |
| Claude | Agent SDK Options、Transport 参数和公开消息类型 | SDK 能证明应用侧输入与控制协议，不能展开闭源 CLI 内部装配 | [Python 入口、Transport 与控制连接](../harnesses/claude/02-python-entry-transport-control.md) |
| pi | Resource Loader、System Prompt、活动工具和 Session Context | 资源先形成一致快照；完整 Session Tree 与模型投影明确分开 | [Coding Agent、Prompt 与 Extensions](../harnesses/pi/03-coding-agent-extensions.md) |
| OpenCode | Project/Config、Session Prompt、有效历史与 Provider 转换 | 服务端 Directory 决定项目身份；数据库历史、有效历史和 Provider 消息是三种视图 | [Runtime、Project、Config 与 Provider](../harnesses/opencode/01-runtime-config-provider.md) |

这张表不能当作接口对照表。例如 Claude 的公开 SDK 边界与其他五个开源运行时并不相同，即使它们都有 `messages` 字段，也不能据此假定自己能够核对同样深度的内部行为。

## 配置合并为什么是输入问题

配置除了选择模型，还可能决定项目指令、Tool Allowlist、Permission、Hook、Extension 和压缩阈值。一个后写入的值会不会覆盖前值，要回到各项目真实的合并语义中判断，因为标量可能覆盖，数组可能拼接，而管理员配置还可能在项目配置之后再次收口。

新人排查这类问题时，最实用的做法是先记下 Provenance，让每个最终值都能追回它的来源：

| 最终字段 | 最终值 | 来源 | 为什么胜出 |
| --- | --- | --- | --- |
| Model | 具体 Provider/Model | 用户或 Agent 配置 | 显式选择覆盖默认 |
| Instructions | 多段项目规则 | 全局 + 仓库 | 按各项目顺序合并 |
| Tools | 本轮可见集合 | Preset/Agent/Feature | 注册表经过投影 |
| Permission | 有效规则集 | 用户 + 项目 + 管理策略 | 按真实优先级求值 |

如果缺少来源信息——也就是 Provenance——那么即使「最终 JSON 看起来正确」，也仍然解释不了为什么换一个目录、客户端或 Session 就会得到不同的请求。

## Tool Schema 和自然语言指南必须一致

模型通常会同时看到两种工具信息，其中结构化 Tool Schema 给出名称、参数和描述，而 System Prompt 或项目指南负责说明何时使用它。一旦两者来自不同的资源快照，就可能出现工具可以调用、模型却毫不知情的情况，也可能让 Prompt 继续推荐一个已经删除的工具。

DeepSeek Harness 通过 Preset/Bundle 完成装配，pi 使用 Resource Loader 和活动工具生成 Prompt，OpenCode 则在 Session Prompt 之前投影 Registry，而 Codex 与 Gemini CLI 也会按照策略和运行配置形成实际工具集合。因此，比较时要检查「本轮发给模型的最终工具表」，不能只数源码中曾经注册过哪些工具。

## Session 中有记录，不代表这一轮可见

至少有四种常见过滤：

1. 当前只选择 Session Tree 的一个活动分支；
2. Compaction Summary 替换了旧前缀；
3. UI 或审计 Entry 不属于模型消息；
4. Provider Adapter 对角色、Tool Result 或附件做了再次转换。

pi 明确区分完整 Entry Tree、活动路径和 Context Entries，OpenCode 则把数据库记录、压缩后的有效历史与 Provider Messages 分成三种视图。Codex 的 Rollout/Compaction、Gemini CLI 的历史压缩和 DeepSeek Harness 的 Session/Context 也都呈现了同类边界，所以调试时应当抓取真正进入 Provider 的安全脱敏请求，只打开 Session 文件还不够。

## 用同一个故障排查法

当模型说「我看不到测试文件」时，按下面顺序排查：

1. **项目身份**：当前 Server/CWD/Project 是否真指向目标仓库；
2. **能力装配**：读取工具是否注册并进入本轮可见集合；
3. **Prompt 与 Schema**：文字说明和 Tool Schema 是否来自同一快照；
4. **历史投影**：读取结果是否写入正确 Session、Call ID 和活动分支；
5. **压缩变换**：摘要或 Hook 是否丢掉路径和工具结果；
6. **Provider 转换**：最终消息是否仍保留 Tool Result；
7. **证据边界**：公开来源是否真的能观察到该阶段。

按这个顺序，调试者会先核对可以确定的系统事实，到最后才需要怀疑模型是不是「忘了」。很多看似是模型的问题，其实源于 Harness 把错误的观察交给了模型。

## 设计取舍：稳定、完整和有界不可能同时最大化

如果一味追求输入完整，Token 用量和延迟就会上升，而压缩过于激进又会增加遗漏未完成事项的风险。动态插入的内容越多，稳定前缀和缓存命中也越容易受影响，因此好的 Harness 会明确哪些信息必须精确保留，哪些可以摘要，哪些适合等到需要时再通过工具读取。

放到运费任务里，用户目标、禁止修改测试的约束和最新测试失败都必须精确保留，整份仓库目录则可以按需读取，很久以前的无关探索也可以压成摘要。这种分类贴近任务语义，比简单按消息时间截断更可靠。

## 练习：为一次模型请求画输入清单

任选两条课程，假设 Agent 已经读取 `shipping.ts` 但还没有编辑，然后分别列出项目身份、系统/项目指令、用户目标、工具定义、历史消息、读取结果和动态状态各自落在哪个对象或函数附近。如果某项无法从公开源码中核对，也要把这道边界明确写出来。

<details>
<summary>查看核对标准</summary>

答案不要求两套实现使用相同的字段名，但必须指向两条真实调用链，而且要区分「存储里存在」与「本轮进入 Provider」。Claude 课程读到公开 SDK/CLI 的边界就应停下，不能借用其他项目的实现来补齐闭源产品。

</details>

[下一篇：六套 Harness 怎样完成模型—工具闭环](02-loop-tools-execution.md)
