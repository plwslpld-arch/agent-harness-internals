# 如何阅读 DeepSeek Harness 的测试、不变量与证据边界

[返回 DeepSeek Harness 课程地图](README.md)

阅读复杂 Harness 源码时，测试通常比 README 更接近真实约束。但「仓库里有测试」仍是一个过宽的说法：类型检查、单元测试、运行时不变量、端到端场景和真实模型评测观察的对象不同。

本篇不统计测试数量，而是教你把一个设计结论追到合适的证据层。

## 五层证据各回答什么

| 层次 | 能直接检查 | 常见盲区 |
| --- | --- | --- |
| 类型与 Schema | 字段、联合类型、输入形状 | 运行顺序与业务语义 |
| 单元测试 | 一个模块在构造输入下的行为 | 真实装配与外部系统 |
| 集成 / 端到端测试 | 多模块或一个产品路径 | 未覆盖平台、长期运行 |
| 运行时不变量 | 一次运行中事件之间的关系 | 没注册或没触发的路径 |
| 独立 Eval | 固定任务与评分规则下的结果 | 分布之外的任务与部署风险 |

例如「Tool Result 必须引用已存在的 Tool Call」不是一个字段能表达的约束，更适合运行时不变量；「Headless 能打印答案」适合端到端测试；「修复后的项目测试真的通过」则必须由 Harness 外部重新执行目标仓库的测试。

## 运行时不变量：由包声明自己的跨事件关系

DeepSeek Harness 提供一个 Registry，让各包在自己的 Companion 中注册动态检查。Registry 负责启用开关、包名筛选、重复注册和生命周期；具体检查仍属于对应包。

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

包归属比统一抛一个 AssertionError 更有用：它让失败能路由到拥有该契约的模块，也避免观察者误以为是触发事件的下游包负责。

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

被 Allowlist/Blocklist 排除时，检查根本不会运行；包没有 Companion 时也不会被「通用服务」自动检查。因此一次运行没有 `InvariantError`，只说明已加载、已选中且已触发的那些检查没有报告违规。

## 测试宿主如何避免业务代码跑在检查之前

DeepSeek Harness 的测试设置按测试文件定位包，只加载该包的 Invariant Companion；专门的拓扑测试才加载全部 Companion。测试 Root Plugin 会等待 Invariant Service 和 Companion 启动完成，随后才进入业务装配。

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

这种做法在速度和覆盖之间取平衡：普通包测试不必导入整个 Monorepo，但每个包若缺少约定的 Companion 会立即报错；另一个全量拓扑场景负责发现跨包注册问题。

## 从一个结论反向找到合适测试

以「ACP 同一 Session 不允许两个并发 Prompt」为例：

1. 先读实现中第一次 `await` 前的 `record.inflight = inflight`，理解竞争窗口在哪里。
2. 在 `packages/acp/acp/tests/turns.spec.ts` 搜并发 Prompt 或 in-flight 场景。
3. 检查测试是否真的让第一个请求停在异步接纳阶段，而不是顺序调用两个已完成请求。
4. 再看取消、转换失败和 Session Dispose 是否都清除槽位。
5. 若要声称某个编辑器集成可用，还需在对应客户端与传输环境做端到端检查。

这套读法比「实现旁边有一个同名测试，所以结论成立」更可靠，因为它要求测试真正制造设计要防的时间窗口。

## 独立 Eval 为什么仍然需要

仓库内部测试主要保护 DeepSeek Harness 自身的契约；它不会自动判断 Agent 在未知仓库中是否正确完成任务。一个完整任务评测至少需要：

- 锁定任务输入、工作区基线、模型、Provider 和 Harness 配置；
- 保存 Session、Tool Trace、文件差异、停止原因、成本和时长；
- 由运行外部执行目标测试或评分器；
- 把基础设施中断与模型/工具造成的任务失败分开；
- 保留失败尝试，不能反复运行到一次通过后覆盖原结果。

如果反馈数据要进一步用于训练，还要加一层显式适配：把原始点赞、文本反馈或测试结果转换成定义清楚的 Reward。训练 Reward、Checkpoint 选择和最终发布评测应使用分离的数据与判断主体。

## 源码能支持和不能支持的结论

从锁定源码与测试可以核对：

- Agent、Session、ToolRuntime、Approval 和 Compaction 的数据流；
- 特定错误、取消和生命周期分支是否被显式处理；
- 仓库作者为哪些边界写了自动检查。

仅凭这些材料不能推出：

- 所有真实模型和 Provider 都满足相同假设；
- 未运行过的平台、文件系统或 Sandbox 已兼容；
- 长时间、高并发或恶意输入下没有未知故障；
- 某个具体部署已经满足安全、成本和发布要求。

到这里，DeepSeek Harness 课程已经从装配一路走到外部证据。建议回到 [课程地图](README.md)，按「首次源码走读」顺序自己沿永久链接复核一遍，再进入 [Codex 课程](../codex/README.md) 比较另一种架构。
