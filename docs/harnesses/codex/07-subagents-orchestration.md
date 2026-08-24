# 子 Agent 为什么是一棵 Thread 树，而不是一组函数调用

[返回 Codex 课程地图](README.md)

Codex 的子 Agent 拥有独立 ThreadId、Session、Turn、Context 和 Rollout。根线程树共享一个 `AgentControl`，用它限制容量、保存父子关系、传递消息、等待、打断和回收节点。

```text
根 Thread
  ├─ 子 Thread：检索实现
  │    └─ 孙 Thread：核对测试
  └─ 子 Thread：检查安全边界

共享：AgentControl、容量约束、父子身份
独立：Session、Turn、Context、Rollout、停止状态
```

## 为什么不直接 `join_all()` 几个模型 Future

普通 Future 只解决并发等待，无法回答：子任务历史写到哪里、父 Agent 如何在下一个 Turn 继续它、取消父任务是否中断全部子树、完成通知如何关联原始委派。Thread 树把这些问题变成持久身份和控制操作。

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

控制面共享不代表上下文共享。它知道每个节点的身份和状态，但不会把所有子 Rollout 合并进父模型历史。

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

`agent_path` 表达树位置，`thread_id` 表达持久身份，`status` 只是某一时刻的状态。界面不能用列表序号替代 ThreadId。

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

先预留防止两个并发 Spawn 都看到「还剩一个名额」并一起超限。创建失败要释放 Reservation；已经发布后则进入正常节点生命周期，不能再当作从未发生。

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

因此「通知已送达」不是「子 Agent 已运行新一轮」，Interrupt 也不是删除 Thread。历史和已提交输出仍然保留。

## 完成通知是父端输入，不是子结果本身

子 Agent 结束后，父 Rollout 会收到关联通知；子 Agent 自己的完整 transcript 在另一条 Rollout 中。

源码：[查看父子 Transcript 与通知测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/subagent_notifications.rs#L492-L516)

```rust
assert!(rollout.contains("<subagent_notification>"));
assert_ne!(parent_transcript_path, agent_transcript_path);
```

父 Agent 可以根据通知继续汇总，但复核具体工具轨迹时应读取子 Thread。父端一句「审查通过」不会改写子端的错误或停止原因。

## 何时应该创建子 Agent

适合：子任务需要独立长上下文、不同工具范围、可并行探索或需要以后单独恢复。不适合：只读取两个小文件、结果必须共享当前细节、创建开销超过任务本身。多 Agent 是上下文与控制结构选择，不是自动质量增益。

下一篇：[产品表面、Trace 与 Eval 接缝](08-surfaces-trace-eval-design.md)。
