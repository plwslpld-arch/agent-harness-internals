---
title: pi 多 Provider 与流归一化
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/ai/src/types.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/ai/src/models.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/ai/src/utils/event-stream.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/ai/src/utils/overflow.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/ai/test/faux-provider.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/ai/test/models-runtime.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi 多 Provider 与流归一化

## 读者会得到什么

本篇解释 pi-ai 怎样把不同模型服务的请求和流响应投影成 Agent Core 可以消费的共同协议。你会看到模型目录、Provider 注册、认证解析、消息上下文、事件流、工具调用、用量、停止原因和错误分别承担什么责任。

所谓归一化，并不表示 Provider 能力完全一致。pi 保留 `api`、`provider`、`model`、`responseModel`、`rawStopReason`、思考签名和兼容配置等差异；共同类型只让上层能用稳定分支处理文本、思考、工具调用、结束和失败。

`Models.getModel()` 只查找目录项。真正请求还会经过 `requireProvider()`、`applyAuth()` 和对应 API Stream；未知 Provider、未配置认证或缺少 API 实现都会在更晚阶段失败。模型名称显示在列表里，不能直接证明当前账户可调用。

流协议把增量与终结分开。文本、思考和工具参数各有 start、delta、end；最终必须以 `done` 或 `error` 收敛。`AssistantMessageEventStream.result()` 返回最终 AssistantMessage，但这个消息仍只表示模型层终态，Agent Loop 是否继续取决于工具调用、队列和 Hook。

用量也需要限定。`Usage` 统一输入、输出、缓存读写、推理 Token 与成本字段，不过 Provider 未报告的细分会保持未定义，价格也依赖锁定模型元数据。不能把字段存在写成所有服务都准确提供。

先把流变成共同语法，再由 Agent 解释共同语法。

## 核心概念

pi-ai 解决的是「不同模型服务怎样被同一上层调用」，而不是「所有模型服务怎样变成完全相同」。模型目录保存可选择的元数据，Provider 注册表保存能够执行请求的适配器，认证解析为适配器补齐访问条件，API Stream 把共同 Context 翻译成服务请求。只有这些环节都成立，一次模型调用才具备运行时可达性。目录命中只是选择过程的起点。

流归一化把远端不断到达的 Frame 转成有限的事件词汇。`thinking_start/delta/end`、`text_start/delta/end` 与 `toolcall_start/delta/end` 让上层可以增量渲染，也能在 end 事件拿到结构化内容；`done` 与 `error` 负责收敛。最终 `AssistantMessage` 保存统一内容、用量和停止原因，同时保留 Provider、模型、响应模型与原始停止原因，避免归一化把诊断信息抹掉。

模型层、Agent 层和产品 Eval 层有不同终态。`done` 表示事件流完整结束，`stopReason: stop` 表示 Provider 认为该次响应正常停止，`toolUse` 表示模型请求工具，`length` 表示可能被长度截断。它们都不等于用户目标已完成。Agent Core 还要解释工具调用和队列，产品验证还要检查文件、测试或外部状态。

| 概念 | 主要责任 | 成功条件 | 不能推出的结论 |
| --- | --- | --- | --- |
| Model Catalog | 保存 Provider、模型、上下文窗和价格等元数据 | ID 能被查询 | 当前凭据一定可调用 |
| Provider Registry | 把 Provider ID 连接到请求适配器 | 目标 Provider 已注册 | 认证、网络与配额有效 |
| Auth Resolution | 从显式参数、凭据存储、OAuth 或环境解析认证 | 得到适配器可用的认证材料 | 远端一定接受请求 |
| API Stream | 发送请求并解析远端增量 | 选择到与模型 `api` 匹配的实现 | 所有服务能力一致 |
| Context | 表达系统提示、消息和工具定义 | 可被 Provider 转换 | 原始字段会原样发送 |
| Stream Event | 表达思考、文本、工具调用和终结增量 | 事件顺序合法并最终收敛 | Agent 或任务已经完成 |
| AssistantMessage | 保存统一响应与差异字段 | `result()` 得到终态消息 | 工具副作用已成功 |
| Usage / Raw fields | 支持计量与诊断 | Provider 有报告且适配器正确映射 | 跨 Provider 口径天然可比 |

## 为什么这样设计

若 Agent Core 直接理解每家服务的原始流，它就要为每个 Provider 重写文本拼接、工具参数增量、停止原因、Abort 和错误处理。新增服务会扩散到工具循环、界面与会话存储，任何一处漏改都可能形成只在某个模型出现的控制流缺陷。共同事件协议把变化集中到 Provider 适配器，使上层围绕稳定语义编程。

归一化又不能过度。Provider 对缓存 Token、推理 Token、响应模型、工具调用 ID 和错误码的定义并不一致；强行丢弃差异会让成本分析和故障归因失真。因此 pi 同时保存统一字段与原始字段：统一字段服务于控制流，原始字段服务于诊断和精确比较。二者不是重复，而是面向不同消费者的双视图。

把目录与运行时分开同样重要。目录可以离线更新、持久缓存或包含尚未配置的服务，让 UI 先展示选择空间；真正调用则必须动态检查 Provider、认证和 API 实现。这样的分层允许「可发现但不可调用」成为明确状态，也让错误可以落在 Provider、auth 或 api 等更具体类别，而不是笼统报告模型不存在。

确定性的 Faux Provider 则解决测试可重复性。真实模型流受网络、服务升级、采样和账户状态影响，无法作为核心协议的唯一回归证据。Faux Provider 能锁定事件顺序、工具参数拼接和终结语义；真实 Provider 实验再用于验证适配器兼容性。两类测试组合起来，既稳定又不假装离线夹具证明了线上可用性。

## 实现思路

下面是一个与 pi 分层一致的教学版适配流程，用来说明责任如何切开；它不是上游源码的逐行复制。关键点是：先解析模型和认证，再选择 API Stream；适配器只能发出共同事件，最终消息同时保存归一化字段与原始诊断。

实现还要定义事件不变量：每个已开始的内容块只能结束一次，Tool Call 的完整参数只能在 `toolcall_end` 后交给 Agent，整个流只能有一个终结事件。若远端连接中途断开，适配器应形成显式 error，而不是把已经收到的半段文本包装成正常 done。这些不变量比某家服务的 Frame 名称更稳定。

```ts
async function openModelStream(request: Request): Promise<AssistantEventStream> {
  const model = models.getModel(request.provider, request.model);
  const provider = providers.require(model.provider);
  const auth = await authResolver.require(model, request.auth);
  const api = provider.requireApi(model.api);

  return api.stream({
    model,
    auth,
    context: request.context,
    onFrame: (raw) => provider.normalize(raw, model)
  });
}
```

1. 查询 Model Catalog，并把「未找到目录项」与后续运行时错误分开。目录记录应包含 Provider ID、API 类型、模型 ID、上下文窗和能力元数据。
2. 用 Provider ID 查注册表。未注册时返回 Provider 类错误，不应悄悄换到另一个服务或只凭同名模型猜测适配器。
3. 按优先级解析认证：显式调用参数、受管凭据、OAuth 或环境变量。记录来源类别即可，密钥正文不得进入 Trace。
4. 按模型的 `api` 选择 Stream 实现。API 不匹配是协议错误，即使 Provider 和认证都存在也不能继续。
5. 把共同 Context 转成远端请求。工具 Schema、系统提示和消息内容在此做 Provider 特定映射，但不修改持久会话原文。
6. 对每个远端 Frame 生成共同事件。文本、思考和工具参数必须正确配对 start、delta、end；未知 Frame 要么安全保存为诊断，要么形成显式错误，不能静默丢失控制信息。
7. 在 `done` 或 `error` 时构造最终 AssistantMessage，填充 Provider、请求模型、响应模型、统一 StopReason、rawStopReason、Usage 和安全错误摘要。
8. 把消息交给 Agent Core。只有 Agent Core 决定是否执行工具、重试或等待；Provider 适配层不得宣布产品任务成功。

测试应分三圈。第一圈用 Faux Provider 做无密钥事件协议测试；第二圈用 Models Runtime 夹具覆盖 Provider、auth 和 api 错误；第三圈才在显式授权下连接真实服务，保存版本、区域和原始诊断。这样可以准确说明每一圈证明了什么。

## 贯穿案例

考虑一个用户选择目录中的模型并请求调用 `read_file` 的场景。第一次实验没有配置认证，第二次改用 Faux Provider 验证流协议，第三次才连接真实服务。三个 Attempt 共享同一任务描述，却回答三个不同问题：目录是否可发现、共同协议是否正确、真实适配器是否可用。不能把其中一次成功替代另外两次。

为避免恢复过程污染结论，实验把 Trial ID 固定，给每次 Attempt 分配独立编号，并在结果中记录证据范围。缺少认证的 Attempt 是配置失败，Faux Provider Attempt 是合成协议证据，真实调用 Attempt 才能说明指定账户与区域在当时可达；三者都保留在记录中。

初始请求可以表示为：

```json
{
  "provider":"demo-provider",
  "model":"demo-model",
  "messages":[{"role":"user","content":"读取说明文件并概括"}],
  "tools":[{"name":"read_file","parameters":{"type":"object","properties":{"path":{"type":"string"}}}}]
}
```

1. `getModel()` 返回目录对象，UI 因而能够展示模型名称和上下文窗。调用继续进入 Provider Registry，说明「看得见」没有被误当成「能调用」。
2. Provider 已注册但认证解析为空，运行时返回 auth 类错误。此时没有远端请求，也不应生成伪造的 `done`；Trace 记录认证来源缺失，但不记录任何密钥正文。
3. 测试改用 Faux Provider。它按固定分块返回思考、文本和 `read_file` Tool Call，适配器发出完整事件序列。这个 Attempt 验证共同协议和参数拼接，明确标注为 synthetic。
4. Agent Core 收到 `toolUse` 后才执行教学用只读工具，将 Tool Result 写入上下文并请求下一次模型响应。Provider 的 `done` 发生在工具之前，因此不能作为任务完成证据。
5. 若获得真实服务授权，再运行同一夹具，记录远端模型、响应模型、rawStopReason、Usage、HTTP 状态和区域。真实结果可能暴露 Faux Provider 未覆盖的 Frame 或计量差异。
6. 产品 Eval 最后检查概括是否引用了文件真实内容。即使两个模型流都正常结束，只要目标内容错误，Trial 仍失败。

Faux Provider 的预期协议证据可写成：

```json
{
  "streamTerminal":"done",
  "stopReason":"toolUse",
  "eventOrder":["start","thinking_start","thinking_delta","thinking_end","text_start","text_delta","text_end","toolcall_start","toolcall_delta","toolcall_end","done"],
  "evidenceScope":"共同事件协议，不代表线上 Provider 可用"
}
```

这个案例把四个容易混淆的成功拆开：目录查询成功、认证成功、流协议成功、产品目标成功。每一层都有独立错误和证据，恢复动作也只能修复对应层。模型列表里出现某个名称，不会自动越过认证；事件流得到 `done`，也不会自动越过工具与 Eval。

## 真实输入与输出

### 输入

Faux Provider 测试构造一个确定性 Assistant 响应，按顺序含思考、文本和工具调用，并指定停止原因为 `toolUse`：

```json
{"content":[{"type":"thinking","thinking":"go"},{"type":"text","text":"ok"},{"type":"toolCall","id":"tool-1","name":"echo","arguments":{}}],"stopReason":"toolUse"}
```

### 输出

`stream()` 将它展开成固定事件序列。工具参数可以由多个 delta 组成，`toolcall_end` 才提供完整 ToolCall，最后 `done` 携带最终 AssistantMessage：

```json
{"events":["start","thinking_start","thinking_delta","thinking_end","text_start","text_delta","text_end","toolcall_start","toolcall_delta","toolcall_end","done"]}
```

这组测试不需要真实 API Key，适合证明共同事件协议。它没有验证 Anthropic、OpenAI、Google 或其他线上服务当前返回完全相同的原始 Frame。

## 调用链

![pi 多模型服务从目录、认证、Provider API、原始流到统一消息事件和 Agent Core 的中文数据流图](../../../assets/diagrams/pi/02-ai-provider-stream-normalization.svg)

Claim: pi.ai.provider-stream-is-normalized

Claim: pi.ai.model-catalog-is-not-runtime-availability

1. 调用方按 Provider ID 和模型 ID 查询 `Models`；目录可以来自内建基线、动态刷新或持久缓存。
2. 请求进入 `stream()` 或 `streamSimple()`，先用模型中的 Provider ID 查找已注册 Provider。
3. `applyAuth()` 解析显式 Key、凭据存储、OAuth、环境和 Provider 特定认证；调用方显式选项按字段覆盖解析结果。
4. Provider 根据模型的 `api` 选择对应 Stream 实现；缺少实现时返回错误流。
5. Provider 适配器把共同 Context 转换成远端请求，并把远端增量解析为思考、文本与工具调用事件。
6. `AssistantMessageEventStream` 排队交付事件；出现 `done` 或 `error` 时解析最终 AssistantMessage。
7. 最终消息携带统一 Usage、StopReason、错误、原始停止原因和 Provider 身份，交给 Agent Core。
8. Agent Core 再根据 `toolUse`、`length`、`error`、`aborted` 或 `deferred` 决定执行工具、恢复、结束或等待；模型层本身不判定任务正确。

## 源码证据

共同类型同时保留统一字段和 Provider 差异：

```source
packages/ai/src/types.ts:372-467
export interface ToolCall { type: "toolCall"; id: string; name: string; arguments: Record<string, any>; }
export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; }
export type StopReason = "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";
export interface AssistantMessage { provider: ProviderId; model: string; usage: Usage; stopReason: StopReason; }
```

Models 在调用 Provider 前强制解析认证；未配置认证不会因为目录命中而跳过：

```source
packages/ai/src/models.ts:628-679
const provider = this.providers.get(model.provider);
if (!provider) throw new ModelsError("provider", ...);
const resolution = await this.getAuth(model, ...);
if (!resolution) throw new ModelsError("auth", ...);
return provider.stream(requestModel, context, requestOptions);
```

事件流只把 `done` 和 `error` 识别为终结事件。Faux Provider 的固定分块测试进一步锁定了 start、thinking、text、toolcall 和 done 的顺序；另一个 Models Runtime 测试确认未知 Provider 形成 error AssistantMessage，而成功测试得到 start、done 和 stop。

Context Overflow 也不是单一字符串。`isContextOverflow()` 依次检查已知错误模式、成功但 Usage 超过窗口的静默溢出，以及 length 且没有输出的近满窗口分支。自定义 Provider 的错误文本可能无法命中，因此分类仍有 unknown。

## 失败与限制

第一，目录命中只说明模型元数据可见。认证可能缺失，Provider 可能未注册，API 实现可能不匹配，网络和区域也可能拒绝请求。

第二，共同 StopReason 会压缩 Provider 差异。调试时应同时保存 `rawStopReason`、错误正文的安全摘要、HTTP 状态和 Provider 身份；不可把所有 error 合并成模型质量差。

第三，`done` 表示流协议收敛。它无法证明工具已经执行、用户目标完成或最终文件正确，后续 Agent 与 Eval 仍有独立终态。

第四，Usage 的共同字段不保证同口径。缓存、推理 Token、服务端计费和响应模型可能由不同 Provider 采用不同定义；跨 Provider 成本比较必须固定版本和计价来源。

第五，Abort 可能来自调用方 Signal、网络中断或 Provider 响应。统一 `aborted` 有利于控制流，但恢复策略仍要判断副作用是否已经发生。

第六，真实跨 Provider Handoff 测试依赖各服务凭据，会按环境跳过或产生外部成本。本篇没有执行它，因此不会把目录里的 Provider 列表写成全部已验证。

共同协议降低上层复杂度，也要求保留原始诊断。

## 验证方法

先静态核对 `types.ts`、`models.ts`、具体 Provider 和事件流实现，确认模型的 API 值能路由到真实 Stream，并记录认证分支。随后运行 Faux Provider 和 Models Runtime 的无密钥测试，保存完整事件序列。

向测试 Provider 注入未知 Provider、缺少认证、缺少 API 实现、error、aborted、length、deferred 和不完整工具参数。逐项检查最终 StopReason、错误消息、事件是否终结以及 `result()` 是否可解析。

真实 Provider 实验必须单独授权并记录版本、区域、端点、模型、认证来源、请求选项、原始停止原因和响应模型；密钥正文不得进入 Artifact。一个 Provider 的成功不能替代其他 Provider。

Eval 以统一 AssistantMessage 和原始诊断为 Trace 输入，但评分器检查目标产物。训练 Reward、Checkpoint 选择与独立发布 holdout 继续使用不同数据和决策记录。

归一化协议，保留差异证据。

## 自检

### 问题 1

`getModel()` 返回对象后，为什么请求仍可能失败？

**答案：** 它只证明目录命中；真正请求还要找到 Provider、解析认证、匹配 API 实现，并通过网络、区域和配额检查。

### 问题 2

`done` 与 `stop` 能证明 Agent 任务完成吗？

**答案：** 不能。它们描述模型流和模型响应终态；Agent 还可能执行工具、处理队列，Eval 还要检查目标产物。

### 问题 3

Faux Provider 测试提供了什么强证据？

**答案：** 它用确定性夹具锁定共同内容结构、增量事件顺序和终结语义，不证明任何线上 Provider 当前可用。

### 问题 4

为什么跨 Provider 比较要保存原始停止原因和 Provider 身份？

**答案：** 共同 StopReason 会压缩服务差异；保留原始字段才能判断错误分类、兼容分支和成本口径是否真的可比。
