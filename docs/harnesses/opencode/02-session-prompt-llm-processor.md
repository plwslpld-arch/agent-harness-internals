---
title: OpenCode 会话循环、模型流与事件处理器
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/session/prompt.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/session/llm.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/session/processor.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/session/processor-effect.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 会话循环、模型流与事件处理器

## 读者会得到什么

本篇解释一条用户消息怎样变成可以持续执行工具的会话，而不是把 OpenCode 简化成一次 `streamText()`。主循环负责读取有效历史、判断上一轮是否真正结束、组装系统指令与工具；LLM 层选择运行后端并发起流请求；Processor 把异构流事件归一成消息部件、工具状态、快照、用量和错误，再向主循环返回继续、压缩或停止。

三个边界必须分开。模型产生 `stop` 只是一种服务结束原因；如果同一助手消息仍有未清理的工具调用，主循环要继续把工具结果送回模型。Processor 返回 `continue` 也不是任务正确，而是当前流未触发阻断或压缩。最终答案是否满足用户目标，必须由产物检查或独立 Evaluator 判定。

这里还有一条容易被忽略的数据边界：会话消息不是模型流的原样转储。流中的 Reasoning、Text 和 Tool 事件会被转换为带标识、时间、父消息和状态的 Part；Step Finish 才把用量、成本与结束原因归档，Snapshot 差异则形成单独 Patch Part。界面订阅到的是这些可持续更新的投影，数据库中最终保存的是处理后的会话事实。调试时应同时保留原始 Provider 事件、Processor 转换结果和最终消息，三者缺一就很难定位错误究竟出在服务、适配还是状态归约。

## 核心概念

OpenCode 会话执行由外层 Prompt Loop、LLM 适配层和流 Processor 共同完成。Prompt Loop 读取历史、选择 Agent 与工具并决定是否继续；LLM 层把消息和 Provider 选项转换为一次模型流；Processor 消费流事件并持续提交 Part。任一层单独都不是完整 Agent Harness。

Message 与 Part 构成可更新会话模型。用户与助手消息拥有身份和父子关系，Text、Reasoning、Tool、Step、Patch 等 Part 保存细粒度状态。Tool Part 会经历 pending、running、completed 或 error 等变化；Step Finish 才归档用量、成本、Finish Reason 与 Snapshot。增量事件是输入，最终 Part 是持久化归约结果。

控制终态至少有三层：Provider Finish Reason 描述一次生成怎样停止，Processor Outcome 告诉外层 continue/compact/stop，Session Idle 表示当前循环不再推进。产品正确性仍由测试、文件和业务断言判断。把三者和 Eval Verdict 分栏保存，可以避免 `stop` 或 `continue` 被解释成任务成功。

| 概念 | 责任 | 典型状态 | 不能推出 |
| --- | --- | --- | --- |
| Prompt Loop | 组装历史、工具并跨轮推进 | running / idle | 单次模型流细节 |
| LLM Layer | 选择运行后端并发起统一流 | open / error / aborted | 工具副作用成功 |
| Processor | 归约流事件和持久化 Part | continue / compact / stop | 用户目标正确 |
| Message | 用户或助手轮次与父关系 | created / finished / error | 所有原始 Provider Frame 已保存 |
| Tool Part | 工具调用、参数、结果和时间 | pending / running / completed / error | 外部状态已回滚 |
| Step Part | 一次模型步骤的用量与终结 | start / finish | Session 不会继续 |
| Snapshot Patch | 工作树差异投影 | recorded / absent | 所有副作用可撤销 |
| Eval Verdict | 根据 Artifact 判断目标 | passed / failed / unscored | Provider 健康状态 |

## 为什么这样设计

外层 Loop 与模型流分开，使 OpenCode 能在一次用户 Prompt 中执行多轮工具调用。模型服务只知道当前请求，Loop 才知道历史、工具结果、压缩和退出策略。若把循环塞进 Provider 适配器，权限、Session 与 UI 事件都会与某个 SDK 耦合，难以支持多 Provider。

Processor 采用事件归约，是为了同时满足流式 UI 与持久状态。Text Delta 可以立即显示，Tool Call 可以从准备到完成持续更新，最终 Message 又能被 Resume 和 Eval 读取。代价是必须处理缺失、重复、乱序和中断事件，并确保未完成 Part 在错误后被清理。

`continue/compact/stop` 三态把容量治理与阻断分开。Context 超预算时请求 compact，错误或权限拒绝时 stop，普通工具闭环继续；这种信号比单个布尔值保留更多恢复语义。不过 compact 只说明需要缩短上下文，不代表有任务进展，Summary 的信息保真还要另行验证。

保留原始 Provider 诊断与归约后 Part 的双视图，有助于定位适配错误。若 Provider 发出工具事件而 Part 缺失，问题在 Processor；若 Part 完整但文件错误，问题可能在工具或模型意图；若流自身不合法，则应回到 Provider/SDK。单一最终文本无法支持这种归因。

## 实现思路

教学实现可以把 Processor 写成显式归约器，并为每个 Stream Event 规定合法前置状态。以下伪代码表达控制责任，不是 OpenCode 源码复刻。所有更新都携带 Session、Message、Part 和 Attempt 身份。

归约器应保持幂等：重复收到相同 Tool Result 或 Step Finish 时，不得重复计费、重复追加 Patch 或再次执行工具。事件若缺少稳定 ID，只能按适配器约定做受限去重，并将不确定性写入诊断，不能伪造完全重放能力。

```ts
async function processStep(input: StepInput): Promise<"continue" | "compact" | "stop"> {
  const state = await beginAssistantMessage(input.sessionId);
  for await (const event of input.llm.stream(input)) {
    await reduceEvent(state, event);
  }
  if (state.needsCompaction) return "compact";
  if (state.blocked || state.assistant.error) return "stop";
  return "continue";
}
```

1. Prompt Loop 将 Session 标为忙碌，读取过滤与压缩后的消息，找出最近用户、助手和未完成工具状态。
2. 根据 Agent、模型、权限、项目指令、MCP 与 Skills 构造系统消息和可见工具，并保存 Assembly 摘要。
3. LLM 层解析 Provider Runtime、模型参数和消息转换，启动统一流。真实 Frame 与适配后 Event 分别留存受控诊断。
4. Processor 在 text/reasoning start 时创建 Part，delta 只更新已存在 Part；孤立 Delta 形成兼容诊断，不能悄悄宣布完整。
5. tool-call 创建或推进 Tool Part，检测重复 ID 与名称修复；tool-result 规范化内容、附件、错误和时间。
6. step-finish 写入 Finish Reason、Token、Cost 与 Snapshot Patch，并判断上下文预算；中断时清理仍处于 running 的 Part。
7. 返回 compact 时由外层创建压缩请求，返回 continue 时重读最新工具结果，返回 stop 时进入 Idle 并保存停止原因。
8. 独立 Eval 读取初始状态、消息、工具 Artifact、最终 Diff 与测试；Session Idle 和 Processor stop 仅作 Trace 字段。

自动重试必须产生新 Attempt 记录，并检查上一次工具是否到达副作用提交点。只有明确的传输失败且未执行产品动作，才可按策略恢复；模型生成错误或工具已产生错误修改，不能通过重试从 Trial 分母删除。

并发更新还需要 Revision 或乐观锁。UI、Tool Executor 和 Processor 可能同时更新同一消息的不同 Part；写入端应验证预期状态转换，拒绝把 completed 工具退回 running。事件发布可以晚于持久提交，但订阅者必须能通过重新读取 Snapshot 收敛。

错误清理必须保存原错误。为了让界面结束 Spinner 而把 running Part 改成 error 是必要状态归约，却不能用通用「已取消」覆盖 Provider 错误、权限拒绝或工具异常。诊断应保留最初原因、清理动作和最终可见状态。

## 贯穿案例

假设用户要求修复一个失败测试。模型第一步读取文件，第二步调用 Edit，第三步运行测试；测试工具返回断言失败，模型随后再次编辑并正常停止。期间 Provider 第一次流在 Text Delta 后发生可重试限流。这个案例同时覆盖流恢复、Tool Part 生命周期和产品终态。

实验预先定义工具提交点：Read 无副作用，Edit 在文件原子替换成功后提交，测试在子进程启动时产生可观察 Attempt。恢复策略根据提交点决定是否重放，不能只看 Provider 是否返回错误。每次文件变化都保存前后哈希。

第一次 Attempt 的事件摘要如下：

```json
{
  "attempt":"a1",
  "events":["text-start","text-delta","provider-error:rate-limit"],
  "toolCommit":false,
  "processor":"stop-retryable",
  "productArtifact":"none"
}
```

1. Prompt Loop 创建助手消息，Processor 接受 Text Start/Delta。限流在任何 Tool Call 前发生，Attempt 1 保存错误并按预注册策略允许恢复。
2. Attempt 2 重新发起模型流，Read Tool Part 从 pending 进入 running 和 completed；结果写回 Session 后 Loop 继续。
3. Edit 执行并产生 Snapshot Patch，随后测试 Tool 成功执行命令，但其内容报告断言失败。Tool 协议成功与测试语义失败分别记录。
4. 模型根据失败输出再次 Edit，测试通过后返回 Provider `stop`。Processor 返回 continue 或外层根据无待处理工具收敛，Session 进入 Idle。
5. Eval 检查最终测试、目标文件和不可接受 Diff。若模型修改了错误文件，即使 `stop` 和 Idle 正常，Trial 仍失败。
6. Attempt 1 与 2 都留在同一 Trial；恢复成功不抹掉首次限流，也不会把第一次已经提交的副作用重复执行。

最终记录并列四层终态：

```json
{
  "provider":{"finish":"stop","attempts":2},
  "processor":{"outcome":"continue","partsFinalized":true},
  "session":{"status":"idle","pendingTools":0},
  "eval":{"tests":"passed","targetDiff":"passed","verdict":"passed"}
}
```

故障变体让 Provider 在 Tool Call 参数中断开。如果 Tool Part 仍是 running，清理逻辑应标错并禁止执行不完整参数；恢复前检查真实副作用。这个反例说明流兼容处理、控制循环恢复和任务评分需要不同证据，不能用最后一次正常响应覆盖之前的状态。

第二个变体重复发送同一 `tool-result`。Processor 应识别已完成调用，保持单一结果和用量；若只能判断为状态未知，就停止自动继续并要求受控恢复。把重复事件当新结果会让下一轮模型看到虚假历史，也可能重复计算成本。

第三个变体在 Step Finish 已持久化后让事件总线断开。界面可能没有收到最终更新，但重新读取 Session 应看到完成 Part；这属于表现或分发问题，不应重新执行工具。反之，若数据库提交失败却广播了完成事件，恢复时必须以权威存储和真实副作用为准。

最终还要检查 Context Projection。被清理的错误 Part、压缩摘要和最近工具结果如何进入下一轮模型，会影响模型是否重试或误判成功。Trace 保存参与请求的 Message/Part ID，才能把后续错误连接到先前归约决定。

如果 Session 在恢复后发现最后一个 Tool Part 为状态未知，系统不应自动伪造失败结果或再次执行。恢复器先核对目标文件、子进程和外部提交记录，再决定标成 completed、error 还是需要人工处理；判断及证据作为新的恢复 Part 追加，原状态不可被静默改写。

用量与成本也应按 Step 归档。Provider 重试、缓存 Token 和响应模型变化可能让总量与单步相加产生差异，Summary 必须保留口径与缺失字段。成本统计能帮助诊断预算，却不证明任务质量或进展。

当预算达到上限时，宿主停止属于控制策略终态，应与 Provider `length` 和 Context Overflow 区分。前者是产品预算决定，后两者分别描述输出截断和输入容量；三者对应的恢复方法不同。

该区别必须进入事件字段。

## 真实输入与输出

### 输入

```json
{"session":"会话标识","user_message":"修复测试失败","history":"压缩过滤后的消息","agent":"build","model":"当前实例模型","tools":["read","edit","bash"]}
```

### 输出

```json
{"assistant_message":{"parts":["推理","文本","工具","补丁"],"finish":"服务结束原因","error":"可选错误"},"loop_outcome":"continue | compact | stop","task_verdict":"尚未由独立评测给出"}
```

## 调用链

![OpenCode 会话主循环组装上下文后调用模型流，事件处理器持续写入消息部件，并以继续、压缩或停止信号反馈主循环的中文时序图](../../../assets/diagrams/opencode/02-session-prompt-llm-processor.svg)

Claim: opencode.session.processor-interprets-stream-events

Claim: opencode.session.stop-is-not-task-correctness

1. `runLoop()` 把会话标成忙碌，读取过滤压缩后的消息，并找出最近用户、助手与待办状态。
2. 主循环检查上一助手消息的 Finish Reason 与工具部件；存在有效 Tool Call 时不会仅因 Provider 报 `stop` 就退出。
3. 系统环境、项目指令、MCP 指令、Skills、历史消息、模型、权限和工具被组装为一次 Processor 输入。
4. LLM 层准备 Provider 参数、消息和工具，选择原生运行时或 AI SDK，随后启动统一事件流。
5. Processor 按事件类型维护 Reasoning、Text、Tool、Step、Patch、Token、Cost 和 Snapshot，并把增量发布到会话存储。
6. 工具失败、服务错误、取消和上下文溢出进入不同错误或重试路径；清理逻辑保证未完成部件不会长期伪装成运行中。
7. Processor 根据 `needsCompaction`、Blocked 和 Assistant Error 返回 `compact`、`stop` 或 `continue`。
8. 主循环创建压缩请求、继续下一步或退出；退出后仍只有运行结果，没有任务正确性结论。

## 源码证据

主循环显式保留带工具调用的轮次，即便 Provider 的结束原因不是 `tool-calls`：

```source
packages/opencode/src/session/prompt.ts:1081-1130
while (true) {
  const hasToolCalls = lastAssistantMsg?.parts.some(...)
  if (lastAssistant?.finish && !hasToolCalls) break
}
```

Processor 消费统一流，并把内部状态归约成三个控制信号：

```source
packages/opencode/src/session/processor.ts:630-681
const stream = llm.stream(streamInput)
if (ctx.needsCompaction) return "compact"
if (ctx.blocked || ctx.assistantMessage.error) return "stop"
return "continue"
```

事件分支并非只拼接文本。`tool-call` 会建立 Running 状态并检测重复调用；`tool-result` 规范化附件；`step-finish` 写入 Finish、Token、Cost、Snapshot Patch，并检测是否需要压缩。

```source
packages/opencode/src/session/processor.ts:331-483
case "tool-call": {
  yield* ensureToolCall(value)
}
case "step-finish": {
  ctx.assistantMessage.finish = value.reason
}
```

## 失败与限制

第一，流事件可能缺失、乱序或由 Provider 特殊实现产生。源码会丢弃没有 Start 的部分孤立 Delta，也会修复部分工具名；这属于兼容处理，不是完整协议证明。

第二，自动重试只应恢复传输或明确可重试错误。重试后的成功不能把第一次副作用从轨迹中抹掉，尤其是已经执行一半的 Shell、网络或文件工具。

第三，Context Overflow 可以请求压缩，但摘要会改变下一轮可见信息。Processor 返回 `compact` 表示容量治理，不表示任务取得进展。

第四，Finish Reason 来自模型服务或适配层。`stop`、`length`、`content-filter` 与 `tool-calls` 描述生成结束方式，不描述测试、文件或用户验收结果。

第五，取消与 Permission Reject 会影响循环退出。会话进入 Idle 只能证明这次处理已终止，不能证明所有子进程、副作用或后台任务均已安全结束。

第六，锁定测试使用可控模型流，能够验证事件转换和重试分支，却不能覆盖每个真实 Provider 的边缘事件序列。

## 验证方法

构造一个确定性模型流，依次发出 Text、Tool Call、Tool Result、Step Finish 和 Finish。订阅会话事件并读取持久化消息，核对增量顺序、部件最终状态、Token、Cost、Patch 与 Processor 返回值。

再注入四种故障：未知 JSON 错误、可重试限流、上下文溢出、用户取消。记录每次 Attempt 的流事件、工具副作用、重试等待与最终错误；不能只保留最后一次成功响应。

最后让模型返回普通 `stop`，但同时留下一个有效工具调用。验证主循环继续把结果送回模型。另设一个内容正确性错误的案例：模型自然停止但修改了错误文件，确认独立检查仍判失败。

## 自检

### 问题 1

为什么 `streamText()` 不是完整 Agent Loop？

**答案：** 它只负责一次模型流；历史投影、工具状态、权限、副作用、压缩、重试和跨轮退出由外层会话与 Processor 负责。

### 问题 2

Provider 返回 `stop` 时一定退出吗？

**答案：** 不一定。若助手消息仍含有效工具调用，主循环需要继续，把工具结果送回模型。

### 问题 3

Processor 返回 `continue` 证明任务有进展吗？

**答案：** 不证明。它只表示当前流没有要求压缩、阻断或带错误停止。

### 问题 4

怎样验证重试没有掩盖副作用？

**答案：** 以 Attempt 为单位保存事件和工具执行记录，为副作用设置幂等键，并让最终 Evaluator 检查真实产物。
