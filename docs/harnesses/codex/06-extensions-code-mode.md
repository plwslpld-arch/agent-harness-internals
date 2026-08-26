# Skills、Hooks、Plugins、MCP 与 Code Mode 各扩展哪一层

[返回 Codex 课程地图](README.md)

前一篇分清了 Rollout、模型可见 History、Compaction 与跨线程 Memory，而历史接续以后，当前任务还能获得哪些扩展能力，就要看 Skill、Hook、Plugin、MCP/Connector 与 Code Mode 分别在哪一层介入。

Codex 的「扩展」并不是一个统一的插件回调，因为 Skill 主要提供按需加载的任务指令，Hook 订阅生命周期，Plugin 汇集一组能力来源，MCP/Connector 提供外部工具，而 Code Mode 改变的是模型调用这些工具的方式。

```text
Skill ─────→ 模型如何完成一类任务
Hook ──────→ 生命周期前后执行附加动作
Plugin ────→ 能力的安装与身份容器
MCP / App ─→ 外部服务与工具目录
Code Mode ─→ 用程序批量调度当前可见工具
```

排查扩展问题时，必须把「目录存在」「被发现」「已启用」「模型可见」「获准执行」和「执行成功」视为六个不同的检查点。

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

Skill 被列在目录中，不代表它的正文已经进入 Context，而即使正文进入了 Context，也不能说明依赖的工具已经连接成功。

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

不能因为所有 Hook 都写在同一份配置文件里，就假定它们都能阻断操作，因为判断一个 Hook 具有什么权限，仍要回到对应事件的消费代码中核对。

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

卸载 Plugin 时也要按照来源撤销能力，否则即使目录已经删除，旧的 Tool Catalog 仍可能留在活动 Session 中。

## MCP 与 Connector：连接成功后还要决定模型是否可见

MCP Manager 负责维护连接与 Tool Catalog Cache，而 Connector Runtime 还要处理策略、鉴权和运行时投影，因此外部服务器即使返回一个工具，也不代表当前模型就能调用它。

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

连接、目录发现、模型可见、调用授权和远端执行分别对应五个独立状态，所以错误信息需要明确指出失败发生在哪一层。

## Code Mode：把多次工具往返收进一个程序

Code Mode 会向模型暴露一个代码执行入口，程序再通过绑定调用现有工具，因此它适合读取多文件、聚合结果和执行带条件的批处理，却不应被理解成绕过 Tool Router 的宿主后门。

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

这两种行为之所以不同，是因为普通模式的目标只是优化工具使用，回退以后仍可保留原有能力，而 `code-mode-only` 要限制模型只能通过代码入口调用工具，一旦暴露直接 Shell 就会违反策略，所以宿主缺失时只能拒绝。

## 一次扩展故障应该怎样定位

当模型说「没有某工具」时，按顺序检查：

1. Plugin/Skill/MCP 配置是否被发现；
2. 来源是否被信任并启用；
3. 外部连接和鉴权是否成功；
4. 当前 Agent 的 Tool Catalog 是否把它投影为模型可见；
5. Skill 是否已经加载完整正文；
6. 调用时是否被 Approval 或 Sandbox 拒绝；
7. 远端工具是否返回业务错误。

理清单个 Agent 的扩展面以后，还要回答多个独立 Thread 怎样协作——父子身份如何保存，消息、等待、打断和回收又由谁控制？下一篇转向共享 `AgentControl` 的 Thread 树。

下一篇：[子 Agent 与线程树编排](07-subagents-orchestration.md)。
