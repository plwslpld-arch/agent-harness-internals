# 复核笔记：2026-08-23 重锁之后

重锁把五个源全部推到当日 HEAD，21 篇正文一律标成 `stale`。这份笔记记的是复核过程中的已查实结论，供后续接手的人不必重查一遍。

## 一个必须先说清的区别

`check:drift` 报「396 处锚点落在已变化的文件上」，`check:anchors` 只报出 **7 处真的坏了**。两个数字都对，量的不是同一件事：

- **7 处**是机器能验的坏：路径没了、行号越界、引文对不上。
- **396 处**是需要人读的量：行号还指得中一行真实存在的代码，但那一行是不是原来引用的那一行、那一段讲的机制还成立不成立，机器判断不了。

所以「`check:anchors` 全绿」不等于「结论还成立」。复核的工作量是后一个数字，不是前一个。

## 已修

| 位置 | 原引用 | 现引用 | 依据 |
| --- | --- | --- | --- |
| `docs/12-surfaces-and-protocols.md:457` | `packages/acp/acp/src/index.ts:235` | `:291` | 注释 `Single-version agent` 原样搬到 291 行 |
| `docs/12-surfaces-and-protocols.md:457` | `packages/acp/acp/src/index.ts:238` | `:295` | `protocolVersion: PROTOCOL_VERSION` 现在在 295 行 |

同段落里 `packages/sdk/server/src/server.ts:124` 与 `packages/sdk/client/src/client.ts:270-274` 逐字复核过，两处仍然准确，不动。

## 待修：`docs/11-web-client-and-host.md`

这篇不能靠推行号救活，上游删了它写的两个包。

### 已查实的去向

| 原引用 | 现状 | 备注 |
| --- | --- | --- |
| `packages/client/web-react/src/bind.ts:18` | 移到 `packages/client/ui-renderer/src/client/bind.ts:18` | `bindSnapshotSelector` 仍在 18 行，`useSyncExternalStoreWithSelector` 仍在 22 行，行号未变 |
| `packages/client/web-react/README.md:5` | 对应段落移到 `packages/client/ui-renderer/README.md:7` | **引文变了**，原文「hosts and engines traffic in bare observable sources; every hook binds here, cached per source」已改写成「Business plugins pass bare observable sources through typed slot `hooks`; the renderer binds them at the outlet」。正文引的英文原文与中译都要跟着换 |
| `packages/client/ui-subagent/src/client/index.ts:121-123` | 该文件从 123 行以上缩到 77 行，`conversation.composer` 的注册块现在在 `:68-76` | 注册模式没变，仍与 `ui-user-questions` 一致 |
| `packages/client/ui-user-questions/src/client/index.ts:56-57` | 仍然准确 | 复核过，不动 |
| `packages/client/web/src/boot.tsx:98` | 文件改名为 `boot.ts`（不再是 TSX） | 「缺失就抛错」对应的是 `boot.ts:51` 的 `window.__ModuleLoader__ bootstrap facade is missing`；`modules/src/client/manifest.ts:110` 现在落在一段注释里，真正的校验位置要重新定位 |
| `packages/client/schema-form/src/model.ts:19-20` 与 `README.md:5` | **整个包已从上游删除** | 没有找到接替它的包。正文里那一整段讲的是「host 校验与浏览器草稿校验共用同一个 schema 对象」，这条结论现在无从核实，属于要重写而不是要改行号 |

### 还要重算的数字

- 「39 个包」在这篇里出现 **9 处**（含标题与顶部提示）。`packages/client/` 下现在是 **40 个目录**。删掉的有 `web-react`、`schema-form`，新增的有 `ui-deliverables`、`ui-jobs`、`ui-workflow-run`、`ui-agent-preset`、`ui-brand-official` 等。改数字之前要先把新旧清单对齐，否则「39 → 40」这个改法会掩盖掉「成分换了一批」这件更要紧的事。
- 「7.2 万行」需要在新 commit 上重数。
- 文末那张「39 个 client 包与总行数」的表要整张重做。

## 建议的下一步顺序

按 `check-drift` 的逐篇优先级走，但把这篇往前提：它的问题是内容过期而不是行号漂移，放着不改会一直挡在最显眼的位置。

1. `docs/11-web-client-and-host.md` 44/75，内容过期，按重写对待
2. `docs/04-llm-adapter.md` 82/123（67%），受影响比例最高
3. `docs/09-extensions-and-code-mode.md` 39/80
4. `docs/02-kv-cache.md` 36/82
5. 其余按报告里的比例顺序

复核完一篇，把 frontmatter 的 `commit` 更新到新值、`status` 改回 `reviewed`，这时该篇的锚点问题会从提醒升级成会让 CI 红的错误。
