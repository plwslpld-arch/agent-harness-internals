# 2026-08-13 社区与社交媒体快照

> 捕获时间：2026-08-13。社交帖子会删除、编辑或改变排序；本页只保存链接、
> 必要摘要和可证/不可证边界，不把讨论热度写成产品采用。

## 官方发布锚点

DeepSeek 官方 X 帖子宣布 Harness v0.1 进入 Developer Preview，并以 MIT 开源；
官方定位强调 Cordis 与“Everything is a plugin”。

- canonical URL: <https://x.com/deepseek_ai/status/2087887408440164663>
- evidence class: A（官方发布）
- supports: 发布身份、Developer Preview、官方定位和许可声明
- does not support: 稳定性、跨平台完成度、社区插件数量、生产采用

## 同日讨论样本

| 样本 | 社区主题 | 可以支持 | 不能支持 |
| --- | --- | --- | --- |
| [LocalLLaMA 发布讨论](https://www.reddit.com/r/LocalLLaMA/comments/1vnau0y/github_deepseekaideepseekharness/) | 权限边界、Cordis 是什么、插件化的实际意义 | 早期用户关注权限是 prompt 还是真实工具边界；Cordis 认知不足 | 权限实现已安全、代表全部用户 |
| [作者征集反馈](https://www.reddit.com/r/DeepSeek/comments/1vnbdzn/author_here_any_feedback_for_deepseek_harness/) | 为什么还需要一个 Harness、与成熟竞品差异、首批体验 | 发布者自述 0.1/Developer Preview；真实问题清单 | 发帖者身份的独立认证、体验声明的可复现性、规模化采用 |
| [社区技术解读](https://www.reddit.com/r/DeepSeek/comments/1vnamjq/the_deeseek_harness/) | Cordis、插件、事件流、Web/headless、权限 | 社区正在按“插件框架而非单一 CLI”理解产品 | 其中每项细节都与锁定 SHA 一致；仍需逐条回源码 |
| [桌面包装尝试](https://www.reddit.com/r/DeepSeek/comments/1vng2hh/i_built_deepseek_harness_for_desktop/) | Web 之外的桌面需求、第三方包装 | 桌面交互是一个早期需求/实验方向 | 官方 Desktop、质量、安全或可维护性 |

## 发布前后的冲突证据

发布前一天的[“即将发布”讨论](https://www.reddit.com/r/DeepSeek/comments/1vmjdnh/deepseek_harness_is_coming_soon/)
与更早的[期待讨论](https://www.reddit.com/r/DeepSeek/comments/1u7a2ca/what_are_your_hopes_for_deepseeks_official_harness/)
出现了“会有完整 CLI/Desktop”“可能只是竞品替代”等猜测。它们只能说明期待与认知，
不能覆盖当前锁定源码：当前官方交互产品面是 Web，内置 TUI 已删除，headless/ACP/
JSON-RPC 是程序化入口。

一个[内测消息纠错帖](https://www.cocoloop.cn/t/topic/12415)还说明发布前传闻会互相
冲突。维护时应优先使用官方发布、仓库 Commit、发行包与实测，再把传闻保留为历史
舆情，而不是事后挑选“猜对了”的帖子。

## 与既有 Harness 的讨论背景

在官方项目发布前，社区已反复比较 OpenCode、Pi、Codex/Claude Code、Reasonix、
VS Code 插件与自建 Harness。样本包括[选择求助](https://www.reddit.com/r/DeepSeek/comments/1vjkstg/can_you_help_me_find_the_best_ai_harness_for_the/)
和[缓存成本争论](https://www.reddit.com/r/DeepSeek/comments/1vm0if3/i_see_people_talking_about_harnesses_with_passion/)。
这提示 Atlas 的评测不能只比较“能否调用 DeepSeek”：还要分别测 prefix cache、
上下文保持、工具/审批、恢复、沙箱、界面、插件替换与真实任务成功率。

## 首发结论

1. 当前关注点集中在插件化差异、Cordis 学习成本、权限是否真隔离、为什么需要新
   Harness，以及 Web/TUI/Desktop 产品形态。
2. 已出现个人体验和第三方包装，但没有足够证据证明跨团队重复使用、生产依赖或
   成熟插件市场。
3. “DeepSeek 原生”可能改善协议与缓存适配，但必须用固定模型、prompt、工具、
   cache 和预算的对照实验验证，不能从品牌关系推出性能优势。
4. 下一快照应跟踪：官方 Issue/Discussion 的重复主题、独立插件仓库、首次升级
   兼容、真实任务轨迹和安全报告，而不是只累计互动数。
