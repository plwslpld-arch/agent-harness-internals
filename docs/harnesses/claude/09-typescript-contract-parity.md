# TypeScript SDK：公开契约能讲到哪里

[返回 Claude 课程地图](README.md)

前一篇已经把 MCP、Agent Definition 和 Skill 分到三条不同的装配与执行路径上，但换成 TypeScript 之后，你不能直接假定这三条路还按同样的结构运作。证据到哪，我们就读到哪。

写跨语言 SDK 时，最容易犯的错是先在 Python 里找到一段内部实现，再把同一套结构安到 TypeScript 头上。当前锁定的 TypeScript 仓库没有公开 SDK 主体的 Runtime（运行时）源码，因此这一篇只读实际看得到的 README、CHANGELOG、SessionStore（会话存储）示例和测试。边界就在这里。

## 当前锁定树里实际有什么

提交 `48275071e804139579fabada9bb8d90cfe02b062` 包含：

- 项目 README、CHANGELOG 和许可证；
- GitHub 工作流与维护脚本；
- PostgreSQL、Redis、S3 三套 SessionStore 参考 Adapter；
- Adapter 的共享契约测试与各后端测试。

这个仓库看不到 SDK Runtime 常见的 `src` 主体，也没有公开包入口和控制协议的实现，所以下面几类材料各自能证明什么，必须分开写：

| 证据 | 可以说明 | 不可以说明 |
| --- | --- | --- |
| README | 项目定位和公开指引 | Runtime 内部调用顺序 |
| CHANGELOG | 某版本声称新增或修复什么 | 该分支具体怎样实现 |
| 示例 Adapter | SessionStore 怎样映射到后端 | SDK 怎样调度所有 Store 回调 |
| 共享测试 | 示例认定的行为契约 | npm 包全部边界条件 |
| Python 源码 | Python 提交中的实现 | TypeScript 必然同构 |

## 契约对齐与实现对齐不是一回事

Python 和 TypeScript 都可以向外提供 `query`、权限、Hooks、MCP 与 SessionStore，这只能说两边暴露的契约属于同一类。要判断内部的类、状态机、并发控制和资源清理是否真的对齐，你必须同时拿到两种语言在同一版本下的 Runtime 实现证据。

CHANGELOG 能提醒你哪些地方可能带来升级风险，例如它记过什么时候会发出 `canUseTool` 遮蔽警告、哪些 Tools 对模型可见、SessionStore 怎样重试，也记过 stdin 过早关闭这类问题：[查看锁定 CHANGELOG 中的权限回调变化](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/CHANGELOG.md#L227-L255)。但它记的是版本对外声明，并没有把对应函数的实现交给我们。

## 真实可读案例：PostgreSQL SessionStore

在 TypeScript 锁定树里，外部 Store Adapter（适配器）最适合顺着往下读，因为这部分同时留下了完整源码和契约测试。

### 第 1 站：示例把 Store 交给 `query()`，并用 Session ID 恢复

源码：[查看 PostgreSQL 端到端示例](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/examples/session-stores/postgres/demo.ts#L23-L44)

```typescript
const store = new PostgresSessionStore({ pool })
await store.ensureSchema()

for await (const m of query({
  prompt,
  options: { sessionStore: store, resume, maxTurns: 1 },
})) {
  if (m.type === 'system' && m.subtype === 'init') sessionId = m.session_id
}
```

- **调用者**：示例应用的 `run()` 函数。
- **输入**：Prompt、Store、可选 Resume ID 和轮数限制。
- **状态变化**：SDK 运行会话并镜像记录；示例从 init 消息提取 Session ID。
- **返回**：`run()` 返回该 ID，下一次调用用它恢复。
- **下一站**：Store Adapter 将 append/load 映射到 PostgreSQL 表。

这段示例只把公开用法展示给你，你无法由此判断 TypeScript Runtime 是否像 Python 那样，会调某个函数把外部记录落到临时目录。

### 第 2 站：Adapter 用递增 ID 保存顺序

源码：[查看 PostgreSQL Adapter](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/examples/session-stores/postgres/src/PostgresSessionStore.ts#L15-L77)

```typescript
export class PostgresSessionStore implements SessionStore {
  async append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void> {
    ...
  }

  async load(key: SessionKey): Promise<SessionStoreEntry[] | null> {
    ... ORDER BY id
  }
}
```

- **调用者**：Agent SDK 通过公开 Store 契约调用；测试也会直接调用。
- **输入**：projectKey、sessionId、可选 subpath 和记录列表。
- **状态变化**：每条 JSON 记录写入一行，`BIGSERIAL` 提供该表中的稳定顺序。
- **返回**：`load()` 按 ID 还原记录，不存在时返回 `null`。
- **下一站**：共享 conformance suite 检查追加顺序、Key 隔离和可选行为。

写入记录时，这里会绑定参数值，同时检查表名是否只含合法的 SQL 标识符字符。由于表名无法像普通值那样绑定成参数，构造 Adapter 时就必须先校验，这一道检查会直接挡住表名注入。

### 第 3 站：共享测试明确最小行为

源码：[查看 SessionStore 契约测试](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/examples/session-stores/shared/conformance.ts#L20-L87)

```typescript
type SessionStore = {
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>
  listSessions?(projectKey: string): Promise<...>
  delete?(key: SessionKey): Promise<void>
  listSubkeys?(key: ...): Promise<string[]>
}
```

- **调用者**：每个后端测试用一个全新 Store Factory 注册相同测试集。
- **输入**：隔离的 Adapter 实例和构造好的记录序列。
- **状态变化**：测试执行多次 append、load 和 Key 隔离操作。
- **返回**：断言深度相等、顺序一致、不存在返回 null 等契约。
- **下一站**：后端特有测试再检查 SQL、S3 分片或 Redis 索引细节。

共享 suite 先给 JSON 对象键排序，再比较两边是否深度相等，因此 PostgreSQL JSONB 重排对象键不会让测试误报。Python Store 的注释也表达了同样的行为，但证据只够我们说「两份公开契约在这一点相符」，还不能说两个 Runtime 复用了同一份实现。

## 怎样写跨语言对照表

对照每项能力时，至少要把下面四列摆在一起，这样你才不会把某一边的公开声明误当成两边共用的实现证据：

| 能力 | Python 锁定源码 | TypeScript 锁定树 | 可下结论 |
| --- | --- | --- | --- |
| Query 公开表面 | 有实现 | README/CHANGELOG 声明 | API 目的相近，内部未知 |
| 权限回调 | 有配置和控制分派源码 | CHANGELOG 记录 | 行为契约可比较，状态机不可比较 |
| SessionStore 示例 | 有 Protocol 与材料化源码 | 有三种 Adapter 和测试 | Store 数据契约可对照 |
| 关闭与子进程回收 | 有 Transport 源码 | 无主体 Runtime | 不写 TypeScript 内部顺序 |

如果以后锁定树放出了 Runtime 源码，要先更新来源提交，再按新提交重走一遍调用链，否则你很容易把新版本的实现倒填进旧版本结论。这一步不能省。

## 选择语言 SDK 时看什么

不要只因为这份课程能读到 Python 内部源码，就认定生产系统也必须用 Python。真正选语言 SDK 时，你还得考虑：

- 应用语言与部署环境；
- SDK 当前公开能力和版本稳定性；
- 团队能否测试权限、Hooks、Session 和关闭语义；
- 依赖与许可证要求；
- 是否需要自定义 Store、MCP 或浏览器表面。

源码和证据是否透明，会影响你评估风险，但它只是其中一项，选型最后还是要回到你的实际需求上。

跨语言对照必须停在可见契约的边界上。课程的最后一篇会回到真实运行，看错误究竟发生在哪一层，哪些可观测证据应该留下，以及独立 Eval（评测）怎样判断任务做得对不对。

下一篇收束 Claude 课程：[错误分类、可观测性与独立 Eval 接缝](10-surfaces-errors-eval-design.md)。
