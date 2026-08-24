# Session、Resume 与外部 Store

[返回 Claude 课程地图](README.md)

Session 不是「把上一轮回答再放进 Prompt」这么简单。它同时涉及会话标识、CLI 本地 Transcript、恢复位置、分叉语义、子 Agent 记录，以及可选的外部持久化。Python SDK 的 `SessionStore` 也不是用外部数据库直接替换 Claude Code 的本地历史文件，而是提供镜像与恢复适配层。

## 先区分三个概念

| 概念 | 解决的问题 |
| --- | --- |
| `session_id` | 当前消息和哪条会话关联 |
| `resume` / `continue_conversation` | 新进程从哪段已有历史继续 |
| `SessionStore` | 怎样把 Transcript 副本写到外部存储，并在恢复前取回 |

`continue_conversation=True` 表示选择最近会话；`resume=<id>` 指定会话；`fork_session=True` 则从旧历史出发但创建新的会话分支。它们不是普通字符串标签，而会改变历史所有权。

## SessionStore 保存的是不透明记录

外部 Store 不应该理解并重写每种 Transcript 行。公开类型故意只要求 `type`，其余字段按 JSON 对象透传。

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

Protocol 注释明确：子进程仍写本地磁盘，Adapter 收到第二份副本。外部存储的 TTL、合规保留和删除是 Adapter 责任，SDK 不会因为本地清理策略自动删除外部副本。

## 镜像为什么要批量写

流式运行可能频繁产生 Transcript 帧。如果每帧都同步等待远程数据库，Store 延迟会进入消息热路径。SDK 默认使用 `batched`：在 Result 或缓存超过阈值时刷新；`eager` 会更快触发后台刷新，但仍不等于每条已经永久落盘。

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

因此，看到模型输出不代表外部 Store 已追平。需要强一致审计时，应在 Result 和关闭路径上等待 flush，并记录镜像错误；不能用「数据库里暂时没看到」直接判定本轮没有发生。

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

为什么自定义 Transport 会跳过？因为它已经由调用方构造，SDK 改写的临时配置未必能传给对端。这个条件必须写进架构说明，不能笼统说「设置 SessionStore 就一定支持 Resume」。

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

这条链路解释了「外部 Store 不是 Runtime 数据库」：CLI 仍沿现有本地恢复机制读取 JSONL，只是 SDK 在启动前把外部记录重新铺成它认识的目录结构。

## 外部 Key 不能直接当路径

子 Agent 的 subpath 来自外部 Store。如果把它直接拼入临时目录，恶意或损坏数据可能使用绝对路径、`..`、Windows 盘符或空字符串逃逸目标目录。

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

这也是通用 Harness 原则：外部持久化返回的任何路径都属于不可信输入，即使数据最初由自己写入。跨平台路径语义必须同时考虑 POSIX 与 Windows。

## Store 实现至少要满足的约束

1. 同一进程内保持 append 调用顺序。
2. 有 UUID 的记录应按 UUID 幂等写入；无 UUID 的标记不能随意去重。
3. `load()` 返回的对象要与写入记录深度相等，但 JSON 键顺序可以不同。
4. 超时、部分失败和重试要可观察；不能默默丢批次。
5. 自己实现外部保留、删除、加密和访问控制。
6. Resume 前验证 project key、Session ID 和 subpath。

SDK 提供了 Store conformance 测试入口；自定义 Redis、PostgreSQL 或对象存储 Adapter 应先跑契约测试，再做真实并发和故障注入。

## Session 恢复不是质量证明

恢复成功只说明历史被加载并进入新的运行。它不保证：旧任务目标仍适用、工作区没有漂移、工具权限相同、模型版本相同或最终答案正确。Artifact 应同时记录恢复来源、父 Session、分叉 ID、工作区基线和新的独立 Eval。

下一篇：[MCP、Agents 与 Skills：三种扩展机制怎样进入运行](08-mcp-agents-skills.md)。
