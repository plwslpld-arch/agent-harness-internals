# Agent Harness 源码课程总目录

这套中文源码课程会从各项目共同面对的问题走进真实实现，不按产品逐项罗列功能，并且始终追问同一件事：模型给出下一步意图以后，Agent Harness（智能体框架）怎样把它变成真实动作，又怎样控制、恢复并核对这些动作？全书就从这个问题展开。

全书会反复处理一个很具体的任务：修好运费计算的边界错误，因为订单金额刚好为 100 元时，系统仍会收取 10 元运费。任务虽小，链条却很完整。你不用陷进业务代码，可以把注意力放在 Harness 怎样读取、编辑、执行测试、处理失败并判断是否结束，这些动作已经覆盖了编程智能体的一条主链。

[下载完整中文 PDF](downloads/agent-harness-internals-cn.pdf){ .md-button }

PDF 和本站使用同一份内容，CI 会从 MkDocs 导航里的这套 Markdown 生成它，因此两个版本不会各自演变。

## 姊妹项目

这套教材只回答「模型的下一步意图怎样变成可以控制的真实动作」。动作做完以后，究竟由谁判断它是否真的做对，则要看另一套系统，详见 [Eval Harness 源码内核](https://plwslpld-arch.github.io/eval-harness-internals/)：
它会讲任务与数据集怎样定义、运行器如何并发与重试、评分和统计如何得出结论，以及发布门禁凭什么放行。
两套教材采用同一种读法，都从锁定到具体行号的源码出发。

## 第一部分：建立共同语言

顺序很重要。如果这是你第一次读 Agent Harness 源码，按顺序看完这一部分，更容易知道每次进入新项目时该去哪里找相同的问题。

1. [从这里开始：先跟完一次任务](00-start-here.md)
2. [Model、Harness 与 Environment](foundations/01-model-harness-environment.md)
3. [一次任务怎样形成 Agent Loop](foundations/02-one-agent-loop.md)
4. [工具、权限与执行边界](foundations/03-tools-permissions-execution.md)
5. [Session、Context、Memory 与恢复](foundations/04-session-context-memory.md)
6. [Trace、Eval 与结果核对](foundations/05-trace-eval.md)

这一部分只帮你建立读后续源码必需的坐标。读完以后，你应该能画出输入、决定、动作和观察怎样连成闭环，系统又怎样选择继续或结束，并解释模型、Harness 和环境分别能做什么、不能做什么。

## 第二部分：六条核心源码课程

六条课程都是主线，所以这里不按项目热度或模型能力排序。你先完整读完一条，等进入第二条课程以后，自然会看出各项目在相同位置用了哪些不同做法，到那时再比较更合适。

| 课程 | 最适合作为切入点的问题 | 入口 |
| --- | --- | --- |
| DeepSeek Harness | 多包、Prompt、工具、Code Mode 与 Session 怎样装配成运行时 | [进入课程](harnesses/deepseek-harness/README.md) |
| Codex | Rust 核心怎样连接 Thread、Turn、审批、Sandbox 与多种客户端 | [进入课程](harnesses/codex/README.md) |
| Gemini CLI | Turn、Scheduler、Policy 与工具生命周期怎样协作 | [进入课程](harnesses/gemini-cli/README.md) |
| Claude | 闭源产品契约与公开 Agent SDK 源码之间的证据边界在哪里 | [进入课程](harnesses/claude/README.md) |
| pi | 最小智能体核心怎样逐层长成编程智能体、会话与协议 | [进入课程](harnesses/pi/README.md) |
| OpenCode | 服务化 Session、Provider、Processor、Permission 和多客户端怎样共享核心 | [进入课程](harnesses/opencode/README.md) |

每条课程都会带你走完一条完整任务链，但不会为了排版整齐，硬把不同项目塞进相同的目录和篇数。读六条课程时，真正该互相对照的是这六个问题：模型看到了什么，循环由谁控制，工具怎样执行，权限在哪里判断，状态怎样恢复，以及结果由谁观察。

## 第三部分：横向比较

至少读完两条源码课程以后再看这一部分。比较页不会给项目打总分，而会把同一个工程问题放回各项目的源码中，让你顺着调用和状态去找差异从哪里产生。

1. [运行时、配置与模型输入](comparisons/01-runtime-config-model-input.md)
2. [Agent Loop、工具与执行](comparisons/02-loop-tools-execution.md)
3. [权限、状态与恢复](comparisons/03-permissions-state-recovery.md)
4. [编排、协议与产品表面](comparisons/04-orchestration-protocol-surfaces.md)
5. [可观测性、Eval 与部署边界](comparisons/05-observability-eval-deployment.md)

## 第四部分：机制案例

每个扩展项目只用来讲清一种机制，六条主课程已经走过的完整路径不会在这里重复一遍。

- [Aider：Architect 与 Editor 的职责分离](samples/aider.md)
- [Cline：审批检查点怎样进入循环](samples/cline.md)
- [Goose：Recipe 与 Extension 怎样扩展运行时](samples/goose.md)
- [mini-swe-agent：最小循环保留了什么](samples/mini-swe-agent.md)
- [OpenHands：Agent、Controller 与事件流](samples/openhands-agent-canvas.md)
- [Qwen Code：Server 与客户端边界](samples/qwen-code.md)

## 第五部分：实践与核对

实践会从能够稳定复核的任务起步，再逐渐增加依赖，所以你一开始不用调用真实模型。

1. [浏览器核对](labs/controlled-task-contract.md)：打开永久链接，复原为什么存在、调用者、输入、状态、返回和下一站。
2. [最小 Agent Loop](labs/minimal-agent-loop.md)：运行确定性 Model Stub、工具请求、结果回填和停止条件。
3. [权限与崩溃恢复](labs/permissions-and-recovery.md)：区分获准、执行、记录和未知副作用。
4. [独立评测管线](labs/independent-eval-pipeline.md)：把执行 Trace 与结果判定分离。

需要真实模型的练习始终可以跳过，因为只用浏览器、锁定源码和确定性本地脚本，你也能完成核心学习路线。

## 查阅资料

- [术语表](appendix-a-glossary.md)
- [怎样核对源码结论](appendix-b-verification.md)
- [按经验选择阅读路线](learning-paths.md)

[开始第一课](00-start-here.md)
