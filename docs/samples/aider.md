---
title: Aider：Repository Map 与 Architect Editor 分工
article_type: sample
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"aider","path":"aider/repomap.py","commit":"5dc9490bb35f9729ef2c95d00a19ccd30c26339c"},{"repo":"aider","path":"aider/coders/architect_coder.py","commit":"5dc9490bb35f9729ef2c95d00a19ccd30c26339c"}]
---

# Aider：Repository Map 与 Architect Editor 分工

## 样本定位

Aider 提供两个值得单独提炼的机制。Repository Map 在有限令牌预算内投影仓库结构，帮助模型看到不在聊天文件中的相关符号；Architect 模式把方案形成与文件编辑分为两个阶段，并可使用不同模型和编辑格式。一个回答「上下文里放什么」，另一个回答「建议怎样交给编辑器实施」。

这两个机制都提升了大型代码库中的可操作性，却不会消除证据缺口。压缩后的 Map 可能省略关键文件，Architect 的建议可能基于不完整上下文，Editor 也可能错误应用方案。本文只陈述锁定源码的选择和交接逻辑，不把模型性能、提交存在或测试一次通过升级为任务正确证明。

![Aider Repository Map 与 Architect Editor 分工](../../assets/diagrams/samples/aider-map-architect-editor.svg)

## 独特机制

`RepoMap.get_repo_map` 首先检查令牌预算和其他文件集合；预算为零或没有其他文件就不生成映射。它接受聊天文件、其他文件、被提及文件和标识符，并调用排序标签映射。没有聊天文件时，可以在上下文窗口减去预留空间的约束内扩大仓库视图。Claim: aider.repomap-is-budgeted-context。

Repository Map 的本质是排序后的上下文投影。它用符号和引用提高单位令牌的信息密度，但不包含完整文件内容，也不保证每个依赖都被选中。`map_tokens`、上下文窗口、提及线索和排序结果共同决定模型看见什么，因此复现实验要保存最终 Map 内容或哈希，而不只是保存预算配置。

ArchitectCoder 继承 AskCoder，先形成架构或修改建议。回复完成后，如果内容非空且没有开启自动接受，就询问用户是否编辑文件；获准后选择主模型配置中的 editor_model，没有独立 Editor 时退回主模型，并设置 editor_edit_format。随后创建新的 Coder，把 Architect 内容作为消息交给 Editor 执行。Claim: aider.architect-hands-plan-to-editor。

这个交接把自然语言方案与结构化编辑协议解耦。Architect 可以擅长分析，Editor 可以擅长应用 diff 或整文件格式；两者也可以是同一个模型对象。是否经过人工确认取决于 `auto_accept_architect`，所以「Architect 模式有人审」只能在有效配置关闭自动接受且交互实际发生时成立。

Editor 完成后，Architect 接收总成本与 Aider 产生的提交哈希，并把当前消息移回上文。这里的提交哈希属于产物血缘，说明某次编辑形成了 Git 对象；它不说明需求满足，也不说明测试没有被错误修改。应把 Git 记录与任务评分分开。

## 源码入口

从 `source:aider:aider/repomap.py:103` 到 `135` 开始，核对提前返回条件、预算放大和 `get_ranked_tags_map` 调用。若需要解释排序，再继续进入标签图、缓存与排名实现，并记录哪些文件被当作 chat_files 与 other_files。只看最终 Map 文本很难解释遗漏原因。

再读 `source:aider:aider/coders/architect_coder.py:6` 到 `48`。这段集中显示空回复处理、人工确认、Editor 模型选择、编辑格式、Coder 创建、建议交接与提交哈希回收。继续分析时要连到模型配置，确定 editor_model 是独立模型还是主模型别名。

## 运行链

1. 入口确定聊天文件、其他仓库文件、提及文件与标识符，并计算 Map 预算。
2. RepoMap 对符号与引用排序，生成受上下文窗口约束的仓库投影。
3. Architect 读取任务、聊天文件和 Map，输出可执行的修改建议。
4. 根据有效配置等待用户确认或自动接受，再选择 Editor 模型与编辑格式。
5. Editor Coder 接收建议，修改文件并可能运行命令、测试或创建 Git 提交。
6. 外部验收比较最终差异、测试与需求，独立决定任务是否通过。

可观测性至少要保存 Map 预算、最终 Map、Architect 原始建议、确认决定、Editor 模型与格式、文件差异、命令和提交哈希。若只保留最终提交，就无法判断错误来自上下文选择、规划还是编辑；若只保留聊天，又无法证明磁盘产物。

## 与一级主线的关系

Aider 作为扩展样本补充代码上下文压缩与规划编辑分工。六条一级主线分别覆盖更完整的运行时、会话、权限和产品表面；这里不进行综合排名，也不把 Repository Map 视为所有 Harness 都应复制的唯一方案。它提供可迁移的问题框架：上下文投影如何产生，缺口如何发现，角色交接如何保留血缘。

在统一评测链中，Map 和 Architect 建议属于 Trace，文件差异和 Git 对象属于 Artifact，Evaluator 读取冻结任务与产物评分。若要进入 DPO、GRPO 或 RFT，RewardAdapter 还要保留评分语义与缺失状态；候选选择和独立发布留出集不共享同一判定责任。

## 失败与限制

Map 的主要风险是信息选择偏差。关键实现可能因预算、解析失败或图排名较低而缺席，模型却会把可见投影误当完整仓库。第二个风险是角色标签造成能力幻觉：Architect 与 Editor 名称不证明它们使用不同模型，也不证明方案经过人工复核。

第三个风险是把 Git 当作完成门槛。自动提交能提高可追溯性，却可能包含错误更改、遗漏未追踪文件或修改测试以迎合结果。命令返回零和提交生成都只是运行信号，必须与冻结任务、禁止项和独立测试一起解释。

## 验证方法

准备一个跨三个文件的受控任务，其中关键符号不在聊天文件。分别使用足够与极小 Map 预算运行，记录最终 Map 是否包含关键符号及其对方案的影响。实验只用于验证上下文投影链，不把单个模型结果当成普遍性能结论。

Architect 实验关闭自动接受，确认拒绝时不创建 Editor；再批准一次并固定独立 editor_model 与格式，检查 Editor 收到的内容等于 Architect 建议。最后用外部测试验证文件产物，并故意构造一个「成功提交但需求错误」案例，确保门禁不会把提交当通过。

## 自检

### 问题 1

Repository Map 是完整源码吗？

**答案：** 不是，它是受预算和排序约束的符号投影。

### 问题 2

Architect 与 Editor 一定使用不同模型吗？

**答案：** 不一定，没有独立 Editor 时会回退主模型。

### 问题 3

Architect 模式一定有人确认吗？

**答案：** 不一定，自动接受配置会改变这条边界。

### 问题 4

生成 Git 提交能否计为完成？

**答案：** 不能，仍需按任务契约验证差异、测试和副作用。
