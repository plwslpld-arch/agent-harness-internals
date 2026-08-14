---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/headless/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, runtime, inference]
---

# 本地第一次跑通：从 key 到一次可解释任务

本实验目标不是“看到一段回答就算成功”，而是让你亲手确认 Harness 的几个关键事实：

- 个人 API key 可以通过 `DEEPSEEK_API_KEY` 配置。
- headless profile 会创建 Agent、调用模型、等待 idle、flush session。
- 缺 key、错 key、工具失败都应该是受控失败。
- 运行证据要记录命令、环境、结果和边界，而不是只截图。

## 安全边界

不要把真实 key 写进仓库、文档、issue、PR 或截图。只在本机 shell 环境中设置：

```bash
export DEEPSEEK_API_KEY="你的个人 key"
```

如果你曾经把 key 明文发到聊天、日志或仓库，应当把它当成已暴露凭据，去 DeepSeek 控制台轮换。

## 实验前你要知道什么

本地跑通分成五层证据：

| 层 | 代表什么 | 不代表什么 |
| --- | --- | --- |
| 依赖安装成功 | 项目能构建或启动 | 模型调用成功 |
| 进程启动成功 | profile 能 boot | 任务成功 |
| 模型请求成功 | provider 有返回 | 工具、安全、session 都正确 |
| Session flush 成功 | 事件写入完成 | 业务结果一定对 |
| 任务完成 | 用户目标被满足 | 所有场景都可靠 |

本实验要你有意识地区分这五层。

## 步骤 1：确认源码 checkout 存在

在 Atlas 仓库根目录执行：

```bash
npm run sources:verify
```

成功含义：Atlas 固定的上游源码 checkout 存在，并且 commit 与 lock 一致。

失败时不要继续跑实验。先修复 source checkout，否则你读的文档和跑的代码可能不是同一版。

## 步骤 2：确认 Atlas 自身校验通过

```bash
npm run check
```

成功含义：文档绑定、生成索引、链接、许可证、secret scan 和脚本测试通过。

这一步仍然不代表 Harness 本体业务 E2E 成功，只代表学习仓库当前是自洽的。

## 步骤 3：进入 Harness 源码

```bash
cd sources/checkouts/deepseek-harness
```

后续命令都在 Harness 源码目录里执行。这样你看到的行为才和 Atlas 的 source commit 对齐。

## 步骤 4：配置个人 API key

```bash
export DEEPSEEK_API_KEY="你的个人 key"
```

说明：

- `DEEPSEEK_API_KEY` 是默认 key 名。
- 不同人可以使用自己的 key。
- 不要把 key 写进 Atlas 文档。
- 如果要使用自定义 endpoint，应单独确认 `DEEPSEEK_BASE_URL` 的可信来源。

## 步骤 5：先跑 keyless/缺 key 失败

先故意不设置 key 或临时开一个没有 key 的 shell，跑一次最小命令。预期结果应该是受控失败，错误应指向缺少 credential，而不是进程崩溃或泄露 secret。

要记录：

```text
实验：缺 DEEPSEEK_API_KEY
预期：MISSING_CREDENTIAL 或等价受控错误
实际：
是否泄露 key：否
```

为什么要先跑失败？因为可靠系统不只是成功路径好看，失败路径也要可解释。

## 步骤 6：跑一次 headless 最小任务

实际命令以 Harness 当前 README/package scripts 为准。原则是使用 headless profile 发起一个短任务，例如：

```bash
dsh --profile headless "用一句话说明你是谁"
```

如果本地没有全局 `dsh`，先查看上游 README 或 package scripts，使用仓库推荐的本地启动方式。

成功后不要只看最后回答。你要确认：

- 进程是否正常退出。
- 回答是否来自 DeepSeek provider。
- 是否产生 session。
- 是否 flush。
- 是否有错误 stderr。

## 步骤 7：观察 Session 证据

headless runner 的代码路径会在 Agent idle 后调用 `sessions.flush()`。这说明一次任务结束前应当把 session event 写入持久层。

你要观察：

```text
session id：
是否存在 turn/start：
是否存在 user/message：
是否存在 assistant/message：
是否存在 turn/end：
flush 是否完成：
```

如果没有持久化 backend，记录为“未配置持久化 backend”，不要把它写成“session 已 durable”。

## 步骤 8：跑一次负向工具/权限实验

选择一个不会造成破坏的失败，例如：

- 调用不存在的工具。
- 在 Code Mode 下直接调用被折叠的工具。
- 触发 approval unavailable。
- 触发一个只读工具的 schema 错误。

观察预期：

- 错误被包装成工具结果。
- Session 中有失败记录。
- 不出现未审计副作用。
- 不因为单个工具错误导致整个进程无解释崩溃。

## 实验记录模板

```yaml
study_id: local-first-run-001
source_commit: 47f943859bef60e4160492346772ded9b24f765a
profile: headless
model_provider: deepseek-official
model_id: <实际模型>
credential_ref: DEEPSEEK_API_KEY
command: <脱敏命令>
started_at: <本地时间>
ended_at: <本地时间>
exit_code: <数字>
result_summary: <一句话>
session_evidence:
  created: true/false
  flushed: true/false
  event_types: []
negative_case:
  name: <缺 key / unknown tool / approval unavailable>
  controlled_failure: true/false
known_gaps:
  - <没有验证 Web>
  - <没有验证 sandbox>
```

## 怎么判断这次实验算成功

成功标准：

- 正向任务能完成。
- 缺 key 或错误配置能受控失败。
- 不泄露真实 key。
- 能说清证据层级：启动、模型请求、session、任务完成分别是什么。
- 实验记录可以让别人复现。

不算成功的情况：

- 只截图最后回答。
- 只说“跑通了”，没有命令和环境。
- 把真实 key 写入记录。
- 用 HTTP 200 代替任务完成。
- 没有负向 case。
