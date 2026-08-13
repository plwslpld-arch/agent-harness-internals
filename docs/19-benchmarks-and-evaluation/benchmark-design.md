# Agent Harness benchmark 设计

## 评测目标

先选择一种目标，不能混在一个总分里：

- 模型能力：固定 Harness，比较模型；
- adapter 正确性：固定模型与任务，比较协议实现；
- Harness 策略：固定模型，比较 compaction/工具/权限/loop；
- 系统可靠性：连接、恢复、持久化、取消、跨平台；
- 安全性：危险动作阻断、授权准确、数据泄漏和 sandbox enforcement；
- 产品效率：真实用户完成时间、人工触点、返工和成本。

## 任务集

任务必须有 immutable 版本、许可、初始状态 hash、可执行评分器和污染说明。代码任务同时覆盖小修、跨文件、调试、长上下文、工具失败和需要拒绝的危险指令。内部任务可以使用，但要和公开可复现集分表。

对 Terminal-Bench、SWE-bench 等公共集合，记录具体版本、容器/镜像、patch 和排除项。不要只写集合名字。

## 实验矩阵

每个 cell 固定：

`model + endpoint + adapter + Harness SHA/package + profile + prompt + tool schemas/order + permissions + sandbox + context/compaction + budgets + retry + sampling + runtime`

一次 A/B 只改变预注册因素。冷/热 cache、是否允许网络、是否并行 subagent 都是实验变量。

## 指标

### 主要结果

- task success / pass@1；多采样时写明 pass@k 与总预算；
- 正确性子分：测试、静态规则、diff 约束、人工盲审；
- unsafe success：通过了任务但违反权限/数据/副作用约束，必须判失败。

### 效率

- 输入、输出、reasoning、cache-read token；
- 实际费用、TTFT、端到端时间、active model time；
- turn/step/tool 数、compaction 次数、最大上下文压力；
- 人工批准/追问次数、被拒动作和返工。

### 可靠性与安全

- provider 429/5xx/timeout、重试与最终恢复；
- MCP/ACP/SDK protocol failure、工具/runner/scorer failure；
- 取消延迟、孤儿进程/会话、持久化恢复；
- 危险动作召回率、误拒率、越权成功率、secret exfiltration；
- full/partial/unavailable sandbox enforcement 分布。

## 统计与删失

超时、取消、基础设施失败和 scorer failure 都必须留在总表，按预注册规则进入不同分母；不能静默删除。对每任务多次 run 报 bootstrap 或合适的置信区间，并公开 task-level 分布，避免平均值掩盖长尾。成本与成功率画 Pareto，而不是只选最高分。

## 轨迹审计

随机抽样成功和失败轨迹，检查：任务是否被真正完成、工具结果是否伪成功、是否借助未声明状态、是否有危险副作用、评分器是否漏判。模型最终自述不作为成功证据。

## 公布结果

结果页必须包含日期、全部版本、运行次数、预算、排除项、失败 taxonomy、置信区间、成本、已知局限和可下载的脱敏 manifest/score。标题应写“模型 X + Harness 配置 Y 在任务集 Z”，不要缩写为“模型 X 得分”。

## 最小评测门禁

- keyless protocol/smoke 通过；
- 实验 workspace 与 session 隔离；
- 配置/工具 schema hash 已保存；
- scorer 在 run 前冻结；
- 所有失败与重试都有 run id；
- 轨迹脱敏但保持可验证结构；
- 至少一名独立评审检查归因和许可证。
