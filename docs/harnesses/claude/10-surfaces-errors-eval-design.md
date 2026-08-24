# 错误分类、可观测性与独立 Eval 接缝

[返回 Claude 课程地图](README.md)

到了课程最后，最重要的问题不是「Claude 有没有输出」，而是：运行在哪一层失败、留下了什么证据、能否安全重试、最终产物是否满足目标。把所有失败都归为「模型答错」会让 Harness 无法改进，也会让重试掩盖真实产品失败。

## 先把失败分层

| 层次 | 例子 | 通常由谁处理 |
| --- | --- | --- |
| 启动与连接 | 找不到 CLI、版本不兼容、子进程无法启动 | Transport / 部署 |
| 协议与解析 | JSON 损坏、消息字段缺失、控制请求超时 | SDK / 集成层 |
| 权限与策略 | Tool 被拒绝、Hook 阻止、Sandbox 不可用 | Harness 策略 |
| 工具执行 | 命令退出非零、文件不存在、MCP Handler 异常 | Tool / 环境 |
| Agent 运行 | 最大轮数、预算、Interrupt、API 错误 | Runtime / 调用方 |
| 任务质量 | 修改不正确、测试失败、违反约束 | 独立 Eval |

同一次运行可能同时产生多层事实。例如 CLI 先发一个 `is_error=true` 的 Result，再以非零状态退出。Artifact 应保留两条原始证据，但根因统计不能把它们算成两个独立任务失败。

### 第 1 站：SDK 错误类型保留不同责任层

源码：[查看错误类型](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_errors.py#L6-L39)

```python
class ClaudeSDKError(Exception): ...
class CLIConnectionError(ClaudeSDKError): ...
class CLINotFoundError(CLIConnectionError): ...

class ProcessError(ClaudeSDKError):
    def __init__(self, message, exit_code=None, stderr=None):
        self.exit_code = exit_code
        self.stderr = stderr
```

- **调用者**：公开 query 或 Client 的连接、读取和关闭路径抛出这些异常。
- **输入**：连接失败原因、进程退出码和可选 stderr。
- **状态变化**：错误对象保存结构化字段，而不是只拼接一段文本。
- **返回**：异常沿调用栈传播，调用方按类型决定重试、降级或停止。
- **下一站**：若 CLI 已先发布错误 Result，SDK 可以提供更具体的 `ResultError`。

`CLINotFoundError` 通常不该通过重试模型解决；它要求修复部署。协议解析错误也不等于用户任务错误，重试前要判断输入是否会再次触发相同确定性故障。

### 第 2 站：ResultError 把终态负载带进异常

源码：[查看 `ResultError`](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/_errors.py#L56-L117)

```python
class ResultError(ProcessError):
    ...
    self.subtype = data.get("subtype")
    self.errors = _normalize_result_errors(data.get("errors"))
    self.api_error_status = data.get("api_error_status")
    self.terminal_reason = data.get("terminal_reason")
    self.session_id = data.get("session_id")
```

- **调用者**：读取流程发现终端错误 Result 后，在进程非零退出路径构造该异常。
- **输入**：Result 原始负载和退出码。
- **状态变化**：终止原因、HTTP 状态、Session 和错误列表被结构化保留。
- **返回**：兼容 `ProcessError` 的更具体异常。
- **下一站**：调用方按 `terminal_reason` 和状态判断是否可重试，并把原始 Result 与异常归为同一根事件。

例如 API 暂时过载可能允许有退避的基础设施重试；达到最大轮数则应检查任务拆分和停止条件；权限拒绝应回到策略，而不是偷偷切换成绕过模式。

## 非致命错误也要进入 Artifact

SessionStore 镜像失败不会终止本地会话，因为本地 Transcript 已经写入；它会产生 `MirrorErrorMessage`。如果只看最终 Result，运行可能显示成功，但外部审计副本存在缺口。

源码：[查看 MirrorErrorMessage 语义](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1262-L1276)

类似地，RateLimitEvent 可以在到达硬限制前发出 warning。可观测系统应区分「运行继续但证据或容量降级」和「运行已经终止」。

### 第 3 站：Result 暴露运行指标，但不是评分器

源码：[查看 ResultMessage 字段](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1318-L1356)

```python
class ResultMessage:
    subtype: str
    duration_ms: int
    duration_api_ms: int
    is_error: bool
    num_turns: int
    total_cost_usd: float | None = None
    permission_denials: list[Any] | None = None
    errors: list[str] | None = None
    terminal_reason: str | None = None
```

- **调用者**：消息解析器从 CLI Result 帧构造，应用消费者接收。
- **输入**：时延、轮数、使用量、拒绝、错误和终止原因。
- **状态变化**：协议事实聚合成一个终态对象，不修改工作区产物。
- **返回**：应用可记录成本、性能和运行结果。
- **下一站**：独立 Eval 读取完整 Artifact 与执行环境，判断任务正确性。

`duration_ms`、`num_turns` 和成本适合做效率指标；`permission_denials` 适合解释为什么动作未执行；`terminal_reason` 适合区分完成、中断和预算终止。任何字段都不能替代对目标文件和测试的检查。

## 可观测性要围绕一次 Trial 组织

建议把一次业务任务定义为 Trial，把基础设施恢复尝试定义为 Attempt：

```text
Trial
  ├─ 输入任务与工作区基线
  ├─ Attempt 1：连接失败，可恢复
  ├─ Attempt 2：产生完整运行 Artifact
  ├─ 最终产物与副作用
  └─ 独立 Eval 结果
```

产品失败不能通过反复重试「刷成通过」。例如 Agent 第一遍错误删除文件，第二遍碰巧修好，Trial 仍要保留第一次副作用；只有明确属于可恢复基础设施故障且未产生业务副作用的 Attempt，才适合自动恢复。

每条事件至少关联：

- trial_id、attempt_id、session_id；
- message UUID、tool_use_id、agent_id；
- SDK 与 CLI 版本、模型标识；
- 权限决定、Hook 结果、工具结果；
- 工作区差异、测试输出和最终 Result；
- 脱敏后的错误与耗时。

不要把完整 Prompt、文件内容、环境变量和凭据无差别送进遥测。先定义数据分级和保留期，再决定哪些字段存原文、哈希或摘要。

## Eval 是 Harness 的横切能力

本仓库以 Agent Harness 为主，Eval 不另起一套与运行时平行的百科。它从每个关键接缝采集证据：

```text
任务合同
  → Harness 运行与工具副作用
  → Artifact（轨迹 + 产物 + 环境事实）
  → 独立 Scorer
  → 质量、约束、效率与证据完整性
```

对「修复运费边界错误」这一任务，可以同时设置：

- **结果检查**：边界测试从失败变为通过；
- **约束检查**：没有修改测试和无关文件；
- **过程检查**：高风险工具调用经过策略，轨迹没有缺口；
- **效率指标**：轮数、时延、成本和重试次数；
- **证据完整性**：Result、Diff、测试输出和错误均可关联。

评分器应独立于模型自述。Assistant 说「已经修好」只是一条消息，不是检查结果。

## 一套可执行的判定顺序

```python
def evaluate(artifact):
    if not artifact.protocol_complete:
        return "inconclusive"
    if artifact.forbidden_side_effects:
        return "fail"
    if not artifact.required_tests_passed:
        return "fail"
    if not artifact.expected_diff:
        return "fail"
    return "pass"
```

这段是教学伪实现，不是 Claude SDK 上游源码。它表达一个重要顺序：证据不完整不能直接算成功；明确违反约束不能靠测试通过抵消；完成正确性判断后，再单独报告效率。

## 重试决策表

| 情况 | 默认处置 |
| --- | --- |
| CLI 不存在、配置确定错误 | 阻止并修复部署，不重试 |
| 429/过载且无副作用 | 有上限退避重试 |
| 权限策略拒绝 | 保留拒绝，回到授权或任务设计 |
| 工具已产生部分副作用后超时 | 先检查幂等与现场副作用 |
| 最大轮数 | 评估任务拆分、Prompt 与停止条件 |
| 测试失败 | 记为任务失败，不作为基础设施重试 |
| Artifact 缺关键轨迹 | `inconclusive`，不能宣称通过 |

到这里，Claude 课程形成了完整外部链路：证据边界 → 入口与 Transport → 消息 → 工具可见性 → 权限 → Hooks → Session → 扩展 → 跨语言契约 → Eval。它没有越过公开 SDK 去虚构 Claude Code 内部实现。

[返回 Claude 课程地图](README.md)
