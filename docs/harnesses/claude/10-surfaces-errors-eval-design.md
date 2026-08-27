# 错误分类、可观测性与独立 Eval 接缝

[返回 Claude 课程地图](README.md)

上一篇对照 TypeScript 时，只读到 README、CHANGELOG、SessionStore 示例和契约测试能支持的地方就停下了。这些可见契约能告诉你运行对外暴露了什么，任务有没有通过独立 Eval（评测），还要另外判断。这两层不能混。

课程走到最后，你要问的已经不只是「Claude 有没有输出」，还要问运行在哪一层失败、留下了哪些证据、能不能安全重试，以及最终产物是否真的满足目标。要是所有失败都被算成「模型答错」，Harness 就无法知道该改哪一层，重试还可能把真实的产品问题藏起来。

## 先把失败分层

| 层次 | 例子 | 通常由谁处理 |
| --- | --- | --- |
| 启动与连接 | 找不到 CLI、版本不兼容、子进程无法启动 | Transport / 部署 |
| 协议与解析 | JSON 损坏、消息字段缺失、控制请求超时 | SDK / 集成层 |
| 权限与策略 | Tool 被拒绝、Hook 阻止、Sandbox 不可用 | Harness 策略 |
| 工具执行 | 命令退出非零、文件不存在、MCP Handler 异常 | Tool / 环境 |
| Agent 运行 | 最大轮数、预算、Interrupt、API 错误 | Runtime / 调用方 |
| 任务质量 | 修改不正确、测试失败、违反约束 | 独立 Eval |

同一次运行可能在多层同时留下事实，比如 CLI 先发出一个 `is_error=true` 的 Result，随后又以非零状态退出。Artifact（产物）要保留这两条原始证据，但统计根因时必须把它们关联到同一次失败，别误算成两个任务各失败了一次。

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

`CLINotFoundError` 说明部署没有准备好 CLI，所以多调几次模型不会解决问题，你得回去修部署。协议解析失败也不能直接算成用户任务做错，重试前先看看原输入会不会稳定触发同一故障，否则只会把确定失败再演一遍。

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

比如 API 只是暂时过载，你可以把它当成基础设施故障，在有次数上限的前提下退避重试。如果运行已经撞上最大轮数，就应该回头检查怎样拆任务、何时停止，而权限拒绝则必须交回策略层处理，不能暗中换成绕过模式。

## 非致命错误也要进入 Artifact

如果 SessionStore 没有镜像成功，本地会话不会因此停下，因为 Transcript 已经写到本地，但系统会发出 `MirrorErrorMessage`。如果你只盯着最终 Result，可能会看到一次「成功」的运行，却没发现外部审计副本已经断了一截。

源码：[查看 MirrorErrorMessage 语义](https://github.com/anthropics/claude-agent-sdk-python/blob/542fefb3b94be87760b2513fff889b91bb5b6672/src/claude_agent_sdk/types.py#L1262-L1276)

RateLimitEvent 也有类似情况，它可能在用量真正撞上硬限制之前就发出 warning。所以可观测系统要分清两种情况：一种是运行仍在继续，只有证据或剩余容量降级，另一种才是运行已经终止。

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

`duration_ms`、`num_turns` 和成本能用来看效率，`permission_denials` 能解释某个动作为什么没有执行，`terminal_reason` 则会告诉你运行是正常完成、中途中断，还是因为预算耗尽而停止。但要判断任务做对没有，你仍然要直接检查目标文件和测试结果。指标只是指标。

## 可观测性要围绕一次 Trial 组织

可以把一次完整的业务任务记为 Trial（评测试次），如果中间遇到可恢复的基础设施故障，每次重试再单独记为 Attempt（尝试）。

```text
Trial
  ├─ 输入任务与工作区基线
  ├─ Attempt 1：连接失败，可恢复
  ├─ Attempt 2：产生完整运行 Artifact
  ├─ 最终产物与副作用
  └─ 独立 Eval 结果
```

产品失败不能靠反复重试「刷成通过」。比如 Agent 第一遍误删了文件，第二遍又碰巧修好，Trial 依然得记住第一遍造成的副作用。只有当某个 Attempt 明确遇到可恢复的基础设施故障，而且还没有对业务产生副作用时，系统才适合自动重试。

每条事件至少关联：

- trial_id、attempt_id、session_id；
- message UUID、tool_use_id、agent_id；
- SDK 与 CLI 版本、模型标识；
- 权限决定、Hook 结果、工具结果；
- 工作区差异、测试输出和最终 Result；
- 脱敏后的错误与耗时。

别把完整 Prompt、文件内容、环境变量和凭据一股脑塞进 Telemetry（遥测）。你应该先给数据分级，设定保留期，然后再按敏感度和排查需求决定每个字段该存原文、哈希还是摘要。

## Eval 是 Harness 的横切能力

这个仓库的主线是 Agent Harness，Eval 会横跨运行时的各个关键位置收集证据，没有必要再另写一套与 Harness 平行的百科：

```text
任务合同
  → Harness 运行与工具副作用
  → Artifact（轨迹 + 产物 + 环境事实）
  → 独立 Scorer
  → 质量、约束、效率与证据完整性
```

以「修复运费边界错误」为例，你可以从下面几个方向同时检查，让任务正确性、执行约束和证据是否齐全都有明确落点：

- **结果检查**：边界测试从失败变为通过；
- **约束检查**：没有修改测试和无关文件；
- **过程检查**：高风险工具调用经过策略，轨迹没有缺口；
- **效率指标**：轮数、时延、成本和重试次数；
- **证据完整性**：Result、Diff、测试输出和错误均可关联。

Scorer（评分器）必须独立检查产物，不能照单全收模型的自述，因为 Assistant 说「已经修好」只代表它发出了这条消息，还没有任何外部检查为这个结论背书。

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

这段只是教学用的伪实现，不来自 Claude SDK 上游源码。它把判定顺序写得很清楚：证据没收齐就不能直接判成功，已经违反约束也不能靠测试通过抵消，只有先确认任务做对了，才能把效率拿出来单独报告。

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

到这里，Claude 课程已经把外部链路走完：证据边界 → 入口与 Transport → 消息 → 工具可见性 → 权限 → Hooks → Session → 扩展 → 跨语言契约 → Eval。整条路都停在公开 SDK 能支持的地方，没有借机补写 Claude Code 从未公开的内部实现。

回到课程地图时，你可以再沿着这条外链定位每个机制，然后对照错误所在层次、Artifact 和独立 Eval，检查它们怎样一起撑起完整 Trial。证据链在这里合上了。

[返回 Claude 课程地图](README.md)
