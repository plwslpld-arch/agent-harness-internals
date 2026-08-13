---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 01｜产品：价值、边界与成熟度

## 一句话定位

DeepSeek Harness 是一个可组合的 Agent 执行平台：它把模型、工具、权限、会话、子 Agent 与产品界面放进可替换的插件系统，而不是围绕某个模型写死一个应用。`evidence: official-doc`

可以从三层理解其价值：

1. **执行层**：让模型在有工具、有状态、有终止条件的循环中完成任务。
2. **控制层**：用审批、guard、沙箱和配置组合约束副作用。
3. **证据层**：用仅追加会话事件保留模型看见什么、做了什么，以及 UI 如何回放。

这些层在 `agent/tools/sandbox`、Cordis 配置与 `session/persistence` 等能力域中都有对应实现。`evidence: code` 把它类比为“Agent 操作系统”有助于理解覆盖面，但这是分析类比，不是官方产品名称。`evidence: inference`

## 第一产品主线：插件平台

Harness 的差异化不只在 Agent Loop，而在从 host 到 browser、从模型到权限策略都能沿 Cordis seam 组合。`evidence: code` 这使 profile 可以成为产品打包单元，也让第三方插件成为潜在生态入口；对应代价是依赖治理、权限披露、版本兼容、HMR/dispose 正确性和供应链审查。`evidence: inference` 完整主线见[插件系统全景](../03-cordis-foundation/plugin-system-mainline.md)。

工作区统计中的 219 个 workspace package 是官方 monorepo 的包单元，不是 219 个社区插件。`evidence: code` 当前不可访问的 turtle-ui 外部示例反而提醒我们：不能用仓库内部模块数量代替外部生态成熟度。`evidence: community`

## 它暂时不是什么

- 不是 DeepSeek 模型权重或推理服务。
- 不是 SWE-bench 一类评测 Harness。
- 不是已经承诺稳定兼容的生产平台；官方明确处于 developer preview。`evidence: official-doc`
- 不是“存在 sandbox 包就自动安全”的系统；隔离强度取决于 provider、平台和最终配置。`evidence: code`

## 当前产品表面

固定快照 `47f943…` 随发行版提供 Web 与 headless 组合，已经删除内置 TUI 产品层。`packages/bundle` 只有 `base`、`web-app`、`headless`，built-bin E2E 还把 `dsh tui` 明确列为移除入口。`evidence: code` terminal、命令适配和通用 client primitives 等底层零件仍可复用，但不能据此声称官方当前交付完整 TUI。`evidence: inference` 移除 TUI 的历史 Agent Note 用于解释决策沿革，当前能力则以现行代码、bundle 和测试为准。`evidence: code`

工作区基线曾完成全仓构建、无密钥快照测试和本地 Web HTTP 200 smoke。`evidence: runtime` 这些只能证明对应快照的构建与基础表面可运行，不证明真实模型任务、审批 E2E、跨平台隔离和升级迁移已经完成。`evidence: inference`

继续阅读：[产品成熟度](product-maturity.md)、[系统架构](../02-system-architecture/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动文件参考](../14-file-reference/README.md)
