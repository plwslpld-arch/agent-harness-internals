# 如何阅读 DeepSeek Harness 的测试、不变量与证据边界

[返回 DeepSeek Harness 课程地图](README.md)

阅读复杂 Harness 源码时，测试通常比 README 更接近真实约束，但只说「仓库里有测试」，范围还是太宽。每层证据都有边界。类型检查、单元测试、运行时不变量、端到端场景和真实模型评测各自观察不同对象，因此只能支持不同范围的结论。

阅读时不妨少统计测试数量，多追问每个设计结论究竟由哪一层证据支撑。

## 五层证据各回答什么

| 层次 | 能直接检查 | 常见盲区 |
| --- | --- | --- |
| 类型与 Schema | 字段、联合类型、输入形状 | 运行顺序与业务语义 |
| 单元测试 | 一个模块在构造输入下的行为 | 真实装配与外部系统 |
| 集成 / 端到端测试 | 多模块或一个产品路径 | 未覆盖平台、长期运行 |
| 运行时不变量 | 一次运行中事件之间的关系 | 没注册或没触发的路径 |
| 独立 Eval | 固定任务与评分规则下的结果 | 分布之外的任务与部署风险 |

例如，「Tool Result 必须引用已存在的 Tool Call」涉及两个事件之间的关系，单个字段无法表达，因此更适合交给运行时检查。至于「Headless 能打印答案」，端到端测试就足以核对。若要确认修复后的项目确实通过测试，还必须在 Harness 外部重新执行目标仓库的测试命令。

多层证据可以共同支持一个结论，但每一层只能证明自己观察到的部分，因此引用测试前要先看它实际构造了什么输入，又检查了什么结果。

## 运行时不变量：由包声明自己的跨事件关系

DeepSeek Harness 提供一个 Registry（注册表），各包通过自己的 Companion 向它登记动态检查。检查不会自动发生。Registry 只管理启用开关、包名筛选、重复注册和生命周期，具体检查哪些事件关系，仍由拥有这些关系的包决定。

这样分工以后，Registry 可以统一管理检查器怎样启动和停止，却不必理解每个业务包发出的事件。读源码时不要停在 Registry，还要进入具体 Companion，确认它到底安装了哪些监听器。

### 第 1 站：错误必须标明哪个包违反了什么约束

源码：[查看 `InvariantError`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/runtime-diagnostics/invariants/src/index.ts#L24-L66)

```typescript
export class InvariantError extends Error {
  readonly code = 'INVARIANT'
  constructor(packageName: string, message: string) {
    super(`invariant violated by "${packageName}": ${message}`)
  }
}
```

- **调用者**：包自有的 Invariant Installer 通过注入的 `fail()` 报错。
- **输入**：注册包名和被破坏的关系描述。
- **状态变化**：中断当前检查路径，不修改业务状态来「自动修复」。
- **返回**：稳定错误码、包归属与可读信息。
- **下一站**：测试或运行宿主决定终止、记录还是隔离该路径。

错误归属很重要。如果错误带有包归属，维护者就能把失败直接交给定义该契约的模块，而不会因为某个下游包触发了事件，就误判它应该负责。统一抛出 AssertionError 无法提供这层定位信息。

### 第 2 站：注册、筛选与生命周期由统一服务管理

源码：[查看 `InvariantRegistry.register()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/runtime-diagnostics/invariants/src/index.ts#L93-L197)

```typescript
if (!this.selected(packageName)) return unregister
const child = ctx.plugin(childCtx => installer(childCtx, fail))
await child
return async () => {
  await child.dispose()
  registrations.delete(packageName)
}
```

- **调用者**：每个包的 `invariant.ts` Companion。
- **输入**：完整包名和一个在子 Context 内安装监听器的函数。
- **状态变化**：预留包名；若被选中则启动独立 Child Fiber；释放时卸载监听器并清除注册。
- **返回**：与 Context Effect 绑定的 Disposer。
- **下一站**：业务事件触发包自有检查。

Allowlist/Blocklist 一旦排除某个包，该包登记的检查就不会运行，没有 Companion 的包也不会由「通用服务」代为检查。因此，一次运行没有出现 `InvariantError`，只能说明已经加载、选中并触发的检查没有报告违规。

## 测试宿主如何避免业务代码跑在检查之前

DeepSeek Harness 的测试设置会根据测试文件找到对应包。普通场景只加载该包的 Invariant Companion，专门检查拓扑的测试才加载全部 Companion。在业务代码开始装配前，测试 Root Plugin 还要等待 Invariant Service 和 Companion 全部启动。

Readiness Barrier 关注事件发生顺序，不关注等待时长，业务事件必须等检查器开始监听后才能发生。否则，即使测试通过，也可能只是违规事件先于检查器到达。这个顺序不能颠倒。

### 第 3 站：按测试拥有者选择 Companion

源码：[查看测试 Companion 选择](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/scripts/test-invariants.ts#L137-L157)

```typescript
const owner = normalized.match(/\/packages\/([^/]+)\/([^/]+)\/tests\//)
const companionPath = `../packages/${owner[1]}/${owner[2]}/src/invariant.ts`
if (testInvariantCompanions[companionPath] === undefined) {
  throw new Error(`test invariants: package test has no companion ...`)
}
```

- **调用者**：Vitest 全局设置建立测试 Invariant Host。
- **输入**：当前 Test Path 与 `import.meta.glob` 发现的 Companion 表。
- **状态变化**：选择本包检查，或在专门测试中选择全部检查。
- **返回**：需要挂载的 Companion Path 列表。
- **下一站**：Host 启动 Service、Companion 和业务 Root 的 Readiness Barrier。

这种做法兼顾了运行速度与检查范围：普通包测试不必导入整个 Monorepo，但某个包只要缺少约定的 Companion，对应测试就会立即报错。全量拓扑场景则负责发现跨包注册问题。

## 从一个结论反向找到合适测试

以「ACP 同一 Session 不允许两个并发 Prompt」为例：

1. 先读实现中第一次 `await` 前的 `record.inflight = inflight`，理解竞争窗口在哪里。
2. 在 `packages/acp/acp/tests/turns.spec.ts` 搜并发 Prompt 或 in-flight 场景。
3. 检查测试是否真的让第一个请求停在异步接纳阶段，而不是顺序调用两个已完成请求。
4. 再看取消、转换失败和 Session Dispose 是否都清除槽位。
5. 若要声称某个编辑器集成可用，还需在对应客户端与传输环境做端到端检查。

测试只有真正制造出设计要防范的时间窗口，才能为并发约束提供证据。同名测试不能作证。沿着输入和观察结果阅读，会比看到实现旁边有同名测试就接受结论更可靠。

## 独立 Eval 为什么仍然需要

仓库内部测试主要保护 DeepSeek Harness 自己的契约，无法自动判断 Agent 是否在陌生仓库中正确完成任务。若要评测完整任务，至少还要保存下面这些输入、过程和判定依据：

- 锁定任务输入、工作区基线、模型、Provider 和 Harness 配置；
- 保存 Session、Tool Trace、文件差异、停止原因、成本和时长；
- 由运行外部执行目标测试或评分器；
- 把基础设施中断与模型/工具造成的任务失败分开；
- 保留失败尝试，不能反复运行到一次通过后覆盖原结果。

一次评测不能拼接多次运行的材料。所有产物都必须来自同一次可识别的运行，否则不同尝试的 Session、文件差异和测试结果混在一起后，Evaluator（评估器）就无法判断某个分数究竟对应哪条执行轨迹。

如果还要用反馈数据训练模型，数据管线必须先经过显式适配，把原始点赞、文本反馈或测试结果转换成语义清楚的 Reward。定义训练所用的 Reward、选择 Checkpoint 和执行最终发布评测时，还要分别使用隔离的数据与判断主体，否则训练信号可能进入最终结论。

## 源码能支持和不能支持的结论

把结论限制在证据能够支持的范围内，我们可以从锁定源码和测试中核对这些内容：

- Agent、Session、ToolRuntime、Approval 和 Compaction 的数据流；
- 特定错误、取消和生命周期分支是否被显式处理；
- 仓库作者为哪些边界写了自动检查。

这些材料只能证明上面的内容，不能继续推出：

- 所有真实模型和 Provider 都满足相同假设；
- 未运行过的平台、文件系统或 Sandbox 已兼容；
- 长时间、高并发或恶意输入下没有未知故障；
- 某个具体部署已经满足安全、成本和发布要求。

读到这里，你已经沿 DeepSeek Harness 的装配链走到外部证据。现在可以回到 [课程地图](README.md)，按照「首次源码走读」的顺序打开永久链接逐项复核，再进入 [Codex 课程](../codex/README.md) 比较另一套架构怎样处理相同问题。
