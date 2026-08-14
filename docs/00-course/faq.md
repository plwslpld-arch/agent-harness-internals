---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"},{"repo":"cordis","path":".","commit":"8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 常见问题

## 这个库能让我学明白 Harness 吗？

能学到“能解释、能定位源码、能做本地实验、能评估改动风险”的程度。

但它不是把 7,412 个文件逐行翻译成中文。那种方式很快会过期，价值也低。Atlas 的方法是：

1. 主课程建立概念和运行链路。
2. 源码研究解释关键设计。
3. 文件卡片帮你定位具体文件。
4. 测试索引告诉你行为契约在哪里。
5. 本地实验把理解变成可复核证据。

如果目标是“深入改核心 runtime”，你还需要在本地跑测试和真实场景，不能只读文档。

## 为什么有些目录只有 README？

是正确的。部分目录是导航型或证据型目录，README 就是主内容；另一些目录有多篇专题文档。判断是否缺内容，不看“文件数量”，看这个目录是否完成了自己的职责：

- `docs/00-course/`：主课程，应该有完整多讲。
- `docs/13-source-studies/`：人工源码研究，应该有关键链路深度分析。
- `docs/14-file-reference/generated/`：机器生成索引，体量很大，不适合当教程入口。
- `research/runtime-evidence/`：证据记录区，有些时候只有 README 或 pending 记录是正常的。

## 逐文件源码解析在哪里？

入口在 [../14-file-reference/source-reading-guide.md](../appendix-a-labs.md)。

具体分三层：

- 全量文件卡片：覆盖固定基线中的每个跟踪文件。
- 重点文件精读：先讲最关键的一批核心文件。
- 关键函数 walkthrough：解释核心代码块的输入、输出、正常路径、失败路径和边界。

它不是逐行注释，而是“文件职责 + 关键代码块 + 测试证据 + 运行链路”。

## 插件系统是不是重点？

是重点，而且是主线之一。Harness 的 profile、模型、工具、权限、Session、Web 能力都通过 Cordis 插件系统装配。

学习顺序：

1. 先读 [03｜Cordis 插件运行时](../02-cordis-and-boot.md)。
2. 再读 Cordis 论文导读和 fork 分析。
3. 再做最小插件实验。
4. 最后看能力插件如何贡献 service、event、prompt、tool 和 UI。

## 它更像 Webpack plugin 还是 React runtime？

都像一部分，但最合适的类比是 VS Code Extension Host。

- 像 Webpack plugin：因为它有插件注册点、生命周期和事件扩展。
- 像 React runtime：因为 Cordis 有 Fiber/Effect 生命周期，负责挂载和卸载。
- 更像 VS Code Extension Host：因为它不只是 build-time hook，而是长期运行的产品 runtime，插件能贡献服务、工具、UI、策略和协议能力。

## prompt 是在哪里拼装的？

主要看 `packages/core/system-prompt/src/index.ts` 和 `packages/core/agent-loop/src/agent.ts`。

简化理解：

- 插件通过 `systemPrompt.section/context/tools/variable` 贡献内容。
- Agent Loop 在每个 step 前调用 `systemPrompt.assemble()`。
- `renderPrompt()` 生成 system prompt。
- runtime context 被放进模型可见消息。
- `session.deriveMessages()` 生成历史消息。
- adapter 最后把内部请求变成 provider wire body。

## 上下文窗口在哪里处理？

Agent Loop 记录 `request/context`，adapter/model resolution 提供 `contextWindow`。真正的窗口治理需要结合模型 adapter、Session surface 和 compaction 逻辑看，不能只看某个 prompt 文件。

核心判断：

- event log 是事实源。
- surface 是模型可见历史。
- compaction 改 surface，不应删除事实事件。

## 当前有没有像 Codex/Claude Code 那种完整 TUI？

固定基线里，当前主要产品表面是 Web/headless。完整内置 TUI 产品层已移除；仓库里可能还保留终端 UI 组件、历史 notes 或测试证据，但这不等于当前有完整可用的 `dsh tui` 产品。

## 我要怎么开始？

如果你是第一次学：

1. 读 [README](README.md) 和 [01｜项目定位](../01-what-is-a-harness.md)。
2. 连续读完 12 讲主课程。
3. 按 [stage-checklists.md](stage-checklists.md) 每阶段自测。
4. 做一次本地 evidence 模板。
5. 再进入源码文件卡片和重点文件精读。

如果你要改核心 runtime，直接跳到“阶段 7”是不够的，至少先完成阶段 3–6。
