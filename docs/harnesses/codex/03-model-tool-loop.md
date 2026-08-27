# 模型响应怎样变成工具调用，再回到下一次采样

[返回 Codex 课程地图](README.md)

上一节把 Follow-up、Steer（中途引导）和新 Turn（回合）分别归到了 Thread、Task 和 Turn 的哪一层。现在边界清楚了，我们来看这个 Turn 里模型到底吐出了什么，其中可能有普通文本、Reasoning、Function Call 和其他 Item。Codex 不会只调用一次 Model 就打印文本。Tool Router 拿到解析出的 Function Call，交给工具执行，再按原来的调用身份把结果写回 Context。Turn 随后判断要不要继续采样。

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

假设一次 Response 提出 A、B、C 三个 Tool Call（工具调用），Agent Harness（智能体框架）可以让支持并行的工具同时执行，但下一次模型请求仍要按 A→结果 A、B→结果 B、C→结果 C 对齐。谁先执行完，和谁先写回历史，是两件事，协议里的写回顺序就在这里定下来。次序不能乱。

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

Router（路由器）只负责把模型协议里的对象转成框架内部调用。Shell、文件和 MCP 各自怎么执行，要看对应的 Handler，Approval（审批）与 Sandbox 则在更后面的链路上处理，所以一句「Router 允许了」把好几层都说混了。

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

并行标志只说明框架允许多个调用的 Body 同时运行，它不保证这些调用碰不到同一份业务资源。比如，两次文件写入都允许并行，仍可能争抢同一个路径，这类冲突得由 Handler 自己管住。

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

这就解释了慢工具为什么会造成 Head-of-Line 等待。即使 B 已经跑完，只要 A 还没结束，Codex 就不会让 B 的结果越过 A 写入历史，它用这段等待保住了可重放、稳定的协议顺序。

### 用测试确认你理解的并行不是「看起来同时开始」

源码：[查看上游批次断言](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/tool_parallelism.rs#L268-L298)

```rust
assert_eq!(function_calls.len(), 3);
assert_eq!(function_call_outputs.len(), 3);
assert!(*index < *output_index);
assert_eq!(call.1.get("call_id"), output.1.get("call_id"));
```

这还不够。

这里的断言只检查请求体怎么排列，以及 Call ID 是否一一对齐，若要证明多个 Body 真的同时运行，你还得看测试有没有设置屏障或时间窗口，能不能让多个 Handler 在同一时刻保持运行状态。

## 模型流重试与工具重试不是一回事

先看清到底在重试谁。

Provider 的 Stream（流）可能在响应尚未结束时断开，遇到这种情况，Codex 只会重连被归为可重试的 Error，次数也受 Provider 配置限制，工具已经落地的副作用则不能跟着模型流无条件重跑。

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

到这里，整条链已经走完。Codex 把模型流里的 Function Call 解析成 Tool Call，Router 找到对应 Handler，再按照工具元数据决定并行还是独占执行，有序的 Future 会按原调用顺序取出结果，写回 Context，然后开始下一次采样。下一篇沿命令执行路径往下读，看看 Exec Policy 怎样作出三值判断，用户审批怎样处理额外权限请求，Sandbox 又怎样准备真正的隔离环境。

下一篇：[执行策略、审批与 Sandbox](04-exec-policy-sandbox.md)。
