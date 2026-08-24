# 从这里开始：先跟完一次任务

如果你会一种编程语言、用过 Git 和命令行，却不清楚 Agent Harness 在模型之外做了什么，这一页就是起点。你不需要同时懂 TypeScript、Rust 和 Python，也不需要准备六家模型账号。

## 我们要完成的任务

后面的基础导读会反复使用同一个小仓库。订单金额刚好达到 100 元时，本应免运费，但测试失败了：

```text
用户：修复订单金额为 100 元时仍收取运费的问题，并运行测试确认。

仓库：
src/shipping.ts
tests/shipping.test.ts

失败：
expected shippingFee(100) to be 0
received 10
```

一个普通聊天模型可以建议把 `>` 改成 `>=`，但它看不到真实文件，也不能证明测试已经通过。一个编程智能体还要读取仓库、定位实现、修改文件、运行测试、观察结果，并判断任务是否结束。把这些动作连接起来的运行系统就是本仓库研究的 Harness。

## 三个角色

| 角色 | 在案例中负责什么 | 不负责什么 |
| --- | --- | --- |
| Model | 根据当前消息决定读取文件、编辑代码、运行测试或给出答复 | 不直接拥有文件系统和终端权限 |
| Harness | 构造模型输入，解析工具请求，检查权限，执行或委托工具，保存状态并控制下一轮 | 不替模型决定业务修复内容 |
| Environment | 保存仓库文件，运行测试，返回真实输出 | 不解释任务是否已经满足用户目标 |

Trace 记录三者之间发生过什么；Eval 使用冻结的任务和判定方法解释结果。它们很重要，但应在读者看懂执行链之后再展开。

![模型、Harness、环境、Trace 与评测的责任边界](../assets/diagrams/start/agent-harness-scope.svg)

## 一次任务的最小循环

```text
1. Harness 把用户目标、仓库信息和可用工具交给 Model
2. Model 请求读取 src/shipping.ts
3. Harness 检查请求并让 Environment 读取文件
4. 文件内容作为工具结果进入下一次模型输入
5. Model 请求把 > 修改为 >=
6. Harness 完成写入并返回结果
7. Model 请求运行测试
8. 测试输出进入下一轮
9. Model 根据通过结果生成最终答复
10. Harness 保存会话并结束循环
```

这十步不代表每个项目都使用相同的函数或事件名。它们只是一张阅读地图：进入任何源码仓库后，你都要找到输入、决定、动作、观察和停止条件分别落在哪里。

## 六个阅读问题

完成任意一条源码课程后，你应该能回答：

1. 模型每一轮究竟看见了哪些消息、工具和状态？
2. 谁创建下一轮请求，谁判断任务继续或结束？
3. 模型给出的工具意图怎样变成真实文件或进程操作？
4. 工具可见、策略允许、用户批准和系统权限分别在哪里判断？
5. Session、Context、Memory 和压缩后的历史怎样保存与恢复？
6. 日志、事件、Trace、测试和 Eval 能核对哪些行为？

这六个问题是跨项目坐标，不是统一实现规范。某个项目可能把循环和工具分派放在同一个模块，也可能拆成服务端、协议层和多个客户端；文章会保留这种差异。

## 先读五篇基础导读

1. [Model、Harness 与 Environment](foundations/01-model-harness-environment.md)：分清谁决定、谁控制、谁产生副作用。
2. [一次任务怎样形成 Agent Loop](foundations/02-one-agent-loop.md)：沿失败测试走完输入、工具结果和停止条件。
3. [工具、权限与执行边界](foundations/03-tools-permissions-execution.md)：区分工具可见、策略允许、用户批准和环境能力。
4. [Session、Context、Memory 与恢复](foundations/04-session-context-memory.md)：理解短期输入、运行状态和跨任务记忆。
5. [Trace、Eval 与结果核对](foundations/05-trace-eval.md)：把「过程结束」和「任务正确」分开。

基础导读只提供阅读源码所需的最低知识。如果你已经能独立画出一次模型—工具循环，可以直接选择项目课程。

## 再选择一条源码课程

- [DeepSeek Harness](harnesses/deepseek-harness/README.md)：适合观察多包 Harness 如何组合上下文、工具、会话和反馈。
- [Codex](harnesses/codex/README.md)：适合观察 Rust 核心、审批、Sandbox 和多种产品表面。
- [Gemini CLI](harnesses/gemini-cli/README.md)：适合观察 Turn、Scheduler、Policy 和工具生命周期。
- [Claude](harnesses/claude/README.md)：适合学习公开产品契约与 SDK 源码之间的证据边界。
- [pi](harnesses/pi/README.md)：适合从极简核心逐层理解编程智能体。
- [OpenCode](harnesses/opencode/README.md)：适合观察服务化 Session 和多客户端架构。

首次阅读只做三件事：运行或观察一个任务，找到核心入口，跟完一条调用链。Provider 兼容层、界面渲染、遥测导出和发布脚本可以暂时跳过。

如果你不确定应该读到什么深度，可以先看[Starter、Builder 与 Maintainer 三层阅读路线](learning-paths.md)。三层不是考试等级，而是三种不同问题：先看完整任务链，再追踪行为怎样被配置改变，最后检查结论是否能稳定复现。

## 源码页面怎样读

每个「第 N 站」都是调用链中的一个停靠点：

```text
任务入口
  → 请求构造
  → 模型响应解析
  → 工具或文本分支
  → 权限与执行
  → 结果回送
  → 持久化与结束
```

源码站点会给出锁定版本链接，并解释调用者、输入、状态变化、返回值和下一站。长代码不会整段复制进仓库；链接负责提供完整上下文，正文负责教你怎样阅读。

## 三种核对深度

### 只用浏览器

打开永久链接，确认文件、符号、调用关系和测试位置。这种方式足以核对多数结构性结论。

### 使用本地 Checkout

运行上游测试或仓库提供的确定性脚本，观察固定输入下的事件和状态变化。核心学习路线尽量不调用付费模型。

### 可选真实模型运行

只有当结论确实依赖模型交互时才使用。对应页面会说明凭据、成本、不确定性和可观察成功条件；一次成功演示不会被扩大成产品整体结论。

## 阅读完成的标志

学习不是记住目录名。真正读懂一条课程后，你应当能从用户输入开始，用自己的话说明状态如何经过模型、工具和环境，指出关键函数的调用关系，并为权限拒绝、执行失败和测试未通过分别找到不同的记录位置。

[下一篇：Model、Harness 与 Environment](foundations/01-model-harness-environment.md)

[查看完整课程目录](README.md)
