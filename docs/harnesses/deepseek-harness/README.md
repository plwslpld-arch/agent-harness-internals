# DeepSeek Harness 源码课程

[返回学习入口](../../00-start-here.md)

DeepSeek Harness 是一套 TypeScript 多包 Agent Harness。它把 Preset、Prompt、模型调用、工具、Session、Code Mode、扩展和评测接缝组合成可装配运行时。课程不会把目录名称直接当成架构结论，而是沿一次任务观察配置怎样变成运行对象、模型输出怎样进入工具循环、状态怎样跨轮保存。

![DeepSeek Harness 系统地图](../../../assets/diagrams/deepseek-harness/system-architecture.svg)

## 这条课程适合谁

如果你想理解一个功能较完整的 Harness 怎样通过包和配置装配能力，可以从这里开始。你只需要能够阅读基础 TypeScript；Cordis、ACP、KV Cache 和 Code Mode 会在遇到实际源码时解释。

## 锁定来源

课程基于 DeepSeek Harness 提交 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。建议先打开三个入口建立地图：

- [标准 Agent Preset](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/apps/cli/config/agent-presets/standard/agent.cordis.yml)
- [Agent Loop 实现](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/src/agent.ts)
- [Agent Loop 测试](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/core/agent-loop/tests/loop.spec.ts)

源码链接固定到同一提交，避免默认分支变化后文章和实现错位。

## 先看一项任务

课程使用「修复失败测试」的共同任务，但进入源码后会映射到 DeepSeek Harness 自己的对象：CLI 选择 Preset，配置装配 Prompt 和工具，Agent Loop 发起模型请求，工具调用成为新的 Message，Session 保留事件，最终产物可以被 ACP 表面或评测适配器读取。

```text
CLI / ACP 输入
  → Preset 与 Bundle 装配
  → Prompt、模型与工具就绪
  → Agent Loop
  → 工具调用与结果消息
  → Session 与输出表面
```

![DeepSeek Harness 端到端任务流程](../../../assets/diagrams/deepseek-harness/end-to-end-task.svg)

这张图是按锁定源码重建的阅读路线，不是运行时自动生成的 Trace。进入各章后，每个箭头都会落到具体文件、对象和上游测试。

## 仓库地图

| 区域 | 首轮关注点 |
| --- | --- |
| `apps/cli` | 参数、Preset 和启动入口怎样选择运行配置 |
| `packages/bundle` | 多个能力怎样通过 Bundle 组合 |
| `packages/core/agent-loop` | 模型、工具结果和停止条件怎样形成循环 |
| Prompt 与上下文相关包 | 系统提示、历史、Cache 和压缩信息怎样进入请求 |
| 工具与 Code Mode 相关包 | 普通工具和代码执行路径怎样连接 Environment |
| Session 与协议表面 | 消息怎样持久化并暴露给 CLI、ACP 或其他宿主 |

首次阅读可以跳过网站、构建脚本和与当前调用链无关的 Provider 兼容代码。

## 三层读法

- **Starter**：读完前三篇，能解释 Preset 怎样装配能力、模型工具请求怎样回到下一轮。
- **Builder**：继续读工具、Code Mode、Session 与 Compaction，选择一个配置字段追到行为变化。
- **Maintainer**：阅读编排、产品表面和核对篇，检查失败分类、来源边界与外部 Eval 接口。

## 阅读顺序

1. [启动、Preset 与 Bundle](01-boot-preset.md)：从 CLI 配置走到可运行 Agent。
2. [Prompt、Context 与 Cache](02-prompt-context-cache.md)：模型一轮真正看见什么。
3. [Agent Loop、模型与工具结果](03-loop-model-tool.md)：沿主循环跟完一次工具调用。
4. [工具、权限与 Code Mode](04-tools-security.md)：工具意图怎样进入受控执行。
5. [Session 与 Compaction](05-session-compaction.md)：消息如何保存、压缩和恢复。
6. [编排与扩展](06-orchestration-extensions.md)：Bundle、子任务和扩展怎样改变运行时。
7. [产品表面、Feedback 与 Eval 接缝](07-surfaces-feedback-eval.md)：运行事实怎样离开核心。
8. [测试、核对与适用边界](08-verification-design-limits.md)：用上游测试回查课程结论。

这些文章会在重构中合并重复概念；编号只表达推荐顺序，不表示每个机制都属于独立层。

## 用贯穿任务复盘

读完后，从「CLI/ACP 收到运费修复目标」开始，依次指出：标准 Preset 选择了哪些能力，Prompt 怎样带入项目上下文，Agent Loop 怎样接收 `read/edit/test` 的 Tool Result，Code Mode 与普通工具路径如何分工，Session 在中断后保存什么，最后哪些 Feedback 或 Eval 接缝能观察结果。每一步都要能回到课程中的一个锁定源码站点。

若你只能说「Bundle 把它们组合起来」，还没有完成复盘；需要进一步说明具体配置进入哪个对象、状态在哪里变化、下一站由谁消费。

## 完成课程后应该能回答

- 标准 Preset 怎样选择 Prompt、工具和运行能力；
- Agent Loop 接收什么输入，何时再次请求模型；
- 工具结果以什么形态回到消息历史；
- Code Mode 与普通工具路径各自解决什么问题；
- Session 和 Compaction 保存或改写了哪些信息；
- DeepSeek Harness 中实际存在的评测接缝在哪里，哪些仍需要外部系统。

[从第一篇开始：启动、Preset 与 Bundle](01-boot-preset.md)
