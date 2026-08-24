---
title: pi 运行时、设计文档与外部边界
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/agent/src/harness/agent-harness.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/test/harness/agent-harness-scaffold.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/agent/docs/harness.md","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/examples/extensions/sandbox/index.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/docs/containerization.md","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"README.md","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi 运行时、设计文档与外部边界

## 读者会得到什么

读完本篇，你能判断一段 pi 结论究竟来自现行 Runtime 源码、上游测试、未来实施规格、Extension 示例、部署文档，还是外部项目。关键能力在于识别材料边界，并在证据强度不足时停止外推。

pi 的锁定树同时存在两套容易混淆的 Agent 路径。`packages/agent/src/agent-loop.ts` 是有上游行为测试支持的现行工具循环；`packages/agent/src/harness/**` 则包含新的 AgentHarness Scaffold，而 `packages/agent/docs/harness.md` 描述比 Scaffold 更完整的未来状态机。三者同仓并不表示它们在锁定版本中已经合并。

上游测试自己使用「AgentHarness v2 scaffold」命名，并要求大量公开操作显式抛出 `HarnessNotImplemented`。与此同时，实施规格写明这一批 Scaffold 源码和测试在第一个切片可以直接删除。这个强烈信号要求课程逐项检查调用者和测试，不能从规格的完整接口表反推当前 Runtime 已经兑现。

安全材料也有相同问题。`examples/extensions/sandbox` 展示怎样替换 Bash 工具并接入操作系统沙箱；`docs/containerization.md` 说明怎样运行 Gondolin、Docker 或 OpenShell。它们证明可选方案和集成路径，不证明默认 CLI 已经隔离。

Session 分享更外一层。根 README 指向单独的 `pi-share-hf` 项目，并要求用户准备外部账户和命令行工具。这个说明证明上游鼓励自愿分享，却不能证明 Coding Agent 默认上传 Session，也不能为外部仓库的当前实现提供本地源码证据。

证据层级决定句子的主语和时态。

## 核心概念

分析 Harness 时，最先要确定材料在系统生命周期里扮演什么角色，代码外观是否完整属于后续问题。源码说明某个结构已经存在，测试说明某个输入在给定夹具下应得到什么结果，设计文档说明维护者希望未来满足什么约束，示例说明一种可选接法，部署文档说明用户可以怎样组装运行环境。它们都很有价值，却回答不同问题。只有把材料类型写进证据记录，结论的时态和强度才不会失控。

运行时可达性比文件存在更严格。一个类即使已导出，也可能没有产品入口调用；一个方法即使签名齐全，也可能只抛出未实现错误；一个 Extension 即使代码完整，也可能需要显式安装和加载；一份容器指南即使可执行，也不表示默认 CLI 正运行在容器里。因此，判断「已实现」至少要同时看到实现体、调用者和行为验证，判断「默认启用」还要继续追踪配置、安装和启动路径。

本仓库把结论写成 Claim，并为 Claim 绑定锁定 Commit、文件和行锚点。Claim 是可复核的最小判断单元，要说明对象、条件、当前状态与边界，脱离上下文的摘要不满足要求。没有证据的部分保留为 unknown；只在设计文档出现的能力写成计划；只在示例出现的能力写成可选集成。这样的证据账本让后续版本漂移可以逐条复核，避免整篇文章凭印象重写。

| 材料类型 | 能直接支持的判断 | 仍需补充的证据 | 常见误读 |
| --- | --- | --- | --- |
| Source | 类型、分支和实现体在锁定树中存在 | 产品调用者、运行条件、行为测试 | 有文件就等于已启用 |
| Test | 给定夹具下的可重复行为和错误契约 | 真实依赖、产品入口、未覆盖分支 | Mock 通过就等于线上可用 |
| Design Doc | 目标约束、未来切片和迁移意图 | 对应源码、调用链和完成测试 | 接口表就是现行能力 |
| Example | 一种可选接入方式和扩展点 | 安装、启用、平台与失败回退 | 示例就是默认安全边界 |
| Deployment Doc | 可部署拓扑、挂载和运维步骤 | 实际部署状态、策略和运行证据 | 写了容器方案就已经隔离 |
| External Link | 上游公开推荐和用户动作 | 外部仓库锁定版本及其源码 | 链接目标的内部行为已核实 |
| Runtime Claim | 当前版本在限定条件下的行为判断 | 锁定来源、锚点和复现实验 | 把有条件结论扩写成普遍保证 |

## 为什么这样设计

pi 同时承担 AI 抽象、通用 Agent Core、Coding Agent 产品和实验性 Harness 设计，仓库自然会保存处于不同成熟度的材料。如果只按目录名阅读，`harness` 目录很容易比成熟的 `agent-loop.ts` 更吸引注意，未来规格也会因为接口完整而显得更「真实」。证据分类把注意力从命名和篇幅拉回可执行事实，使课程不因材料排版而颠倒主次。

显式区分材料还能保护安全结论。Sandbox Extension 和容器化文档说明 pi 可以接入更强边界，但边界是否存在取决于 Extension 是否加载、初始化是否成功、哪些工具被替换、宿主目录如何挂载以及网络策略是否生效。把示例提升为默认保证，会让读者错误估计命令和文件副作用；把它完全忽略，又会漏掉真实的扩展能力。条件化 Claim 能同时保存这两面。

这种设计也服务于版本维护。未来 AgentHarness v2 若逐步落地，课程无需争论旧文章「对还是错」，只需重跑绑定测试和调用者检查：原先的计划 Claim 可以升级为运行时 Claim，显式未实现项可以改为已实现，仍然未知的部分保持不动。证据类型、强度和时态共同构成迁移记录，读者能看到变化来自哪里。

最后，证据边界让学习目标更加具体。读者要练习怎样从一个公开断言回到实现、调用者、测试和部署条件，模块名称仅作为索引。这种方法同样适用于其他 Harness，也能阻止跨项目比较把「设计上支持」「示例中可接入」和「默认运行时已验证」混成一列。

## 实现思路

下面给出一套课程用的证据账本流程。这是本仓库用来约束分析结论的教学蓝图，pi 上游没有同名内部类型。每条记录先固定材料身份，再计算可达性，最后生成带条件的 Claim；任何一步证据不足都不得由下一层材料猜补。

账本还应保存反证。调用者搜索为空、测试明确期待拒绝、初始化存在本地回退，都是限制结论范围的可复核结果，不能写成「没有发现」的随手备注。正向证据与反向边界放在同一记录中，审查者才不会只挑支持预设答案的材料。

```ts
type EvidenceKind = "source" | "test" | "design" | "example" | "deployment" | "external";

interface EvidenceRecord {
  commit: string;
  path: string;
  kind: EvidenceKind;
  callers: string[];
  assertions: string[];
  enablement: string[];
  unknowns: string[];
}

interface ClaimRecord {
  id: string;
  status: "runtime" | "planned" | "optional" | "unknown";
  conditions: string[];
  evidence: EvidenceRecord[];
}
```

1. 固定仓库与 Commit，记录每个文件的材料类型。文件若同时含规格与示例，应按具体段落拆分，不能只给整文件一个标签。
2. 对 Source 建立调用者表：查导出、构造位置、产品入口和错误分支。只有类名却没有调用者时，状态保持「源码可见」；方法直接抛出未实现错误时，状态明确写成「显式未实现」。
3. 对 Test 提取真实输入、断言和替身边界。把测试证明的最小行为写入 `assertions`，把未连接的 Provider、文件系统或外部服务写入 `unknowns`。
4. 对 Design Doc 找未来时态、里程碑、迁移和删除说明。它们用于解释目标和约束，不能覆盖现行源码与测试的相反证据。
5. 对 Example 和 Deployment Doc 逐项填写安装、显式启用、平台、权限、挂载、网络、凭据与回退。某个条件未验证，Claim 就保留该条件。
6. 对 External Link 只记录本仓库能看到的推荐关系和用户动作；要描述链接目标内部实现，必须把外部仓库作为独立来源锁定。
7. 生成 Claim 后做反向审查：如果删掉设计文档，运行时判断是否仍成立；如果删掉示例，默认行为是否仍成立。答案为否时，说明结论强度写高了。
8. 最后运行锚点、来源锁和内容检查，把复现命令及失败结果也保存为证据。失败会限制 Claim 强度，应作为重要信息留存。

这套实现把「阅读仓库」变成可重复的数据处理。它尤其适合 pi，因为现行 Loop、未来 Scaffold、Extension 和部署方案都可能使用相似词汇；记录层级后，相同名词不再自动代表相同运行路径。

## 贯穿案例

假设要核对一句看似合理的描述：「pi 的 AgentHarness 默认在沙箱中持久执行任务，并能把会话分享到外部服务。」这句话混合了 Harness Scaffold、未来持久化规格、Sandbox 示例、容器部署和外部分享五类材料。正确做法是把复合句拆成可以独立证伪的 Claim，直接增加几个限定词仍会保留证据混写。

拆分时要保留原句中的每个动词：「执行」需要现行调用链，「持久」需要存储与恢复证据，「沙箱」需要真实隔离边界，「分享」需要出站动作和默认配置。任一动词只在规格或示例中出现，都必须单独降级，不能借相邻能力的成熟度补强。

第一步先记录观察到的材料，不急于给产品能力下结论：

```json
{
  "observations": [
    {"kind":"source","subject":"AgentHarness.prompt","result":"throws HarnessNotImplemented"},
    {"kind":"design","subject":"persistent operations","result":"planned slices"},
    {"kind":"example","subject":"sandbox Bash","result":"opt-in with local fallback"},
    {"kind":"deployment","subject":"containerization","result":"three optional topologies"},
    {"kind":"external","subject":"session sharing","result":"user-initiated setup link"}
  ]
}
```

1. 核对现行入口。Scaffold 测试调用 `prompt("hello")` 并期待 `HarnessNotImplemented`，所以「AgentHarness 已持久执行任务」被当前契约直接否定；与此同时，成熟的 `agent-loop.ts` 仍能执行工具，不能把这一否定扩大成「pi 没有 Agent Loop」。
2. 核对安全路径。Sandbox 代码位于示例 Extension，需加载后才可能替换 Bash；初始化失败还会回退 `localBash`。因此只能写「pi 提供可选 Sandbox Extension」，不能写「所有工具默认隔离」。
3. 核对部署条件。Docker、Gondolin 和 OpenShell 的挂载、网络与策略不同，文档存在只证明可部署。若没有实际运行记录，就不能选择其中一种拓扑替 pi 的默认 CLI 背书。
4. 核对分享边界。根 README 指向外部项目并要求主动设置，能支持「上游推荐可选分享路径」，不能支持「默认上传」或具体字段治理结论。
5. 把复合句改写为四条最小 Claim，并分别标注 runtime、planned、optional 或 external。任何未来变更只更新受影响的一条。

最终账本应类似下面的结果：

```json
{
  "claims": [
    {"id":"pi.loop.current","status":"runtime","statement":"现行 agent-loop 具备受测试支持的工具循环"},
    {"id":"pi.harness.v2","status":"planned","statement":"AgentHarness v2 多项公开操作在锁定版本显式未实现"},
    {"id":"pi.sandbox.example","status":"optional","statement":"Sandbox Extension 可替换 Bash，但需启用且存在本地回退"},
    {"id":"pi.session.share","status":"external","statement":"会话分享需要用户主动设置外部项目"}
  ],
  "rejected_summary":"默认沙箱化、持久执行并自动分享"
}
```

这个案例要求每个判断都能回到单一证据路径，谨慎措辞只是结果。读者由此看到：同一仓库里可以同时有成熟运行时、未完成 Scaffold、可选安全集成和外部生态；课程必须呈现它们之间的连接，也必须保留它们之间的断点。

## 真实输入与输出

### 输入

下面是一条真实可调用的 Scaffold 操作。锁定测试创建 AgentHarness 后调用 `prompt("hello")`，并把操作名加入 unfinished 列表：

```json
{"surface":"AgentHarness v2 scaffold","operation":"prompt","input":"hello"}
```

### 输出

测试期望 Promise 拒绝，错误对象携带 `HarnessNotImplemented` 和操作名 `prompt`。锁定测试把这种拒绝定义为当前契约：

```json
{"name":"HarnessNotImplemented","operation":"prompt","message":"AgentHarness.prompt is not implemented yet"}
```

因此，实施规格里关于持久操作、重试、工具恢复、收件箱、导航和迁移的完整流程只能写成「计划设计」。如果文章把这个输入画成已经运行完整状态机，就与当前测试直接冲突。

## 调用链

![pi 现行工具循环、AgentHarness Scaffold、未来实施规格、扩展示例、外部部署和 Session 分享之间的中文证据边界图](../../../assets/diagrams/pi/01-evidence-runtime-design-boundaries.svg)

Claim: pi.evidence.design-doc-is-not-runtime

Claim: pi.security.examples-are-not-default-boundaries

1. 先固定 Commit，并列出所分析文件是 Source、Test、Design Doc、Example、Deployment Doc 还是 External Link。
2. 对 Source 查找真实调用者和导出；类名、接口或目录存在只说明代码可见，不说明产品入口已经使用。
3. 对 Test 读取输入、断言和 Mock 边界。锁定 Scaffold 测试明确把多个公开操作定义为尚未实现。
4. 对 Design Doc 检查未来时态、切片表和迁移说明。规格要求第一个切片可删除当前 Harness Scaffold，说明它不是对现行完整行为的描述。
5. 对 Example 检查安装、显式启用、平台和失败回退。Sandbox 示例需要 `-e` 启用，初始化失败时会调用本地 Bash。
6. 对 Deployment Doc 记录额外进程、挂载、网络、凭据和网关。容器方案必须实际部署后才形成强边界。
7. 对 External Link 只记录公开关系和用户动作；没有把外部仓库锁入来源时，不描述其内部实现。
8. 最后把结论写成带条件的 Claim，并把未知项保留为 unknown，而不是用设计目标补齐。

## 源码证据

Scaffold 的错误类型直接把未实现状态编码进 Runtime：

```source
packages/agent/src/harness/agent-harness.ts:74-81
export class HarnessNotImplemented extends Error {
  constructor(operation: string) {
    super(`AgentHarness.${operation} is not implemented yet`);
    this.name = "HarnessNotImplemented";
  }
}
```

这里用全角符号重建模板字符串，只为避免把课程文本解释成真实插值；准确短摘录由 Claim 绑定锁定行号。

上游测试枚举了 prompt、skill、compact、navigate、resume、abort、队列、watch 和 lane 等未完成操作，并逐项断言拒绝：

```source
packages/agent/test/harness/agent-harness-scaffold.test.ts:145-188
it("rejects every unfinished public operation explicitly", async () => {
  for (const [operation, invoke] of unfinished) {
    await expect(Promise.resolve().then(invoke), operation)
      .rejects.toMatchObject({ name: "HarnessNotImplemented", operation });
  }
});
```

未来规格又给出更强边界：`packages/agent/docs/harness.md:2798-2815` 把 R3 到 R12 列为后续实施切片，并明确 `packages/agent/src/harness/**` 在切片 1 可直接删除。规格保留旧 `agent-loop.ts` 行为，说明旧 Loop 与未来 Harness 不能被揉成同一现行路径。

Sandbox 示例的 `execute` 也暴露默认回退。如果 `sandboxEnabled` 或 `sandboxInitialized` 为假，它直接执行 `localBash`；Session 启动时，命令行禁用、配置禁用、平台不支持或初始化异常都会令这两个条件失败。示例证明可扩展安全路径，也证明「文件存在」远远不够。

## 失败与限制

第一，不能因为 Scaffold 不完整就说 pi 没有 Agent Harness。现行 `Agent` 与 `agent-loop.ts` 已有完整工具循环；结论只限定新的 AgentHarness v2 Scaffold 和其未来规格。

第二，不能把设计文档全部降为无用。规格对目标不变量、持久化和迁移提供重要设计证据，也能指导将来漂移复核；它只是不足以证明锁定 Runtime 已兑现。

第三，Sandbox 示例在支持平台、依赖齐全、配置有效且初始化成功时可以形成操作系统级 Bash 边界。本篇否定的是默认启用和全工具覆盖，不否定该方案本身。

第四，Docker 的挂载可能把宿主工作区直接暴露给容器，Gondolin 只重定向特定工具，OpenShell 又依赖网关和策略。把三者统一写成「已沙箱化」会丢失威胁模型。

第五，Session 分享的公开链接不证明默认遥测。是否上传、上传哪些字段、如何脱敏、许可证和删除机制都要在外部项目锁定后另行核对；当前只能确认用户需要主动设置。

第六，上游 Commit 会变化。未来某个版本可能完成 Scaffold、改变默认工具或内建权限；届时应把文章标为 stale 并重核调用者，不能自动用新文档改写旧 Claim。

一个仓库可以同时包含过去、现在和未来。

## 验证方法

运行静态证据检查时，先确认 Lock 和 Checkout HEAD。随后搜索 AgentHarness 的产品调用者、`HarnessNotImplemented`、测试标题和设计文档的切片表；将每个公开操作标记为已实现、显式未实现或未知。

对 Sandbox 示例，只做无密钥的源码和目标测试核对：确认需要显式加载、确认初始化条件、列出支持平台，并追踪所有回退到 `localBash` 的分支。不要因为默认配置 `enabled: true` 就忽略 Extension 本身尚未安装或加载。

如果实际验证容器化，分别运行最小临时仓库，记录宿主与容器文件差异、挂载、网络、凭据可见性和策略拒绝。没有完成这些实验时，Claim 保持 C 级，不写成已验证隔离。

对 Session 分享，只验证根 README 的外部链接和主动动作，不执行上传，也不推断外部数据格式。真正的数据治理实验需要单独授权、脱敏夹具和可删除的测试账户。

先分类材料，再允许结论进入正文。

## 自检

### 问题 1

为什么新的 AgentHarness 类存在仍不能证明完整状态机已经运行？

**答案：** 锁定源码和上游测试明确让大量公开操作抛出 HarnessNotImplemented，未来规格还允许在第一切片删除当前 Scaffold；必须等待具体实现和调用者证据。

### 问题 2

Sandbox 示例的默认配置是 enabled，为什么仍不是默认隔离？

**答案：** Extension 需要安装和显式加载；即使加载，禁用标志、配置、平台或初始化失败都会回退本地 Bash。配置默认值只在 Extension 已进入运行时后生效。

### 问题 3

本篇是否否定 pi 现行 Agent Loop？

**答案：** 不否定。旧 agent-loop.ts 有源码和行为测试支持；本篇只阻止把未来 AgentHarness v2 规格写成现行完整实现。

### 问题 4

根 README 的 Session 分享段落能证明什么？

**答案：** 它证明上游推荐一个需要用户主动设置的外部分享项目；不能证明默认上传，也不能证明外部项目内部字段和治理行为。
