<p align="center">
  <img src="assets/brand/logo-lockup.svg" width="760" alt="Agent Harness 内部原理中文组合标">
</p>

<h1 align="center">Agent Harness 内部原理</h1>

<p align="center">从公开源码、上游测试与可复现实验，理解模型如何被变成能够完成真实任务的 Agent</p>

这个仓库是一套中文、源码级、可核对的 Agent Harness 知识库。它关心机制，也关心边界。这里不按厂商宣传词罗列功能，而是沿着一次真实任务的生命周期，解释上下文怎样装配、模型怎样请求、工具怎样执行、权限怎样约束、会话怎样保存、失败怎样恢复，以及运行结果怎样进入评测与反馈闭环。

**Agent Harness 是唯一主线；Eval 是横切验证能力。** 仓库不会再建设一套与 Agent Harness 并列的 Eval Harness 百科。Inspect AI、SWE-bench、Terminal-Bench 和 LM Evaluation Harness 只在需要回答「任务怎样定义、轨迹怎样收集、结果怎样评分、失败能否重试」时作为外部参照出现。缺少证据，就保留未知。

> 当前状态：仓库正在覆盖式重建。治理、证据门禁和正式品牌已经完成阶段复核；共同基础 6/6 已达到 `reviewed` 并开放正式导航，六条一级主线仍处于 `outline`。未完成内容不会以链接冒充成品。

## 这里研究的不是「模型排行榜」

语言模型只负责根据输入生成下一段输出。把输出变成可观察、可控制、可恢复的行动，需要模型之外的一整套运行系统：

```text
用户目标
  → 上下文与策略装配
  → 模型请求
  → 工具选择与参数校验
  → 权限、沙箱与执行
  → 结果回送与会话持久化
  → 终止、恢复或继续循环
  → Trace、Feedback 与独立评测
```

这个外层系统就是本仓库所说的 Agent Harness。它会直接改变模型看见什么、能做什么、何时停止、失败后如何继续，也会改变一次评测到底测到了模型、Harness 还是环境。因此，只拿一个模型名和一个分数无法解释真实任务表现。

分数不是答案。

仓库坚持三个分离：

1. 训练奖励只回答「训练时优化了什么」。
2. Checkpoint 选择只回答「候选模型怎样被筛选」。
3. 独立发布评测才回答「在预先冻结的任务和统计口径下是否达到发布门槛」。

同样，Trial 是统计单位；Attempt 只用于恢复基础设施错误，不能把产品失败不断重试成通过。产品失败仍然是失败。

## 六条一级主线

每条主线都会形成独立、连续的课程，而不是被一张横向矩阵压成几行摘要。每条课程至少覆盖：入口与配置、上下文、Agent Loop、工具与权限、会话与恢复、扩展协议，以及 Trace、Feedback 和评测接入。

| 主线 | 主要证据面 | 将回答的核心问题 | 当前状态 |
| --- | --- | --- | --- |
| DSH | DeepSeek Harness 锁定源码与上游测试 | 多包 TypeScript Harness 怎样组织模型、工具、会话、Code Mode 与评测能力 | `outline` |
| Codex | Rust 核心源码、协议、测试与官方文档 | CLI、工具、沙箱、审批、会话、压缩和多表面怎样连接 | `outline` |
| Gemini CLI | Core/CLI 源码、Policy、Safety、Confirmation 与测试 | 工具调度、策略确认、会话和扩展怎样形成完整执行链 | `outline` |
| Claude | 官方公开文档、Python SDK、TypeScript SDK 与示例 | Claude Code 的公开契约与 Agent SDK 的可见实现边界分别在哪里 | `outline` |
| pi | AI、Agent、Coding Agent、Protocol、Session、Telemetry 与 Evals 源码 | 极简核心怎样向编码 Agent 和协议表面逐层扩展 | `outline` |
| OpenCode | Provider、Session、Permission、Server、Protocol 与多客户端源码 | 服务化会话、权限决策和多前端怎样共享同一 Harness 核心 | `outline` |

`Claude` 主线需要特别说明证据边界：Claude Code 本体不是公开源码，仓库不会从 SDK 反推闭源内部实现。Python 与 TypeScript SDK 分别锁定版本和许可证；确定性实现结论只落在公开源码真正覆盖的范围内，其他内容只能引用官方文档或标成推断与未知。

边界必须写清。

## Eval 在哪里

Eval 不与六条主线争夺主导航，而是在每条主线中重复回答同一组质量问题：

- 任务输入、初始仓库、容器和网络条件由谁冻结。
- 一次 Trial 允许哪些 Attempt，哪些失败属于基础设施，哪些属于产品结果。
- Trace、补丁、日志、工具结果和资源消耗怎样成为可核对产物。
- Scorer 判断最终状态还是中间轨迹，评分失败与执行失败怎样区分。
- 训练反馈、候选选择和独立发布门槛是否使用了相互隔离的数据。

| 外部参照 | 在本仓库中的角色 | 不会被扩大解释成什么 |
| --- | --- | --- |
| Inspect AI | 任务、Sandbox、Agent、Scorer 和运行记录的设计参照 | 通用生产发布授权 |
| SWE-bench | 真实仓库修复任务、补丁与测试判定参照 | 单独证明某个 Harness 更强 |
| Terminal-Bench | 终端环境、任务容器和判分接口参照 | 所有交互式 Agent 的统一标准 |
| LM Evaluation Harness | 模型评测任务与请求抽象参照 | Agent Harness 的替代实现 |

失败不能混淆。

## 阅读路径

正式课程导航只会出现 `reviewed` 和 `verified` 页面。六篇共同基础已经整批完成复核并开放；六条项目主线会继续显示状态，但达到发布门槛前不提供课程链接。

<!-- course-navigation:start -->
[从总入口开始：先建立概念、状态与证据口径](docs/00-start-here.md)

1. [Agent Harness 的职责与边界](docs/foundations/01-boundaries.md)
2. [一次真实 Agent Turn](docs/foundations/02-agent-turn.md)
3. [模型输入、输出与工具结果](docs/foundations/03-model-tool-io.md)
4. [工具、权限与 Sandbox](docs/foundations/04-tools-permissions-sandbox.md)
5. [Session、Context、Compaction 与 Memory](docs/foundations/05-session-context-memory.md)
6. [Trace、Feedback 与评测接入](docs/foundations/06-trace-feedback-eval.md)
<!-- course-navigation:end -->

| 你的目标 | 建议路径 | 需要的背景 |
| --- | --- | --- |
| 第一次理解 Agent Harness | 一次模型调用 → Agent Loop → 工具与权限 → 会话与恢复 → Eval 接入 | 无需先读源码 |
| 实现自己的 Harness | 共同基础 → 选择一条主线完整跟读 → 控制实验 → 接入独立评测 | 熟悉一种编程语言 |
| 做安全与平台治理 | 工具契约 → 权限决策 → Sandbox → Hook/Policy → 失败语义 | 了解进程和文件权限 |
| 做产品和交互设计 | 会话生命周期 → 审批体验 → 压缩与恢复 → 多表面协议 | 了解 Agent 产品流程 |
| 做评测与质量工程 | Trial/Attempt → Trace/Artifact → Scorer → 反馈适配 → 发布门槛 | 基础统计与测试经验 |
| 做源码研究或技术选型 | 六条独立主线 → 共同维度比较 → 适用边界与未知项 | 能阅读对应语言源码 |

文章状态具有固定含义：

- `outline`：只有证据清单和提纲，不能进入正式导航。
- `draft`：已有可读正文，但深度、证据或复核尚未完成。
- `reviewed`：正文、来源、图示和边界已经完成对抗复核，可以进入正式导航。
- `verified`：在 `reviewed` 基础上，相关运行实验也已复现。
- `stale`：上游版本漂移或证据失效，需要退出正式导航并重新审核。

## 结论怎样做到可核对

### 锁定来源

仓库不按「最新分支大概如此」写结论。每个上游来源都具有稳定 ID、仓库地址、锁定 Commit、许可证和来源分组。默认本地验证只要求六条主线所需的 `core` 来源；扩展样本使用 `samples`，外部评测参照使用 `eval`，全量复核使用 `all`。

当前来源清单包含 12 个定义：DSH、Codex、Gemini CLI、Claude Python SDK、Claude TypeScript SDK、pi、OpenCode、mini-swe-agent，以及四个外部评测参照。机器可读配置见 [`sources/sources.yml`](sources/sources.yml) 和 [`sources/sources.lock.yml`](sources/sources.lock.yml)。

### 证据等级

关键公开结论进入独立注册表，并按证据强度分级：

只有当读者能够从公开结论一路回到锁定版本中的具体文件与行号，确认对应测试确实约束了同一行为，再根据实验记录复现输入、环境、命令、产物与失败条件，这项结论才具有超越文字摘要的核对价值；任何一环缺失，都必须降低证据等级或明确保留未知。

| 等级 | 最低证据 | 可以怎样表述 |
| --- | --- | --- |
| A | 锁定源码、对应上游测试和可复现实验同时成立 | 可以描述已在锁定环境复现的确定行为 |
| B | 锁定源码与对应上游测试同时成立 | 可以描述源码和测试共同约束的行为 |
| C | 锁定源码或官方公开文档直接支持 | 只能描述证据直接覆盖的事实 |
| D | 从多个事实推导，但不存在直接实现证据 | 必须明确写「这是推断」并给出推导链 |
| U | 公开证据不足、相互冲突或不适用 | 必须保留未知，不能用猜测补齐矩阵 |

### 能力状态

比较表不会用模糊的「支持/不支持」掩盖条件。每个能力状态只能取以下值：

| 状态 | 含义 |
| --- | --- |
| `default` | 默认路径直接具备 |
| `optional` | 官方实现存在，但需要配置启用 |
| `extension` | 通过插件、Hook 或扩展协议提供 |
| `external` | 需要 Harness 之外的系统提供 |
| `absent` | 锁定版本中有充分证据表明不存在 |
| `unknown` | 公开证据不足，不能判断 |
| `not-applicable` | 该能力不适用于当前对象或比较维度 |

横向比较必须先完成各方独立证据，再汇总为矩阵；仓库不会给六个项目算一个脱离场景的总分。

未知就是未知。

## 本地验证

完整检查使用 Node 24 运行，不需要也不应调用 NVM。项目自动化只使用 Node.js 标准库；上游 Checkout 由 Git submodule 管理，不会被打包进正文。

```bash
git clone https://github.com/plwslpld-arch/agent-harness-internals.git
cd agent-harness-internals
npm run bootstrap
npm run check
```

`npm run bootstrap` 默认准备 `core` 来源；需要复核全部来源时显式传入 `--profile all`。`npm run check` 会依次检查来源锁、文章元数据、关键结论、正式导航、内容深度、中文视觉、阶段复核、源码锚点、许可证、链接、敏感信息和单元测试。

复现优先于口号。

门禁只能证明「仓库自身声明的结构和证据目前一致」，不证明生产就绪，也不证明维护者拥有某种个人能力，更不构成任何上游项目的发布授权。

## 边界、许可与贡献

- 本仓库不是任何上游项目的官方仓库、镜像或贡献入口。
- 不使用泄露 Prompt、来源不明的转储、未授权逆向材料或私有会话内容。
- 公开实验会说明日期、环境、样本、失败和是否由本仓库复跑；第三方结果不会冒充本地复现。
- 原创代码按 [MIT](LICENSE-CODE) 授权，原创文档按 [CC BY 4.0](LICENSE-DOCS) 授权；第三方许可证边界见 [THIRD_PARTY.md](THIRD_PARTY.md) 和 [NOTICE.md](NOTICE.md)。
- 贡献前请阅读 [贡献指南](CONTRIBUTING.md)；维护与证据规则见 [仓库治理](AGENTS.md)。

仓库会逐阶段发布共同基础、六条主线、横向比较、角色路径、控制实验和扩展样本。每个阶段都必须先完成反向审查，再进入下一阶段；文件数量、测试数量或第三方评分都不能单独作为「已经完成」的证据。
