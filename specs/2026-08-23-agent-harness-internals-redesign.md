---
title: Agent Harness 内部原理：全仓重建设计
date: 2026-08-23
status: approved
---

# Agent Harness 内部原理：全仓重建设计

## 一、目标

把当前仓库覆盖式重建为一个中文、源码级、可复核的 Agent Harness 知识库。仓库解释不同 Agent Harness 如何把语言模型变成能够完成真实任务的 Agent，并解释这些 Harness 如何接入评测、反馈和质量闭环。

仓库对外名称为 **Agent Harness 内部原理**，仓库标识为 `agent-harness-internals`。

完成后的仓库必须同时满足：

- 六条一级主线均有独立、连续、达到发布质量的课程。
- 关键结论能够追溯到锁定源码、上游测试、官方文档或运行实验。
- 评测作为每条 Agent Harness 的横切能力出现，不建设并列的 Eval Harness 百科。
- README、正文、图表、图例和说明文字全部使用中文。
- 公开导航不出现一两句话的空壳文章。
- 整个 GitHub 仓库完成改名、元数据、内容、视觉、门禁和发布部署。

## 二、非目标

- 不与旧仓库版本做公开对比，也不维护旧目录兼容。
- 不制作 Harness 总分榜或笼统排行榜。
- 不把 Eval Harness 建成与 Agent Harness 并列的第二套课程。
- 不把测试通过扩大解释为生产就绪、发布授权或个人能力证明。
- 不使用泄露内容、未授权逆向材料或来源不明的 Prompt 转储。
- 不为凑覆盖率而创建空文件、短摘要或项目名称清单。
- 不维护英文 README。

Git 历史负责保存旧内容，新的公开树只服务新定位。

## 三、核心范围

### 3.1 六条一级主线

1. DeepSeek Harness
2. Codex
3. Gemini CLI
4. Claude Code / Claude Agent SDK
5. pi
6. OpenCode

六条主线地位相同，但不强制拥有相同的文章数量和证据形态。

- DSH、Codex、Gemini CLI、pi、OpenCode 以开放核心源码、上游测试和运行实验为主要证据。
- Claude 结合 Claude Code 官方机制文档、Claude Agent SDK Python 源码、Claude Agent SDK TypeScript 源码和运行实验。
- Claude Code 核心未公开的部分不得写成源码事实；无法核验时使用 `U`，基于行为推导时使用 `D`。

### 3.2 扩展样本

扩展样本只补充一级主线没有充分展示的机制：

| 项目 | 主要补充机制 |
| --- | --- |
| mini-swe-agent | 极简 Agent Loop、环境抽象、Benchmark 运行 |
| OpenHands | 远程 Agent 服务、容器沙箱、控制平面 |
| Cline | IDE、人机审批、SDK 与 Headless 多表面 |
| goose | Rust 核心、CLI、桌面端、服务端、MCP 与 ACP |
| Aider | Repo Map、编辑格式、Architect/Editor 双模型分工 |
| Qwen Code | Gemini CLI 架构分化和 Provider 适配 |

扩展样本只有在六条一级主线全部达到 `reviewed` 后才进入正式导航。研究过程可以提前锁定来源，但不能提前对外宣称完成。

### 3.3 评测参照

以下项目只作为 Agent Harness 的外部评测参照和适配对象：

- Inspect AI
- SWE-bench
- Terminal-Bench
- lm-evaluation-harness

仓库必须明确区分：

```text
能运行评测任务
≠ 能给任务评分
≠ 能聚合统计结果
≠ 能授权发布
```

## 四、信息架构

```text
README.md
docs/
  00-start-here.md
  foundations/
  harnesses/
    deepseek-harness/
    codex/
    gemini-cli/
    claude/
    pi/
    opencode/
  comparisons/
  roles/
  labs/
  appendix/
assets/
  brand/
  diagrams/
evidence/
  claims/
  experiments/
  external-results/
sources/
scripts/
specs/
```

### 4.1 入口职责

`README.md` 是唯一公开导航入口，回答：

- 仓库研究什么。
- 覆盖哪些 Harness。
- 每条主线当前达到什么状态。
- 不同读者从哪里开始。
- 结论如何验证。

`docs/00-start-here.md` 提供三条阅读路径：

- 从零理解 Agent Harness。
- 深入某个具体实现。
- 为选型、评测或安全审查做横向比较。

### 4.2 共同基础

`docs/foundations/` 只解释一次六条主线共享的概念：

1. Agent Harness 的职责与边界。
2. 一次真实 Agent Turn 的完整运行过程。
3. 模型输入、输出和工具结果。
4. 工具、执行环境、权限和沙箱。
5. Session、Context、Compaction 与 Memory。
6. Trace、Feedback 和评测接入。

### 4.3 独立主线

每条主线拥有独立 `README.md`，记录锁定版本、证据边界、完整任务链、课程状态和推荐顺序。每个主线入口至少包含一张中文系统架构图和一张端到端任务流程图。项目正文不得被横向矩阵取代。

### 4.4 横向比较

比较文章只能在相关主线正文达到 `reviewed` 后发布。比较矩阵是正文结论的摘要，不承担完整解释。

### 4.5 角色路径

- `roles/engineering.md`：扩展、集成、调试和维护。
- `roles/product.md`：用户可观察行为和产品边界。
- `roles/quality-and-evaluation.md`：可重复运行、Trace、Scorer 和证据口径。
- `roles/operations-and-security.md`：权限、隔离、成本、凭据和故障恢复。

### 4.6 实验与附录

`docs/labs/` 保存可复现实验说明，`evidence/experiments/` 保存实验元数据和结果。附录保存词表、来源索引、证据等级、漂移说明和限制。

## 五、六条主线的课程范围

### 5.1 DeepSeek Harness

覆盖：

- 全景与一次真实任务。
- Cordis 启动与依赖装配。
- Preset 与 Agent 组合。
- System Prompt 的真实拼装。
- KV Cache 与请求前缀稳定性。
- Agent Loop 与 LLM Adapter。
- 工具、Guard、审批和多平台沙箱。
- Session、事件流、查询和持久化。
- Context、Compaction 与 Spill。
- Plan、Goal、Todo、Subagent 与 Workflow。
- Skill、MCP、Extension 与 Code Runtime。
- Web、Host、ACP、SDK 和无人值守运行。
- Feedback、Benchmark 和评测接入。
- 自验证、设计取舍与限制。

现有 DSH 长文必须逐篇复核后吸收，不能直接搬运。

### 5.2 Codex

覆盖：

- 全景与一次 Turn。
- 配置、模型、Prompt 和 Context Fragment。
- Thread、Task、Turn 和内部状态。
- 模型请求、流式响应和工具调用。
- Tool Registry、并行执行和结果回传。
- Exec Policy、审批和权限升级。
- Linux、Windows、网络和进程沙箱。
- Rollout、History、Thread Store 和恢复。
- Context、Compaction 与 Memory。
- Skill、Hook、Plugin、MCP 和 Connector。
- Subagent、协作模式和编排。
- Code Mode。
- CLI、TUI、App Server、Cloud 和 SDK。
- Rollout Trace、Telemetry、Feedback 和评测接入。
- Rust 多 crate 架构的设计取舍。

### 5.3 Gemini CLI

覆盖：

- 全景和一次任务。
- 配置来源与优先级。
- Prompt、GEMINI.md 和上下文资源。
- Agent Loop、Scheduler 与 Routing。
- Tool Registry 和工具生命周期。
- Confirmation Bus、Policy 与 Safety。
- Sandbox 和平台边界。
- Session、历史和上下文压缩。
- Agent、Subagent 和编排。
- Hook、Skill、MCP 和扩展。
- CLI、IDE、Headless 和输出协议。
- Telemetry、错误分类和评测接入。
- 策略分层的设计取舍。

### 5.4 Claude

覆盖：

- Claude Harness 生态和证据边界。
- Claude Code 的公开 Agent Loop。
- System Prompt、CLAUDE.md 和配置加载。
- 工具系统、MCP 和延迟加载。
- 权限决策链与沙箱。
- Hook 与确定性控制。
- Session、Resume、Fork 与 Checkpoint。
- Context、Auto Compact 和 Memory。
- Subagent、Skill、Plugin 和多 Agent。
- Python SDK 的 Query、Client、Transport、消息解析和 MCP Bridge。
- Python Session Store 与外部持久化。
- TypeScript SDK 与控制协议。
- Headless、CI 和部署。
- Cost、Usage、Telemetry 和评测接入。
- 可核验结论与未知内部实现。

### 5.5 pi

覆盖：

- 全景和一次任务。
- 多 Provider LLM 归一化。
- Agent Core、状态和工具循环。
- Coding Agent 的 Prompt 和上下文。
- Tool、Extension 和自扩展能力。
- Session、Protocol、Server 和 Client。
- CLI、TUI 和差分渲染。
- 默认宿主权限与外部容器化边界。
- Telemetry、Session 分享和数据契约。
- `evals` 包与评测闭环。
- 小核心、强扩展和弱内建隔离的取舍。

### 5.6 OpenCode

覆盖：

- 全景和一次任务。
- 配置、Provider 和模型抽象。
- Agent 模式和 Prompt 装配。
- Session、Message 和事件模型。
- Agent Loop 和模型响应处理。
- Tool、Permission 和用户审批。
- Shell、文件操作和执行边界。
- Context、Compaction、Snapshot 和恢复。
- Subagent 和任务编排。
- Plugin、MCP 和 Code Mode。
- Server、Protocol、SDK 和多客户端。
- 企业、远程和多产品表面。
- Stats、事件和评测接入。
- Server-first、多 Provider 架构的取舍。

## 六、文章质量契约

### 6.1 基础概念文章

必须包含：读者目标、真实输入输出、完整运行链、术语边界、常见误解、至少两个实现对照、自检题和完整答案。

### 6.2 Harness 源码文章

必须包含：

1. 本文解决的问题。
2. 用户或模型真实看到的数据。
3. 从入口到结果的多步骤调用链。
4. 关键源码片段。
5. 每段源码的中文解释。
6. 关键数据结构。
7. 设计原因。
8. 默认是否启用。
9. 平台和配置限制。
10. 失败路径和异常语义。
11. 与其他 Harness 的有限对照。
12. 可复核方法。
13. 自检题和完整答案。

### 6.3 比较文章

比较项目必须已有独立深度分析，使用相同问题和边界，分开事实、推断和建议，并解释设计代价和失败模式。

### 6.4 实验文章

必须提供目的、锁定版本、环境、输入、命令、结果、失败判据、平台限制以及证据边界。未执行的内容只能标记为实验设计。

### 6.5 角色文章

每条建议必须引用已经完成的机制文章或实验，不得形成第二套未经验证的浅层结论。

## 七、统一比较维度

所有横向比较沿一次任务的生命周期组织：

1. 产品与运行边界。
2. 配置与模型输入。
3. Agent Loop 与状态机。
4. 工具与执行环境。
5. 权限、安全与恢复。
6. Session、Context 与 Memory。
7. 编排与扩展。
8. 协议与产品表面。
9. 可观测性与评测集成。
10. 部署与维护。

比较文章不设置总分。能使用相同模型和环境时尽量固定；无法固定时必须披露未控制变量。

## 八、证据模型

### 8.1 能力状态

- `default`：默认内置。
- `optional`：内置可选。
- `extension`：扩展提供。
- `external`：外部依赖。
- `absent`：明确不提供。
- `unknown`：尚未确认。
- `not-applicable`：不适用。

### 8.2 证据等级

- `A`：源码、上游测试和运行实验相互印证。
- `B`：源码和上游测试相互印证。
- `C`：源码或官方文档直接支持。
- `D`：明确标注的行为推断。
- `U`：无法核验。

能力状态和证据等级必须分开。证据不足不能写成能力缺失，代码存在也不能写成默认启用。

### 8.3 关键结论结构

`evidence/claims/` 保存会影响公开比较的重要结论。每条结论至少包含：

```yaml
id: codex.permissions.command-policy
harness: codex
dimension: permissions.command-policy
statement: 结论正文
capability: default
version: 固定提交或产品版本
surface: CLI
platform: Windows
mode: default
evidence_level: B
evidence:
  - type: source
    source: codex
    path: 具体文件
    commit: 固定提交
    lines: 具体行号
    excerpt: 可校验片段
last_verified: 2026-08-23
```

必须进入结论注册表的内容：

- 默认行为。
- 安全边界。
- 平台差异。
- 终止与失败语义。
- 成本和性能结论。
- 跨 Harness 比较结论。
- 评测与发布证据。
- README 中的公开承诺。

比较矩阵从结论注册表生成；解释性正文保持人工撰写。

## 九、来源管理

来源分为三个配置组：

### 9.1 核心来源

- deepseek-harness
- codex
- gemini-cli
- claude-agent-sdk-python
- claude-agent-sdk-typescript
- pi
- opencode

### 9.2 扩展来源

- mini-swe-agent
- OpenHands 所需的当前拆分组件
- cline
- goose
- aider
- qwen-code

### 9.3 评测来源

- inspect-ai
- swe-bench
- terminal-bench
- lm-evaluation-harness

默认 Bootstrap 只准备核心来源，并支持 `core`、`samples`、`eval` 和 `all` 配置。CI 按来源组运行验证矩阵。所有来源按完整 commit 锁定，采用 metadata-and-analysis-only 再分发策略。

## 十、发布状态

文章状态：

- `outline`：只有结构，不进入正式导航。
- `draft`：有正文但证据或复核未完成。
- `reviewed`：内容和证据已经人工复核。
- `verified`：相关运行实验也完成。
- `stale`：上游漂移后需要重新审核。

README 正式导航只展示 `reviewed` 和 `verified`。状态表可以显示未完成主线，但不能把未完成文件链接成正式课程。

## 十一、自动门禁

保留并重构现有来源、锚点、许可证、链接、敏感信息和测试门禁，新增或升级：

- 文章类型与必需章节检查。
- 深度检查：真实数据、调用链、源码、失败条件、验证和答案。
- 关键结论 Schema 检查。
- 能力状态和证据等级检查。
- 来源配置组检查。
- 比较发布前置条件检查。
- 正式导航状态检查。
- 中文自然语言检查。
- SVG 可见文字中文检查。
- 实验记录格式和结果存在性检查。
- 上游漂移报告。

门禁只能证明仓库规定的结构和证据一致性，不能证明生产就绪或发布授权。

## 十二、中文与视觉规范

- README、正文、图表、图例、替代文本和说明全部中文。
- 产品名、协议名、命令、路径和代码标识符保留原文。
- 英文引用后紧跟中文解释。
- 文件名使用 ASCII slug，页面标题和可见自然语言使用中文。
- 删除英文 README 和现有英文图。

新 Logo 使用抽象的 Harness 内部剖面、并行轨道或数据流形成简洁标记：

- 不使用机器人脸、吉祥物或厂商 Logo。
- 图标本身不依赖文字。
- 小尺寸仍可辨认。
- 中文标题作为独立字标。
- 所有架构图使用中文节点、方向和图例。

### 12.1 图示使用原则

图示用于解释文字难以清楚表达的关系，不作为装饰性填充。出现以下内容时应优先使用对应图形：

| 信息类型 | 首选图形 |
| --- | --- |
| 三个以上组件的边界、依赖和所有权 | 系统架构图 |
| 一次任务从输入到完成的时间顺序 | 流程图或时序图 |
| Session、Turn、Tool Call、审批等状态变化 | 状态图 |
| Prompt、Context、Tool Result 的变换与流向 | 数据流图 |
| 六个 Harness 在相同字段上的差异 | 对照表或对比图 |
| 选型条件产生三个以上分支 | 决策树 |

不为单一事实、一步操作或短列表强行配图。正文必须解释图中最重要的关系，不能只放图片不讲结论。

### 12.2 图示最低覆盖

- 仓库总入口：一张 Agent Harness 总体边界图和一张仓库阅读地图。
- 每条一级主线：至少一张系统架构图和一张端到端任务流程图。
- 每篇包含三步以上时序或三个以上状态的深读文章：至少一张对应流程图、时序图、状态图或数据流图。
- 每篇横向比较：至少一张由关键结论注册表支持的中文对比图或对照表。
- 每个实验：用图能明显改善理解时增加实验拓扑或结果图，但不把截图当作机制证据。

### 12.3 图示工程规范

- 正式图保存到 `assets/diagrams/<scope>/`，采用可审查的 SVG；需要生成源时同时保存 Mermaid 或其他文本源。
- SVG 可见文字、标题、图例和注释全部使用中文，代码标识符和协议名除外。
- 每张图具有中文替代文本、正文说明和来源或证据说明。
- 箭头必须表达明确方向；颜色不能是区分状态的唯一方式。
- 图在浅色背景、深色背景和窄屏 README 中都要保持可读。
- 渲染后执行视觉检查，确认没有文字截断、重叠、字体缺失、线条不可见或缩放失真。
- 图中结论必须与正文和关键结论注册表一致；上游漂移影响图示时标记为 `stale`。

### 12.4 品牌交付物

品牌阶段至少交付：

- `assets/brand/logo-mark.svg`：无文字的核心标记。
- `assets/brand/logo-lockup.svg`：标记与中文标题组合。
- `assets/brand/social-preview.svg`：GitHub 社交预览源文件。
- `assets/brand/social-preview.png`：经过渲染和视觉复核的上传版本。

Logo 设计先产生三个可比较的矢量方向，按小尺寸辨识度、独特性、与 Harness 内部结构的关联、中文标题组合效果和商标混淆风险进行对抗复核，最终只发布最佳方案。README 顶部使用正式组合标，不使用供应商 Logo 拼贴。

### 12.5 GitHub 对外信息

最终部署同时优化：

- 仓库名：`agent-harness-internals`。
- About 描述：中文、准确、不过度承诺完成度。
- Topics：围绕 Agent Harness、六条主线、源码分析、评测和中文内容设置。
- README：中文定位、视觉主标、状态表、阅读路径、证据方法、本地验证和免责声明。
- Social preview：上传最终品牌预览图，并验证公开仓库卡片显示。
- 默认分支、分支保护、License、Description、Topics 和公开可见性：发布后逐项复核。

## 十三、实施阶段

### 阶段 0：地基

- 写入本规格和实施计划。
- 替换旧双 Harness 规格和旧仓库规则。
- 建立新目录、文章状态、来源配置和证据 Schema。
- 升级门禁及其测试。

### 阶段 1：品牌和入口

- 改仓库标识、包名和 GitHub 元数据。
- 生成三个 Logo 矢量方向，完成对抗复核并发布最佳方案。
- 交付核心标记、中文组合标和 GitHub 社交预览图。
- 重写 README 和总入口。
- 删除英文 README、旧 Logo 和旧英文图。

### 阶段 2：共同基础

- 完成六篇基础课程。
- 通过内容质量、证据和中文门禁。

### 阶段 3：六条一级主线

- 3A：DeepSeek Harness。
- 3B：Codex。
- 3C：Gemini CLI。
- 3D：Claude。
- 3E：pi。
- 3F：OpenCode。

每条主线独立验收，不能用其他主线的完成状态代替。

### 阶段 4：比较、角色和评测

- 完成跨 Harness 比较文章。
- 完成四条角色路径。
- 完成评测集成与小型控制实验。

### 阶段 5：扩展样本

- 完成扩展样本的独特机制专题。
- 通过来源、证据和发布状态检查。

### 阶段 6：最终审计与部署

- 删除旧 A/E 空壳、旧导航、旧规格和不再使用的资产。
- 全量复核结论、导航、图像和来源。
- 使用 Node 24 运行完整检查，不调用 NVM。
- 合并隔离分支。
- 在最终提交完成后受控重写提交消息，移除 Codex/Claude 的 `Co-Authored-By` 尾注和 Claude Session 元数据；保留人类作者、文件内容和提交顺序，并在强推后恢复保护规则。
- 推送 GitHub。
- 完成仓库改名、Description、Topics、默认分支与保护规则核验。
- 上传并验证 GitHub Social preview。
- 验证公开仓库页面、About、Topics、README、Contributors、相对链接和资产渲染；贡献者页不得再把 Codex 或 Claude 列为协作者。

## 十四、逐阶段对抗复核

每个阶段完成后必须先做一次反向审查：

1. 列出该阶段承诺的每个交付物。
2. 为每个交付物指出当前证据。
3. 主动寻找空壳内容、证据滑坡、默认条件遗漏、平台遗漏和导航夸大。
4. 运行该阶段相关自动检查。
5. 修复发现的问题。
6. 只有没有未解决的阻断问题时才进入下一阶段。

反向审查结果记录在 `evidence/reviews/`，并包含日期、审查范围、发现和处理结果。

## 十五、实施约束

- 所有改造在隔离分支完成。
- 不调用 NVM；验证使用当前可用 Node 24。
- 公开内容不写机器绝对路径。
- 文件编辑使用可审查的补丁。
- 不覆盖无关用户改动。
- 不在正文中使用未执行实验的成功表述。
- 不把第三方 Benchmark Pass 解释为个人能力或发布授权。
- 不让训练 Reward、Checkpoint 选择和独立发布评测共用同一证据口径。

## 十六、最终验收

只有以下条件全部成立，仓库才可以宣布完成：

- 六条一级主线全部达到 `reviewed`。
- 关键运行实验达到 `verified`。
- 扩展样本的公开承诺与实际状态一致。
- 比较文章拥有各方独立证据。
- 所有正式图像可见文字均为中文。
- 六条一级主线均具备系统架构图和端到端流程图，复杂机制的图示覆盖符合本规格。
- Logo、README 头图和 Social preview 均经过渲染与视觉复核。
- 所有来源、锚点、链接、许可证和敏感信息检查通过。
- README 没有超出实际完成度的承诺。
- 逐项人工审计没有关键矛盾或缺失。
- 完整检查在 Node 24 下通过。
- GitHub 仓库完成改名、About、Topics、Social preview、元数据更新、推送和公开页面核验。
- GitHub 默认分支历史已移除 Codex/Claude 协作者尾注，Contributors 页面复核无 Codex 或 Claude 条目。

最终完成声明必须附带验证命令、结果、Git 提交和 GitHub 公开状态，不能仅凭计划、文件数量或局部测试作出。
