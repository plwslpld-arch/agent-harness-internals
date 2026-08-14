---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, runtime, official-doc, inference]
---

# 阶段式学习清单

这不是读书目录，而是学习任务单。每个阶段都回答三个问题：读什么、做什么、做到什么程度算过关。

## 阶段 0：先建立正确问题

适合：所有人。

读：

- [非研发导读](non-engineer-guide.md)
- [产品路线](product-path.md)
- [完整学习路径](complete-learning-path.md)

做：

- 用自己的话写下 Harness 和模型的区别。
- 写下“源码存在、配置启用、运行激活、产品闭环”四者的区别。

过关标准：

- 不再把 Harness 说成“DeepSeek 的一个 API 包装”。
- 能解释为什么 HTTP 200、进程启动、测试通过都不等于业务任务完成。

## 阶段 1：看懂产品和架构

适合：产品、架构、工程负责人。

读：

- [产品成熟度](../01-product/product-maturity.md)
- [系统架构](../02-system-architecture/README.md)
- [运行拓扑](../02-system-architecture/runtime-topology.md)

做：

- 画出一次任务从用户输入到结果落账的路径。
- 标出哪些层是控制平面、执行平面、证据平面、产品表面。

过关标准：

- 能说明 Web、headless、SDK 不是三套内核，而是不同产品表面。
- 能说清模型、工具、session、权限、Web 之间的关系。

## 阶段 2：看懂插件系统

适合：所有要理解 Harness 差异化的人。

读：

- [插件系统全景](../03-cordis-foundation/plugin-system-mainline.md)
- [插件生命周期](../03-cordis-foundation/plugin-lifecycle.md)
- [Cordis 分叉与插件系统研究](../13-source-studies/cordis-fork-and-plugin-system.md)
- [论文注释方法](../13-source-studies/paper-annotation-method.md)

做：

- 用“办公室积木”的方式解释 Context、Service、Plugin、Fiber、Effect。
- 找一个具体能力，例如 DeepSeek model provider，说明它为什么是插件。

过关标准：

- 能区分 Cordis 论文、Harness vendored Cordis、Harness 插件生态。
- 能解释为什么“219 packages 不等于 219 个社区插件”。

## 阶段 3：跑通本地闭环

适合：想真正上手的人。

读：

- [本地第一次跑通](../15-labs-and-tutorials/local-first-run.md)
- [实验协议](../15-labs-and-tutorials/experiment-protocol.md)

做：

- 配置个人 `DEEPSEEK_API_KEY`。
- 跑一次 headless 任务。
- 记录命令、环境、结果、失败边界。
- 故意触发一次缺 key 或错误配置，观察失败是否受控。

过关标准：

- 能区分“启动成功”“模型请求成功”“Session 写入成功”“任务完成”。
- 能把实验结果写成可复核记录，而不是只说“我跑过了”。

## 阶段 4：读源码主链路

适合：研发、技术产品、架构同学。

读：

- [重点文件精读](../14-file-reference/key-file-deep-dives.md)
- [关键函数代码块解析](../14-file-reference/key-function-walkthroughs.md)
- [逐文件源码阅读指南](../14-file-reference/source-reading-guide.md)

做：

- 按顺序读 12 个核心文件。
- 对每个核心文件写一句话：它在主链路里解决什么问题。
- 对每个关键函数写三段：正常路径、失败路径、边界情况。

过关标准：

- 能讲清 `dsh → profile boot → app boot → Loader → AgentLoop → DeepSeek adapter → ToolRuntime → Session persistence`。
- 遇到某个源码文件，知道去文件卡片里查依赖、测试和调用关系。

## 阶段 5：写一个最小插件

适合：研发、平台产品、架构同学。

读：

- [最小插件实验](../15-labs-and-tutorials/minimal-plugin-lab.md)
- [插件系统全景](../03-cordis-foundation/plugin-system-mainline.md)

做：

- 写一个 host-only 插件。
- 注册一个 service 或只读 event listener。
- 再注册一个最小 tool。
- 验证启用、禁用、dispose 后没有残留。

过关标准：

- 能解释插件为什么要通过 `ctx.effect()` 或注册 API 的 disposer 管理副作用。
- 能解释为什么工具必须经过 `ctx.tools`，不能绕开 ToolRuntime。

## 阶段 6：学习安全改核心 runtime

适合：要参与核心代码改动的人。

读：

- [核心 runtime 修改路线](core-runtime-contributor-path.md)
- [工具策略管道](../07-tools-permissions-sandbox/tool-policy-pipeline.md)
- [Session 事件与恢复](../08-session-and-context/event-log-and-recovery.md)
- [benchmark 设计](../19-benchmarks-and-evaluation/benchmark-design.md)

做：

- 选择一个小改动，先写“改动前说明”：目标、受影响服务、受影响事件、保持不变的行为、测试矩阵。
- 修改前先找相关测试。
- 修改后跑相关测试和全局检查。

过关标准：

- 能说清这个改动为什么没有破坏不变量。
- 能写出 PR 级别的测试证据和未覆盖风险。

## 阶段 7：持续跟踪生态

适合：维护者、产品负责人、战略判断。

读：

- [生态入口](../16-ecosystem-and-community/README.md)
- [社区快照](../16-ecosystem-and-community/2026-08-13-community-snapshot.md)
- [版本基线](../17-version-tracking/version-baseline.md)
- [上游与许可证维护](../18-maintainer-guide/upstream-and-license.md)

做：

- 每次上游更新后看 stale 文档。
- 分清官方声明、源码事实、社区证据、推断。
- 对插件生态做持续采样，不用一次性结论替代长期观察。

过关标准：

- 能判断一个上游更新影响哪些学习文档。
- 能说明生态成熟度的证据等级，而不是只看 star 或宣传。
