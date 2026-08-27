# Session、Resume 与外部 Store

[返回 Claude 课程地图](README.md)

Hook 已经能在一次运行里按事件串起记录，但要跨轮次继续，你还得知道历史归谁、该从哪里恢复。历史必须有归属。因此这一篇沿着 Session 标识、Resume（恢复）和外部 Store，看状态怎样接着走下去。

只放回上一轮回答还不够。运行时还要认出原来的会话，找到 CLI 保存在本地的 Transcript，确定从哪里续接，并处理分叉、子 Agent 记录和可选的外部持久化。Python SDK 的 `SessionStore` 也不会拿外部数据库直接替掉 Claude Code 的本地历史文件，它只负责镜像记录，并在恢复时做适配。

## 先区分三个概念

| 概念 | 解决的问题 |
| --- | --- |
| `session_id` | 当前消息和哪条会话关联 |
| `resume` / `continue_conversation` | 新进程从哪段已有历史继续 |
| `SessionStore` | 怎样把 Transcript 副本写到外部存储，并在恢复前取回 |

`continue_conversation=True` 会选择最近的会话，`resume=<id>` 会指定一条会话，`fork_session=True` 则沿用旧历史再开出新的会话分支。它们会改变后续历史写到哪里，不能只当成几个普通的字符串标签。

## SessionStore 保存的是不透明记录

外部 Store 不用读懂并改写每一种 Transcript 行，因为公开类型只强制要求 `type`，其余字段都会作为 JSON 对象原样传过去。

### 第 1 站：Store 契约要求可往返，不要求字节完全相同

源码：[查看 SessionStoreEntry 与 Protocol](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1515-L1645)

```python
class SessionStoreEntry(TypedDict, total=False):
    type: Required[str]
    uuid: str
    timestamp: str

class SessionStore(Protocol):
    async def append(self, key, entries) -> None: ...
    async def load(self, key) -> list[SessionStoreEntry] | None: ...
```

- **调用者**：SDK 的 Transcript 镜像器调用 `append()`，恢复材料化流程调用 `load()`。
- **输入**：由 project、session 和可选 subpath 组成的 Key，以及不透明 JSON 记录。
- **状态变化**：Adapter 将副本写入外部系统，或从外部系统读取完整会话。
- **返回**：`append()` 无业务结果；`load()` 返回记录列表或不存在。
- **下一站**：镜像写入不会替代 CLI 本地写入；恢复时返回值会被写到临时 JSONL。

Protocol 的注释说得很清楚：子进程仍把记录写到本地磁盘，Adapter（适配器）拿到的是另一份副本。至于外部存储保留多久、怎样满足合规要求、何时删除，都由 Adapter 自己负责，SDK 不会跟着本地清理策略自动删掉外部副本。

## 镜像为什么要批量写

流式运行会频繁产生 Transcript 帧，如果每一帧都同步等待远程数据库，Store 的延迟就会卡住消息处理。落盘没有这么快。SDK 默认采用 `batched`，等 Result 出现或缓存超过阈值再刷新。`eager` 虽然更早触发后台刷新，也不能保证每条记录都已经永久落盘。

源码：[查看镜像批处理构造](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/session_resume.py#L97-L127)

```python
eager = flush_mode == "eager"
return TranscriptMirrorBatcher(
    store=store,
    projects_dir=projects_dir,
    on_error=on_error,
    max_pending_entries=0 if eager else MAX_PENDING_ENTRIES,
    max_pending_bytes=0 if eager else MAX_PENDING_BYTES,
)
```

所以看到模型已经输出，不等于外部 Store 也追到了同一位置。需要强一致审计时，要在 Result 出现和运行关闭的路径上等待 flush，同时记下镜像错误。否则数据库里暂时没有记录，只能说明镜像还没写到那里，不能断定本轮什么也没发生。

### 第 2 站：Client 在启动 CLI 前决定是否材料化

源码：[查看长连接 Client 的恢复入口](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/client.py#L81-L119)

```python
validate_session_store_options(self.options)
self._materialized = (
    await materialize_resume_session(self.options)
    if self._custom_transport is None
    else None
)
```

- **调用者**：`ClaudeSDKClient.connect()`。
- **输入**：包含恢复选项、Store、工作目录和超时的 Options。
- **状态变化**：先校验不兼容组合；默认 Transport 路径可能创建临时配置目录。
- **返回**：材料化结果保存在 Client 上；自定义 Transport 跳过这一过程。
- **下一站**：材料化 Options 指向临时 `CLAUDE_CONFIG_DIR`，Transport 再启动 CLI。

自定义 Transport 会跳过这一步，因为调用方已经把它构造好了，SDK 就算改写临时配置，也未必能把配置送到对端。架构说明必须写清这个条件，不能笼统地说「设置 SessionStore 就一定支持 Resume」。

### 第 3 站：恢复先从 Store 取回，再生成临时本地结构

源码：[查看恢复材料化](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/session_resume.py#L130-L200)

```python
if options.resume is not None:
    resolved = await _load_candidate(store, project_key, options.resume, timeout_s)
else:
    resolved = await _resolve_continue_candidate(store, project_key, timeout_s)

tmp_base = Path(tempfile.mkdtemp(prefix="claude-resume-"))
project_dir = tmp_base / "projects" / project_key
_write_jsonl(project_dir / f"{session_id}.jsonl", entries)
```

- **调用者**：Client 在创建默认子进程前调用 `materialize_resume_session()`。
- **输入**：Store、明确 Session ID 或 continue 语义、project key 和读取超时。
- **状态变化**：选择候选会话，创建临时目录，写入主 Transcript，并可能材料化子 Agent 记录和认证文件。
- **返回**：`MaterializedResume`，包含临时目录、实际恢复 ID 和清理协程；无可用历史时返回 `None`。
- **下一站**：`apply_materialized_options()` 把 CLI 配置目录指向临时位置，运行结束后清理。

这条链路解释了外部 Store 和 Runtime（运行时）数据库为什么不能画等号：CLI 仍按原来的本地恢复机制读取 JSONL，SDK 只是在启动前取回外部记录，并把它们重新写成 CLI 认识的目录结构。

## 外部 Key 不能直接当路径

子 Agent 的 subpath 来自外部 Store，如果不做检查就直接拼到临时目录后面，恶意或损坏的数据便可能借助绝对路径、`..`、Windows 盘符或空字符串逃出目标目录。

### 第 4 站：恢复时验证 subpath

源码：[查看安全路径检查](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_internal/session_resume.py#L591-L623)

```python
if not subpath:
    return False
if Path(subpath).is_absolute() or subpath.startswith(("/", "\\")):
    return False
if ntpath.splitdrive(subpath)[0]:
    return False
if any(p in (".", "..") for p in re.split(r"[\\/]", subpath)):
    return False
```

- **调用者**：子 Agent Transcript 材料化循环。
- **输入**：Store 返回的 subpath 和目标 Session 目录。
- **状态变化**：只对通过验证的记录创建 JSONL 或元数据文件；危险路径被跳过并告警。
- **返回**：安全布尔判断。
- **下一站**：安全路径对应的记录才写入临时配置，再供 CLI 恢复。

任何由外部持久化系统返回的路径都应当按不可信输入处理，即使数据最初是自己写进去的，也要同时用 POSIX 和 Windows 的路径规则检查。这个检查不能省。

## Store 实现至少要满足的约束

1. 同一进程内保持 append 调用顺序。
2. 有 UUID 的记录应按 UUID 幂等写入；无 UUID 的标记不能随意去重。
3. `load()` 返回的对象要与写入记录深度相等，但 JSON 键顺序可以不同。
4. 超时、部分失败和重试要可观察；不能默默丢批次。
5. 自己实现外部保留、删除、加密和访问控制。
6. Resume 前验证 project key、Session ID 和 subpath。

SDK 提供了 Store conformance 测试入口。你自己为 Redis、PostgreSQL 或对象存储编写 Adapter 时，应先跑契约测试，再用真实并发和故障注入来检验实现。

## Session 恢复不是质量证明

恢复成功只能说明运行时加载了旧历史，并开始了一次新的运行。它不能保证旧任务目标依然适用，也不能保证工作区、工具权限和模型版本都没有变化，更不能证明最终答案正确。因此 Artifact（产物）还要记下恢复来源、父 Session、分叉 ID、工作区基线，并接受新的独立 Eval。

Session 和 Store 解释了历史怎样延续，却还没说明一次运行怎样加入新的能力和角色。下一篇会分别看 MCP Server、Agent Definition（智能体定义）和 Skill 各自怎样进入运行。

下一篇：[MCP、Agents 与 Skills：三种扩展机制怎样进入运行](08-mcp-agents-skills.md)。
