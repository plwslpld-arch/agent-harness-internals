---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 可复现实验协议

## 1. 预注册

写清研究问题、唯一自变量、主要指标、失败 taxonomy、retry 和停止条件。看到结果后改成功标准只能作为 exploratory 记录。

## 2. Manifest

```yaml
study_id: ds-adapter-ab-v1
source_sha: 47f943859bef60e4160492346772ded9b24f765a
package_version: 0.1.0-rc.5
model_route: deepseek-official
model_id: deepseek-v4-flash
profile: jsonrpc-minimal
config_sha256: <redacted-config-hash>
task_set: <name-and-version>
sandbox: <backend-mode-enforcement>
permission_policy: <name>
max_tokens: <value>
wall_time_limit_s: <value>
tool_call_limit: <value>
sampling: <documented-values>
runtime: <os-arch-node-python>
```

源码 SHA 与 npm 版本同时记录；secret 只记引用、scope 与 rotation batch，不记值。

## 3. 隔离

- 每任务独立 workspace/session/storage，从相同 immutable fixture 创建并记录 tree hash。
- 禁止共享未声明 cache、后台进程与 MCP 状态；测 cache 时把 cold/warm 当变量。
- 先跑 keyless protocol purity/smoke，再跑需真实 API 的任务。

## 4. 过程证据

收集 turn/step、provider/request header facts、usage/retry、工具参数 hash/result、approval、sandbox enforcement、cancel/compaction、diff/scorer。OpenTelemetry 是辅助观测，append-only session events 是 Harness 语义真源。

## 5. 失败分层

| 层 | 示例 | 处理 |
| --- | --- | --- |
| task/fixture | fixture 损坏、依赖源不可达 | 修任务后整批失效重跑 |
| protocol/adapter | malformed SSE、缺完成、role/tool 不兼容 | 系统失败，按预注册决定重跑 |
| provider | 429/quota/5xx/timeout | 固定 retry，保留全部成本 |
| Harness | registration/session/persistence/scheduler bug | 单列系统可靠性，不冒充模型失败 |
| policy/sandbox | 误拒或危险放行 | 安全指标；不得静默换 full-access |
| model/task | 策略/代码错误或未完成 | 主要能力指标 |
| scorer | flaky/漏判 | 冻结后重算全部轨迹 |

## 6. 重复、统计与复现包

非确定性任务做多次独立 run，报告置信区间、token/cache/cost/time/tools/approval 与失败分布。pass@k 写明 k、采样、并发和总成本。超时/取消不能静默移出分母。

复现包包含 manifest schema、任务版本、无 secret 配置、启动命令、scorer、脱敏 trajectory 与结果摘要。商业任务至少保留内部 content hash 和访问审计。

## 最小 A/B 检查

- 唯一变量是否只有一个？
- tools schema 顺序、system prompt、时间上下文是否稳定？
- retry 与预算是否同等？
- cache 是否单列？
- scorer 是否预先冻结并盲评？
- Harness 可靠性与模型能力是否分开报告？
