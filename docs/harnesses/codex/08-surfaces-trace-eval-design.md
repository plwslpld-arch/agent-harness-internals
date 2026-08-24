---
title: Codex 产品表面、证据通道与评测设计
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/cli/src/main.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/app-server/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/rollout-trace/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/otel/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/feedback/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/cli_stream.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/otel.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 产品表面、证据通道与评测设计

## 读者会得到什么

Codex 的 CLI、交互终端、无界面执行、App Server、MCP Server、Cloud 与 SDK 可以共享核心 Thread、Turn、模型和工具链，却通过不同命令、传输与协议投影对外。共享核心不代表事件名、停止语义、错误载荷或能力集合完全相同。

投影不是原始事件。共享也不是等价。

本篇同时分开三类证据通道：Rollout Trace 记录可重放的运行关联，OTel 输出遥测事件和指标，Feedback 收集诊断与用户反馈。三者都能帮助分析，却都不是训练 Reward，也不是独立发布 Eval。观察不是评分。反馈不是门禁。

遥测会有缺口。反馈会有偏差。裁决必须独立。产物必须核对。

## 真实输入与输出

### 输入

CLI 流测试向本地模拟 Responses 服务提交一次真实命令行会话；App Server 可选择标准输入输出、Unix Socket 或 WebSocket 传输。OTel 测试注入正常完成、解析错误和流提前关闭：

```text
同一核心 Turn → CLI 流输出或 App Server 通知
同一模型流 → 成功事件、失败事件与用量属性
```

Feedback 路径则捕获诊断日志、结构化标签和可选附件，上传前仍受同意与脱敏边界约束。

### 输出

CLI 可以输出面向终端的流式投影并追加 Rollout；App Server 通过 JSON-RPC 消息和通知路由到客户端；OTel 记录请求、流事件、工具决定、沙箱结果与用量；Trace bundle 保存追加事件并可归约状态；Feedback 形成诊断快照和附件。

```text
产品输出：供用户或客户端消费
运行证据：供调试、分析和关联
评测结果：由独立 Scorer 对固定 Trial 产出
```

这三种输出不能互换。

## 调用链

共享核心，分离投影；共享证据，独立评分。

![Codex 多产品表面共享核心，并将 Rollout Trace、OTel、Feedback 与独立 Eval 分层输出的中文证据流图](../../../assets/diagrams/codex/08-surfaces-trace-eval-design.svg)

Claim: codex.surfaces.protocol-projections-not-identical

Claim: codex.feedback-trace.is-not-release-eval

Claim: codex.architecture.multi-crate-boundaries-have-tradeoffs

1. CLI 解析交互、Exec、MCP Server、App Server、Cloud、Resume、Fork 与调试命令，再把控制权交给相应 surface adapter。不同入口先决定配置、传输、认证和输出协议。
2. 适配器把外部请求映射到共享 Thread、Op、Event、Turn、模型与工具核心；核心事件再被 CLI 文本流、TUI 状态或 App Server JSON-RPC 通知投影。投影可能隐藏、合并或重命名内部事件。
3. Rollout Trace 在热路径记录线程、推理、工具、MCP 与压缩的关联事件，追加到 bundle 后可重放和归约。它面向因果分析，不负责判断任务是否正确。
4. OTel 记录 span、事件、指标和传播上下文。事件可以区分响应完成、解析失败、工具结果与沙箱结局，但遥测缺失或采样不能改写原始任务事实。
5. Feedback 从 tracing layer 捕获诊断日志和结构化元数据，并按选项附加脱敏诊断、Rollout 或缓存信息。用户反馈表达观察或偏好，不自动形成可训练标量。
6. Eval Adapter 把固定 Trial、目标、产物和原始证据交给独立 Scorer。训练 RewardAdapter 可从已审计评分派生 DPO、GRPO 或 RFT 信号；发布门禁仍应使用隔离 holdout 和独立评测。
7. 多 crate 边界让协议、存储、沙箱、Trace、Feedback 和表面适配器可独立演进，也增加跨 crate 配置、Feature、版本与语义漂移成本。架构图必须标出这些桥接点。

## 源码证据

CLI 枚举多个产品与管理入口，而不是只有一个交互命令：

```source
codex-rs/cli/src/main.rs:126-223
Exec(ExecCli), McpServer(...), AppServer(...), Resume(...), Fork(...), Cloud(...)
```

App Server 支持多种传输并维护独立输入、处理和输出循环：

```source
codex-rs/app-server/src/lib.rs:158-167,733-763
run_main_with_transport_options uses two loops/tasks
AppServerTransport::Stdio ... UnixSocket ... WebSocket ...
```

Trace crate 明确拥有追加事件 Schema、writer 与 reducer：

```source
codex-rs/rollout-trace/src/lib.rs:1-3,47-78
Trace bundle format, writer, and reducer for Codex rollouts.
pub use raw_event::RawTraceEvent; pub use writer::TraceWriter;
```

OTel 暴露 SessionTelemetry、运行指标和 W3C 上下文传播：

```source
codex-rs/otel/src/lib.rs:16-40
pub use ... SessionTelemetry;
pub use ... RuntimeMetricsSummary;
pub use ... inject_span_w3c_trace_headers;
```

Feedback 保存诊断快照并上传可选附件，其职责是问题反馈而非评分：

```source
codex-rs/feedback/src/lib.rs:175-257,360-427
pub struct CodexFeedback ...
pub fn snapshot(...) -> FeedbackSnapshot ...
pub async fn upload_feedback(...)
```

第一条 Claim 使用 B 级，由入口分派、App Server 传输和 CLI 流上游测试支持。后两条使用 D 级：证据 crate 的职责由源码锁定，但把它们映射到独立 Eval 与多 crate 取舍属于架构推断；仓库没有内置完整发布门禁或训练 RewardAdapter。

## 失败与限制

表面共享核心不等于协议等价。CLI 的退出码、文本流和终端信号，App Server 的 JSON-RPC 错误与通知，Cloud 的任务状态都需各自映射。只验证一个表面不能替另一个表面签字。

Trace 不是原始世界。Trace writer 可能关闭、事件可能受版本或采样影响，reducer 还是派生状态；文件存在只能证明记录通道产出，不能证明任务满足用户目标。

Telemetry 不是完整审计。OTel 适合关联、性能和运行指标，但 exporter 配置、采样、脱敏和网络故障都会造成缺口。发布评测不能以「没有错误 span」替代产物检查。

Feedback 不是 Reward。正负反馈可能受选择偏差、界面、用户预期和诊断上下文影响；附件还可能包含敏感信息。未经 Schema、归因、去重、对抗审计与独立标签，不应直接进入训练。

训练 Reward 也不是发布 Eval。训练可使用经审计的偏好或可验证奖励优化模型，但 checkpoint 选择与最终发布必须使用隔离数据。否则同一信号既训练又裁判，会高估泛化。

多 crate 不是天然优点。清晰边界能限制依赖与所有权，过细拆分也会让 Feature、错误类型、协议版本和测试夹具在多个包漂移。评审要看真实调用链，而不是按 crate 名猜能力。

## 验证方法

先用同一固定输入运行 CLI、无界面执行和 App Server，保存原始核心事件、各表面输出、退出状态与取消结果。建立映射表，逐项标记保留、合并、重命名和丢弃字段。

再开启 Trace 与 OTel，给 Thread、Turn、模型请求、工具调用和审批使用稳定关联键。注入流关闭、解析失败、工具拒绝与沙箱错误，确认 Trace、遥测与产品输出能关联，但缺少任一通道时不会伪造成功。

随后测试 Feedback：检查用户同意、脱敏、附件大小、路径读取失败和上传拒绝。反馈记录应引用 Trial 与证据，而不是只保存自由文本；进入训练前必须经过独立标签和数据治理。

最后建立 Eval：Dataset 固定 Trial，Target 调用某个明确表面，Artifact 保存产物与原始证据，Scorer 独立判断。RewardAdapter 只消费经审计评分；发布 holdout 与训练数据隔离，并单独报告每个 surface 的结果。

## 自检

### 问题 1

CLI 与 App Server 共享核心，是否可以只测试 CLI？

**答案：** 不可以。两者的传输、协议投影、错误和停止语义不同，共享核心只能复用部分证据。

### 问题 2

Trace 能完整重放，是否就能判断任务通过？

**答案：** 不能。Trace 提供运行关联和派生状态，任务正确性仍需对目标产物和副作用独立评分。

### 问题 3

用户点击正反馈，可以直接作为训练 Reward 吗？

**答案：** 不应直接使用。必须处理归因、偏差、去重、隐私和标签质量，再由显式 RewardAdapter 转换。

### 问题 4

训练 Reward 很高，为什么还需要独立发布 Eval？

**答案：** 训练信号参与了优化，会产生适配偏差；隔离 holdout 才能检验未见数据上的任务质量与安全边界。
