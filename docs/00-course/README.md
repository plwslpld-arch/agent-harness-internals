---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, runtime, official-doc, inference]
---

# DeepSeek Harness 核心课程

这是本仓库的主学习线。其它目录是专题研究、源码索引、实验记录或维护资料；第一次学习时优先读这里。

## 课程目标

学完后，你应该能做到：

- 给非研发同学解释 Harness 是什么，以及它和模型、评测框架、聊天 UI 的区别。
- 画出一次任务从用户输入到模型、工具、Session 和 Web 展示的完整链路。
- 看懂 Cordis 插件系统为什么是 Harness 的底座。
- 知道 prompt 拼装、上下文窗口、工具审批、Session 事件和 DeepSeek adapter 分别在哪里。
- 能用本地实验验证理解，并能设计一个小改动的回归检查。

## 12 讲顺序

| 讲次 | 主题 | 重点 |
| --- | --- | --- |
| 01 | [项目定位](01-product-positioning.md) | Harness 解决什么问题，什么不是它的目标 |
| 02 | [系统架构](02-system-architecture.md) | 控制平面、执行平面、证据平面、产品表面 |
| 03 | [Cordis 插件运行时](03-cordis-plugin-runtime.md) | Context、Service、Event、Fiber、Effect |
| 04 | [启动与配置](04-boot-and-config.md) | CLI、profile、patch、环境变量如何合成 |
| 05 | [Agent Loop](05-agent-loop.md) | turn、step、model request、tool call 的主循环 |
| 06 | [Prompt 与上下文](06-prompt-and-context.md) | system prompt、history、context window、compaction |
| 07 | [DeepSeek Adapter](07-deepseek-adapter.md) | API key、请求序列化、SSE、thinking、usage |
| 08 | [工具、审批与沙箱](08-tools-approval-sandbox.md) | tool policy pipeline 和副作用治理 |
| 09 | [Session、持久化与恢复](09-session-persistence-repair.md) | append-only event log、flush、repair |
| 10 | [Web、Headless 与协议入口](10-web-headless-protocols.md) | Web/headless/ACP/MCP/SDK 的边界 |
| 11 | [源码阅读与本地实验](11-source-reading-and-labs.md) | 从问题定位源码，再用实验闭环验证 |
| 12 | [生态、论文与维护](12-ecosystem-maintenance.md) | Cordis 论文、生态证据、上游更新和开源维护 |

## 学习方式

每讲按同一个节奏读：

1. 先看“人话理解”，建立概念。
2. 再看“系统位置”，知道它在整条链路中的作用。
3. 然后看“关键代码片段”，理解实现形状。
4. 最后做“检查题/实验”，确认不是只看懂文字。

需要查具体文件时，再进入 [../14-file-reference/](../14-file-reference/README.md)。需要看更完整的源码研究时，进入 [../13-source-studies/](../13-source-studies/README.md)。
