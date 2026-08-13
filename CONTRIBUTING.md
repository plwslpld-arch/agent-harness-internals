# 贡献指南

## 可以贡献什么

- 修正与固定 Commit 不一致的路径、符号或行为说明；
- 增加文件级、调用链、测试或设计决策分析；
- 提交可复现的协议、安全、性能和 UX 实验；
- 增加经过分级的官方、社区和采用证据；
- 改进自动更新、可移植性和许可证检查。

## 事实要求

每个重要结论至少包含一种证据，并明确标记为 `code`、`test`、`runtime`、
`official-doc`、`community` 或 `inference`。运行结论需要记录版本、环境、
命令、开始/结束时间、退出码、跳过项、日志或产物路径。

不要把路线图当成已经实现，不要把默认关闭的插件写成默认能力，不要把
HTTP 200、编译成功或 benchmark 分数当作完整业务 E2E。

## 文档元数据

`docs/13-source-studies/` 与 `docs/20-decisions-and-postmortems/` 的人工分析必须使用：

```yaml
---
source_repo: deepseek-harness
source_path: packages/core/agent-loop/src/agent.ts
source_commit: <full-sha>
last_verified: YYYY-MM-DD
status: draft # draft | reviewed | verified | stale
depth: L2 # L0 | L1 | L2 | L3
audience: [engineering]
evidence: [code, test]
---
```

## 提交流程

1. 从当前 `main` 创建分支。
2. 不提交 `sources/checkouts`、依赖、构建产物、模型权重、真实日志或密钥。
3. 运行 `npm run check` 和适用的生成/验证命令。
4. PR 说明上游 SHA、变更证据、验证结果和未覆盖项。
5. 自动更新 PR 需要人工确认语义变化后才能合并。

第三方内容必须遵守原始许可证。不能确认再发布权利时，只提交 URL、SHA、
少量合规引用和自己的分析。
