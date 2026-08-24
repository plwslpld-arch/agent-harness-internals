# Agent Harness 源码课程总目录

这不是一组按产品分类的功能说明，而是一套从共同问题进入真实实现的中文源码课程。整套课程反复追问同一件事：模型给出下一步意图之后，究竟是谁把它变成可控制、可恢复、可核对的真实动作？

贯穿全书的任务是修复一个运费边界错误：订单金额为 100 元时仍然收取 10 元运费。这个任务足够小，可以让我们把注意力放在 Harness 上，而不是业务代码上；它又包含读取、编辑、执行测试、处理失败和判断结束，足以覆盖一条编程智能体的主链。

## 第一部分：建立共同语言

如果这是你第一次读 Agent Harness，请按顺序完成这一部分。

1. [从这里开始：先跟完一次任务](00-start-here.md)
2. [Model、Harness 与 Environment](foundations/01-model-harness-environment.md)
3. [一次任务怎样形成 Agent Loop](foundations/02-one-agent-loop.md)
4. [工具、权限与执行边界](foundations/03-tools-permissions-execution.md)
5. [Session、Context、Memory 与恢复](foundations/04-session-context-memory.md)
6. [Trace、Eval 与结果核对](foundations/05-trace-eval.md)

这一部分只建立后续读源码必需的坐标。读完后，你应该能画出「输入—决定—动作—观察—继续或结束」的闭环，并解释模型、Harness 和环境各自拥有什么权力。

## 第二部分：六条核心源码课程

六条课程都是主线，不按项目热度或模型能力排序。第一次只选择一条完整读完，第二条开始再比较。

| 课程 | 最适合作为切入点的问题 | 入口 |
| --- | --- | --- |
| DeepSeek Harness | 多包、Prompt、工具、Code Mode 与 Session 怎样装配成运行时 | [进入课程](harnesses/deepseek-harness/README.md) |
| Codex | Rust 核心怎样连接 Thread、Turn、审批、Sandbox 与多种客户端 | [进入课程](harnesses/codex/README.md) |
| Gemini CLI | Turn、Scheduler、Policy 与工具生命周期怎样协作 | [进入课程](harnesses/gemini-cli/README.md) |
| Claude | 闭源产品契约与公开 Agent SDK 源码之间的证据边界在哪里 | [进入课程](harnesses/claude/README.md) |
| pi | 最小智能体核心怎样逐层长成编程智能体、会话与协议 | [进入课程](harnesses/pi/README.md) |
| OpenCode | 服务化 Session、Provider、Processor、Permission 和多客户端怎样共享核心 | [进入课程](harnesses/opencode/README.md) |

每条课程都要完成一条完整任务链，但不会为了整齐而强制使用同样的目录或篇数。真正需要对齐的是六个阅读问题：模型输入、循环控制、工具执行、权限判断、状态恢复和结果观察。

## 第三部分：横向比较

至少读完两条源码课程后再进入这里。比较页不会给项目打总分，而是把同一个工程问题放回各自源码位置。

1. [运行时、配置与模型输入](comparisons/01-runtime-config-model-input.md)
2. [Agent Loop、工具与执行](comparisons/02-loop-tools-execution.md)
3. [权限、状态与恢复](comparisons/03-permissions-state-recovery.md)
4. [编排、协议与产品表面](comparisons/04-orchestration-protocol-surfaces.md)
5. [可观测性、Eval 与部署边界](comparisons/05-observability-eval-deployment.md)

## 第四部分：机制案例

扩展项目只承担一个清楚的教学任务，不复制六条主课程。

- [Aider：Architect 与 Editor 的职责分离](samples/aider.md)
- [Cline：审批检查点怎样进入循环](samples/cline.md)
- [Goose：Recipe 与 Extension 怎样扩展运行时](samples/goose.md)
- [mini-swe-agent：最小循环保留了什么](samples/mini-swe-agent.md)
- [OpenHands：Agent、Controller 与事件流](samples/openhands-agent-canvas.md)
- [Qwen Code：Server 与客户端边界](samples/qwen-code.md)

## 第五部分：实践与核对

实践按依赖逐步增加，而不是从真实模型调用起步。

1. [浏览器核对](labs/controlled-task-contract.md)：打开永久链接，复原为什么存在、调用者、输入、状态、返回和下一站。
2. [最小 Agent Loop](labs/minimal-agent-loop.md)：运行确定性 Model Stub、工具请求、结果回填和停止条件。
3. [权限与崩溃恢复](labs/permissions-and-recovery.md)：区分获准、执行、记录和未知副作用。
4. [独立评测管线](labs/independent-eval-pipeline.md)：把执行 Trace 与结果判定分离。

需要真实模型的练习永远是可选项。核心学习路线可以只依赖浏览器、锁定源码和确定性本地脚本完成。

## 查阅资料

- [术语表](appendix-a-glossary.md)
- [怎样核对源码结论](appendix-b-verification.md)
- [按经验选择阅读路线](learning-paths.md)

[开始第一课](00-start-here.md)
