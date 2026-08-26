# TypeScript SDK：公开契约能讲到哪里

[返回 Claude 课程地图](README.md)

前一篇已经把 MCP、Agent Definition 和 Skill 的装配与执行路径分开——换到 TypeScript 后，不能据此假定三条路径仍然同构，因此阅读的边界必须停在证据处。

跨语言 SDK 课程最危险的写法，是在 Python 中找到一个内部实现，然后把它复制成 TypeScript 的「同构架构」。当前锁定的 TypeScript 仓库并没有公开 SDK 主体运行时源码，所以本篇只分析真实可见的 README、CHANGELOG、SessionStore 示例与测试。

## 当前锁定树里实际有什么

提交 `48275071e804139579fabada9bb8d90cfe02b062` 包含：

- 项目 README、CHANGELOG 和许可证；
- GitHub 工作流与维护脚本；
- PostgreSQL、Redis、S3 三套 SessionStore 参考 Adapter；
- Adapter 的共享契约测试与各后端测试。

它不包含通常可用于追踪 SDK Runtime 的 `src` 主体、公开包入口实现或控制协议实现。因此，下列结论层次必须分开：

| 证据 | 可以说明 | 不可以说明 |
| --- | --- | --- |
| README | 项目定位和公开指引 | Runtime 内部调用顺序 |
| CHANGELOG | 某版本声称新增或修复什么 | 该分支具体怎样实现 |
| 示例 Adapter | SessionStore 怎样映射到后端 | SDK 怎样调度所有 Store 回调 |
| 共享测试 | 示例认定的行为契约 | npm 包全部边界条件 |
| Python 源码 | Python 提交中的实现 | TypeScript 必然同构 |

## 契约对齐与实现对齐不是一回事

Python 和 TypeScript 都可以公开 `query`、权限、Hooks、MCP 和 SessionStore 概念。这叫契约家族相似。只有同时拿到两个同版本 Runtime 的实现证据——才能比较类、状态机、并发与资源清理是否对齐。

CHANGELOG 可以帮助发现版本迁移风险，例如它记录过 `canUseTool` 遮蔽警告、Tools 可见集合、SessionStore 重试和 stdin 过早关闭等变化：[查看锁定 CHANGELOG 中的权限回调变化](https://github.com/anthropics/claude-agent-sdk-typescript/blob/48275071e804139579fabada9bb8d90cfe02b062/CHANGELOG.md#L227-L255)。不过，这些材料只是版本声明，不能说明课程已经看到了相应函数的实现。

## 真实可读案例：PostgreSQL SessionStore

TypeScript 锁定树最适合深入学习的是外部 Store Adapter，因为源码和契约测试都完整存在。

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

这段示例证明公开使用方式，不证明 TypeScript Runtime 内部是否采用与 Python 相同的临时目录材料化函数。

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

这里还使用参数化值写记录，并校验表名只含合法 SQL 标识符字符。表名不能作为普通参数绑定，所以构造时校验是必要的注入边界。

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

共享 suite 使用排序键后的 JSON 表示比较深度相等，允许 PostgreSQL JSONB 重排对象键。这个行为与 Python Store 注释一致，但我们只能说「两个公开契约在这一点相符」，不能说 Runtime 复用了同一实现。

## 怎样写跨语言对照表

每个能力至少标四列：

| 能力 | Python 锁定源码 | TypeScript 锁定树 | 可下结论 |
| --- | --- | --- | --- |
| Query 公开表面 | 有实现 | README/CHANGELOG 声明 | API 目的相近，内部未知 |
| 权限回调 | 有配置和控制分派源码 | CHANGELOG 记录 | 行为契约可比较，状态机不可比较 |
| SessionStore 示例 | 有 Protocol 与材料化源码 | 有三种 Adapter 和测试 | Store 数据契约可对照 |
| 关闭与子进程回收 | 有 Transport 源码 | 无主体 Runtime | 不写 TypeScript 内部顺序 |

以后若锁定树增加 Runtime 源码，应先更新来源提交，然后重新梳理调用链，否则就可能拿新版本的实现倒填旧版本结论。

## 选择语言 SDK 时看什么

不要因为一份课程能读到 Python 内部源码就默认生产系统必须选 Python。实际选择还要考虑：

- 应用语言与部署环境；
- SDK 当前公开能力和版本稳定性；
- 团队能否测试权限、Hooks、Session 和关闭语义；
- 依赖与许可证要求；
- 是否需要自定义 Store、MCP 或浏览器表面。

证据透明度是风险因子之一，不替代需求评估。

跨语言对照停在可见契约之后，课程最后要回到一次真实运行：分清错误发生的层次，保留可观测证据，再让独立 Eval 判断任务质量。

下一篇收束 Claude 课程：[错误分类、可观测性与独立 Eval 接缝](10-surfaces-errors-eval-design.md)。
