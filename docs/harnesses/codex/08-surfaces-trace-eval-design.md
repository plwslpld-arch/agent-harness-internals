# 多种产品表面怎样共享核心，又怎样留下可评测证据

[返回 Codex 课程地图](README.md)

上一篇顺着 Thread 树，弄清了子任务是谁、处于什么状态，又该怎样控制。现在走出这棵树，看看同一套核心怎样接住不同产品入口。

交互 CLI、无头 Exec、App Server、IDE（集成开发环境）、MCP Server 或 Cloud 入口都能驱动 Codex 核心。它们共用 Thread、Turn（回合）、模型和工具实现，可到了传输方式、错误格式、停止语义和对外事件这一层，各入口并不完全一样。

```text
交互 CLI ─┐
Exec ─────┤
App Server┼→ Op → Thread / Turn → Event → 各表面投影
IDE / SDK ┤                         │
Cloud ────┘                         ├→ Rollout Trace
                                    ├→ OTel
                                    └→ Feedback
```

## 第 1 站：CLI 只是入口分派器之一

源码：[查看 CLI 子命令](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/cli/src/main.rs#L126-L223)

```rust
enum Subcommand {
    Exec(ExecCli),
    McpServer(...),
    AppServer(...),
    Resume(...),
    Fork(...),
    Cloud(...),
}
```

- **调用者**：进程 `main()` 解析命令行。
- **输入**：子命令、配置覆盖和终端环境。
- **状态变化**：选择交互、无头、Server 或管理流程。
- **返回**：对应表面的退出码和输出。
- **下一站**：表面创建 Thread/Session，或连接既有 Thread。

同一个 Turn Error 到了 Exec，可能表现为非零 Exit Code，所以你测过这种映射，仍不能断定另一种也对。到了 App Server，它也可能变成 JSON-RPC Error 或 Event。两种映射要分开测。

## App Server 把核心变成多传输服务

### 第 2 站：输入、处理和输出具有独立异步循环

源码：[查看 App Server 传输入口](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/app-server/src/lib.rs#L158-L167)

```rust
// AppServerTransport 可以是 Stdio、UnixSocket 或 WebSocket。
// 主入口为传输建立独立读写与处理任务。
```

源码：[查看 App Server 主循环](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/app-server/src/lib.rs#L733-L763)

```rust
// 输入消息进入处理循环，核心事件再由输出循环发送。
```

- **调用者**：CLI 的 AppServer 子命令或嵌入宿主。
- **输入**：所选 Transport 与客户端请求流。
- **状态变化**：把协议请求映射为核心操作；把 Events 投影为客户端通知。
- **返回**：协议响应、通知和连接终态。
- **下一站**：客户端更新自己的任务视图或提交下一项操作。

Transport（传输层）连上了，不代表 Thread 已经创建。服务端接受请求，也不代表 Turn 已经跑完，Client 必须分别拿请求 ID、ThreadId（线程 ID）和 TurnId 对上这三个层次。这几层不能混。

## Trace、Telemetry 与 Feedback 分别保存什么

### Rollout Trace：重建 Harness 内部因果

源码：[查看 Trace 模块](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/rollout-trace/src/lib.rs#L1-L78)

```rust
//! Trace bundle format, writer, and reducer for Codex rollouts.

pub use raw_event::RawTraceEvent;
pub use writer::TraceWriter;
```

- **调用者**：Session/Turn 事件记录与诊断工具。
- **输入**：带关联身份的 Raw Events。
- **状态变化**：追加 Trace Bundle；Reducer 可派生便于查询的状态。
- **返回**：可重建调用链的事件集合或派生视图。
- **下一站**：调试器、可视化或 Evaluator 消费。

Reducer 给出的只是派生视图，不能拿它覆盖原始事件。Writer 没有启用或者写入时失败了，你都可能看不到 Trace（执行轨迹）。这不能反推执行没发生。

### OTel：观察性能与运行指标

源码：[查看遥测导出](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/otel/src/lib.rs#L16-L40)

```rust
pub use ... SessionTelemetry;
pub use ... RuntimeMetricsSummary;
pub use ... inject_span_w3c_trace_headers;
```

OTel 适合用来查延迟、错误率、调用关系和资源消耗，而采样会漏掉一部分信息，Exporter 故障和脱敏也会留下缺口。因此，看不到 Error Span，不能据此判定任务成功。

### Feedback：用户提交诊断与主观信号

源码：[查看 Feedback Snapshot](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/feedback/src/lib.rs#L175-L257)

```rust
pub struct CodexFeedback { ... }
pub fn snapshot(...) -> FeedbackSnapshot { ... }
```

Feedback（反馈）可以带上日志和附件，帮你定位问题，不过谁愿意提交反馈、用户当时处在什么语境，都会影响这份材料，其中还可能混有敏感数据。它不能自动变成 Reward。也不能充当发布门禁。

## 一个独立 Eval 应怎样使用这些通道

以「修复失败测试」为任务：

1. 固定仓库基线、用户输入、模型、Codex 配置和表面版本。
2. 通过 Exec 或 App Server 提交一次任务，并保存 ThreadId/TurnId。
3. 收集 Rollout、Tool Trace、文件差异、停止原因、Token 和时长。
4. 在 Codex 运行之外执行目标测试与静态检查。
5. Evaluator 依据测试、Diff 范围和任务约束给出 Score 与失败原因。

Assistant（助手）的最终文本、Exec Exit Code、OTel、Trace 和 Feedback 都能提供证据，真正给出评分的应是明确设置的 Evaluator。如果还想拿这些数据训练模型，就要另设 Reward Adapter（把原始信号转换成训练奖励的版本化规则），把样本怎么选、标签表示什么写清楚，并保留一份独立发布集。

读完这八篇，你已经能从配置出发，一路追过 Thread、Turn、工具和执行边界，再读到 Rollout、子 Agent 以及各个入口留下的证据。要做横向比较，手边还缺另一套 Agent Harness 的同类证据，先读完另一条课程，再回课程地图对照会更稳。

到这里可以回到 [Codex 课程地图](README.md) 自己复核永久链接，或进入 [Gemini CLI 课程](../gemini-cli/README.md) 比较 Config 和 Scheduler，再看 Tool 与 Confirmation 这两个概念在 Tool Confirmation 里怎样配合。
