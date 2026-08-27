# 六套 Harness 怎样形成一次模型输入

[返回课程总目录](../README.md) · [下一篇：Agent Loop、工具与执行](02-loop-tools-execution.md)

模型不会直接读取整个仓库，因为每次采样前，Harness 都得先取出用户目标、系统指令、项目规则、历史消息、工具定义和运行状态，再按 Context 容量把它们收进一个有界请求。这篇不比谁的「提示词更强」，我们要看六套实现怎样取得输入、由谁定下最终顺序，以及哪些状态压根没有交给模型。

![六套 Harness 的模型输入路径](../assets/diagrams/comparisons/01-runtime-config-model-input.svg)

## 先用运费任务建立问题

用户说：「修复订单金额为 100 元时仍收取运费的问题，并运行测试确认。」第一轮里，模型至少要看到用户目标和可用工具，但没必要立刻把全部源码读完。读取工具拿回 `shipping.ts` 后，下一轮才会看到真实的文件内容。如果项目规则写着「禁止修改测试」，就得在模型决定编辑前把这条约束交给它，否则就要让权限层直接拦住违规操作。

所以，每轮都要根据新的工具结果和运行状态重新算出「模型输入」，它不是启动时生成一次就不再改变的字符串：

```text
稳定前缀：系统指令、项目规则、工具定义
任务输入：用户目标、补充约束
运行历史：模型消息、工具调用、工具结果
动态状态：工作目录、活动 Agent、剩余预算、压缩摘要
```

各套 Harness 给这些内容起的名字不同，保存方式也不同，但最后都得把它们转成 Provider（模型提供商）能读懂的消息和 Tool Schema。名字不是重点。

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

这条链只要有一步走错，你就会遇到「模型为什么没看见」：程序可能从另一个目录读了配置，投影工具时把某个工具过滤掉，把历史写到了非活动分支，压缩摘要时遗漏了事实，或者在转成 Provider 消息时丢了某类内容。

## 六条主线的真实切入点

| 课程 | 输入装配的主要入口 | 值得学习的差异 | 继续阅读 |
| --- | --- | --- | --- |
| DeepSeek Harness | Preset、Bundle、Prompt 与 Context/Cache 包 | 能力通过多包装配；Prompt、KV Cache 和 Code Mode 共同影响请求 | [Prompt、Context 与 Cache](../harnesses/deepseek-harness/02-prompt-context-cache.md) |
| Codex | Config、项目指令、Thread/Turn 与请求构造 | 强类型事件和项目指令进入同一 Thread；稳定前缀还影响缓存 | [配置、项目指令与模型输入](../harnesses/codex/01-config-prompt-context.md) |
| Gemini CLI | Config、Prompt、Turn 与 Core | 当前 Turn/Scheduler 主链要与 Legacy Agent Session 分开 | [配置、Prompt 与 Context](../harnesses/gemini-cli/01-config-prompt-context.md) |
| Claude | Agent SDK Options、Transport 参数和公开消息类型 | SDK 能证明应用侧输入与控制协议，不能展开闭源 CLI 内部装配 | [Python 入口、Transport 与控制连接](../harnesses/claude/02-python-entry-transport-control.md) |
| pi | Resource Loader、System Prompt、活动工具和 Session Context | 资源先形成一致快照；完整 Session Tree 与模型投影明确分开 | [Coding Agent、Prompt 与 Extensions](../harnesses/pi/03-coding-agent-extensions.md) |
| OpenCode | Project/Config、Session Prompt、有效历史与 Provider 转换 | 服务端 Directory 决定项目身份；数据库历史、有效历史和 Provider 消息是三种视图 | [Runtime、Project、Config 与 Provider](../harnesses/opencode/01-runtime-config-provider.md) |

这张表不能当成接口对照表。例如 Claude 的公开 SDK 只能让我们看到某些边界，而其他五套开源运行时能暴露的内部流程并不相同。即使它们都有 `messages` 字段，你也不能因此认为自己能核对同样深度的内部行为。证据到哪里，就说到哪里。

## 配置合并为什么是输入问题

配置不只选模型，它还会定下项目指令、Tool Allowlist、Permission、Hook、Extension 和压缩阈值。想知道后写的值会不会盖掉前值，你得回到各项目的真实合并逻辑：标量可能直接覆盖，数组可能往后拼接，管理员配置还可能在项目配置合并完以后再收紧一遍。

新人排查这类问题时，最好先记下 Provenance，以后看到任何一个最终值，都能顺着记录追回它从哪里来：

| 最终字段 | 最终值 | 来源 | 为什么胜出 |
| --- | --- | --- | --- |
| Model | 具体 Provider/Model | 用户或 Agent 配置 | 显式选择覆盖默认 |
| Instructions | 多段项目规则 | 全局 + 仓库 | 按各项目顺序合并 |
| Tools | 本轮可见集合 | Preset/Agent/Feature | 注册表经过投影 |
| Permission | 有效规则集 | 用户 + 项目 + 管理策略 | 按真实优先级求值 |

没有 Provenance，即使「最终 JSON 看起来正确」，你也解释不了为什么换个目录、客户端或 Session，程序就组出了不同的请求。这一层不能省。

## Tool Schema 和自然语言指南必须一致

模型通常会同时看到两种工具信息：结构化的 Tool Schema 列出名称、参数和描述，System Prompt 或项目指南则告诉模型什么时候该用它。如果两者取自不同的资源快照，模型就可能根本不知道某个工具其实可以调用，Prompt 也可能还在推荐已经删除的工具。两份快照必须对上。

DeepSeek Harness 通过 Preset/Bundle 把内容装起来，pi 让 Resource Loader 根据活动工具生成 Prompt，OpenCode 则先把 Registry 投影出来，再构造 Session Prompt。Codex 和 Gemini CLI 也会读取策略与运行配置，然后定下这一轮真正可见的工具。所以比较时，要检查「本轮发给模型的最终工具表」，不能只数源码里曾经注册过哪些工具。

## Session 中有记录，不代表这一轮可见

至少有四种常见过滤：

1. 当前只选择 Session Tree 的一个活动分支；
2. Compaction Summary 替换了旧前缀；
3. UI 或审计 Entry 不属于模型消息；
4. Provider Adapter 对角色、Tool Result 或附件做了再次转换。

pi 把完整 Entry Tree、当前活动路径和 Context Entries 分开处理，OpenCode 也会分别保留数据库记录、压缩后的有效历史和 Provider Messages。Codex 的 Rollout/Compaction、Gemini CLI 的历史压缩与 DeepSeek Harness 的 Session/Context 同样把这几层分开。所以调试时，你得抓到真正交给 Provider 的请求并安全脱敏。只打开 Session 文件还不够。

## 用同一个故障排查法

当模型说「我看不到测试文件」时，按下面顺序排查：

1. **项目身份**：当前 Server/CWD/Project 是否真指向目标仓库；
2. **能力装配**：读取工具是否注册并进入本轮可见集合；
3. **Prompt 与 Schema**：文字说明和 Tool Schema 是否来自同一快照；
4. **历史投影**：读取结果是否写入正确 Session、Call ID 和活动分支；
5. **压缩变换**：摘要或 Hook 是否丢掉路径和工具结果；
6. **Provider 转换**：最终消息是否仍保留 Tool Result；
7. **证据边界**：公开来源是否真的能观察到该阶段。

按这个顺序查，你会先核对能确定的系统事实，最后才需要怀疑模型是不是「忘了」。很多问题看着像模型在犯错，其实是 Harness 把错误的观察交给了它。所以要先核对输入。

## 设计取舍：稳定、完整和有界不可能同时最大化

如果一味把输入塞得更全，Token 用量和延迟都会上升，可压得太狠又容易漏掉还没做完的事。每轮动态插入的内容越多，稳定前缀就越容易变，缓存也越难命中。因此，Harness 得明确定下哪些信息要精确保留，哪些可以压成摘要，哪些等真正用到时再通过工具读取。

放到运费任务里，Harness 必须精确留下用户目标、「禁止修改测试」这条约束，以及最近一次测试失败。但整份仓库目录可以用到时再读，很久以前那些无关的探索也可以压成摘要。按内容对任务的作用来分类，比简单按消息时间截断更可靠。

## 练习：为一次模型请求画输入清单

任选两条课程，假设 Agent 已经读取 `shipping.ts` 但还没有编辑，然后分别找出项目身份、系统/项目指令、用户目标、工具定义、历史消息、读取结果和动态状态分别由哪个对象保存、在哪个函数附近流转。如果某项无法从公开源码中核对，也要明确写出你能看到哪里、又从哪里开始无法确认。

<details>
<summary>查看核对标准</summary>

答案不要求两套实现使用相同的字段名，但你必须指出两条真实的调用链，并且分清「存储里存在」和「本轮进入 Provider」。Claude 课程读到公开 SDK/CLI 的边界就应停下，不能拿其他项目的实现来补齐看不见的闭源部分。

</details>

[下一篇：六套 Harness 怎样完成模型—工具闭环](02-loop-tools-execution.md)
