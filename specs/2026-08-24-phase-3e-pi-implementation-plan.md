# 阶段 3E：pi 主线实施计划

> **给智能体执行者：** 必须使用 `superpowers:executing-plans` 在当前任务中逐项执行；本仓库明确采用内联执行，不分派子代理。每个步骤完成后更新复选框，并在阶段末进行独立对抗复核。

**目标：** 发布一条以 Agent Harness 为主、覆盖 pi 的 AI、Agent、Coding Agent、Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 真实源码边界的九篇中文课程。

**架构：** 课程沿着 `ai -> agent -> coding-agent` 的组合链解释一次任务，再把 Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 作为可独立核对的横切层展开。`packages/agent/src/harness/**` 的已实现源码、`packages/agent/docs/harness.md` 的未来设计、Coding Agent 现行路径和外部 Session 分享项目必须分开，不能把设计目标、扩展示例或外部工具写成默认运行时事实。

**技术栈：** Markdown、SVG、JSON 兼容 YAML、Node.js 24 标准库、Sharp 渲染、Git submodule 锁定源码。

**规格：** `specs/2026-08-23-agent-harness-internals-redesign.md`

## 全局约束

- 全部正文与图中自然语言使用中文；pi、AI、Agent、Coding Agent、Provider、Protocol、Client、Server、Session、TUI、Telemetry、Eval、JSONL、CBOR、API 和代码标识符可保留。
- pi 锁定 `c1279a65b3ef6b0b19950ed1771d5933241c240f`，正文锚点、测试和 Claim 必须指向这个 Commit。
- 已实现源码、上游文档、未来 Harness 设计文档、示例扩展与外部项目分别标注证据类型；设计文档不能证明运行时已经具备目标能力。
- pi 默认继承宿主进程权限；不得把 Gondolin、Docker、OpenShell 或 sandbox 示例写成默认内建隔离。
- `packages/evals` 是 pi 自带评测基础设施，但 Eval 仍作为 Agent Harness 的横切验证链；单次 Eval 通过不等于训练 Reward、Checkpoint 选择或独立发布授权。
- 不运行 NVM；仓库门禁使用 Node 24。不调用真实 Provider，不使用密钥或付费模型；未执行的上游运行实验不写成成功。
- 九篇课程全部达到 `reviewed` 后才整批进入正式导航；OpenCode 与扩展样本不得提前开放。

---

## 文件结构

| 文件 | 单一责任 |
| --- | --- |
| `docs/harnesses/pi/README.md` | 包分层、系统架构、一次真实任务、证据边界和九篇导航。 |
| `docs/harnesses/pi/01-evidence-runtime-design-boundaries.md` | 现行源码、设计文档、示例与外部项目的证据边界。 |
| `docs/harnesses/pi/02-ai-provider-stream-normalization.md` | 多 Provider 模型、消息、流事件、能力与失败归一化。 |
| `docs/harnesses/pi/03-agent-loop-state-tools.md` | Agent 状态、消息队列、工具循环、终止和事件。 |
| `docs/harnesses/pi/04-coding-agent-prompt-extensions.md` | Coding Agent Prompt、资源发现、工具与 Extension 装配。 |
| `docs/harnesses/pi/05-session-context-compaction-storage.md` | Session 树、Context 投影、Compaction、JSONL/SQLite 后端与并发。 |
| `docs/harnesses/pi/06-protocol-server-client.md` | Framing、Codec、Schema、Server、Client、Session Handle 与远程表面。 |
| `docs/harnesses/pi/07-cli-tui-permissions-containerization.md` | CLI/TUI、差分渲染、宿主权限和外部隔离边界。 |
| `docs/harnesses/pi/08-telemetry-evals-data-contracts.md` | Telemetry 契约、Artifact、Scorer、Session 分享和独立 Eval。 |
| `assets/diagrams/pi/*.svg` | 系统架构、端到端任务及各篇复杂关系的中文图。 |
| `evidence/claims/pi.*.yml` | 公开结论、锁定证据、能力状态、限制与反例。 |
| `evidence/claims/pi/evidence-map.yml` | 九篇证据清单、上游测试和高风险误读。 |
| `evidence/reviews/2026-08-24-phase-3e-pi.yml` | 阶段承诺、证据、发现、修复和最终命令。 |

### Task 1：锁定 pi 模块与证据边界

**文件：**
- 创建：`evidence/claims/pi/evidence-map.yml`
- 修改：`scripts/tests/content-contract.test.mjs`

- [x] 写失败测试：pi 一级入口必须包含模块边界、默认权限、两张核心中文图、课程状态表和至少两条 Claim。
- [x] 登记九篇课程的源码、测试、上游文档、设计文档与外部项目边界。
- [x] 运行目标测试、来源、许可证、内容和敏感信息检查。
- [x] 提交：`test(pi): 锁定模块与证据边界`。

### Task 2：发布 pi 主线入口

**文件：**
- 创建：`docs/harnesses/pi/README.md`
- 创建：`assets/diagrams/pi/system-architecture.svg`
- 创建：`assets/diagrams/pi/end-to-end-task.svg`
- 创建：`evidence/claims/pi.architecture.layers-are-composed.yml`
- 创建：`evidence/claims/pi.task.coding-agent-composes-core.yml`
- 修改：`assets/diagrams/manifest.yml`

- [x] 用 `ai -> agent -> coding-agent` 和 Session/Protocol/TUI/Telemetry/Evals 横切层解释真实调用链。
- [x] 系统图和任务图明确默认宿主权限、外部隔离、数据落点与 Eval 出口。
- [x] 渲染两图，检查中文、箭头、截断、模块边界和窄屏可读性。
- [x] 运行内容、Claim、视觉、链接和聚合检查并提交：`docs(pi): 发布分层源码主线入口`。

### Task 3：运行时、设计文档与外部边界

- [x] 创建 `01-evidence-runtime-design-boundaries.md`、对应 SVG 和 Claim：设计文档不等于现行运行时、示例与外部项目不等于默认能力。
- [x] 分开已发布包源码、`packages/agent/docs/harness.md`、Extension 示例、容器化方案和外部 Session 分享。
- [x] 渲染复核，运行门禁并提交：`docs(pi): 发布运行时与设计证据边界课程`。

### Task 4：多 Provider 与流归一化

- [x] 创建 `02-ai-provider-stream-normalization.md`、对应 SVG 和 Claim，覆盖 Models、Provider 注册、消息转换、流事件、Tool Call、Usage、StopReason、Context Overflow 与 Abort。
- [ ] 明确模型目录或能力声明不证明当前凭据、区域和运行请求必然成功。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布多 Provider 流归一化课程`。

### Task 5：Agent Loop、状态与工具

- [x] 创建 `03-agent-loop-state-tools.md`、对应 SVG 和 Claim，覆盖 Agent 状态、steering/follow-up 队列、外层/内层循环、工具批次、事件和终止。
- [ ] 核对被 `length` 截断的工具参数、Abort、Error、`shouldStopAfterTurn` 与工具 `terminate`。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布 Agent Loop 与工具状态课程`。

### Task 6：Coding Agent、Prompt 与 Extension

- [x] 创建 `04-coding-agent-prompt-extensions.md`、对应 SVG 和 Claim，覆盖 SDK 入口、系统 Prompt、资源发现、内建工具、Skill、Prompt Template、Extension 事件与自定义 Provider。
- [ ] 明确扩展可改写工具和界面表面，但扩展示例存在不等于默认启用或安全隔离。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布 Coding Agent 与扩展课程`。

### Task 7：Session、Context、Compaction 与存储

- [x] 创建 `05-session-context-compaction-storage.md`、对应 SVG 和 Claim，覆盖 Session/Entry/Branch、Context 投影、Compaction、JSONL、SQLite、Writer Lease 与恢复。
- [ ] 分开持久历史、模型可见 Context、派生摘要和并发提交；不能把摘要当原始历史。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布会话上下文与存储课程`。

### Task 8：Protocol、Server 与 Client

- [x] 创建 `06-protocol-server-client.md`、对应 SVG 和 Claim，覆盖 Length Framing、CBOR/JSON Codec、Schema、Connection、Server、Client、Snapshot、Session Handle 与 Unix Transport。
- [ ] 区分协议可编码、服务可监听、客户端已连接、Session 可恢复与任务成功。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布协议服务与客户端课程`。

### Task 9：CLI、TUI、权限与容器化

- [ ] 创建 `07-cli-tui-permissions-containerization.md`、对应 SVG 和 Claim，覆盖 CLI 模式、交互 TUI、差分渲染、终端输入、宿主权限和 Gondolin/Docker/OpenShell。
- [ ] 明确 pi 没有默认内建权限系统；Extension 确认提示不等于强制安全边界。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布终端表面与隔离边界课程`。

### Task 10：Telemetry、Evals 与数据契约

- [ ] 创建 `08-telemetry-evals-data-contracts.md`、对应 SVG 和 Claim，覆盖 Vendor-neutral Telemetry、Memory/Noop Adapter、Schema、Vitest Eval Harness、Artifact、Summary、Session 分享与外部 Scorer。
- [ ] 建立 Dataset、固定 Trial、Target、Trace/Artifact、Scorer、统计、RewardAdapter、Checkpoint 与独立 holdout；Session 分享只作需授权的数据出口。
- [ ] 渲染复核，运行门禁并提交：`docs(pi): 发布遥测评测与数据契约课程`。

### Task 11：原子导航发布

**文件：**
- 修改：`scripts/check-navigation.mjs`
- 修改：`scripts/tests/navigation.test.mjs`
- 修改：`README.md`
- 修改：`docs/00-start-here.md`
- 修改：`docs/harnesses/pi/README.md`

- [ ] 先增加 pi 九篇缺失、降级和零链接绕过失败测试。
- [ ] 一次性把 pi 九篇改为已复核链接；根入口和总入口只新增第五条主线，OpenCode 与扩展样本保持提纲无链接。
- [ ] 运行导航、链接、内容、Claim、视觉和聚合检查。
- [ ] 提交：`docs(navigation): 开放 pi 一级主线`。

### Task 12：阶段 3E 全量对抗复核

**文件：**
- 创建：`evidence/reviews/2026-08-24-phase-3e-pi.yml`
- 创建：`evidence/reviews/phase-3e-pi-contact-sheet.png`
- 修改：`specs/2026-08-23-agent-harness-internals-program-plan.md`
- 修改：本计划复选框

- [ ] 从已提交基线运行 Node 24 聚合检查和 `--profile all` 来源验证。
- [ ] 逐篇审计真实输入输出、调用链、源码锚点、能力条件、失败语义和自检答案。
- [ ] 打开十张正式图，检查中文、截断、箭头、颜色依赖、包边界和证据绑定。
- [ ] 主动寻找：设计文档冒充实现、模型目录冒充运行可用、Extension 冒充默认能力、提示确认冒充权限隔离、摘要冒充原始历史、协议成功冒充任务成功、Telemetry 冒充 Scorer、Eval 通过冒充发布授权、Session 分享冒充默认上传。
- [ ] 修复全部高优先级发现，记录中低风险；创建阶段复核记录并勾选总路线 3E。
- [ ] 提交：`chore(review): 完成阶段 3E pi 主线复核`。

## 阶段完成证据

1. pi 入口与八篇课程均为 reviewed，每篇都区分现行源码、设计文档、示例、外部项目与未知项。
2. 十张中文图完整覆盖包分层、一次任务和关键复杂机制。
3. AI、Agent、Coding Agent、Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 均绑定锁定源码和上游测试。
4. 默认宿主权限、外部隔离、Session 分享、Telemetry、Scorer、Reward 与发布门禁没有被合并。
5. 根入口与总入口只开放 DSH、Codex、Gemini CLI、Claude、pi，OpenCode 与扩展样本仍无正式链接。
6. Node 24 聚合检查、全部来源验证和阶段对抗复核通过，无未解决高优先级发现。
