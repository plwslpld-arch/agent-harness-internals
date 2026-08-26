# OpenCode 源码课程

[返回学习入口](../../00-start-here.md)

OpenCode 以服务化 Session 为核心，其中 Project 和 Config 负责选择运行上下文，Provider 建立模型接口，Session Prompt 驱动主循环，Processor 消费模型流和工具结果，最后再由 Server 与 Protocol 把同一核心暴露给多个客户端。

![OpenCode 系统地图](../../../assets/diagrams/opencode/system-architecture.svg)

## 这条课程适合谁

如果你想理解一个 Agent 核心怎样作为服务被 TUI、Desktop、Web 和协议客户端共享，可以选择 OpenCode，因为它在最小 Loop 之外加入了 Project、Server 和持久化边界，正好适合已经完成基础导读的读者。

## 锁定来源

课程基于 OpenCode 提交 `3a31c4ea801915c0b050df4b3842997ea62b6e93`：

- [程序入口](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/index.ts)
- [Session Prompt](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/prompt.ts)
- [Session Processor](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/processor.ts)
- [模型调用层](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/session/llm.ts)
- [Protocol API](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/protocol/src/api.ts)

## 先看一项任务

客户端在某个 Project 中创建或选择 Session 之后，Prompt 主链会先组合消息、Agent 配置和工具，再向 Provider 发起模型请求。随后由 Processor 处理流式事件和工具状态，而权限询问通过 Session 事件到达客户端，得到的结果会继续写回 Session。

```text
TUI / Desktop / Web / ACP
  → Server / Protocol
  → Project 与 Session
  → Prompt / LLM
  → Processor 与 Tools
  → Permission / Question
  → Message Store 与下一轮
```

![OpenCode 端到端任务流程](../../../assets/diagrams/opencode/end-to-end-task.svg)

图中客户端只负责展示询问和结果，真正的 Session 状态仍由服务核心维护——接入多个客户端并不等于复制多份 Agent Loop。

## 仓库地图

| 区域 | 首轮关注点 |
| --- | --- |
| `packages/opencode/src/project` 与 Config | 工作区和配置怎样建立 |
| `packages/opencode/src/provider` | 多 Provider 怎样归一化 |
| `packages/opencode/src/session` | Prompt、LLM、Processor、消息和压缩 |
| Tools 与 Permission | 工具副作用和用户询问 |
| Agent、Skills、Plugins、MCP、LSP | 运行时扩展和上下文来源 |
| `packages/server` 与 `packages/protocol` | 多客户端怎样共享服务核心 |
| TUI、Desktop、Web、ACP | 同一事件在不同表面怎样呈现 |

Permission 规则和用户询问虽然能够控制产品行为，却不会自动构成操作系统 Sandbox，真正的隔离仍取决于宿主或另行配置的执行环境。

## 三层读法

- **Starter**：先读 Runtime、Session Prompt 和工具权限，跟完一次请求。
- **Builder**：继续读 Storage、Compaction、Revert 与扩展，解释状态怎样被改写。
- **Maintainer**：检查 Server、Protocol、Share、Telemetry 与多客户端一致性边界。

## 阅读顺序

1. [Runtime、Project、Config 与 Provider](01-runtime-config-provider.md)
2. [Session Prompt、LLM 与 Processor](02-session-llm-processor.md)
3. [Tools、Permission、Question 与 Patch](03-tools-permission-patch.md)
4. [Storage、Compaction 与 Revert](04-storage-compaction-revert.md)
5. [Agents、Skills、Plugins、MCP 与 LSP](05-extensions-subagents.md)
6. [Server、Protocol 与多产品表面](06-server-protocol-surfaces.md)
7. [Share、Telemetry 与 Eval 边界](07-share-telemetry-eval.md)

## 用贯穿任务复盘

从客户端选择 Server/Directory 开始，依次说明 Project/Config/Provider 怎样建立实例，Session Prompt 怎样驱动 LLM 与 Processor，Permission Question 怎样到达客户端，Message/Part 怎样持久化，Compaction/Revert 如何改变有效历史，以及多种产品表面如何从同一 Server 读取事实。

最后还要分别判断 Share 同步、OpenTelemetry Span、Session Idle 和独立测试各自能证明什么，因为它们虽然都可以关联同一 Session，却不能互相替代。

## 完成课程后应该能回答

- Project、Config、Provider 和 Session 的创建顺序。
- Prompt 怎样形成模型请求，Processor 怎样消费结果。
- 工具和权限事件怎样跨服务端与客户端。
- Message、History、Compaction 和 Revert 如何改变 Session。
- 多种产品表面共享了哪些协议和状态。
- Share、Telemetry 和测试能支持哪些核对，哪些仍需外部 Eval。

[从第一篇开始：Runtime、Project、Config 与 Provider](01-runtime-config-provider.md)
