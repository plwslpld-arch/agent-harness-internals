# Agent Harness Internals 仓库规则

本仓库是中文、可核对的 Agent Harness 源码知识库。**Agent Harness 是唯一主线**；评测只作为任务定义、环境、Trace、Scorer、统计与独立发布门禁等横切能力进入各条主线，不建设并列的 Eval Harness 百科。

六条一级主线是 DSH、Codex、Gemini CLI、Claude、pi 和 OpenCode。Claude 主线必须区分 Claude Code 的闭源实现、官方文档，以及 Claude Agent SDK for Python / TypeScript 的公开契约面，不能借 SDK 的确定性外推闭源内部实现。

仓库按新项目覆盖式建设，不为旧目录、旧文章编号或旧定位保留兼容入口，也不在公开正文中比较新旧仓库版本。

## 公开内容与语言

- README、正文、图中可见文字、图例、替代文本、GitHub About 和 Social Preview 均使用中文。
- 产品名、协议名、API、函数、类型、字段、枚举和代码标识符保留原文，例如 Codex、MCP、Session、JSONL。
- 英文完整句必须紧跟中文解释；上游短摘录可以保留原文，但正文必须说明它支持什么、不能支持什么。
- 不创建平行的英文 README。文件名使用稳定的 ASCII slug，文章标题与说明使用中文。
- 用户可见文字不得出现本机绝对路径；命令从仓库根目录写相对路径。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `README.md` | 唯一公开入口、真实进度、正式导航与证据边界 |
| `docs/00-start-here.md` | 全仓阅读入口和课程地图 |
| `docs/foundations/` | Agent Harness 的共同基础 |
| `docs/harnesses/` | 六条一级主线的独立连续课程 |
| `docs/comparisons/` | 同问题、同口径、无总分的横向比较 |
| `docs/roles/` | 产品、工程、安全、评测与研究角色路径 |
| `docs/labs/` | 可复现实验说明 |
| `docs/appendix/` | 词表、来源、证据等级、漂移与限制 |
| `assets/brand/` | Logo、中文组合标和 Social Preview |
| `assets/diagrams/` | 中文机制图、Manifest 与图示规范 |
| `evidence/claims/` | 影响公开判断的关键结论注册表 |
| `evidence/experiments/` | 实验环境、命令、结果和产物索引 |
| `evidence/reviews/` | 逐阶段对抗复核记录 |
| `sources/` | 上游来源清单、Lock 与本地 Checkout |
| `scripts/` | 零运行时依赖的校验和维护脚本 |
| `specs/` | 已批准总规格、总路线和当前阶段计划 |

## 来源配置

来源分为三组：

- `core`：DSH、Codex、Gemini CLI、Claude 双 SDK、pi、OpenCode。
- `samples`：用于补充独特机制的扩展样本。
- `eval`：Inspect AI、SWE-bench、Terminal-Bench、lm-evaluation-harness 等评测参考。

默认 Bootstrap 与来源验证只要求 `core`；需要复核扩展或评测正文时显式选择 `samples`、`eval` 或 `all`。所有来源必须绑定完整 Commit，Manifest、Lock、gitlink、许可证和 Checkout 必须一致。上游源码只做本地核对，不 vendor 到公开正文。

## 文章元数据与状态

新目录文章必须包含 `title`、`article_type`、`status`、`last_verified` 和 `sources`；Harness 文章还必须声明 `harness`。数组和对象写为单行 JSON 兼容 YAML，便于零依赖解析器读取。

状态只有五种：

- `outline`：只有结构，允许空来源，不进入正式导航。
- `draft`：已有正文，但证据、深度或复核未完成。
- `reviewed`：内容和证据完成复核，可以进入正式导航。
- `verified`：在 reviewed 基础上完成相关运行实验。
- `stale`：上游漂移或边界变化后等待重新审核。

README 的正式导航必须放在 `course-navigation` 标记区间内，并且只能链接 `reviewed` 或 `verified`。进度表可以显示其他状态，但不能把草稿伪装成正式课程。

## 内容质量

行号是证据定位，不是正文。文章必须先给读者真实可见的输入、输出、请求、事件或行为，再解释调用链、实现选择、失败条件和验证方法。

Harness 文章至少包含：

1. 读者会得到什么。
2. 真实输入与输出。
3. 至少三步的调用链。
4. 可核对的源码证据。
5. 失败与限制。
6. 验证方法。
7. 三至四组有完整答案的自检。

基础、比较、角色、实验和附录文章遵循 `check:content` 中各自的结构与深度下限。长代码块、表格和标题不能冒充解释性正文。机器门禁只能拦截明显空壳，不能证明论证正确；`reviewed` 仍需要人工逐段复核。

## 源码锚点与推断

- 源码引用写成 `来源ID!路径:起止行`；同一来源的后续简写只在没有歧义时使用。
- 重要引用在行号后附短摘录，便于门禁确认区间与原文一致。
- 不把伪代码写成上游源码；重建示例必须标明“重建”或“示意”。
- 能力存在、默认启用、平台可用和产品公开承诺是不同结论，分别核对。
- 推断必须明确写出依据、推理步骤和不成立条件；证据不足时使用 `unknown`，不能写成 `absent`。
- 上游变化后只把文章标记为 `stale`，机器不得自动改写语义结论。

Frontmatter、代码块、行内代码、源码路径、行号、Commit、表格数字和上游短摘录属于受保护内容。改写文风时不得改变这些字段，完成后必须运行锚点与来源检查。

## 关键结论注册表

默认行为、安全边界、平台差异、终止和失败语义、成本与性能、跨 Harness 比较、评测与发布证据，以及 README 的公开承诺，必须进入 `evidence/claims/` 的关键结论注册表。

能力状态为 `default`、`optional`、`extension`、`external`、`absent`、`unknown`、`not-applicable`。证据等级为 A、B、C、D、U。能力状态与证据等级不能混用：源码存在不等于默认能力，无法核验也不等于功能缺失。D 级结论必须写推断说明，A 级结论必须同时有源码、上游测试和实验记录。

## 中文图示

每条一级主线至少交付一张中文系统架构图和一张中文端到端任务流程图。复杂文章按需要使用时序图、状态图、数据流图或决策树；两句话能讲清的关系不画装饰图。

正式 SVG 只放在 `assets/brand/` 或 `assets/diagrams/`，并登记到图示 Manifest。每张 SVG 必须有中文 `<title>`、中文 `<desc>` 和中文 `alt`，图中说明句使用中文，专名与代码标识符可以保留。图示必须实际渲染检查窄屏、裁切、对比度、字体回退、箭头方向和 GitHub 预览。图中直接表达的重要结论要关联 Claim ID。

## 实验与评测边界

- 没有执行过的实验不得写成成功结果；实验记录必须包含环境、输入、命令、退出码、原始结果和限制。
- Trial 是统计单位，Attempt 是恢复过程；不能靠重试把产品失败改成通过。
- 训练 Reward、Checkpoint 选择和独立发布评测必须分开记录。
- Eval 集成说明任务与环境如何固定、Trace 如何采集、Scorer 如何判定、统计如何汇总，以及哪些失败不能重试消除。
- 仓库门禁、第三方 Benchmark 或局部实验不证明生产就绪、发布授权或个人能力。

## 逐阶段对抗复核

每个阶段完成后必须写入 `evidence/reviews/`：列出阶段承诺、逐项证据、实际命令与退出码、反向检查发现、解决动作和最终结果。`pass` 不能存在未解决的高优先级发现，也不能带非零最终命令。没有对应复核记录的阶段不得宣布完成。

对抗复核至少回答：是否遗漏用户明确要求；是否把草稿、结构门禁或文件数量当成完成；是否越过闭源、平台、模式或版本边界；是否有绝对路径、英文图中文字、失效链接、未登记图示或只在本机成立的命令；是否把来源存在误写成行为确定。

## 验证环境与命令

本仓库使用 **Node 24** 执行完整验证，**不调用 NVM**。需要运行脚本时使用已配置的 Node 24 环境；不得反复探测或切换 NVM，也不得触发其弹窗。

核心命令：

| 命令 | 作用 |
| --- | --- |
| `npm run sources:verify` | 来源、Lock、gitlink 和 Checkout |
| `npm run check:analysis` | 文章类型、状态、来源与路径 |
| `npm run check:claims` | 关键结论、证据等级与摘录 |
| `npm run check:navigation` | 正式导航发布状态 |
| `npm run check:content` | 各类文章结构与解释深度 |
| `npm run check:visuals` | 中文 SVG、安全结构与 Manifest |
| `npm run check:reviews` | 阶段对抗复核记录 |
| `npm run check:anchors` | 正文源码行号与短摘录 |
| `npm run check:licenses` | 第三方许可证和哈希 |
| `npm run check:links` | 本地链接目标 |
| `npm run check:secrets` | 敏感信息模式 |
| `npm test` | 门禁脚本单元测试 |
| `npm run check` | 聚合执行全部门禁 |

提交前先运行与改动直接相关的测试，再运行聚合检查。任何成功声明都要附实际命令和结果；不要用“应该通过”代替执行证据。

## 最终 GitHub 发布

最终仓库名为 `agent-harness-internals`。发布时逐项复核 About、Topics、README、Social Preview、License、默认分支、保护规则、公开可见性和相对链接。最终提交完成后，受控移除历史提交消息中的 Codex/Claude `Co-Authored-By` 与 Claude Session 元数据，保留人类作者、文件内容和提交顺序；强推后恢复保护规则，并确认 Contributors 页面不再列出 Codex 或 Claude。
