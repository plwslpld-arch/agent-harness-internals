# Model、Harness 与 Environment：先分清谁在做什么

[返回学习入口](../00-start-here.md) · [下一篇：一次任务怎样形成 Agent Loop](02-one-agent-loop.md)

![模型、Harness 与环境的边界](../../assets/diagrams/foundations/01-boundaries.svg)

第一次阅读 Agent 源码时，最容易犯的错误是把所有行为都归到模型上。模型说「我读取了文件」，并不代表文件真的被读取；终端返回成功，也不代表用户的任务已经完成。要读懂实现，先把 Model、Harness 和 Environment 分开。

## 从失败测试开始

我们继续使用订单运费案例：

```text
用户目标：修复订单金额为 100 元时仍收取运费的问题，并运行测试。

失败断言：
shippingFee(100)
期望：0
实际：10
```

模型要提出一个合理修改，需要看到任务、相关源码和失败输出。Harness 决定怎样把这些信息装进模型输入，也决定模型能够请求哪些工具。Environment 保存真实文件并运行测试。三者缺一，任务都无法形成闭环。

## Model：产生候选决定

Model 接收一组消息和工具定义，返回文本、推理数据或结构化工具请求。它可以根据失败断言猜测边界条件写错了，也可以请求读取 `src/shipping.ts`。

下面是教学化的模型输出，不代表任何上游项目的精确协议：

```json
{
  "type": "tool_call",
  "name": "read_file",
  "arguments": {"path": "src/shipping.ts"}
}
```

这只是候选行动。文件此时还没有被读取。Model 不知道宿主进程有没有文件权限，也不知道产品策略是否允许访问这个路径。

阅读源码时，Model 侧要找的是「请求怎样构造」和「响应怎样解析」。常见线索包括 Provider、Client、Request、Response、Stream、Message 和 ToolCall。不要从工具实现开始猜模型协议；先确认模型实际收到什么、返回什么。

## Harness：把候选决定接入任务循环

Harness 位于 Model 与 Environment 之间。它通常承担六类责任：

1. 把系统提示、用户消息、历史、工具定义和动态状态组合成模型输入；
2. 发起模型请求并消费流式或非流式响应；
3. 区分文本完成、工具请求、错误、取消和超时；
4. 检查工具名称、参数、权限和用户确认；
5. 调用执行器并把结果重新写入消息历史；
6. 保存 Session、发送事件，并决定继续还是结束。

不同项目会拆分这些责任。Codex 把核心循环、协议和多种表面分在不同 crate；OpenCode 通过服务化 Session 连接多个客户端；Claude Agent SDK 则公开应用进程能够观察到的 SDK 和控制协议，Claude Code 内部实现仍不可见。职责相似不表示模块名称相同。

在运费案例中，Harness 会把 `read_file` 请求交给工具注册表，确认路径处于工作区，再调用文件读取实现。工具结果随后成为下一轮输入：

```json
{
  "type": "tool_result",
  "tool_call_id": "call-1",
  "content": "export function shippingFee(total) { return total > 100 ? 0 : 10 }"
}
```

Model 看见结果后，才有足够信息提出把 `>` 改成 `>=`。

## Environment：副作用真正发生的地方

Environment 包括工作区文件、进程、网络、凭据、数据库、浏览器或远程服务。工具最终要在某个 Environment 中执行，真实权限由这个环境决定。

产品策略允许读取 `src/shipping.ts`，并不保证读取一定成功。文件可能不存在，宿主进程可能没有权限，Sandbox 可能没有挂载该目录，远程工作区也可能已经断开。这些都属于执行失败，不应记录成策略拒绝。

反方向也成立。宿主进程有能力删除整个仓库，不代表 Harness 应当批准该动作。系统能力和产品授权必须分开记录。

| 观察 | 更可能属于哪一层 | 下一步检查 |
| --- | --- | --- |
| 模型没有请求任何工具 | Model 或输入构造 | 模型请求、工具定义、上下文 |
| 工具请求被判定为未知 | Harness | 工具注册和名称解析 |
| 请求被规则拒绝 | Harness | 权限策略和确认结果 |
| 请求获准但文件打不开 | Environment | 路径、挂载和系统权限 |
| 测试进程退出码为 0 | Environment 事实 | 继续检查测试是否覆盖用户目标 |

## Trace 与 Eval 在哪里

Trace 记录任务中出现的消息、工具调用、决定、输出和时间顺序。Eval 使用任务说明、环境和判定方法解释这些记录以及最终产物。

如果测试进程启动失败，Harness 运行可能已经正常结束，但任务结果仍然无法判断。如果测试只覆盖 `shippingFee(101)`，即使退出码为 0，也没有证明金额 100 的问题已修复。Eval 关注的是任务判定，不只是进程状态。

初学阶段只需记住：Trace 负责留下事实，Eval 负责按照明确口径解释事实。第五篇基础导读会展开这一区别。

## 用一条数据流检查理解

教学伪代码如下：

```text
messages = Harness.构造输入(用户目标, Session, tools)
response = Model.生成(messages)

如果 response 是工具请求:
    decision = Harness.检查(response)
    result = Environment.执行(decision)
    Harness.把结果写回 Session
    进入下一轮

如果 response 是最终文本:
    Harness.保存并结束
```

这段代码故意省略了流式事件、并行工具、取消、重试和压缩。它的目的只是标出三方边界。进入真实项目后，文章会指出每一行分别落到哪些文件和函数。

## 常见混淆

### 「模型会调用工具」

更精确的说法是：模型产生工具调用请求，Harness 决定如何处理，Environment 承担实际执行。省略中间两层会掩盖权限和失败归因。

### 「有权限系统就有 Sandbox」

权限系统表达产品是否愿意执行；Sandbox 限制进程即使执行也能访问什么。前者可能是规则和用户确认，后者需要操作系统、容器或远程执行环境支持。

### 「测试通过就完成了」

只有当测试覆盖用户目标、运行的是修改后的代码、输出属于本次任务时，测试通过才构成有效证据。Harness 还要把这些事实关联到正确 Session 和任务。

## 读源码时的落点

面对一个新仓库，先记录以下位置：

- 模型请求入口；
- 消息和工具调用的数据类型；
- 核心循环或状态机；
- 工具注册与执行接口；
- Session 或事件存储；
- 用户可见输出入口。

找到这些位置后，再问哪一部分属于 Model 适配，哪一部分属于 Harness 控制，哪一部分把动作交给 Environment。你不需要先读完整个仓库，就能建立第一张可靠地图。

## 练习：给一句运行记录归属

把下面四句话分别归到 Model、Harness、Environment 或 Eval：

1. 「下一步应当把 `>` 改成 `>=`。」
2. 「本次写入需要用户确认。」
3. 「`shipping.test.ts` 返回退出码 0。」
4. 「边界值测试通过，而且测试文件未被修改，因此任务结果合格。」

<details>
<summary>查看核对要点</summary>

依次是 Model 的候选决定、Harness 的策略决定、Environment 的执行事实和 Eval 对结果的解释。第三句仍不能单独证明第四句，因为退出码必须与正确命令、正确工作区和本次补丁关联。

</details>

## 现在应该能解释

模型提出 `edit_file` 不等于文件已经变化；Harness 批准请求不等于系统一定能执行；测试进程返回 0 也不自动等于用户目标满足。三种判断分别依赖 Model 输出、Harness 决定和 Environment 事实。

[下一篇：一次任务怎样形成 Agent Loop](02-one-agent-loop.md)
