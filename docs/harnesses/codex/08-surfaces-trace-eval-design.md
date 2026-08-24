# 多种产品表面怎样共享核心，又怎样留下可评测证据

[返回 Codex 课程地图](README.md)

Codex 核心可以被交互 CLI、无头 Exec、App Server、IDE、MCP Server 或 Cloud 入口驱动。它们共享 Thread、Turn、模型和工具实现，但传输、错误格式、停止语义和对外事件并不完全相同。

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

同一个 Turn Error 在 Exec 中可能成为非零 Exit Code，在 App Server 中则是 JSON-RPC Error/Event；测试一个映射不能替代另一个。

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

传输连接成功不代表 Thread 创建成功；请求被接受也不代表 Turn 已完成。客户端需要用请求 ID、ThreadId 和 TurnId 分别关联三个层次。

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

Reducer 输出是投影，不应覆盖 Raw Events；Writer 未启用或写入失败时，也不能用「没有 Trace」推断没有发生执行。

### OTel：观察性能与运行指标

源码：[查看遥测导出](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/otel/src/lib.rs#L16-L40)

```rust
pub use ... SessionTelemetry;
pub use ... RuntimeMetricsSummary;
pub use ... inject_span_w3c_trace_headers;
```

OTel 适合回答延迟、错误率、调用关联和资源使用。采样、Exporter 故障与脱敏都会造成信息缺口，因此「没有 Error Span」不是任务成功判定。

### Feedback：用户提交诊断与主观信号

源码：[查看 Feedback Snapshot](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/feedback/src/lib.rs#L175-L257)

```rust
pub struct CodexFeedback { ... }
pub fn snapshot(...) -> FeedbackSnapshot { ... }
```

Feedback 可以携带日志或附件帮助定位问题，但受选择偏差和用户语境影响，也可能包含敏感数据。它不是自动 Reward，更不是发布门禁。

## 一个独立 Eval 应怎样使用这些通道

以「修复失败测试」为任务：

1. 固定仓库基线、用户输入、模型、Codex 配置和表面版本。
2. 通过 Exec 或 App Server 提交一次任务，并保存 ThreadId/TurnId。
3. 收集 Rollout、Tool Trace、文件差异、停止原因、Token 和时长。
4. 在 Codex 运行之外执行目标测试与静态检查。
5. Evaluator 依据测试、Diff 范围和任务约束给出 Score 与失败原因。

Assistant 最终文本、Exec Exit Code、OTel、Trace 与 Feedback 都是证据来源，但评分权属于显式 Evaluator。若要用这些数据训练，还应通过单独的 Reward Adapter 定义样本选择和标签语义，并保留独立发布集。

到这里可以回到 [Codex 课程地图](README.md) 自己复核永久链接，或进入 [Gemini CLI 课程](../gemini-cli/README.md) 比较它的 Config、Scheduler 与 Tool Confirmation 设计。
