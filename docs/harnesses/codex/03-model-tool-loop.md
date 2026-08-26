# 模型响应怎样变成工具调用，再回到下一次采样

[返回 Codex 课程地图](README.md)

上一节已经沿 Thread、Task 和 Turn 分清了 Follow-up、Steer 与新 Turn 的归属边界。边界确定后，视线还要继续往里走——追踪当前 Turn 内的模型输出。一个 Codex Turn 不是「调用一次模型然后打印文本」，因为模型流中可能出现普通文本、Reasoning、Function Call 或其他 Item，一旦 Function Call 被解析并交给 Tool Router，结果就会按原调用身份写回 Context，由 Turn 再决定是否继续采样。

```text
Prompt
  ↓
Responses 流 ── 文本 → 对外事件
  │
  └─ Function Call → Tool Router → Handler
                              ↓
                        Function Output
                              ↓
                      写回模型历史 → 再采样
```

## 两个顺序必须同时成立

如果一次模型响应提出 A、B、C 三个工具调用，Harness 可以并发执行支持并行的工具，但下一次模型请求仍需要稳定的 A→结果A、B→结果B、C→结果C 对应关系。执行完成顺序和写回顺序不是一回事。

顺序在这里就固定了。

## 第 1 站：Router 按调用种类找到具体 Handler

源码：[查看 Tool Router](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/tools/router.rs#L1-L160)

```rust
pub(crate) struct ToolRouter {
    registry: ToolRegistry,
}

// 路由器根据 ToolCall 找到 Handler，并把调用上下文交给它。
```

- **调用者**：Turn 对模型输出 Item 的处理流程。
- **输入**：Tool Call、Turn Context、Call ID 和 Cancellation Token。
- **状态变化**：选择注册的 Handler，进入统一 Dispatch/事件路径。
- **返回**：可写回模型的 Tool Output 或类型化失败。
- **下一站**：并行调度器决定本调用取得共享锁还是独占锁。

Router 的职责是把模型协议对象翻译为 Harness 内部调用，而 Shell、文件、MCP 等具体语义属于 Handler，审批与 Sandbox 则会在更下游处理，因此不能把它们都称为「Router 允许了」。

## 第 2 站：工具元数据决定是否允许并行

源码：[查看并行执行门](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/tools/parallel.rs#L112-L175)

```rust
let supports_parallel = router.tool_supports_parallel(&call);
let _guard = if supports_parallel {
    Either::Left(lock.read().await)
} else {
    Either::Right(lock.write().await)
};
router.dispatch_tool_call_with_terminal_outcome(...).await
```

- **调用者**：一批 Tool Calls 的调度代码。
- **输入**：待执行调用、Router 与同批次读写锁。
- **状态变化**：可并行工具获取读锁；独占工具获取写锁并等待其他调用退出。
- **返回**：单个调用的终态结果。
- **下一站**：有序 Future 容器等待并按提交顺序取回结果。

并行标志只表达 Harness 允许调用 Body 重叠，却不能保证业务资源互不冲突，因为两个都允许并行的文件写入仍可能争用同一路径，这类冲突还需要 Handler 自己约束。

## 第 3 站：执行可乱序完成，历史按调用顺序提交

源码：[查看 Turn 中的有序 Tool Future](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/session/turn.rs#L2130-L2153)

```rust
let mut in_flight: FuturesOrdered<_> = FuturesOrdered::new();

while let Some(res) = in_flight.next().await {
    sess.record_conversation_items(...).await;
}
```

- **调用者**：模型流处理完当前批次 Tool Calls 后的 Turn Loop。
- **输入**：按模型出现顺序压入的 Tool Futures。
- **状态变化**：Future 可以并发推进；取出与记录保持原始顺序。
- **返回**：稳定排序的 Function Call Outputs。
- **下一站**：Context Manager 把调用和结果交给下一次模型请求。

这也解释了为什么一个慢工具可能造成 Head-of-Line 等待：B 已完成，但 A 仍未完成时，B 的结果不会越过 A 提交，而这样的等待换来了可重放与稳定的协议顺序。

### 用测试确认你理解的并行不是「看起来同时开始」

源码：[查看上游批次断言](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/tool_parallelism.rs#L268-L298)

```rust
assert_eq!(function_calls.len(), 3);
assert_eq!(function_call_outputs.len(), 3);
assert!(*index < *output_index);
assert_eq!(call.1.get("call_id"), output.1.get("call_id"));
```

这还不够。

这里核对的只是请求体布局与 Call ID 对齐，如果要证明 Body 确实重叠，还得看测试是否使用屏障或时间窗口，让多个 Handler 同时处于运行中。

## 模型流重试与工具重试不是一回事

重试对象必须先分清。

Provider 流可能在尚未完成一次响应时断开，因此 Codex 只会对可重试错误按 Provider 配置的上限重连，而已经落地的工具副作用不能因为模型流重试就无条件再执行。

### 第 4 站：重试受错误分类和次数上限控制

源码：[查看模型流重试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/session/turn.rs#L1363-L1439)

```rust
let max_retries = turn_context.provider.info().stream_max_retries();
if !err.is_retryable() {
    return Err(err);
}
handle_retryable_response_stream_error(..., max_retries, ...).await?;
```

- **调用者**：Turn 的 Responses Stream 循环。
- **输入**：Provider Error、已重试次数与 Cancellation Token。
- **状态变化**：记录重试信息；超过上限或不可重试时结束当前路径。
- **返回**：新的 Stream，或向上返回错误。
- **下一站**：继续处理 Response Items，或结算 Turn Error。

## 一次失败测试修复的完整闭环

1. 模型先调用 Read；Result 写回 Context。
2. 模型调用 Shell 运行测试；非零退出是工具成功执行后返回的业务结果，不一定是 ToolRuntime 故障。
3. 模型调用 Patch 修改代码。
4. 模型可能并发 Read 两个互不依赖文件，但 Patch 或某些执行工具串行。
5. 第二次测试通过后，模型生成最终文本；外部仍可再次独立运行测试核对产物。

到这里，Function Call 从模型流中被解析为 Tool Call，经 Router 找到具体 Handler，按工具元数据并行或独占执行，再由有序 Future 按原调用顺序把结果写回 Context 并进入下一次采样——下一篇将沿命令执行路径继续分清 Exec Policy 的三值判断、用户审批能否请求额外权限，以及 Sandbox 如何准备实际隔离。

下一篇：[执行策略、审批与 Sandbox](04-exec-policy-sandbox.md)。
