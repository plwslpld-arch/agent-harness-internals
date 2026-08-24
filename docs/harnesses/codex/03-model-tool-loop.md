---
title: Codex 模型流与工具闭环
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/core/src/session/turn.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/tools/router.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/src/tools/parallel.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/tool_parallelism.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/tools.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 模型流与工具闭环

## 读者会得到什么

入口篇证明了单个工具结果会回到模型，本篇继续回答更难的部分：一个响应里出现多个工具调用时，哪些可以并行，结果为什么仍按调用顺序写回，流错误何时重试，取消发生在排队、执行或终态之后又有何差异。核心不变量是：并行改变完成时间，不改变调用与结果的可关联顺序；模型只有在当前批次工具结果结算后，才进入下一次采样。

读完后，你应能沿着 Prompt、模型客户端流、输出项处理、ToolRouter、ToolCallRuntime、工具 Future、会话历史和 follow-up 标志复原闭环，也不会把 Provider 流重试、工具取消、Turn 结算与 Eval Attempt 混成一种「重试」。

## 核心概念

模型工具闭环由「采样、解析、路由、执行、提交、继续」六个阶段组成。并行只发生在执行阶段；调用身份、历史排序和下一次采样边界仍要保持确定。若把流式响应一到达就边执行边重新请求模型，下一次请求可能只看到半批结果，调用语义会随完成时序漂移。

| 概念 | 负责的问题 | 关键身份 | 终止条件 |
|---|---|---|---|
| 模型采样 | Responses 流产生了什么输出项 | request / response | 流完成或错误 |
| 输出组装 | chunk 如何形成完整消息和调用 | item、call_id | 项完成 |
| ToolRouter | 名称与参数交给哪个处理器 | 工具名、call_id | 找到或返回工具错误 |
| 并行门 | 哪些调用可重叠执行 | 工具能力、批次 | 获取读锁或写锁 |
| 有序提交 | 结果如何进入历史 | call_id、模型顺序 | 当前批次全部结算 |
| follow-up | 是否再次向模型采样 | TurnId、sample index | 无待续事件 |
| 流重试 | Provider 传输是否可恢复 | retry class、次数 | 成功、上限或不可重试 |
| Eval Attempt | 基础设施恢复如何计数 | TrialId、AttemptId | 恢复结算 |

Tool call 是模型提出的行动请求，tool result 是 Harness 对请求的结构化结算，外部副作用则是执行环境真实改变。三者可能不一致：策略拒绝会产生结果而没有副作用；进程写文件后崩溃会产生副作用却暂时没有已提交结果；未知工具有调用但没有真实处理器。可靠实现必须分别记录。

并行支持是一项工具能力，不是模型响应的全局许可。多个只读或独立工具可以共享执行门，不支持并行的处理器取得独占门。即使都标记为可并行，访问同一外部资源仍可能在业务层冲突，因此工具作者要定义幂等性和资源作用域。

`FuturesOrdered` 解决的是提交确定性。三个工具可以按 2、3、1 的顺序完成，历史仍按 1、2、3 写入，下一次请求先包含完整调用批次，再包含完整结果批次。call_id 关联比数组位置更根本，位置断言用于进一步锁定稳定布局。

重试需要区分尚未产生副作用的 Provider 流错误与已经进入工具阶段的恢复。前者可按错误分类和上限重新采样；后者若盲目重放可能重复写文件或发送外部请求。Eval Attempt 只允许基础设施恢复，模型或工具产生的产品失败保留在原 Trial 中。

工具错误仍然是一种已结算结果。参数无效、策略拒绝、命令非零和处理器异常要用不同 terminal kind 表达，但都携带原 call_id 回到历史；模型可以基于错误修正下一步。只有运行时无法保证历史一致性时，才应升级为 Turn 级基础设施错误。

批次中的部分失败不会自动取消其他已独立执行的调用。若一个只读查询失败，另外两个结果仍可能有用；若失败触发全局取消，也要为每一项写出已完成、已取消或未开始。单个「batch failed」无法支撑副作用恢复。

有些工具可以返回「结论性」结果，要求当前 Turn 不再继续采样；这类能力要与普通错误分开。结论性终止仍需保存工具结果和原因，不能跳过批次 drain，否则历史中会出现调用无结果。是否支持该语义要以具体工具和锁定源码为准，教学原型只保留显式接口。

## 为什么这样设计

第一，Router 将模型可见名称与真实处理器分开，可以集中做参数解析、工具可用性、安全决策和生命周期事件。模型不能通过构造任意名称直接调用宿主函数；未知工具也能形成可回送的错误，让模型选择修正。

第二，工具级并行门兼顾吞吐和语义安全。完全串行会浪费独立查询的等待时间，全局并发又会让终端、补丁和共享文件互相竞争。读写门让工具声明能力，运行时仍以统一机制执行。

第三，批次结果有序提交使相同模型输出得到稳定历史。若按完成顺序追加，网络和调度抖动会改变下一次 Prompt，测试难以复现，缓存前缀也会漂移。等待整批结算再 follow-up，把执行时序与对话语义解耦。

第四，取消令牌贯穿等待门、处理器和模型流，允许及时终止；终态检查又防止已经完成的工具被事后改写成 cancelled。取消是一场竞态，必须记录观察点，不能只保存最后一个布尔值。

第五，Provider 重试只接受明确的可重试分类和次数上限，避免无限循环及错误吞噬。上下文超限、用量限制和业务拒绝拥有不同恢复方法；统一重试会隐藏配置问题，也可能重复真实副作用。

第六，把调用、执行和提交拆开，允许崩溃恢复判断落在哪个区间。只看到 started 而没有 terminal 时，状态是 unknown；看到 terminal 和产物但没有历史提交时，可以通过幂等探测补写结果；看到已提交结果则绝不能再次执行。没有这些提交点，自动恢复只能在重复副作用和丢失结果之间猜测。

## 实现思路

教学实现可把一个模型响应视为 `ToolBatch`。批次保存模型顺序、每个 call_id、解析状态、并行能力、执行状态和提交状态；只有所有项达到终态后才允许下一次采样。

1. **采样并组装。** 消费 Responses 流，将完整函数调用解析为批次项；流未结束前不假设参数完整。
2. **路由与校验。** 通过 Router 查找处理器、验证参数和可见性；失败项生成带 call_id 的结构化结果。
3. **分配执行门。** 可并行工具取得共享门，不可并行工具取得独占门；为每项创建子取消令牌和生命周期记录。
4. **执行并捕获副作用。** 保存 started、terminal、退出码和可观察产物；处理器异常转换为结果，不能丢失调用身份。
5. **按模型顺序提交。** 等待所有 Future，使用原索引 drain，先保留调用批次，再追加一一对应的结果批次。
6. **决定 follow-up。** 若批次要求模型继续且 Turn 未取消，从更新历史构造下一次请求；否则进入停止 Hook 与终态。
7. **限制流重试。** 仅在工具阶段之前、错误可重试且未超上限时重新采样；把次数和分类写入 Trace。

```text
batch = parse_complete_tool_calls(response)
for call in batch.model_order:
    handler = router.resolve(call.name, call.arguments)
    future[call.index] = execute_with_gate(handler, call, cancel_token)
results = await drain_in_model_order(future)
history.append(batch.calls)
history.append(results)
如果 batch 需要继续且 Turn 仍活动:
    sample(history)
```

执行记录至少包含 `callId`、`toolName`、`argumentsHash`、`startedAt`、`terminalAt`、`terminalKind` 和 `artifactRefs`。参数中可能含秘密，公开证据只保留脱敏摘要；call_id 与产物引用必须完整，以支持恢复时判断副作用是否已经发生。

测试应使用屏障而非只靠睡眠。两个并行处理器进入屏障后才释放，独占处理器必须等待；通过可控完成顺序证明执行重叠与提交有序是两件事。再在每个边界注入取消，检查未开始、执行中和已终态三种结果。

恢复日志采用追加型状态：`accepted → started → terminal → committed`。每次迁移携带 call_id 与 fencing token，只允许向前；重启后 terminal 记录可以安全重建历史结果，started 则进入 unknown 处理。处理器若支持幂等键或副作用查询，可由专门恢复器解决，通用 Router 不应假设所有工具幂等。

模型流重试还要绑定 response attempt。只有尚未形成可执行批次的 attempt 可以被安全丢弃；一旦完整调用被接受，后续错误与该批次关联。Trace 保存每次 attempt，却只让 canonical attempt 的模型输出进入历史，避免重复响应项。

## 贯穿案例

模型在一次响应中提出三个调用：读取配置、运行测试、读取报告。前两个允许并行，第三个处理器声明独占，因为它依赖测试生成的报告。教学实验故意让测试最快返回，让配置读取最慢结束。

1. **建立批次。** 三个函数调用按 `call-1`、`call-2`、`call-3` 进入，Router 验证名称和参数，保存模型顺序。
2. **运行并行组。** `call-1` 与 `call-2` 取得共享门并重叠执行；`call-3` 申请独占门，在共享门释放后开始。
3. **观察完成顺序。** 真实结束顺序为 2、1、3，但结果 Future 仍按 1、2、3 drain；每项保留自己的 call_id。
4. **提交完整批次。** 历史先出现三个调用项，再出现三个结果项；模型不会在只有测试结果、缺少配置结果时提前采样。
5. **继续推理。** 第二次请求基于完整结果生成修复计划；若测试进程非零，结果仍回送模型，不被误写成传输错误。
6. **独立评分。** Scorer 检查最终补丁和测试，三个工具成功只作为 Trace，不直接产生 pass。

```json
{"batch":"tb-4","modelOrder":["call-1","call-2","call-3"],"completionOrder":["call-2","call-1","call-3"]}
```

```json
{"committedResults":["call-1","call-2","call-3"],"followupSample":2,"turnState":"active"}
```

取消变体在 `call-2` 已结束、`call-1` 仍运行时触发。已终态的 `call-2` 结果保留，`call-1` 与尚未开始的 `call-3` 生成可关联的取消结果；Turn 不能把整个批次改写成三个同样的失败。恢复若重新执行 `call-2`，必须先证明它无副作用或使用幂等键。

流错误变体发生在任何完整 tool-call 形成之前，因此可按 Provider 分类重试。若错误发生在三个调用已执行之后，系统需要依据提交记录恢复，不能简单重新请求模型并再次执行输出。这个对照把传输恢复、工具恢复和 Eval Attempt 的边界展示清楚。

再让 `call-2` 返回非零退出、`call-1` 成功、`call-3` 因依赖失败而取消。提交历史仍包含三个不同结果，第二次模型采样可以选择修复命令；若模型未修复便结束，Turn 可以正常结算，Trial 仍因测试失败判 fail。产品失败不能转换成一次新的基础设施 Attempt。

崩溃变体发生在 `call-2` 已产生文件副作用、terminal 尚未持久化时。恢复器先检查幂等键或外部产物，无法确定就标记 unknown 并请求人工或上层策略，绝不默认重跑。案例由此覆盖并发性能之外更关键的「恰好一次无法凭空保证」边界。

为了防止观察系统反过来改变结算，遥测发送失败只追加诊断，不覆盖工具 terminal kind；但权威日志写入失败属于一致性故障，必须停止继续采样。两类「记录失败」的处置不同，因为前者是旁路观察，后者决定恢复时能否证明调用已经结算。

恢复判断必须以权威提交点为准。

## 真实输入与输出

### 输入

上游 `tool_parallelism.rs` 构造一次包含三个 `exec_command` 函数调用的模拟模型响应，三个调用标识依次为 `call-1`、`call-2`、`call-3`，命令参数相同：

```json
{"cmd":"echo 'shell output'","yield_time_ms":1000}
```

测试向 Codex 提交 `run shell three times`。模型服务是 Mock，但本地 shell 工具路径实际执行；该文件仅在上游支持的测试环境中证明行为，不代表任意平台的性能。

### 输出

第二次模型请求包含三个原始函数调用和三个函数调用输出。测试不只数数量，还检查所有调用项都位于所有输出项之前，并按位置配对 call_id：

```text
调用顺序：call-1, call-2, call-3
结果顺序：call-1, call-2, call-3
约束：全部调用先出现，随后才是全部结果
```

这意味着运行时可以并行完成工具，但提交给模型的历史仍保持确定性批次布局。下一次模拟响应返回 `done`，Turn 才完成。

## 调用链

先结算，再继续。

![Codex 模型响应流、工具路由、并行执行、有序结果提交、重试与终止的中文时序图](../../../assets/diagrams/codex/03-model-tool-loop.svg)

Claim: codex.loop.tool-results-before-continuation

1. `run_turn` 从正规化会话历史构造采样输入，建立 Prompt、Responses 元数据和子取消令牌，再调用模型客户端流。
2. 流消费器按事件处理输出项；函数调用完成项被解析成 ToolCall，通过 ToolRouter 查询模型可见规格对应的真实运行时。未知工具、参数错误或运行时缺失会形成工具错误，而不是执行任意字符串。
3. ToolCallRuntime 询问该工具是否支持并行。支持者取得共享读锁并可并发执行；不支持者取得写锁，从而与其他工具串行。并行是工具级声明和运行时门控共同结果。
4. 每个工具调用产生 Future，按模型输出顺序加入 `FuturesOrdered`。工具可以先后完成，但 drain 按入队顺序取结果，记录到会话历史并保留 call_id。
5. 当前响应完成后，Harness 排空在途工具；只要工具输出或其他事件要求 follow-up，外层就从更新后的历史再次构造模型输入。不会在结果尚未结算时把半批历史交给模型。
6. Responses 流错误只有被分类为可重试时才进入受上限约束的重试处理；上下文超限、用量限制和非重试错误走独立分支。重试采样不能重复已提交的真实副作用。
7. 取消令牌可在等待执行门、工具处理或模型流期间触发。若工具已经达到终态，应保留完成生命周期；否则中止执行并生成可关联的取消结果。无 follow-up 时才进入 Turn 停止 Hook 与完成路径。

## 源码证据

并行执行门由工具能力决定：

```source
codex-rs/core/src/tools/parallel.rs:112-175
let supports_parallel = router.tool_supports_parallel(&call);
let _guard = if supports_parallel {
    Either::Left(lock.read().await)
} else {
    Either::Right(lock.write().await)
};
router.dispatch_tool_call_with_terminal_outcome(...).await
```

Turn 流使用有序 Future 容器，并在 drain 时按顺序记录结果：

```source
codex-rs/core/src/session/turn.rs:2130-2153,2224-2227
let mut in_flight: FuturesOrdered<...> = FuturesOrdered::new();
while let Some(res) = in_flight.next().await {
    sess.record_conversation_items(...).await;
}
```

模型流重试有显式分类与上限，不是捕获所有错误后无限重放：

```source
codex-rs/core/src/session/turn.rs:1363-1439
let max_retries = turn_context.provider.info().stream_max_retries();
if !err.is_retryable() { return Err(err); }
handle_retryable_response_stream_error(..., max_retries, ...).await?;
```

上游批次测试直接断言所有调用在所有结果之前，并按调用标识保持顺序：

```source
codex-rs/core/tests/suite/tool_parallelism.rs:268-298
assert_eq!(function_calls.len(), 3);
assert_eq!(function_call_outputs.len(), 3);
assert!(*index < *output_index, "all function calls must come before outputs");
assert_eq!(call.1.get("call_id"), output.1.get("call_id"));
```

该 Claim 使用 B 级：并行门、有序 drain 和 follow-up 由源码支持，上游集成测试锁定三调用批次布局。它不保证所有工具都并行，也不声称任意平台具有同一耗时。

## 失败与限制

重试不是重放。

第一，模型声称支持并行工具调用不代表每个工具都并行。Router 的工具元数据决定是否取得读锁；不支持并行的工具通过写锁串行。涉及同一文件、终端或外部资源时，即便并行允许，业务副作用仍可能互相竞争。

第二，有序提交不等于串行执行。只看第二次请求的结果顺序无法推断实际开始与结束时间；要证明并发需要独立时序或屏障测试。相反，只看到执行并发也不能省略结果排序，因为模型需要稳定的 call_id 对齐。

第三，Provider 流重试与工具重试不同。流在工具调用完成前失败，可能安全地重新建立采样；真实工具已经产生副作用后，再重放模型输出可能重复执行。恢复设计必须记录已执行调用并区分请求、调用和结果的提交点。

第四，取消存在竞态。取消发生在执行门前、处理器运行中或处理器已完成后，应该产生不同计时与生命周期；不能统一覆盖成「工具失败」。已经到达终态的结果应保留，尚未执行的调用不能伪造副作用。

第五，TurnComplete 只说明 Harness 收敛。三个命令都退出零仍可能违反用户意图、安全约束或产物要求。独立 Eval 需固定 Trial 并检查副作用，不能把同一 Trial 内的工具恢复 Attempt 计成新通过样本。

并行不是乱序。

## 验证方法

时序必须可见。

标识必须稳定。

副作用要去重。

结果必须对齐。

先构造两个可并行工具和一个不可并行工具，用屏障与可控延迟记录开始、结束和 call_id。确认并行组重叠执行，串行工具获得独占门；不要只用墙钟阈值作为唯一证据。

再捕获下一次模型请求，检查函数调用数量、输出数量、所有调用与结果的相对区间，以及逐位置 call_id。让第二个工具最快完成，确认历史仍按模型调用顺序提交。

随后注入未知工具、参数错误、运行时未就绪、策略拒绝、非零退出、工具超时和取消；分别检查工具生命周期事件、结果内容、会话历史与是否 follow-up。任何分支都不能丢失调用标识。

最后注入模型流提前关闭、可重试错误、上下文超限和用量限制。记录实际采样次数与已发生副作用，确认只有允许的流错误受上限重试，并验证不会把工具恢复次数改写成 Eval Trial 数量。

## 自检

### 问题 1

三个工具并发完成，为什么结果仍要按调用顺序交给模型？

**答案：** 稳定批次布局保证每个 call_id 与结果可确定关联，避免完成时序让模型上下文随机变化；并发优化执行时间，不应改变历史语义。

### 问题 2

所有工具都使用同一个并发策略吗？

**答案：** 不是。Router 查询工具是否支持并行；支持者共享读门，不支持者取得写门并与其他工具串行。

### 问题 3

Responses 流可重试是否表示工具调用也能安全重放？

**答案：** 不能。模型流重试与真实副作用恢复是不同问题；工具一旦执行，必须通过调用身份和提交记录避免重复副作用。

### 问题 4

工具完成后立刻收到取消，应丢弃结果吗？

**答案：** 不应机械丢弃。源码区分是否已到终态；已完成生命周期要保留，只有尚未完成的执行才生成取消结果并中止。
