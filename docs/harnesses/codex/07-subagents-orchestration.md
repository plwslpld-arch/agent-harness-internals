# 子 Agent 为什么是一棵 Thread 树，而不是一组函数调用

[返回 Codex 课程地图](README.md)

上一篇讲过，Code Mode（代码模式）会把多次工具往返收进一个程序，再通过绑定来调度当前可见的工具。如果一项任务要有自己的 Context、持久身份，还要能单独控制，你就不能只盯着工具调用了，得看子 Agent 怎样连成一棵 Thread 树。

每个 Codex 子 Agent 都有自己的 ThreadId（线程 ID）、Session、Turn（回合）、Context 和 Rollout（运行轨迹）。整棵树只共用一套控制面。这个控制面就是 `AgentControl`，它管容量，记父子关系，也负责传消息、等待、打断和回收节点。

```text
根 Thread
  ├─ 子 Thread：检索实现
  │    └─ 孙 Thread：核对测试
  └─ 子 Thread：检查安全边界

共享：AgentControl、容量约束、父子身份
独立：Session、Turn、Context、Rollout、停止状态
```

## 为什么不直接 `join_all()` 几个模型 Future

普通 Future（异步计算）只能帮你并发等待，却回答不了后面的事：子任务的历史写到哪里？父 Agent 到了下一个 Turn 怎样接着推进它，父任务取消后又是否要中断整棵子树？完成通知又该怎样找到当初那次委派？Thread 树给每项工作留下持久身份，再把这些需求交给明确的控制操作。

## 第 1 站：一棵根线程树只共享一个控制面

源码：[查看 `AgentControl` 的作用域](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/agent/control.rs#L101-L120)

```rust
/// An `AgentControl` instance is intended to be created at most once
/// per root thread/session tree and shared with every spawned sub-agent.
pub(crate) struct AgentControl { ... }
```

- **调用者**：根 Session 创建控制面，Spawn/Fork/通信工具复用它。
- **输入**：根线程配置、Agent Registry 和容量限制。
- **状态变化**：注册和更新整棵树的 Live Agent 节点。
- **返回**：供子 Agent 工具调用的共享控制接口。
- **下一站**：Spawn 在控制面中预留槽位并创建子 Thread。

这两件事不能混。整棵树可以共用控制面，各个节点却仍有自己的 Context，`AgentControl` 也不会把所有子 Rollout 都塞进父 Agent 的模型历史。

## 第 2 站：活动节点把身份、元数据和状态分开

源码：[查看 Agent 节点类型](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/agent/control.rs#L88-L99)

```rust
pub(crate) struct LiveAgent {
    thread_id: ThreadId,
    metadata: AgentMetadata,
    status: AgentStatus,
}

pub(crate) struct ListedAgent {
    agent_path: AgentPath,
    agent_status: AgentStatus,
}
```

- **调用者**：AgentControl 的列表、等待、通知和清理逻辑。
- **输入**：新子 Thread 与父子 Agent Path。
- **状态变化**：节点状态从创建、运行、Idle 到终态迁移。
- **返回**：面向调用者的路径与状态快照。
- **下一站**：父 Agent 可以 Wait、Follow-up、Interrupt 或读取结果。

`agent_path` 告诉你节点在树上的位置，`thread_id` 则标出它的持久身份，`status` 只记录这个节点眼下处于什么状态。列表序号不能代替它。

## Spawn 先预留容量，再开始昂贵创建

### 第 3 站：容量和继承在创建前确定

源码：[查看 Spawn 控制](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/agent/control/spawn.rs#L403-L448)

```rust
let agent_max_threads = config.effective_agent_max_threads(...);
let mut reservation = self.state.reserve_spawn_slot(...)?;
let inheritance = SpawnAgentThreadInheritance { ... };
```

- **调用者**：Spawn Agent 工具 Handler。
- **输入**：父 Thread、父 Turn、Prompt、Agent 配置和最大线程数。
- **状态变化**：原子预留一个树容量槽；构造明确的历史/配置继承描述；成功后发布子 Thread。
- **返回**：子 ThreadId 或类型化启动失败。
- **下一站**：子 Session 接收初始 Prompt，父端获得可等待的节点。

系统先占住名额，免得两个并发 Spawn 都看见「还剩一个名额」，随后一起挤过上限。失败就得退还名额。只要发布成功，子 Thread 就进入正常的节点生命周期，不能再当成从未创建过。

## 发送消息与打断是不同控制动作

### 第 4 站：是否触发新 Turn 是消息本身的契约

源码：[查看通信与中断](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/agent/control.rs#L211-L311)

```rust
let parent_turn_id =
    parent_turn_id.filter(|_| communication.trigger_turn);

Op::InterAgentCommunication { communication }
Op::Interrupt
```

- **调用者**：Follow-up、Send Message 和 Interrupt 工具。
- **输入**：发送者/接收者 ThreadId、内容、是否触发 Turn。
- **状态变化**：普通消息只进入通信记录；触发型消息可以唤起接收 Thread 的新 Turn；Interrupt 走取消路径。
- **返回**：提交结果和后续 Agent Events。
- **下一站**：接收 Session 处理消息，或 RunningTask 响应取消。

所以，「通知已送达」不代表子 Agent 已经跑了新一轮，Interrupt（中断）也不会删除 Thread，原来的历史和已经提交的输出都还在。

## 完成通知是父端输入，不是子结果本身

子 Agent 结束后，父 Rollout 会收到一条能关联到它的通知，子 Agent 自己的完整 Transcript（对话记录）仍保存在另一条 Rollout 里。

源码：[查看父子 Transcript 与通知测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/subagent_notifications.rs#L492-L516)

```rust
assert!(rollout.contains("<subagent_notification>"));
assert_ne!(parent_transcript_path, agent_transcript_path);
```

父 Agent 可以看着通知继续汇总。你若要复核工具具体跑过什么，就得去读子 Thread。父端改不了这份记录。一句「审查通过」，也抹不掉子端已经记下的错误和停止原因。

## 何时应该创建子 Agent

如果子任务要占用一段独立的长 Context，要用不同范围的工具，要并行探索，或者以后还得单独恢复，就适合创建子 Agent。若只是读两个小文件，结果又必须带回眼前的全部细节，甚至创建开销比任务本身还大，那就别创建，因为多 Agent 改变的是 Context 和控制结构，不会凭空提高质量。

到这里，Thread 树已经把子任务是谁、处于什么状态、该怎样控制讲清楚了。可同一套核心还要接入 CLI、Exec、App Server 等产品入口，下一篇就去核对各个接口面怎样投影事件，又为 Trace 和 Eval 留下了哪些证据。

下一篇：[产品表面、Trace 与 Eval 接缝](08-surfaces-trace-eval-design.md)。
