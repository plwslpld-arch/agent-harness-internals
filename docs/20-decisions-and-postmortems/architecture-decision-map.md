---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# DeepSeek Harness 架构决策地图

## 入口形态

| 需求 | 选择 | 主要代价/边界 |
| --- | --- | --- |
| 人工交互式编码、设置与审批 | Web profile | 客户端/host 构建、身份与浏览器 E2E 成本 |
| 自动化单任务、研究最小闭环 | headless/minimal | 没有完整 UI，需要自己管理输入输出与持久化 |
| Python 批处理和轨迹评测 | SDK JSON-RPC example | 自有预发布 wire，无协议版本协商/单轮取消 |
| 编辑器或父 agent 调用 | ACP server | 当前只公开窄基线，非完整 transcript/UI |

当前基线不再把 TUI 列为入口。Web 是交互面；ACP、SDK JSON-RPC、headless/一次性 CLI 是程序化或非 Web 入口。历史 TUI notes 只作历史资料，见 [TUI 删除案例](tui-removal-evidence-case.md)。

## 外部能力

| 问题 | 选择 | 不应选择 |
| --- | --- | --- |
| 外部系统能以 MCP tools 暴露 | MCP client | 为一次性内部函数引入独立 server |
| 需要资源/提示词 MCP 能力 | 先设计新 seam | 假定当前 MCP bridge 已支持 |
| 需要本机低延迟工具 | 原生 Harness tool/provider | 用 MCP 掩盖权限/生命周期不清晰的问题 |
| 需要远端一次性执行环境 | E2B provider POC | 把它宣称为整个 Harness 的远端隔离 |
| 需要宿主内扩展、事件与 UI slot | Cordis plugin | 把不可信第三方 plugin 当沙箱扩展 |

## 编排

| 目标 | 机制 | 边界 |
| --- | --- | --- |
| 独立上下文解决有界子问题 | subagent | 权限/工作区继承、成本与取消不是事务回滚 |
| 一次 turn 内批量 map/parallel/pipeline | workflow | JSON 边界与数量限制；vm 不是安全边界 |
| 长时后台操作与增量读取 | job | 输出读取可能是消费式；必须保存 job id |
| 当前唯一长期目标 | goal | 不是并行项目数据库，历史在 session log |
| 会话内延迟/周期触发 | schedule | session-local，不是 host-wide cron |

## 模型接入

优先用原生 `deepseek-official` adapter 验证 V4 thinking、reasoning 回传、tool calls、usage/cache 和错误分类；再用 pi-ai provider 做多模型对照。通用 OpenAI-compatible 接口相似不代表 reasoning 与缓存语义完全等价。

模型切换实验要锁定 system prompt、tools 顺序、max tokens、reasoning effort、采样和 retry。模型目录只是建议值，实际 route/model 仍需运行时解析与持久化 request header 证据。

## 权限与执行

1. 无写入需求：read-only。
2. 只需改任务工作区：workspace-write，并验证当前平台 enforcement。
3. 需要越界动作：按 tool call 一次性审批和窄作用域 escalation。
4. `danger-full-access`：只用于明确受信环境与人工控制，不能作为测试“修绿”的默认办法。

网络隔离、凭据最小化和远端数据政策必须另行设计；文件 sandbox 不包办这些问题。

## 持久化

- 本地可审计、单 writer 场景：JSONL，保留 checksummed frame 与显式 flush。
- 需要查询和事务整合：SQLite，但评估同步 API 对事件循环的影响及 busy 行为。
- 跨进程/服务化：先定义 session event 语义、并发写入和迁移，不要仅换一个数据库 driver。

预览格式当前以拒绝未知版本为主，不应先承诺无损跨版本迁移。

## 决策记录最低字段

背景、目标/非目标、可选项、证据、决定、剩余风险、验证门禁、回退办法、重新评估触发器、对应 SHA/config。没有退出条件的“临时方案”通常会成为隐性长期架构。
