# Skills、Hooks、Plugins、MCP 与 Code Mode 各扩展哪一层

[返回 Codex 课程地图](README.md)

前一篇已经分清 Rollout（运行轨迹）、模型能看到的 History（历史记录）、Compaction 和跨线程 Memory。旧历史接上以后，当前任务还能得到哪些额外能力，取决于 Skill、Hook、Plugin、MCP/Connector 和 Code Mode 各自插在流程的哪一层。

别把 Codex 里的「扩展」想成一套统一的插件回调。Skill 在任务用到时提供指令，Hook 盯住生命周期中的特定节点，Plugin 把多种能力装在一起，MCP/Connector 接入外部 Tool，Code Mode 则让模型改用程序来编排这些工具。

它们改动的地方不同。

```text
Skill ─────→ 模型如何完成一类任务
Hook ──────→ 生命周期前后执行附加动作
Plugin ────→ 能力的安装与身份容器
MCP / App ─→ 外部服务与工具目录
Code Mode ─→ 用程序批量调度当前可见工具
```

排查扩展故障时，你得沿着六个检查点逐项确认：目录存在、系统发现、配置启用、模型可见、权限放行、执行成功。前一项通过，只能说明流程可以往后走，证明不了后一项也正常。

## Skill：先发现，再在任务需要时加载

### 第 1 站：Skill 模块同时维护根加载、快照与工具依赖

源码：[查看 Skill 公共接口](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/skills/src/lib.rs#L17-L38)

```rust
pub use loading::SkillRootLoadRequest;
pub use loading::SkillRootSnapshotCache;
pub use model::SkillToolDependency;
pub use mentions::extract_tool_mentions;
```

- **调用者**：Session 启动、Skill 发现与显式提及处理。
- **输入**：Skill Roots、任务文本和缓存快照。
- **状态变化**：发现候选 Skill，解析元数据与依赖；需要时才读取完整指令。
- **返回**：可展示目录或注入当前任务的 Skill 内容。
- **下一站**：Prompt 构造加入被选中的 Skill，工具表核对依赖是否可用。

Skill 出现在目录里，只能说明发现阶段认出了它。系统还要按任务需要读取正文，把内容放进 Context，并检查它依赖的工具是否可用。目录里看得见，模型不一定看得见。

## Hook：观察或干预明确的生命周期点

### 第 2 站：不同 Hook 事件拥有不同 Matcher 语义

源码：[查看 Hook 事件定义](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/hooks/src/lib.rs#L22-L89)

```rust
// 公开的事件包括 PreToolUse、PostToolUse 等。
// 某些其他事件即使在 JSON 中带 matcher，也会忽略该字段。
```

- **调用者**：工具执行、Session 生命周期或其他 Hook 发射点。
- **输入**：事件载荷、配置的 Command 与 Matcher。
- **状态变化**：同步 Hook 可能影响当前动作；异步 Hook 只在旁路运行。
- **返回**：允许、拒绝、附加上下文或诊断结果，取决于具体事件契约。
- **下一站**：原生命周期继续，Hook 结果按该事件的规则合并。

所有 Hook 即使写在同一份配置文件里，能做的事也可能完全不同。要判断某个 Hook 能不能拦住操作，你仍得找到消费对应 Event 的代码，看它怎样处理这个 Hook 返回的结果。

配置长得像，权限未必一样。

## Plugin 是来源容器，不是单一执行引擎

### 第 3 站：能力摘要保留 Plugin 身份与不同能力种类

源码：[查看 Plugin Capability Summary](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/plugin/src/lib.rs#L15-L89)

```rust
pub struct PluginCapabilitySummary {
    // Skill、Hook、App Connector 等能力摘要
}

pub struct PluginHookSource {
    plugin_id: ...,
    plugin_root: ...,
    hooks: ...,
}
```

- **调用者**：Plugin Loader 与能力目录。
- **输入**：一个 Plugin Root 及其 Manifest/子目录。
- **状态变化**：发现能力并保留来源 Plugin ID，方便权限、诊断和卸载。
- **返回**：分类后的能力摘要。
- **下一站**：Skills、Hooks、Connector 等各自进入自己的加载器。

卸载 Plugin 时，加载器还得按来源撤掉它贡献的每项能力。只删目录不够，旧的 Tool Catalog 仍可能留在正在运行的 Session 里，让当前任务继续看到已经卸载的工具。

## MCP 与 Connector：连接成功后还要决定模型是否可见

MCP Manager（管理器）维护连接和 Tool Catalog Cache，Connector 的 Runtime（运行时）则继续处理策略、鉴权和工具投影。外部 Server 返回了一个工具，只能证明目录里有它，还不能证明当前模型有权调用它。

源码：[查看 MCP 可见性与目录缓存导出](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/codex-mcp/src/lib.rs#L5-L30)

```rust
pub use connection_manager::tool_is_model_visible;
pub use tool_catalog_cache::McpToolCatalogCache;
```

- **调用者**：MCP 连接管理与 Tool Schema 构造。
- **输入**：Server Catalog、当前配置和工具元数据。
- **状态变化**：缓存目录，并过滤当前模型不可见的工具。
- **返回**：可合并进 Tool Registry 的定义。
- **下一站**：Tool Router 在调用时仍执行审批与外部请求。

从连上服务器到拿到业务结果，中间至少隔着五个状态：连接建立、目录发现、模型可见、调用获准、远端执行。报错时必须说清卡在哪一层，否则你很容易拿着鉴权问题去查 Tool Schema，或拿着可见性问题去重启服务器。

## Code Mode：把多次工具往返收进一个程序

Code Mode 会给模型一个代码执行入口，模型写出的程序再通过绑定去调用现有工具。要读很多文件、汇总结果，或者按条件跑一批操作，这种方式很合适。但它仍会经过 Tool Router（工具路由器），没有多出一条直通宿主的后门。

### 第 4 站：宿主缺失时的回退取决于配置模式

源码：[查看 Code Mode 宿主缺失测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/code_mode.rs#L315-L387)

```rust
// 普通模式：缺少 Process Host 时回退到直接工具并警告一次。
// code-mode-only：绝不暴露直接 Shell 工具，而是失效关闭。
```

- **调用者**：Tool Registry 构造阶段。
- **输入**：Code Mode 配置、Process Host 可用性和直接工具集合。
- **状态变化**：选择 Code Mode 工具面、回退面或 Fail-Closed 面。
- **返回**：本轮模型实际可见的 Tool Schemas。
- **下一站**：模型生成普通 Tool Call 或 Code Program。

普通模式启用 Code Mode，只是想减少模型和工具来回往返。Process Host（宿主）缺失时退回直接工具，原来的能力还在。`code-mode-only` 则明确要求模型只能走代码入口，如果这时暴露直接 Shell，就违反了配置给出的限制，因此系统只能拒绝继续。

配置决定了退路。

## 一次扩展故障应该怎样定位

当模型说「没有某工具」时，按顺序检查：

1. Plugin/Skill/MCP 配置是否被发现；
2. 来源是否被信任并启用；
3. 外部连接和鉴权是否成功；
4. 当前 Agent 的 Tool Catalog 是否把它投影为模型可见；
5. Skill 是否已经加载完整正文；
6. 调用时是否被 Approval 或 Sandbox 拒绝；
7. 远端工具是否返回业务错误。

单个 Agent 能看到哪些扩展，现在已经有了排查顺序。下一篇要处理多个独立 Thread 怎样协作：谁保存父子身份，谁负责发消息、等待、打断和回收。答案要从它们共享的 `AgentControl` 往下找。

下一篇：[子 Agent 与线程树编排](07-subagents-orchestration.md)。
