# 权限、Sandbox、Session 与恢复不能压成一个开关

[上一篇：Agent Loop、工具与执行](02-loop-tools-execution.md) · [返回课程总目录](../README.md) · [下一篇：编排、协议与产品表面](04-orchestration-protocol-surfaces.md)

当你问「这个 Agent 有权限吗」，至少要分开问五件事：模型看不看得到这个工具，策略放不放行，用户批不批准，执行环境做不做得到，以及中断后系统能不能安全接着做。这篇把六套 Harness 摆在同一条动作链上，看清界面显示 Allow 时，为什么不能证明操作系统已把动作隔离起来，更不能承诺随时撤销副作用。

![权限、执行与恢复的分层](../assets/diagrams/comparisons/03-permissions-state-recovery.svg)

## 五层边界

```text
模型可见性：本轮是否提供这个 Tool Schema
  ↓
参数与策略：名称、参数、路径或命令是否符合规则
  ↓
用户决定：是否需要一次性或持续批准
  ↓
执行能力：宿主、容器、Sandbox 或远程环境实际允许什么
  ↓
恢复语义：中断后能否确认副作用并安全继续
```

前四层一起决定动作能不能发生，第五层要处理的是另一件事：动作做到一半，副作用还不知道有没有发生，系统该怎样诚实地收拾现场。少任何一层，出错的方式都不一样。

## 六条课程各自暴露了什么

| 课程 | 应用层判断 | 执行或隔离边界 | 状态与恢复入口 | 深入阅读 |
| --- | --- | --- | --- | --- |
| DeepSeek Harness | 工具、安全策略与 Code Mode 配置 | 普通工具与代码执行路径需要分别说明真实宿主 | Session 与 Compaction | [工具、权限与 Code Mode](../harnesses/deepseek-harness/04-tools-security.md) |
| Codex | Exec Policy、审批和具体工具策略 | OS Sandbox/执行环境与审批分开 | Rollout、Thread Store、压缩与恢复 | [执行策略、审批与 Sandbox](../harnesses/codex/04-exec-policy-sandbox.md) |
| Gemini CLI | Policy、Confirmation 与 Safety | Sandbox 是独立执行边界 | Session、历史与压缩 | [Confirmation、Policy、Safety 与 Sandbox](../harnesses/gemini-cli/04-confirmation-policy-safety-sandbox.md) |
| Claude | SDK Options、`can_use_tool` 与 Hooks 的公开契约 | 实际 CLI/产品执行边界不能由公开 SDK 全部证明 | Session/Resume/Store 的公开接口 | [动态权限决策](../harnesses/claude/05-permission-decisions.md) |
| pi | 工具 Hook、项目 Trust 与交互表面 | 默认继承宿主权限；Sandbox Extension 可能回退本地 | Session Tree、JSONL 与 Resume | [CLI、TUI、权限与外部隔离](../harnesses/pi/06-surfaces-permissions-isolation.md) |
| OpenCode | Tool Registry、Permission Rules 与 Question | Permission 是应用规则，不自动构成 OS Sandbox | Storage、Compaction、Patch/Revert | [Tools、Permission、Question 与 Patch](../harnesses/opencode/03-tools-permission-patch.md) |

看到「项目提供 Sandbox 选项」时，先别认定所有工具、Extension、Plugin 和外部进程都会经过它。你得顺着每个具体工具的执行器往下追，再查它失败时会不会回退，才能下这个结论。先顺着路径查到底。

## 运费任务里的三个动作风险不同

| 动作 | 常见策略 | 仍需注意的环境事实 |
| --- | --- | --- |
| 读取 `shipping.ts` | 工作区内可自动允许 | 符号链接、外部目录和敏感文件 |
| 编辑比较符 | 展示 Diff 或请求批准 | 实际写入范围、并发修改、编码与回退 |
| 运行测试 | 按命令和工作目录判断 | 子进程、网络、环境变量、后台任务和超时 |

系统不必对每个动作都弹出同样的确认框，因为它可以按动作会碰哪些资源、影响多大范围、能不能撤销来分级。但动作就算已经获批，也应放进一个只拥有必要能力的环境里运行。批准不等于放开限制。

## Allow、Ask、Deny 只是产品策略

应用层的 Permission 通常先读取工具名和已经规范化的 Pattern，然后回答 Allow、Ask 或 Deny。OpenCode 会按顺序检查规则，以最后命中的一条为准，Gemini CLI 让 Policy 和 Confirmation 跟着工具从提出调用走到结算，Codex 则让 Exec Policy、审批和 Sandbox 各管一层。Claude SDK 虽然公开了 `can_use_tool` 回调，我们仍然不能用它证明闭源产品内部的所有决策。

用户选择 Always 时，通常只是让当前应用规则多放行一些动作，它不会跟着改写操作系统 ACL。反过来也一样：OS 能执行某个动作，产品不一定就该放行。宿主用户可能有权访问整个磁盘，Harness 却仍然要把 Agent 限制在当前工作区。

## Sandbox 约束能力，不解释意图

Sandbox 可以限制路径、进程、网络和系统调用，却不懂「修改测试来让测试通过」违反了任务。Policy 要读懂任务，并在动作发生前拦住这类行为。独立 Eval 只能在运行后判断任务有没有违规，Sandbox 则在动作获准后继续守住已经配好的资源边界。三层不能混用。

检查真实隔离至少要问：

1. 哪些工具被重定向到隔离环境；
2. 工作区以只读还是读写方式挂载；
3. 网络默认允许、拒绝还是经网关；
4. 凭据是否进入环境；
5. 初始化失败时失败关闭还是回退宿主；
6. Plugin/Extension 是否能直接使用宿主 API 绕过工具执行器。

pi 的示例 Sandbox Extension 在隔离失败后可以回退到本地，所以只看到「代码库里有 Sandbox」，还不能证明所有动作默认都在隔离环境里运行。

## Session 保存历史，不自动保存环境

Session 通常能把消息、工具结果、模型选择、分支和摘要重新读回来，但它无法让已经退出的进程回到原状，也无法复原远端事务或抹掉工作区后来发生的变化。所以 Resume 之前，你得重新查看环境：

```text
加载 Session
→ 找到最后已结算事件
→ 检查未完成 Tool Call
→ 读取文件、Diff、进程或远端状态
→ 判断副作用已发生、未发生或未知
→ 构造下一轮 Context
```

重放消息和重做副作用是两件事。如果编辑工具已经把内容写进文件，却在记下「完成」之前崩溃，Session 只能说它的状态未知。恢复时应该先读文件，确认 Patch 到底有没有应用，不能直接再做一遍。

## Compaction 会让恢复变得更难

摘要可能写着「代码已经修复」，却漏了「测试尚未运行」，所以必须让人能从模型当前看到的 Context，一路追回完整 Session 里的记录和环境当时的状态。Codex Rollout、Gemini CLI Session、DeepSeek Harness Session、pi Entry Tree 和 OpenCode Message/Part 虽然投影历史的方式不同，却都得防止人们把摘要当成精确的执行账本。

恢复时还会用到 Tool Call ID、工具状态、目标路径、命令、退出码、工作区版本和未完成事项，这些内容应该尽量存成结构化数据。自然语言摘要能帮模型继续往下做，却不能证明副作用真的发生过。判定时不能靠它。

## Revert 不是通用事务

文件 Snapshot 或 Git Patch 可以逆转工作区修改，却通常不能撤销：

- 已发送的网络请求；
- 数据库写入；
- 发布到外部系统的包或消息；
- 工作区外删除；
- 启动后仍在运行的后台进程。

OpenCode 会把 Patch/Revert 和 Session 后缀放在一起处理，但它仍然没有越过上面这些边界。其他 Harness 就算依赖 Git，也得说清哪些状态根本没进版本控制。对高风险工具，应当优先使用幂等键、事务或预演，别等出事后才把希望都寄托给 Revert。

## 练习：设计一次崩溃恢复

场景：Harness 已经请求把 `>` 改成 `>=`，但进程随后崩溃，而 Session 里只有 Tool Call 和「开始执行」，没有最终结果。请为两条课程分别写出恢复步骤，并指出应该在哪一层确认用户批准仍然有效。

<details>
<summary>查看核对标准</summary>

合格答案必须先检查文件或 Diff，在看清现场之前不能直接重做编辑。你还要分清应用批准了什么，环境里实际发生了什么，Session 又记下了什么。一次性批准通常不能自动延伸到新 Tool Call，除非项目契约明确允许系统安全地恢复同一次调用。

</details>

[下一篇：编排、Skills、Plugins、MCP 与产品表面如何分类](04-orchestration-protocol-surfaces.md)
