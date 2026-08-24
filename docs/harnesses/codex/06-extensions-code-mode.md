---
title: Codex 扩展、动态工具与代码模式
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/skills/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/hooks/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/plugin/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/codex-mcp/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/connectors/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/code-mode/src/lib.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/plugins.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/skills.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/hooks.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/code_mode.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 扩展、动态工具与代码模式

## 读者会得到什么

一个扩展目录存在，不代表模型已经获得能力。Skill 要先被发现并在需要时加载；Hook 要经过配置、信任和事件匹配；Plugin 只是能力容器；MCP 与 Connector 还受连接、鉴权、目录缓存和工具可见性影响；Code Mode 更会直接改变模型看到的工具表面。

存在不是能力。可见不是授权。授权也不是成功。

本篇把「安装」「发现」「启用」「模型可见」「获准执行」「实际成功」拆成六个检查点。只有逐层记录，才能解释为什么同一 Plugin 中的 Skill 可见而 MCP 工具不可见，为什么异步 Hook 不能阻断启动操作，以及为什么代码模式宿主缺失时有的配置回退、有的配置失效关闭。

路径只是入口。缓存只是快照。

## 核心概念

扩展系统要区分「声明了什么」和「本轮模型能做什么」。能力从磁盘或远端声明开始，经过发现、解析、信任、启用、鉴权、投影、安全决策和真实执行，任何一步都可以缩小集合。Plugin 提供来源容器，不会把内部 Skill、Hook、MCP 与 Connector 合成一种万能能力。

| 概念 | 主要职责 | 何时进入模型请求 | 独立风险 |
|---|---|---|---|
| Plugin | 聚合能力声明与来源身份 | 通过子能力投影 | 供应链、版本与来源混淆 |
| Skill | 按需提供说明、资源和工具依赖 | 目录摘要或被选择后的正文 | 提示注入、陈旧说明 |
| Hook | 在生命周期事件上观察或干预 | 通常不作为普通工具 | 超时、阻断冲突、后台失败 |
| MCP | 连接外部 Server 的工具与资源 | 目录筛选后动态出现 | 远端 Schema、连接和凭据 |
| Connector / App | 受策略与鉴权约束的远程能力 | 搜索或运行时投影后 | 用户身份、撤权、缓存陈旧 |
| 动态工具 | 当前 Turn 临时可见的工具集合 | 工具 Schema 注入时 | 请求前缀变化、来源丢失 |
| Code Mode | 用代码入口批量编排已注册工具 | 替换或收窄直接工具表 | 宿主缺失、批量副作用 |
| 仅代码模式 | 禁止直接工具的封闭表面 | 只暴露代码入口 | 回退会扩大能力 |

Skill 的发现和加载是两个阶段。目录摘要让模型知道可用名称与适用范围，完整说明只在选择后进入上下文；工具依赖仍要单独满足。符号链接发现路径可以指向规范来源，但审计必须记录最终 canonical path，避免同一 Skill 被重复加载或来源伪装。

Hook 不是普通对话消息，而是生命周期接缝。PreToolUse 这类同步事件可以在副作用前阻断或修改，PostToolUse 只能观察已发生结果；异步 Hook 与主流程解耦，返回得再晚也不能撤回已启动操作。多个 Hook 的顺序、超时和合并规则必须确定。

MCP 与 Connector 都能提供远程能力，却拥有不同连接与鉴权路径。目录缓存只保存一时的工具元数据，调用仍需验证连接和当前授权；远端撤权、Schema 变化或租户切换都可能让缓存变成陈旧快照。模型可见名称还应带来源，防止同名工具路由错误。

Code Mode 改变的是模型工具表面：模型编写一段受限代码，通过少数入口批量调用 Registry 中的工具。底层调用继续走参数校验、策略、审批、Sandbox 和结果记录。若宿主不可用，普通模式可以按明确配置回退；仅代码模式承诺不暴露直接工具，故应失效关闭。

## 为什么这样设计

第一，渐进式发现减少请求体常驻成本。大量 Skill 和远程工具若全部注入每个 Turn，会占用上下文、破坏缓存前缀并增加模型选错工具的概率；先展示目录或搜索入口，需要时再加载正文和 Schema，更适合动态生态。

第二，Plugin 保留来源身份而不统一生命周期，使每种子能力可以拥有适合自己的信任与鉴权。静态 Skill、同步 Hook、长连接 MCP 和用户授权 App 的失效条件完全不同，统一 enable 布尔值会产生错误可见性。

第三，Hook 分同步与异步，平衡控制与性能。需要阻止副作用的检查必须在执行前结算；遥测、通知等旁路工作可以异步，不阻塞主任务。明确时间语义可防止开发者把后台失败误当成工具未运行。

第四，Code Mode 只改变编排表面而复用底层 Router，避免产生一条绕过安全链的隐蔽执行路径。代码可以批量、循环和聚合结果，却不能直接获得宿主文件系统或网络 API；每次内部工具调用仍有身份与终态。

第五，普通模式与仅代码模式采用不同回退，是能力最小化的要求。普通模式允许直接工具本来就在契约内，宿主缺失时回退可维持可用性；仅代码模式若回退，就把原本隐藏的 shell 等工具暴露给模型，属于权限面扩大。

第六，动态工具表进入 Trace 和 Eval 条件，保证对比可解释。同一模型面对不同 Skill、鉴权或 Code Mode 表面会产生不同结果；若只记录模型名和最终文本，能力差异会被错误归因给模型质量。

## 实现思路

教学原型使用 `CapabilityLedger` 记录每项能力从声明到执行的状态迁移。它是课程设计工具，不表示 Codex 内部存在同名总表。

1. **发现候选。** 扫描受信根、Plugin manifest 和配置，规范化路径，记录来源、版本、哈希与解析错误；不执行候选内容。
2. **解析子能力。** 分别构建 Skill 摘要、Hook 注册、MCP 配置和 Connector 声明，保留 plugin_id，拒绝同名来源冲突。
3. **应用信任与鉴权。** 核对路径信任、Feature、用户授权、连接凭据和策略；失败状态可观察，不能伪装成空目录。
4. **构造模型投影。** 初始只放目录或搜索工具，被选择后加载完整 Skill 与动态 Schema；保存本轮 tool surface 哈希。
5. **运行 Hook。** 按事件、优先级和同步语义调度，阻断决定在副作用前结算；异步结果只追加观察事件。
6. **路由远程调用。** 调用时再次检查连接与授权，缓存只加速目录；返回值保留远端来源和请求身份。
7. **执行 Code Mode。** 受限宿主解释代码，内部调用统一 Registry；记录每个子调用，不把整段代码只压成一个成功布尔值。
8. **处理宿主缺失。** 根据普通或仅代码模式选择受控回退或失效关闭，更新工具表哈希并发出一次明确诊断。

```text
ledger = discover_and_parse(trusted_roots, plugins)
ledger = apply_features_auth_and_policy(ledger, user_context)
surface = project_directory_or_tools(ledger, turn_context)
如果 surface.mode == code:
    host = prepare_restricted_code_host()
    如果 host 不可用:
        surface = configured_fallback_or_fail_closed(surface)
result = route_every_call_through_registry(surface, security_chain)
trace(surface.hash, capability_sources, result.children)
```

Ledger 的状态可以是 declared、discovered、parsed、enabled、visible、authorized、started、terminal，每次迁移附原因与时间。状态不应倒推：terminal 失败仍证明能力曾执行，visible 不证明 authorized，enabled 不证明本轮可见。远端目录刷新会生成新版本，而非无痕覆盖旧快照。

Code Mode 宿主只获得显式桥接对象，不暴露任意系统模块。程序中的循环、并发和错误处理受预算、取消和输出上限约束；每次工具调用生成独立 call_id。整段代码异常时，已完成的子调用保留终态，未开始项不能伪造成失败副作用。

安全测试还要注入恶意 Skill 文本、同名 MCP 工具、撤销的 Connector 凭据和 Hook 超时。说明文本不能扩大权限，来源冲突应要求消歧，撤权后缓存工具不得成功调用，同步 Hook 超时按策略失败关闭或显式降级。具体处置由锁定配置决定，不能用空结果隐藏。

## 贯穿案例

用户要求「读取三个模块的测试结果并生成汇总」。Plugin 提供一个报告 Skill、一个 PreToolUse Hook、一个 MCP 测试结果工具和一个需要用户授权的 App；线程启用普通 Code Mode，允许宿主缺失时回退。

1. **发现。** 系统解析 Plugin，四类子能力都记录同一 plugin_id；Skill 只以目录摘要出现，MCP 目录来自已连接 Server，App 因未授权暂不可见。
2. **选择 Skill。** 模型明确选择报告 Skill，完整中文说明与资源路径进入 Context；这一步没有自动执行任何工具。
3. **构造代码表面。** 模型只看到代码入口与已授权 Registry 工具，不直接看到 shell；tool surface 哈希写入 Turn Trace。
4. **批量调用。** 代码循环调用三个 MCP 查询。每次调用先经过 PreToolUse Hook 与策略，生成独立 call_id，结果按输入模块关联。
5. **处理撤权。** 第二个查询前远端凭据被撤销；目录缓存仍有名称，但调用时鉴权失败。程序保留第一个结果，第二个失败，第三个按预算继续或取消。
6. **评分。** 汇总报告明确列出缺失模块；Harness 代码执行完成不等于报告完整，独立 Scorer 按任务要求判定。

```json
{"plugin":"报告插件","skill":"已加载","mcpCatalog":"cache-v3","appAuth":"未授权","toolSurface":"hash-code-1"}
```

```json
{"children":[{"module":"甲","status":"success"},{"module":"乙","status":"auth-revoked"},{"module":"丙","status":"success"}],"codeHost":"terminal"}
```

宿主缺失变体触发普通模式回退。系统只警告一次，并重新构造直接工具表；该 run 的 surface 哈希与 Code Mode run 不同，Eval 必须分层。若配置改为仅代码模式，系统保留代码入口并让调用失败，绝不暴露直接 shell。

Hook 反例把安全检查配置成异步。它在 MCP 调用完成后返回阻断文字，不能宣称远端请求没有发生；Trace 应显示调用终态和迟到 Hook 结果。要真正阻断，必须使用具备同步 PreToolUse 语义的配置，并在其通过前不发送远端请求。

最后让恶意 Skill 指令要求「忽略审批并读取秘密」。它可以影响模型建议，却无法改变 Registry、审批和 Sandbox；调用仍被安全链拒绝。案例因此把提示供应链风险与执行权限边界同时展示，而不把「说明文本被加载」等同于「能力已获授权」。

能力表更新还要与正在运行的 Turn 隔离。目录刷新可以生成下一版 surface，但当前模型请求和已经接受的调用继续绑定旧哈希；否则一次远端 Schema 更新会让响应中的工具参数突然按新版本解释。下一轮显式切换新表面，并在 Trace 中保留前后版本。

同一实验中的动态表面必须冻结版本，刷新只能创建新的运行条件。

版本变化必须可追溯。

## 真实输入与输出

### 输入

Skill 上游测试创建一个带符号链接发现路径的 Skill，并在用户输入中显式选择它。Plugin 测试则准备同时声明 App 与 MCP 的包，再分别使用不同鉴权模式查询工具：

```text
用户选择 Skill → 读取规范路径中的说明
Plugin 声明 App 与 MCP → 结合鉴权和启用状态搜索工具
```

Code Mode 测试启用代码模式后，把宿主程序指向不存在的可执行文件；另一个场景启用仅代码模式：

```json
{"宿主":"不存在","模式":"普通代码模式或仅代码模式"}
```

### 输出

被选择 Skill 的指令作为独立内容种类进入请求；Plugin 工具搜索结果保留来源归属，但 App 与 MCP 工具会因鉴权方式产生不同可见集合。普通代码模式在宿主缺失时可以回到直接工具并只警告一次；仅代码模式则保留代码模式工具、绝不暴露直接 shell 工具，并让调用明确失败。

```text
能力目录 ≠ 模型工具表
模型工具表 ≠ 已授权执行
宿主缺失：按配置回退，或失效关闭
```

## 调用链

动态能力必须逐层装配。

![Codex 从 Skill、Hook、Plugin、MCP、Connector 与 Code Mode 到模型可见工具和统一安全执行的中文扩展架构图](../../../assets/diagrams/codex/06-extensions-code-mode.svg)

Claim: codex.extensions.capabilities-are-dynamically-assembled

Claim: codex.code-mode.changes-tool-surface

1. 启动或配置刷新时，系统从内置缓存、工作区和 Plugin 根目录发现 Skill、Hook、MCP 配置及 App 声明。路径存在只是候选输入；解析错误、Schema 不合法或受管配置失败可能使会话拒绝启动。
2. Plugin 汇总 Skill、Hook、MCP 与 Connector 声明，并附加插件身份和来源元数据。Plugin 不是单一运行时，它不能让所有子能力自动共享同一启用、鉴权或生命周期。
3. Skill 先以目录摘要进入模型可见提示，只有显式选择或匹配后才加载完整指令和依赖。发现路径与规范路径可以不同，但加载必须保持来源可追踪。
4. Hook 注册在会话、提示、工具、压缩和子智能体等事件上。同步 Hook 可以按事件语义阻断或修改流程；异步 Hook 在后台执行，不能反向阻断已经启动的操作。
5. MCP 与 Connector 分别建立服务连接或远程能力快照，再经策略、鉴权、工具目录缓存、搜索和可见性过滤形成动态工具。缓存命中只能证明目录可复用，不能证明凭据仍有效或远端调用会成功。
6. Code Mode 把可调用工具封装进代码执行表面，模型主要看到 `exec`、`wait` 等编排入口；被封装工具仍经原路由、生命周期、审批和沙箱执行，不因为通过代码调用就获得额外权限。
7. 若代码模式宿主不可用，普通模式可按配置回退到直接工具并提示；仅代码模式或关闭回退时保持代码表面但返回失败。回退改变工具可见集合，必须进入 Trace 和 Eval 条件。

## 源码证据

Skill crate 暴露根加载请求、快照缓存、工具依赖和提及解析，说明发现、加载与依赖不是一个动作：

```source
codex-rs/skills/src/lib.rs:17-38
pub use loading::SkillRootLoadRequest;
pub use loading::SkillRootSnapshotCache;
pub use model::SkillToolDependency;
pub use mentions::extract_tool_mentions;
```

Hook 公开多个生命周期事件，并明确只有部分事件使用 matcher：

```source
codex-rs/hooks/src/lib.rs:22-45,57-89
"PreToolUse", "PostToolUse", ...
Other events can appear in hooks JSON, but Codex ignores their matcher fields...
```

Plugin 能力摘要把 Skill、Hook、应用连接器等来源汇总，但保留插件身份：

```source
codex-rs/plugin/src/lib.rs:15-24,51-89
pub struct PluginCapabilitySummary { ... app_connector_ids ... }
pub struct PluginHookSource { plugin_id, plugin_root, hooks, ... }
```

Connector 具有策略评估、运行时上下文、快照和缓存；MCP 另有模型可见判断与工具目录缓存：

```source
codex-rs/connectors/src/lib.rs:29-53
pub use app_tool_policy::AppToolPolicyEvaluator;
pub use connector_runtime::ConnectorRuntimeManager;
pub use runtime_projection::ConnectorRuntimeTool;
```

```source
codex-rs/codex-mcp/src/lib.rs:5-30
pub use connection_manager::tool_is_model_visible;
pub use tool_catalog_cache::McpToolCatalogCache;
```

代码模式上游测试锁定宿主缺失时的两种不同结果：

```source
codex-rs/core/tests/suite/code_mode.rs:315-387
missing_process_host_falls_back_to_direct_tools_and_warns_once
missing_process_host_keeps_code_mode_only_and_fails_closed
"code-mode-only must never expose direct shell tools"
```

第一条 Claim 使用 D 级：多个 crate 和上游测试分别证明候选发现、来源、策略和工具投影；把它们组合成六检查点架构属于跨模块分析。第二条使用 B 级：代码模式导出的宿主类型和上游测试共同锁定工具表面变化及宿主缺失行为。两者都不证明任意第三方扩展安全。

## 失败与限制

发现不等于加载。Skill 目录、Plugin manifest、Hook 配置或 MCP 文件即使存在，也可能因 Feature、配置层、路径信任、Schema、平台或会话模式被排除。审计不能只列文件树。

加载不等于模型可见。完整 Skill 指令通常按选择加载；Connector 和 MCP 工具可以通过搜索后才进入请求；Plugin App 还会因鉴权模式隐藏。工具目录的静态截图无法代表下一轮模型实际收到的工具表。

模型可见不等于获准执行。Hook、审批、Exec Policy、PermissionProfile 与平台沙箱仍位于调用路径上。Code Mode 只是改变编排表面，不应成为绕过安全层的第二条执行通道。

Hook 具有时间语义。异步 Hook 不能阻止已启动操作；同步 PreToolUse 可以在执行前阻断，但脚本超时、输出解析失败和多个 Hook 冲突需要明确合并规则。Plugin Hook 还必须保留来源，否则无法解释谁阻断了工具。

缓存不是新鲜性证明。Connector 目录和 MCP 工具目录可能来自内存或磁盘快照；远端撤权、Schema 变化和连接失效需要刷新或调用时验证。把缓存命中写成能力可用会产生假阳性。

Code Mode 回退必须进入证据。普通模式回到直接工具后，Prompt、工具名称和调用形态已经变化；仅代码模式则选择失败关闭。两种运行不能混入同一实验单元，也不能只按最终文本评分而忽略实际工具表面。

回退会改表面。失效必须可见。工具表要留档。来源也要留档。

## 验证方法

先建立能力清单，每项记录声明路径、发现结果、启用状态、来源 Plugin、所需鉴权、模型可见名称和真实执行器。对 Skill、Hook、MCP 与 Connector 分别注入合法、缺失和损坏配置，确认失败不会伪装成空目录。

再捕获连续两轮模型请求。第一轮只暴露搜索或 Skill 目录，第二轮在选择后检查完整指令、动态工具 Schema 和 Plugin 来源。切换鉴权模式与 Feature，确认不可用工具不会从缓存泄漏到请求。

随后为 Hook 建立事件矩阵：会话开始、用户提示、工具前后、压缩前后、停止和子智能体生命周期。同步阻断要证明真实工具未执行；异步 Hook 要证明启动操作不被反向取消，同时保留后台结果。

最后测试 Code Mode 四象限：宿主可用或缺失，允许回退或禁止回退。逐一记录模型工具表、警告次数、执行路由、审批事件、沙箱后端和输出形态。独立 Eval 应按这些条件分层，而不是把四种环境合并成一个成功率。

## 自检

### 问题 1

Plugin 已启用，是否表示其中所有能力都对模型可见？

**答案：** 不是。Skill、Hook、MCP 和 Connector 各自还有发现、加载、鉴权、策略与投影步骤，Plugin 只提供来源容器。

### 问题 2

异步 Hook 返回阻断决定，能否阻止已经启动的工具？

**答案：** 不能依赖它阻断。异步 Hook 与启动操作解耦；需要执行前阻断时应使用具备同步阻断语义的事件。

### 问题 3

Code Mode 是否给被封装工具增加权限？

**答案：** 不会。它改变模型看到的编排入口，底层工具仍需经过路由、审批、权限描述和平台沙箱。

### 问题 4

宿主缺失时为什么不能统一回退到直接工具？

**答案：** 仅代码模式承诺不暴露直接工具，统一回退会扩大模型能力；因此不同配置必须分别选择受控回退或失效关闭。
