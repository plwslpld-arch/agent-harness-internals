---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, official-doc, inference]
---

# 核心 runtime 修改路线

这条路线的目标不是只会读 Harness，而是能在改动核心 runtime 时降低破坏行为的概率。这里的“核心 runtime”主要指：boot/profile、Cordis/Loader、Agent Loop、LLM adapter、tools、session persistence、sandbox/approval、Web/API 投影这些会影响任务执行语义的部分。

## 最终能力目标

学完后应该能做到：

- 判断一个需求应该改插件、配置、profile，还是必须改核心 runtime。
- 找到改动会影响的服务、事件、测试和设计决策。
- 看懂关键代码块的 happy path、error path、edge case。
- 写出最小兼容改动，而不是绕开 Cordis 生命周期或工具策略管道。
- 给改动补上对应测试、运行证据和文档更新。
- 在提交前说明“哪些行为被保持不变，哪些行为被有意改变”。

## 必须先掌握的运行不变量

| 不变量 | 为什么重要 | 先读 |
| --- | --- | --- |
| profile 是 patch 组合结果 | 改默认行为时不能只看一个 `cordis.yml` | [`config-composition.md`](../04-boot-and-configuration/config-composition.md) |
| Cordis service 随 fiber 生命周期清理 | 插件/HMR/teardown 是否安全取决于 effect disposer | [`plugin-lifecycle.md`](../03-cordis-foundation/plugin-lifecycle.md) |
| Loader entry tree 是插件装配事实来源 | 功能存在、entry 启用、profile 挂载是三件事 | [`key-file-deep-dives.md`](../14-file-reference/key-file-deep-dives.md) |
| Agent 和 Session 共享身份边界 | resume、fork、persistence、Web 投影都依赖 SessionId 语义 | [`event-log-and-recovery.md`](../08-session-and-context/event-log-and-recovery.md) |
| ToolRuntime 是唯一工具策略管道 | 不能让工具绕过 pre/post、approval、guard、schema、result 通知 | [`tool-policy-pipeline.md`](../07-tools-permissions-sandbox/tool-policy-pipeline.md) |
| DeepSeek adapter 按请求解析配置和 key | 改模型配置不能把 endpoint/key/retry 绑定到错误生命周期 | [`deepseek-protocol.md`](../06-model-adapter/deepseek-protocol.md) |
| HTTP ready 不等于业务 ready | Web URL、进程 ready、Agent idle、Session flush 是不同证据 | [`web-dataflow.md`](../10-web-client/web-dataflow.md) |

这些不变量是改核心 runtime 前的底线。任何改动如果破坏其中一条，都应该被当成架构变更，而不是普通 bug fix。

## 分阶段学习清单

### 阶段 A：能定位改动点

目标：看到一个需求，能判断入口在哪。

要做：

1. 读 [完整学习路径](complete-learning-path.md)。
2. 读 [重点文件精读](../14-file-reference/key-file-deep-dives.md)。
3. 在 [文件卡片](../14-file-reference/generated/harness-file-cards.md) 中查同一个能力域的 source、test、decision 文件。
4. 为一个假需求写 5 行判断：应该改哪个包、风险在哪、需要哪些测试。

验收：能把“想改模型默认参数”“想新增工具权限”“想改变 session 恢复行为”分别定位到不同子系统。

### 阶段 B：能读懂关键代码块

目标：不是逐行背代码，而是能解释关键函数的控制流。

要做：

1. 读 `runProfile()`、`boot()`、`Loader.constructor`、`AgentLoop.createAgent()`、`ToolRuntime.execute()`、`PersistenceCoordinator.append()` 这类关键函数。
2. 对每个函数写三段：正常路径、失败路径、边界情况。
3. 找到对应测试，先读测试名，再读断言，再回源码。

验收：不用看文档时，也能口头讲清楚一次 headless 任务从命令到 session flush 的路径。

### 阶段 C：能本地跑闭环

目标：验证不是“代码能编译”，而是行为真的符合预期。

要做：

1. 配置个人 `DEEPSEEK_API_KEY`。
2. 跑一次 headless 最小任务。
3. 观察模型请求是否真的走 `deepseek-official`。
4. 观察 session event 是否写入并能读回。
5. 故意触发一次缺 key、未知 tool 或 tool denial，确认失败是受控失败。

验收：能区分 build/typecheck、进程启动、模型请求成功、Session durable、业务任务完成这五种不同证据。

### 阶段 D：能写小插件

目标：先通过插件扩展能力，不急着改核心。

要做：

1. 从 [minimal-plugin-lab.md](../15-labs-and-tutorials/minimal-plugin-lab.md) 开始。
2. 写一个插件注册 service。
3. 写一个插件注册 tool。
4. 给 tool 加 output schema 和 render。
5. 在 agent scope 下测试 tool visibility、restriction、result。

验收：能解释为什么插件要通过 `ctx.plugin()`、`ctx.provide()`、`ctx.effect()`，而不是直接改全局对象。

### 阶段 E：能安全改核心 runtime

目标：做一个小而真实的核心 runtime 改动，并能证明没有破坏关键行为。

改动前必须写清楚：

- 现有行为是什么。
- 改动目标是什么。
- 哪个不变量可能被影响。
- 需要新增或修改哪些测试。
- 是否需要更新 docs、Agent Note 或实验记录。

改动时优先遵守：

- 优先改最靠近问题的层，不跨层绕开服务边界。
- 保持 Cordis effect/disposer 成对。
- 不让工具绕过 ToolRuntime。
- 不让 session 写入绕过 persistence coordinator。
- 不把凭据、endpoint、用户配置固化到启动时，除非该字段本来就是启动事实。
- 不用“测试改弱”证明代码正确。

改动后至少验证：

| 改动区域 | 最低测试 |
| --- | --- |
| boot/profile | app-boot、config reload、profile、CLI startup 相关测试 |
| Cordis/Loader | loader composition、HMR、plugin lifecycle 相关测试 |
| Agent Loop | agent、loop、cancel、resume、tool order、scope lifecycle |
| LLM adapter | dynamic config、serialize、SSE、translate、credential failure |
| Tools | schema、execution mode、code mode、scoped、approval/guard |
| Session persistence | persistence、write-behind、preparations、resume/load |
| Web/API | startup、trusted host、web dataflow、client runtime 相关测试 |

验收：能提交一个核心 runtime 小改动，并在 PR 描述里说明行为差异、风险、测试证据和未覆盖边界。

## 改核心 runtime 的检查模板

```text
改动目标：
受影响文件：
受影响服务/事件：
保持不变的行为：
有意改变的行为：
新增/修改测试：
本地验证：
运行证据：
文档影响：
回滚方式：
```

如果填不出来，说明还没到可以改核心 runtime 的阶段。

## 学完后能到什么程度

如果只读现有架构文档，大概只能到“看懂全局”。加上本路线、代码片段级 walkthrough、本地实验和插件实验后，目标水平是：

| 能力 | 目标水平 |
| --- | --- |
| 产品/架构判断 | 85–90% |
| 插件系统理解 | 80–85% |
| 本地使用和写简单插件 | 75–80% |
| 修改核心 runtime 并降低破坏概率 | 70–75% |
| 独立维护复杂核心改动 | 需要继续做第二批源码精读和更多真实回归实验 |

这里故意不写 100%。核心 runtime 的安全修改能力来自持续训练：读源码、读测试、做小改动、跑回归、记录证据、复盘失败。
