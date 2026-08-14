---
sources: [{"repo":"deepseek-harness","path":"packages/bundle/web-app/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/bundle/headless/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/mcp/mcp-client/src/tools.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/mcp/mcp-client/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/acp","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/sdk/protocol/src/transport.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/client","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"acp-typescript-sdk","path":".","commit":"01010146a731212fbbb677d6055e0b7bf183b288"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"}]
last_verified: 2026-08-14
status: draft
depth: L2
audience: [engineering]
evidence: [code, test, official-doc]
---

# 10｜产品表面与协议：Web / headless / ACP / MCP / SDK / DSML

> 本文基线 `47f9438`。所有行号对应该 Commit。

## 一、产品现象

「Web 打开了、URL 出来了，所以能用了吧？」

不一定。进程 ready、服务 ready、Agent idle、Session durable closure 是四件不同的事，只有最后一件能证明任务完成。

| 现象 | 背后是什么 |
| --- | --- |
| 命令行和网页跑同样的任务，结果一致 | 共享同一个 runtime，只是产品表面不同 |
| 从编辑器里驱动它，但看不到完整思考过程 | ACP 公开面**有意做窄** |
| 接了个 MCP server，工具名变成一长串 | `mcp__<server>__<tool>` 是确定性命名 |
| 用 SDK 采集轨迹能拿到完整事件 | SDK JSON-RPC 流完整 session-event envelope |

## 二、源码路径

各面的代码量对比本身就说明定位：

| 包组 | 行数 | 是什么 |
| --- | --- | --- |
| `packages/client` | **43,561** | 浏览器 runtime 与 UI 插件 |
| `packages/host` | 10,634 | Host 侧 RPC schema 与 server |
| `packages/web` | 2,903 | web 能力 seam |
| `packages/api` | 1,807 | gateway 与 remotes |
| `packages/sdk` | 1,754 | JSON-RPC 协议、server、TS client |
| `packages/mcp` | 929 | MCP client |
| `packages/acp` | **532** | ACP server |

client 43,561 行 vs acp 532 行——交互产品面和自动化面根本不是一个量级，也不该是。

### 行号锚点

| 位置 | 是什么 |
| --- | --- |
| `mcp-client/src/tools.ts:97` | `` const joined = `mcp__${serverName}__${rawName}` `` |
| `mcp-client/src/index.ts:55` | 名字须匹配 `[A-Za-z0-9_-]{1,32}` |
| `sdk/protocol/src/transport.ts:229` | `-32601` method not found |
| `sdk/protocol/src/transport.ts:236` | `-32603` handler failure |
| `bundle/headless/src/index.ts:122` | `agent.followup(...)` |
| `bundle/headless/src/index.ts:127` | `await sessions.flush(agent.session)` |
| `bundle/headless/src/index.ts:133` | 退出码由 turn end reason 决定 |

## 三、机制

### 五个名字不是同一类东西

| 名称 | 它是什么 | 方向 |
| --- | --- | --- |
| **Web** | 给人用的产品表面 | — |
| **Headless** | 一次性命令任务入口 | — |
| **SDK JSON-RPC** | 程序控制 Harness | 外 → 内 |
| **ACP** | 编辑器 / 父 Agent 控制 Harness session | 外 → 内 |
| **MCP** | Harness 连接外部工具服务器 | 内 → 外 |
| **DSML** | 模型级序列化（本地自托管参考） | 模型侧 |

ACP 和 MCP 方向相反，这是最常混淆的一点。

### Headless：退出码来自 turn end reason

`bundle/headless/src/index.ts` 的主流程（150 行的包）： `evidence: code`

```ts
agent.followup(createUserMessage({ ... }))      // :122
await sessions.flush(agent.session)              // :127
io.exit(outcome.reason?.kind === 'completed' ? 0 : 1)   // :133
```

退出码 0 当且仅当 turn 的结束原因是 `completed`。 文章 03 里那四种结束原因——`max-tokens`、`aborted`、`blocked`、`UNKNOWN`——全部退出 1。

再看 `:127`：flush 在 exit 之前。这正是文章 05 说的 write-behind 的必然要求——屏幕上有输出不代表事件已落盘。

headless 适合做实验，因为命令、退出码、脱敏输出三样都容易记录。

### Web：ready URL 不是业务证明

Web bundle 的启动形状：

```ts
ctx.provide('webRuntime', runtime)
mountFrontendStatic(dist)
registerWebSystemPromptSection()
publishDshWebUrl()
waitForLoaderSettle()
printReadyUrl()
```

ready URL 是产品信号，不是业务 E2E 证明。 上游有一个专门的复盘（Postmortem 0003）就是关于这个：裸 Vite 或替代端口返回 HTTP 200，不能证明用户当前 origin 的 GUI 已经刷新——必须对同一个 URL 做浏览器可见行为验收。

Web 的三层结构：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| **Host** | `bundle/web-app/src/{startup,index}.ts`、`host/apiproxy` | 组装 surface；提供 sessions/approvals/settings/credentials/jobs/goals/skills 的 RPC schema |
| **Bridge** | `client/connection/src/{rpc-host,http-bridge,websocket-downlink,api-request-trust}.ts` | HTTP/RPC/downlink 与信任检查 |
| **Client runtime** | `client/runtime/src/client/sessions/` | 从 event/projection 组装 conversation、pending、lineage、tool-call tree、timing、request inspection |

各个 `ui-*` 插件只往 slots / commands / settings / renderers 注册具体体验。

### MCP：只桥接 tools，公开名是确定函数

`mcp-client/src/tools.ts:97`： `evidence: code`

```ts
const joined = `mcp__${serverName}__${rawName}`
```

公开名是 `(serverName, rawName)` 的**确定性函数**——重新发现不会因为顺序漂移而改名。名字须匹配 `[A-Za-z0-9_-]{1,32}`（`index.ts:55`），需要字符替换或截断时会加 hash 保证唯一。

当前只桥接 tools，不消费 resources / prompts。 这一点在评估「MCP 支持度」时要说清楚。

**代际更新语义**是这一层比较讲究的地方：

| 事件 | 行为 |
| --- | --- |
| 发现失败 | **保留旧一代**，不清空 |
| 注册冲突（重复 serverName / 重复原始名） | **回滚整整一代**，避免半套工具残留 |
| `list_changed` 或重连 | 按**整代替换**注册 |
| stdio 崩溃 | supervisor 指数退避 |
| 预算耗尽 | 注销工具 |

「整代」是关键词：工具集要么整体切换，要么完全不动，不允许出现「一半新一半旧」的中间状态——那会让模型看到一个自相矛盾的工具列表。

注意 stdio 与 HTTP 的差异不能互推：stdio 有 spawn / reconnect 语义，HTTP 不可达更多表现为**逐请求失败**。

### ACP：有意做窄

ACP bridge 占用 stdin/stdout，stdout 必须协议纯净。一个连接可以拥有多个会话，`session/new` 需要绝对 cwd。

**当前明确拒绝**：非空 additional directories、MCP servers。

**当前不公开**：完整 reasoning、tool、plan、title、transcript。
**当前不支持**：load / list / fork / delete、单会话 close。

还有一个语义陷阱：`end_turn` 表示桥接拥有的活动已停稳，不应解释成某个底层 turn 的精确 finish reason。

ACP SDK（`01010146a731…`）的 v2 实现增加了内置 response parser 的统一校验、batch response mapper 前校验、未识别协议方法与扩展方法的类型区分。这让「协议能连上」更接近「双方 message shape 被验证」——但不等于 Harness 暴露了完整会话管理或 UI 能力。

### SDK JSON-RPC：仓库自有 wire

`sdk/protocol/src/transport.ts` 的 `JsonRpcLineTransport`，每行一个 JSON-RPC 2.0 frame： `evidence: code`

| 情况 | 行号 | 行为 |
| --- | --- | --- |
| 非法 JSON 行 | — | 忽略 |
| 缺失请求 handler | `:229` | `-32601` method not found |
| handler 抛异常 | `:236` | `-32603` |
| 无 handler 的通知 | — | 丢弃 |

业务方法：`initialize`、`session/prompt`、`shutdown`，以及 session event/status、subagent 通知。

它流完整的 session-event envelope——所以采集 benchmark 轨迹优先用 SDK。客户端自己组合「prompt 已持久入队」和「Agent idle」两个信号。

当前**没有**协议版本协商、单轮取消、session close，所以 protocol types、TS client、Python SDK 与 server **必须作为原子兼容集升级**。

### ACP 与 SDK 都用 JSON-RPC，但是两套协议

| 维度 | ACP | SDK JSON-RPC |
| --- | --- | --- |
| 连接模型 | 一个连接拥有多个新会话；清理时 drain 自有可继续后代 | 更像由外部进程管理的无人值守组合 |
| prompt 返回 | **stop reason** | **持久入队的 message id**，再靠 event/status 判定活动 |
| 事件面 | 窄 | 完整 session-event envelope |

不得用一个 client 的成功用例为另一套 wire 背书。

### DSML：模型级，不是在线 wire

V4 模型仓库不提供 Jinja chat template，而提供 Python encoder/parser（`encoding_dsv4.py`）。DSML 把 OpenAI 形状的工具渲染进提示词，用 `tool_calls / invoke / parameter` 表示调用，区分原始字符串与 JSON 参数，并把结果放进后续 user 消息的 `<tool_result>`。

它不是 Harness 在线请求直接发送的 XML。 原生 adapter 调的是 Chat Completions SSE（文章 09）。

DSML 的用途是理解模型训练 / 自托管的编码约定，以及构建 golden compatibility tests。注意：官方 parser 只面向格式良好的输出，生产实现还必须处理畸形与截断。

### 至少三份互相关联的真源

一次 MCP 工具调用要跨过三套 schema：

```
MCP schema  ←→  Harness session-event vocabulary  ←→  DeepSeek provider wire
```

任何一份变化都可能造成兼容性回归。 这是端到端七步转换链的根本复杂度来源。

## 四、约束与失效条件

### 四种 ready 不能互相替代

| 信号 | 证明了什么 |
| --- | --- |
| 进程 ready | 进程起来了 |
| 服务 ready（HTTP 200 / ready URL） | 端口在监听 |
| Agent idle | 这一轮工作停稳了 |
| Session durable closure | **事件已落盘，任务真的完成了** |

只有最后一个能支撑「任务完成」的结论。

### 当前没有内置 TUI

固定基线里 `packages/ui/tui`、TUI profile / entry / tests / patch 都已删除（`2026-08-04-remove-tui-package`，状态 implemented）。

判断「某个产品面是否存在」的五检查项：

1. package / profile 是否存在
2. CLI 是否接受该命令
3. tests 是否覆盖
4. bundle 是否 shipped
5. 用户路径是否能跑通

通用的 question / command / approval / PTY / projection seam 仍可复用，但不能据此宣称存在 TUI 产品。外部 `turtle-ui` 地址当前不可访问，不能作为可运行插件教程。

### 「Web 是插件化的」不等于第三方 client 代码自动安全

UI 必须与 host 权限、session identity 同步。产品门禁至少包括：同 origin E2E、XSS 与不可信 tool output 处理、断线重放、approval ownership。

HMR 的 generation 必须配对：host candidate ready、client chunk 可加载、旧 handler/slot dispose、新 generation 生效。HMR 成功日志不是用户界面成功；构建产物、HMR receiver、page refresh 是三件不同的事。

### 权限最终由工具流水线结算

ACP 只承载一次性的权限请求与回答，最终结算仍走文章 08 的工具流水线。协议层不是权限的决定者。

### 选型表

| 目标 | 选择 |
| --- | --- |
| 给 Harness 加外部工具 | **MCP** |
| 编辑器 / 父 Agent 驱动 Harness | **ACP** |
| Python 批处理、采集完整轨迹 | **SDK JSON-RPC** |
| 自托管 V4、验证 chat template | **DSML encoding** |
| 浏览器交互产品 | **Web / API surface** |

### 接入门禁（八条）

1. 记录双方 SHA、包版本、config hash
2. 用真实入口，不是手挂插件
3. **stdout 零污染**
4. 覆盖非法 frame、断流、timeout、abort、重连
5. 权限拒绝 / 取消 / 错误产生**唯一可审计结果**
6. 工具 schema 变化不能静默改名或部分注册
7. 恶意 schema、工具列表大规模变化、HTTP 鉴权过期、prompt-injection 输出都要验
8. 代码里存在重连逻辑 ≠ 远端服务可信

## 五、可复核实验

### 实验 1：核对公开名与错误码（无需凭据）

```bash
cd sources/checkouts/deepseek-harness
sed -n '80,100p' packages/mcp/mcp-client/src/tools.ts      # mcp__<server>__<raw>
sed -n '55,62p'  packages/sdk/protocol/src/transport.ts    # -32601 / -32603
sed -n '118,135p' packages/bundle/headless/src/index.ts    # flush 在 exit 之前
```

回答：为什么 MCP 注册冲突要回滚整整一代，而不是跳过冲突的那一个工具？

### 实验 2：验证退出码语义（需要凭据）

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness

# 正常完成
pnpm dsh --profile headless "说一句你好"; echo "exit=$?"      # 期望 0

# 中途取消
pnpm dsh --profile headless "逐个读 packages 下所有 README" & sleep 5; kill %1
# 检查 session 的 turn/end reason，并确认退出码非 0
```

**该得出**：退出码 0 严格对应 `turn/end` 的 `reason.kind === 'completed'`。`max-tokens` 也退出 1——这一点在脚本里包 dsh 时很容易踩，因为「模型说完了」但被截断过。

### 实验 3：区分四种 ready（需要凭据）

```bash
export DEEPSEEK_API_KEY="your-own-key"
cd sources/checkouts/deepseek-harness
pnpm dsh --profile web &
```

依次记录四个时间点：

1. 进程 PID 出现
2. ready URL 打印
3. 通过界面发起一个任务后，Agent 变 idle
4. Session flush 完成，`turn/end` 落盘

**该记录**：四个时间戳、命令、URL、session id。
**该得出**：第 2 步到第 4 步之间可能有很长的间隔。任何把第 2 步当作「可用」的验收标准都是错的——这正是 Postmortem 0003 的教训。

## 本篇尚未覆盖的源文件

- `packages/client`（43,561 行）—— 浏览器 runtime 与全部 `ui-*` 插件，本文只提了结构
- `packages/host/apiproxy` —— 全部 RPC schema 的字段级定义
- `packages/api/{gateway,remotes}` —— agent lookup 与 remote events
- `packages/mcp/mcp-client/src/transport.ts` —— stdio supervisor 与 HTTP 重连的差异实现
- `packages/acp/src/index.ts`（532 行）—— ACP 窄面的完整方法表
- `packages/sdk/{protocol,server,client}` 与 `python/` —— 原子兼容集的三方
