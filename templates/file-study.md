---
sources: [{"repo":"deepseek-harness","path":"path/to/source.ts","commit":"full-commit-sha"}]
last_verified: YYYY-MM-DD
status: draft
depth: L1
audience: [engineering]
evidence: [code]
---

# `path/to/source.ts`

## 文件职责

用一句话说明这个文件为什么存在，再说明它在系统架构中的位置。

## 输入、输出与公开接口

列出 exports、输入 schema、返回值、错误和副作用。

## 依赖和反向依赖

- Imports：
- Imported by：
- 提供/消费的 Cordis services：
- 发出/监听的 events：
- 注册/调用的 tools：

## 状态与生命周期

说明创建、使用、取消、失败、释放和重载；effect 必须说明清理路径。

## 执行路径

### Happy path

### Error path

### Edge cases

至少检查超时、取消、并发、恢复、缓存和跨平台差异中适用的部分。

## 关键代码段

只对决定行为的代码段逐行解释；不要把源码机械复述一遍。

## 测试与运行证据

| 行为 | 单元测试 | 集成/E2E | Fixture/Snapshot | 平台/条件 |
| --- | --- | --- | --- | --- |

## 产品含义

说明用户可见体验、默认/可选状态、权限和失败时的感知。

## 设计决策与历史

链接相关 Agent Note、postmortem、上游 issue/commit，并写明被拒方案。

## 风险、限制与待验证项

明确区分已验证事实和推断。

## 固定源码链接

使用上游仓库完整 Commit 的 permalink。
