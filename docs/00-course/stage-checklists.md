---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"},{"repo":"cordis","path":".","commit":"8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, official-doc, inference]
---

# 阶段学习检查清单

这页只回答“每个阶段学完要能做什么”。不要求精确到源码行号，但要求能追到源码文件、关键代码块、测试和本地证据。

## 阶段 1：知道 Harness 是什么

读：

- [01｜Harness 是什么](../01-what-is-a-harness.md)

学完要能做到：

- 用 3 句话解释 Harness 和模型、评测框架、聊天 UI 的区别。
- 画出用户输入、Agent Loop、模型、工具、Session、Web 的关系。
- 判断一个功能是“源码存在”“profile 默认启用”“产品可见”还是“真实跑通过”。

过关问题：

- 为什么不能把 benchmark 结果只归因于模型？
- 为什么 Web 是产品表面，而 Session 才是事实账本？

## 阶段 2：理解插件系统

读：

- [03｜Cordis 插件运行时](../02-cordis-and-boot.md)
- [12｜生态、论文与维护](12-ecosystem-maintenance.md) 中的 Cordis 论文部分
- [../13-source-studies/cordis-fork-and-plugin-system.md](../02-cordis-and-boot.md)

学完要能做到：

- 解释 Context、Service、Event、Fiber、Effect 分别解决什么问题。
- 说明为什么 Harness 更像 VS Code Extension Host，而不只是 Webpack plugin。
- 看懂一个插件如何注册 service、监听事件、贡献 prompt 或工具。

过关问题：

- 为什么 Cordis 的 effect/fiber 对热更新和卸载很重要？
- 为什么 219 个 workspace packages 不等于 219 个社区插件？

## 阶段 3：走通核心运行链路

读：

- [04｜启动与配置](../02-cordis-and-boot.md)
- [05｜Agent Loop](../03-agent-loop.md)
- [06｜Prompt 与上下文](../04-system-prompt.md)
- [07｜DeepSeek Adapter](07-deepseek-adapter.md)

学完要能做到：

- 从 profile/CLI 追到插件装配。
- 从一个用户任务追到 turn、step、request/header、request/context、assistant/message。
- 解释 prompt 不是一个静态字符串，而是运行时 assembly。
- 解释 DeepSeek adapter 如何处理 API key、baseURL、thinking、SSE、usage。

过关问题：

- prompt 在哪里配置？哪些是全局，哪些是 scoped？
- 为什么 adapter 不应该自己偷偷改变任务语义？

## 阶段 4：理解副作用治理

读：

- [08｜工具、审批与沙箱](08-tools-approval-sandbox.md)
- [09｜Session、持久化与恢复](../05-session.md)

学完要能做到：

- 区分 approval、sandbox、permission preset。
- 解释工具失败为什么也必须变成 model-visible result。
- 解释 Session event log、surface、UI state 的区别。
- 说明恢复时为什么不能盲目重跑副作用工具。

过关问题：

- 如果工具已经开始但结果没落盘，为什么是 `TOOL_OUTCOME_UNKNOWN`？
- 为什么“看到最后回答”不等于“Session 已经可恢复”？

## 阶段 5：进入源码和测试

读：

- [11｜源码阅读与本地实验](11-source-reading-and-labs.md)
- [../14-file-reference/source-reading-guide.md](../14-file-reference/source-reading-guide.md)
- [../14-file-reference/key-file-deep-dives.md](../14-file-reference/key-file-deep-dives.md)
- [../14-file-reference/key-function-walkthroughs.md](../14-file-reference/key-function-walkthroughs.md)

学完要能做到：

- 不从 7,412 个文件硬读，而是从产品问题定位到源码文件。
- 对一个核心文件写出：责任、入口、调用者、失败路径、测试证据。
- 读懂测试不是“覆盖率数字”，而是行为契约。

过关问题：

- 修改 Agent Loop 时，除了 `agent-loop` 自己的测试，还要看哪些相邻测试？
- 为什么源码索引只能定位，不能替代人工语义判断？

## 阶段 6：做本地实验闭环

读：

- [../15-labs-and-tutorials/local-first-run.md](../15-labs-and-tutorials/local-first-run.md)
- [../15-labs-and-tutorials/experiment-protocol.md](../15-labs-and-tutorials/experiment-protocol.md)
- [../15-labs-and-tutorials/minimal-plugin-lab.md](../15-labs-and-tutorials/minimal-plugin-lab.md)

学完要能做到：

- 用个人 `DEEPSEEK_API_KEY` 跑一次正向任务。
- 跑一次缺 key、工具拒绝或 sandbox 失败的负向任务。
- 用脱敏证据记录命令、环境、退出码、session 摘要和 known gaps。
- 明确“HTTP 200”“进程退出 0”“模型有回答”和“任务完成”不是同一层证据。

过关问题：

- 你的证据能不能让另一个人复现？
- 你的日志里有没有泄露 key、私有路径或不可分享内容？

## 阶段 7：准备改核心 runtime

读：

- [../13-source-studies/core-runtime-study.md](../03-agent-loop.md)
- [../13-source-studies/core-runtime-study.md](../03-agent-loop.md)
- [../13-source-studies/security-and-orchestration-study.md](../13-source-studies/security-and-orchestration-study.md)

改动前必须写清：

- 改哪个边界：Agent Loop、prompt、adapter、tool runtime、session、persistence、Web projection。
- 哪些事件词汇会变化。
- 哪些请求字段会变化。
- 哪些失败路径会变化。
- 哪些测试和本地实验能证明没有破坏行为。

最低验证：

- `npm run check`。
- 受影响包的直接测试。
- 至少一个成功运行证据。
- 至少一个失败/拒绝/取消/恢复场景证据。
- 如果涉及 DeepSeek provider，再跑真实 `DEEPSEEK_API_KEY` 的脱敏 E2E。

达到这个阶段后，你不是“看懂了介绍”，而是具备修改核心 runtime 的基本安全边界感。
