---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/headless/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/session/src/repair.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, runtime, official-doc]
---

# 附录 A｜实验手册：本地跑通与证据留痕

> 本附录是全部 12 篇文章「可复核实验」一节的操作底座。先读这里，再按文章顺序做实验。

## 一、安全边界（先读这段）

**不要把真实 key 写进仓库、文档、issue、PR 或截图。** 只在本机 shell 里设置：

```bash
export DEEPSEEK_API_KEY="你的个人 key"
```

如果你曾经把 key 明文发到聊天、日志或仓库，**把它当成已暴露凭据**，去 DeepSeek 控制台轮换。

## 二、五层证据阶梯

这是做任何实验前都要装在脑子里的分层：

| 层 | 代表什么 | **不**代表什么 |
| --- | --- | --- |
| 依赖安装成功 | 项目能构建或启动 | 模型调用成功 |
| 进程启动成功 | profile 能 boot | 任务成功 |
| 模型请求成功 | provider 有返回 | 工具、安全、session 都正确 |
| Session flush 成功 | 事件写入完成 | 业务结果一定对 |
| 任务完成 | 用户目标被满足 | 所有场景都可靠 |

**每次记录实验结果时，都要说清楚你证明到了第几层。**

## 三、八步跑通第一次

### 步骤 1：确认源码 checkout 与 lock 一致

```bash
cd ~/…/deepseek-harness-internals
npm run sources:verify
```

**失败就停下。** 否则你读的文档和跑的代码不是同一版。

### 步骤 2：确认本仓库自洽

```bash
npm run check
```

通过只代表**学习仓库**当前自洽，不代表 Harness 本体业务 E2E 成功。

### 步骤 3：进入 Harness 源码

```bash
cd sources/checkouts/deepseek-harness
pnpm install
```

后续命令都在这里执行，行为才与锁定 commit 对齐。

### 步骤 4：先跑负向用例（缺 key）

**先跑失败，再跑成功。** 开一个没有 key 的 shell：

```bash
env -u DEEPSEEK_API_KEY pnpm dsh --profile headless "你好"; echo "exit=$?"
```

期望：**受控失败**，错误指向缺少 credential，而不是进程崩溃或泄露 secret。

```text
实验：缺 DEEPSEEK_API_KEY
预期：MISSING_CREDENTIAL 或等价受控错误
实际：
是否泄露 key：否
```

**为什么先跑失败？** 可靠系统不只是成功路径好看，失败路径也要可解释。

### 步骤 5：配置 key 并跑最小任务

```bash
export DEEPSEEK_API_KEY="你的个人 key"
pnpm dsh --profile headless "用一句话说明你是谁"; echo "exit=$?"
```

不要只看最后那段回答。要确认五件事：进程是否正常退出、回答是否来自 `deepseek-official` route、是否产生 session、是否 flush、stderr 是否干净。

### 步骤 6：观察 Session 证据

headless runner 在 Agent idle 后调用 `sessions.flush()`（文章 10 的 `index.ts:127`）。核对：

```text
session id：
turn/start：
user/message：
assistant/message：
turn/end：
flush 完成：
退出码是否对应 turn/end 的 reason.kind === 'completed'：
```

如果没有配置持久化 backend，**记录为「未配置持久化 backend」**，不要写成「session 已 durable」。

### 步骤 7：跑一次负向工具 / 权限实验

选一个不会造成破坏的失败：调用不存在的工具、触发 approval unavailable、触发只读工具的 schema 错误。

期望：错误被**包装成工具结果**、Session 中有失败记录、无未审计副作用、不因单个工具错误导致整个进程无解释崩溃。

### 步骤 8：制造一次中断，观察修复

```bash
pnpm dsh --profile headless "逐个读取 packages/core 下每个子目录的 README" &
sleep 6 && kill -9 %1
```

核对 `turn/end` 的 `reason.kind === 'interrupted'`，以及中断工具的 error code 是 `TOOL_NOT_STARTED` 还是 `TOOL_OUTCOME_UNKNOWN`（文章 05）。

**杀进程的时机决定你看到哪一种**——这两个状态的区别是可以复现出来的。

## 四、实验记录模板

```yaml
study_id: local-first-run-001
source_commit: 47f943859bef60e4160492346772ded9b24f765a
profile: headless
model_provider: deepseek-official
model_id: <实际模型>
credential_ref: DEEPSEEK_API_KEY      # 只记引用名,不记值
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

## 五、什么算成功

**算：**

- 正向任务能完成
- 缺 key 或错误配置能**受控失败**
- 不泄露真实 key
- **能说清证据层级**：启动、模型请求、session、任务完成分别是什么
- 记录可以让别人复现

**不算：**

- 只截图最后回答
- 只说「跑通了」，没有命令和环境
- 把真实 key 写进记录
- **用 HTTP 200 代替任务完成**
- 没有负向 case

## 六、可复现实验协议（做对照实验时）

### 预注册

先写清：研究问题、**唯一自变量**、主要指标、失败 taxonomy、retry 与停止条件。

**看到结果之后再改成功标准，只能记为 exploratory。**

### Manifest

```yaml
study_id: ds-adapter-ab-v1
source_sha: 47f943859bef60e4160492346772ded9b24f765a
package_version: 0.1.0-rc.5
model_route: deepseek-official
model_id: <model>
profile: <profile>
config_sha256: <config-hash>
task_set: <name-and-version>
sandbox: <backend-mode-enforcement>
permission_policy: <name>
max_tokens: <value>
wall_time_limit_s: <value>
tool_call_limit: <value>
sampling: <documented-values>
runtime: <os-arch-node-python>
```

**源码 SHA 与包版本同时记录；secret 只记引用、scope 与 rotation batch，不记值。**

### 隔离

- 每个任务独立 workspace / session / storage，从相同 immutable fixture 创建并记录 tree hash
- 禁止共享未声明的 cache、后台进程与 MCP 状态
- **测缓存时把 cold / warm 当作变量**（文章 06）
- 先跑 keyless 的协议纯净性 smoke，再跑需要真实 API 的任务

### 七层失败分类

**这是整个协议里最有价值的一张表。** 不分层就会把 Harness 的 bug 算成模型能力不足：

| 层 | 示例 | 处理 |
| --- | --- | --- |
| task / fixture | fixture 损坏、依赖源不可达 | 修任务后**整批失效重跑** |
| protocol / adapter | malformed SSE、缺完成标志、role/tool 不兼容 | 系统失败，按预注册决定重跑 |
| provider | 429 / quota / 5xx / timeout | 固定 retry，**保留全部成本** |
| Harness | registration / session / persistence / scheduler bug | **单列系统可靠性，不冒充模型失败** |
| policy / sandbox | 误拒或危险放行 | 安全指标；**不得静默换 full-access** |
| model / task | 策略或代码错误、未完成 | 主要能力指标 |
| scorer | flaky、漏判 | 冻结后**重算全部轨迹** |

### 统计与复现包

非确定性任务做多次独立 run，报告置信区间，以及 token / cache / cost / time / tools / approval 与失败分布。

pass@k 要写明 k、采样、并发和总成本。**超时与取消不能静默移出分母。**

复现包含：manifest schema、任务版本、无 secret 的配置、启动命令、scorer、脱敏 trajectory、结果摘要。

### 最小 A/B 检查清单

- 唯一变量是否真的只有一个？
- **tools schema 顺序、system prompt、时间上下文是否稳定？**（文章 04、06）
- retry 与预算是否同等？
- **cache 是否单列？**
- scorer 是否预先冻结并盲评？
- **Harness 可靠性与模型能力是否分开报告？**

## 七、源码阅读方法

读一个代码块时固定问四句：

1. 它**接过了什么责任**？
2. 它**交给谁**？
3. 它**在哪里拒绝**？
4. 它**留下什么可验证证据**？

第 3 和第 4 句是这个仓库特有的——因为 dsh 的每条路径都要能拒绝，且每次拒绝都要留下模型可见的结果（文章 08）。

### 建议的第一轮阅读顺序

不要按文件名 A→Z 读。按**一次任务的主链路**读：

| 顺序 | 能力域 | 入口 | 对应文章 |
| --- | --- | --- | --- |
| 1 | 启动 | `apps/cli/src/bin.ts` → `profile-boot.ts` → `packages/boot/app-boot/src/index.ts` | 02 |
| 2 | 插件运行时 | `vendor/cordis/src/{context,fiber,service}.ts`、`vendor/loader/src/index.ts` | 02 |
| 3 | 循环 | `packages/core/agent-loop/src/{agent,tool-calls}.ts` | 03 |
| 4 | Prompt | `packages/core/system-prompt/src/index.ts` | 04 |
| 5 | 会话 | `packages/core/session/src/{surface,repair,request-header}.ts` | 05 |
| 6 | 模型适配 | `packages/llm/llm-deepseek/src/{serialize,sse,translate,adapter}.ts` | 09 |
| 7 | 工具治理 | `packages/core/tools/src/index.ts` | 08 |
| 8 | 产品表面 | `packages/bundle/{headless,web-app}/src/index.ts` | 10 |

### 每篇文章末尾的「尚未覆盖」是路线图

12 篇文章每篇末尾都列了「本篇尚未覆盖的源文件」。**把它们合起来就是下一轮深读的清单**，也是这个仓库承认的覆盖边界。

### 十个类比：把机制讲给非研发听

读懂之后要能讲出去。这十个类比覆盖主链路上的关键函数，用同一套「公司」隐喻串起来：

| 函数 | 类比 |
| --- | --- |
| `runProfile()` | 打开一个**工作台模板**。模板决定这次是 Web 工作台还是 headless 一次性任务 |
| `loadLayeredEnv()` | 员工可以**带自己的门禁卡**，但不能随便改大楼安检系统 |
| `boot()` | 把公司**组织架构图变成真实入职的员工和岗位**。图纸存在不等于人已到岗 |
| `Context.extend/isolate/intercept()` | 同一家公司里的**不同项目组**。共享公司系统，但某个组可以有自己的权限、预算和流程 |
| `Service` 构造函数 | 服务不是焊死的。它像一个**岗位**：插件上岗时岗位出现，离岗时岗位撤销 |
| `Loader.constructor` | **人事系统 + 排班系统**。配置说要哪些岗位，它负责安排上岗；配置变了负责换班和撤岗 |
| `AgentLoop.createAgent()` | 开一个**新任务办公室**。不只是派一个人，还要开房间、配权限、开日志、设置退出流程 |
| `resolveAdapterOptions()` | 每次打电话给供应商前**确认号码、合同、预算和身份凭证**。不能拿旧号码配新钥匙 |
| `ToolRuntime.execute()` | **采购 / 审批 / 执行 / 报销系统**。不能绕过审批直接花钱，也不能执行完不留记录 |
| `PersistenceCoordinator.append()` | **财务流水账**。编号必须连续不能断号，也不能把两个项目的流水写进同一本账 |

最后两个尤其值得记：**「不能绕过审批直接花钱」对应文章 08 的统一工具流水线，「不能断号、不能混账本」对应文章 05 的 append-only 与 collision 检测。** 这两条是 dsh 最容易被外行误解、也最容易被内行忽略的设计约束。

## 八、插件实验（Lab 1–6 递进）

想真正理解「一切皆插件」，按这个顺序动手：

| Lab | 目标 | 验收 |
| --- | --- | --- |
| 1 | host-only 插件，**可逆** | dispose 后无残留 listener / timer |
| 2 | provider / consumer seam | 换 provider，consumer 无感 |
| 3 | 配置 patch 与 HMR | 验 entry root lazy config、`disabled` 的特殊 interpolation、候选失败 rollback、写入 durable drain、连续变更 coalescing |
| 4 | host / client 双端 | generation 配对，client chunk 可加载 |
| 5 | 工具与安全 | 走完七段流水线，deny 路径有 `tool/result` |
| 6 | 树外安装与发布 | 在复制的 profile 中验 PENDING / ACTIVE / FAILED / HMR / dispose |

Lab 3 的五个验收项对应文章 02 的 vendored Cordis 差异清单——**那 18 类修改里有一半是为了让 Lab 3 能通过**。

## 九、全部实验索引

| 文章 | 实验 | 需要凭据 |
| --- | --- | --- |
| 01 | 数 219 包与 219 invariant | 否 |
| 01 | dump-config 区分「配置启用」与「运行激活」 | 否 |
| 01 | headless 跑通一次 | **是** |
| 02 | 数 vendored 包与 18 类本地修改 | 否 |
| 02 | 证明 profile 根配置是 `[]` | 否 |
| 02 | 观察 bootstrap-only 变量被拒绝 | 否 |
| 03 | 读调度器三层循环 | 否 |
| 03 | 跑 `tool-order.spec.ts` / `cancel.spec.ts` | 否 |
| 03 | 观察真实 turn 的事件序列 | **是** |
| 04 | 读五注册点与插值规则 | 否 |
| 04 | 跑 system-prompt 单测 | 否 |
| 04 | 对比事件日志与模型可见消息 | **是** |
| 05 | 读两段恢复指示原文 | 否 |
| 05 | 跑 session 与崩溃恢复测试 | 否 |
| 05 | 制造中断并观察修复 | **是** |
| 06 | 数 215/305 覆盖面与四分类词频 | 否 |
| 06 | 找出 4 个豁免包并核对理由 | 否 |
| 06 | 跑 `request-cache.e2e.ts` | **是** |
| 06 | 实测缓存命中率趋势 | **是** |
| 07 | 读三个被否决的方案 | 否 |
| 07 | 核对指令在末尾 | 否 |
| 07 | 跑压缩测试 | 否 |
| 07 | 观察一次真实压缩 | **是** |
| 08 | 核对四态与类型排除 | 否 |
| 08 | 跑工具 / 审批 / 沙箱测试 | 否 |
| 08 | 五场景副作用矩阵 | **是** |
| 09 | 读三条协议规则 | 否 |
| 09 | 跑 serialize / sse / translate 单测 | 否 |
| 09 | 真实协议行为矩阵（9 个场景） | **是** |
| 10 | 核对公开名与错误码 | 否 |
| 10 | 验证退出码语义 | **是** |
| 10 | 区分四种 ready | **是** |
| 11 | 数不变量与空实现比例 | 否 |
| 11 | 读一个空实现与一个满实现 | 否 |
| 11 | 遍历 Agent Note 分类分布 | 否 |
| 11 | 读四篇复盘的 Executive summary | 否 |
| 12 | 复核七个仓库的规模 | 否 |
| 12 | 复核制度差异 | 否 |
| 12 | 验证「只有 dsh 强制 KV-cache 文档化」 | 否 |
| 12 | 同一任务跑三家 | **是** |

**39 个实验，其中 26 个不需要任何凭据。** 建议先把这 26 个跑完再申请 key。
