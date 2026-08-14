---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/sandbox/sandbox/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"swe-bench","path":".","commit":"b3f33bf3f7dc07080486fa2e1c5d3f0de8ab14e2"},{"repo":"terminal-bench","path":".","commit":"d435a67e30ecb41f916716607c30c4646f208ee6"},{"repo":"cordis-paper","path":".","commit":"948a07b369c62adb3b12e102458be5c18dfb69b9"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"},{"repo":"claude-agent-sdk-typescript","path":".","commit":"8716a39f83dd7506e6421199caface603d4941ab"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, official-doc, community]
---

# 附录 B｜术语、证据方法与维护

> 查阅用。术语表按字母/主题排，其余是做研究和维护时的方法约定。

## 一、术语表

| 术语 | 在本仓库中的含义 |
| --- | --- |
| **Harness** | 包住模型的执行系统：上下文、工具循环、权限、状态、恢复、终止和轨迹。**不等于模型，也不等于 benchmark** |
| **Agent harness** | 驱动任务执行的运行时与工具系统 |
| **Evaluation harness** | 分发任务、隔离环境、评分和汇总指标的评测系统 |
| **Cordis** | dsh 使用并 vendored / 修改的插件与依赖注入元框架（文章 02） |
| **Plugin** | 在 Cordis context 上注册 service、event、effect、配置或 UI contribution 的生命周期单元；**不是隔离边界** |
| **Fiber** | 插件实例与所有权单元；六态 `PENDING / LOADING / ACTIVE / FAILED / UNLOADING / DISPOSED` |
| **Effect** | 与 plugin/fiber 生命周期绑定、可清理的副作用注册 |
| **Service seam** | 能力的抽象契约，由 Service Definition、Provider、Consumer 三角色组成，**缺一不可** |
| **Session event** | append-only 会话事实；projection、UI、回放和 telemetry 从其派生（文章 05） |
| **Surface** | 会话日志中「模型可见」的那个有序投影；`SurfaceOp` 只有 `append` 与 `replace` |
| **Turn / step** | turn 是一轮用户活动；step 是一轮模型请求及其后续工具结算，工具后可进入下一 step（文章 03） |
| **Provider route** | 选择模型或执行能力 provider 的稳定路由名（如 `deepseek-official`） |
| **Epoch header** | 某次请求构建时生效的 `system` + `tools` + config，可从日志重建 |
| **DSML** | DeepSeek 模型级工具调用标记格式；**不是网络 RPC**（文章 10） |
| **MCP** | Model Context Protocol；dsh 当前作为 client **只桥接 tools** |
| **ACP** | Agent Client Protocol；dsh 以 stdio JSON-RPC server 暴露**窄**自动化面 |
| **SDK JSON-RPC** | dsh 自有的换行分帧 JSON-RPC wire，服务 Python/TS SDK，**不等于 ACP** |
| **Scoped registration** | 只对指定 agent / session 生效的能力注册，避免全局变更 |
| **Waterfall** | 可短路 / 委托的顺序拦截链；listener **必须显式调用 `next()`** 才继续 |
| **Permission preset** | sandbox mode 与 approval policy 的组合选择；**不是完整安全边界**（文章 08） |
| **Enforcement** | sandbox runner 实际返回的强制完整度事实，而非请求的模式名 |
| **Compaction** | 保留完整证据日志的前提下，用 summary / checkpoint 替换模型可见的旧历史表面（文章 07） |
| **Spill** | 把过大的工具输出转存，模型侧只保留有界引用 / 投影 |
| **Profile** | 由 bundle patch、用户配置和 overlay 解析出的插件组合；根配置是空列表 `[]` |
| **Snapshot test** | 固定可观察输出的回归工具；**刷新 snapshot 不证明新输出语义正确** |
| **Provenance** | 发布物从源码、构建、签名到分发的可验证来源链 |
| **Agent Note** | 记录一个设计决策与被否决的替代方案；路径即状态（文章 11） |
| **Postmortem** | 回溯一次失败：什么坏了、为什么每层防护都没拦住、加了什么守卫 |

### ⚠️ 一处术语更正

早期资料把 **Enforcement** 描述为「full / partial / unavailable 三态」。**这是不准确的。**

源码里 `SandboxEnforcement = 'full' | 'partial'`（`packages/sandbox/sandbox/src/index.ts:59`），**只有两态**。 `evidence: code` `'unavailable'` 属于 `EscalationOutcome`（`escalation.ts:93`），是审批那一族的值。

详见文章 08。

## 二、证据分级

本仓库每个结论至少标注一种证据。**已停用 `inference` 标签**——它曾出现在每一篇文档里，零区分度；属于推断的句子直接在正文写明。

| 标签 | 能支持 | **不能**单独支持 |
| --- | --- | --- |
| `code` | 锁定 commit 下源码确实这么写 | 该代码默认启用、生产可用 |
| `test` | 上游有测试覆盖该行为 | 真实业务闭环 |
| `runtime` | 本地实际运行出现过该结果 | 其它环境、其它版本也如此 |
| `official-doc` | 官方这样声明 | 实现与声明一致 |
| `community` | 存在这样的社区样本 | 普遍性、留存或采用率 |

`runtime` 结论必须记录：版本、环境、命令、开始/结束时间、退出码、跳过项、日志或产物路径。

**冲突处理**：两个证据打架时不要二选一，把结论写成「在 SHA X 的组合 Y 下可 / 不可复现」。

### 三条边界

1. **源码存在 ≠ 默认启用**
2. **测试通过 ≠ 真实业务闭环**
3. **UI 可见 ≠ 副作用已隔离**

## 三、Benchmark 设计

### 先选一种目标，不要混进一个总分

| 目标 | 固定什么，比较什么 |
| --- | --- |
| 模型能力 | 固定 Harness，比较模型 |
| adapter 正确性 | 固定模型与任务，比较协议实现 |
| Harness 策略 | 固定模型，比较 compaction / 工具 / 权限 / loop |
| 系统可靠性 | 连接、恢复、持久化、取消、跨平台 |
| 安全性 | 危险动作阻断、授权准确、数据泄漏、sandbox enforcement |
| 产品效率 | 真实用户完成时间、人工触点、返工、成本 |

### 任务集

必须有：immutable 版本、许可、初始状态 hash、可执行评分器、污染说明。

代码任务要同时覆盖：小修、跨文件、调试、长上下文、工具失败、**需要拒绝的危险指令**。

对 Terminal-Bench、SWE-bench 这类公共集，**记录具体版本、容器/镜像、patch 和排除项**——不要只写集合名字。

### 实验矩阵：每个 cell 固定 13 项

```
model + endpoint + adapter + Harness SHA/package + profile + prompt
+ tool schemas/order + permissions + sandbox + context/compaction
+ budgets + retry + sampling + runtime
```

一次 A/B **只改变预注册的那一个因素**。冷/热 cache、是否允许网络、是否并行 subagent 都是实验变量，不是「环境」。

### 指标三组

**主要结果**

- task success / pass@1；多采样时写明 pass@k 与总预算
- 正确性子分：测试、静态规则、diff 约束、人工盲审
- **unsafe success：通过了任务但违反权限/数据/副作用约束，必须判失败**

**效率**

- 输入、输出、reasoning、**cache-read** token
- provider usage 原始字段 + 归一化字段（两者都要）
- 实际费用、TTFT、端到端时间、active model time
- turn / step / tool 数、compaction 次数、最大上下文压力
- 人工批准与追问次数、被拒动作、返工

**可靠性与安全**

- provider 429/5xx/timeout、重试与最终恢复
- MCP/ACP/SDK protocol failure、工具/runner/scorer failure
- **基础设施失败只做附加分类，不能把样本从分母里静默移除**
- 取消延迟、孤儿进程/会话、持久化恢复
- 危险动作召回率、误拒率、越权成功率、secret exfiltration
- sandbox enforcement 的 full / partial 分布

### 统计与删失

超时、取消、基础设施失败、scorer failure **都必须留在总表**，按预注册规则进入不同分母。

每任务多次 run 报 bootstrap 或合适的置信区间，**公开 task-level 分布**——平均值会掩盖长尾。

成本与成功率画 **Pareto**，不要只选最高分。

### 轨迹审计

随机抽样成功和失败的轨迹，检查五件事：任务是否被真正完成、工具结果是否**伪成功**、是否借助未声明状态、是否有危险副作用、评分器是否漏判。

**模型最终自述不作为成功证据。**

### 公布结果的十项必含

日期、全部版本、运行次数、预算、排除项、失败 taxonomy、置信区间、成本、已知局限、可下载的脱敏 manifest 与 score。

标题写「**模型 X + Harness 配置 Y 在任务集 Z**」，不要缩写成「模型 X 得分」。

### 最小评测门禁（七条）

1. keyless protocol / smoke 通过
2. 实验 workspace 与 session 隔离
3. 配置与工具 schema hash 已保存
4. scorer 在 run 前冻结
5. 所有失败与重试都有 run id
6. 轨迹脱敏但保持可验证结构
7. 至少一名独立评审检查归因和许可证

## 四、版本与上游维护

### 基线

所有源码结论绑定 [`sources/sources.lock.yml`](../sources/sources.lock.yml) 中的 commit。当前主基线：

```
deepseek-harness  47f943859bef60e4160492346772ded9b24f765a
```

共 15 个上游仓库，由 git submodule 与 lock 文件共同固定。

### 上游更新流水线（七步）

1. 每 6 小时的 CI 解析上游 HEAD，生成差异报告
2. `sources.lock.yml` 变化时，刷新 checkout 与许可证
3. 重新生成源码索引（发布到 `gh-pages`）
4. **把受影响文档的 frontmatter `status` 改为 `stale`**，并写入 `sources/stale-documents.md`
5. 创建**只读审查用**的候选 PR
6. **人工复核语义变化**——机器人不改架构结论
7. 合并后基线前移，`stale` 文档逐篇重新审核

**原则：上游变更只能先生成差异和「待复核」提示，不能自动改写结论。**

### Cordis fork 的特殊维护

不能直接复制上游目录。先读上游 `vendor/README.md` 的 Local modifications 清单，**逐项决定重放、改写、退役还是拒绝**，然后重跑 `pnpm run test && pnpm run build`（文章 02 的 18 类差异）。

### 本仓库自身的门禁

```bash
npm run check   # sources:verify → check:analysis → check:portability
                # → check:licenses → check:links → check:secrets → test
```

`&&` 串联，任一步失败即短路。零依赖约束：`package.json` 不允许有 dependencies。

## 五、许可证边界

三种行为分开判断：**阅读**、**引用**、**再分发**。

| 项 | 当前状态 |
| --- | --- |
| 本仓库代码 | MIT |
| 本仓库文档 | CC BY 4.0 |
| deepseek-harness | MIT |
| MCP TypeScript SDK | 处于 MIT → Apache-2.0 迁移；文档 CC-BY-4.0 |
| Claude Agent SDK | payload 受 Anthropic 条款约束 |
| Cordis 论文 | **只引用和原创释义，不复制正文** |
| DeepSeek V4 | 声明 MIT，但**权重不入库** |

### PR 前七问

1. 这份内容是**阅读**、**引用**还是**再分发**？
2. 原始许可证是什么版本？
3. 引用比例是否合理？
4. 是否保留了必要的归属与 notice？
5. 是否引入了新的 transitive 或 platform payload？
6. 时间敏感来源是否附了 capture time？
7. 不能确认再发布权利时，是否只提交了 URL + SHA + 少量合规引用 + 自己的分析？

## 六、论文标注方法

读 Cordis 论文（或任何与实现对照的论文）时，每条主张做一张 claim card，11 个字段：

```yaml
claim_id: <唯一 id>
paper_location: <页码/章节>
author_claim: <作者主张,尽量逐字>
evidence_type: <理论证明 / 实验 / 断言>
experiment_subject: <实验对象与基线假设>
limits: <限制与外推边界>
source_path: <对应源码路径 + SHA>
implementation_state: <完全实现 / 部分实现 / 未实现 / 无对应>
reproducible_experiment: <可复现实验或"无">
confidence: <高 / 中 / 低>
notes: <备注>
```

**「未找到对应实现」是一个合法结论**，要写成「在 SHA X 下未找到对应实现」，而不是「论文说的是假的」。

对照步骤：

1. 提取主张 → 2. 定位候选源码 → 3. 判断实现状态 → 4. 设计可证伪实验 → 5. 记录置信度

## 七、来源索引

| 主题 | 权威入口 |
| --- | --- |
| 架构总览 | 上游 `docs/architecture.md` |
| Cordis 概念 | 上游 `docs/cordis-primer.md` + `cordiverse/paper` |
| Agent 生命周期 | 上游 `docs/agent-lifecycle.md` |
| 工具流水线 | 上游 `docs/tool-execution-pipeline.md` |
| 各子系统 | 上游 `docs/subsystems/`（48 组，中英双语） |
| 包级契约 | 各包 `README.md` 的 Model Experience 节 |
| 设计决策 | 上游 `.agents/notes/`（675 篇） |
| 失败复盘 | 上游 `docs/postmortem/`（4 篇） |
| 新增包的规范 | 上游 `docs/cookbook/adding-a-package.md` |
| 全量文件/符号索引 | 本仓库 `gh-pages` 分支 |

**时间敏感来源（社区讨论、社交媒体、可用性状态）必须附 capture time。** 例如「turtle-ui 地址返回 repository not found」这个结论，捕获时间是 2026-08-13——它证明当时不可用，不证明永远不可用。
