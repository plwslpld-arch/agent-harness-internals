---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 架构决策地图入口

DeepSeek Harness 的核心价值不是某一个固定 agent loop，而是用插件和 service seam 组合模型、循环、工具、权限、存储、UI 与协议。选择时应从目标与边界出发，而不是“把所有包都启用”。

详细选型见 [决策地图](architecture-decision-map.md)。默认原则：从最小 profile 开始，先形成可验证的会话—工具—结果闭环；只有明确的产品需求才增加 Web、MCP、subagent、workflow、远程 sandbox 或动态扩展。

本章记录的是当前基线下的推荐，不是 API 承诺。每个决策应绑定源码 SHA、配置和退出条件；重大变化进入 [决策与复盘](../20-decisions-and-postmortems/README.md)。
