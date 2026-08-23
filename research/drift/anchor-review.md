# 锚点复核工作量：HEAD~5 → 当前 lock

比对了 1007 处落在已变化文件上的锚点。**真正需要人读的是 18 处**；184 处已在中间提交里更新，804 处行号内容没动，1 处仍可机械平移。

| 档 | 数量 | 怎么处理 |
| --- | ---: | --- |
| same 未动 | 804 | 不用读 |
| moved 挪位 | 1 | 按新行号改，改完抽查上下文 |
| updated 已更新 | 184 | 中间提交已经改过，不再自动触碰 |
| changed 内容变了 | 17 | **必须人读**：这一行现在讲的还是原来那件事吗 |
| gone 找不到了 | 1 | **必须人读**：多半实现换了，正文结论要重写 |

## 逐篇

| 篇目 | 需要人读 | same | moved | updated | changed | gone |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `docs/11-web-client-and-host.md` | 5 | 43 | 0 | 30 | 4 | 1 |
| `docs/04-llm-adapter.md` | 4 | 49 | 0 | 41 | 4 | 0 |
| `docs/05-session.md` | 3 | 59 | 0 | 7 | 3 | 0 |
| `docs/08-orchestration.md` | 3 | 99 | 0 | 15 | 3 | 0 |
| `docs/02-kv-cache.md` | 2 | 60 | 0 | 16 | 2 | 0 |
| `docs/13-self-verification.md` | 1 | 40 | 0 | 4 | 1 | 0 |
| `docs/00-overview.md` | 0 | 11 | 0 | 2 | 0 | 0 |
| `docs/01-system-prompt.md` | 0 | 78 | 0 | 8 | 0 | 0 |
| `docs/03-agent-loop.md` | 0 | 20 | 0 | 3 | 0 | 0 |
| `docs/06-compaction.md` | 0 | 47 | 0 | 0 | 0 | 0 |
| `docs/07-tools-approval-sandbox.md` | 0 | 63 | 1 | 18 | 0 | 0 |
| `docs/09-extensions-and-code-mode.md` | 0 | 60 | 0 | 20 | 0 | 0 |
| `docs/10-cordis-boot-preset.md` | 0 | 48 | 0 | 1 | 0 | 0 |
| `docs/12-surfaces-and-protocols.md` | 0 | 39 | 0 | 6 | 0 | 0 |
| `docs/14-comparison.md` | 0 | 13 | 0 | 6 | 0 | 0 |
| `docs/15-agent-notes-guide.md` | 0 | 14 | 0 | 0 | 0 | 0 |
| `docs/appendix-a-glossary.md` | 0 | 58 | 0 | 7 | 0 | 0 |
| `docs/appendix-b-verification.md` | 0 | 3 | 0 | 0 | 0 | 0 |

## gone：内容在新版本里找不到了

- `docs/11-web-client-and-host.md:319` 引 `deepseek-harness!packages/client/web/src/boot.tsx:98`（文件在新版本里不存在）
  - 原行：`this.manifest = parseBootManifest((globalThis as DshWindow).__DSH_BOOT__)`

## changed：行号还在，内容变了

- `docs/02-kv-cache.md:74` 引 `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:279`
  - 旧：`const body = serializeRequest(options, connection.defaults)`
  - 新：`+ `(${version.mediaType}, 8-bit ${colour}, ${version.width}x${version.height})``
- `docs/02-kv-cache.md:445` 引 `deepseek-harness!packages/llm/token-meter/src/usage-projection.ts:107`
  - 旧：`export const tokenUsageProjectionDefinition:`
  - 新：`type ContextPressureState = z.infer<typeof contextPressureStateSchema>`
- `docs/04-llm-adapter.md:186` 引 `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:169`
  - 旧：`// A short title budget must produce visible text; conversation and`
  - 新：`switch (block.type) {`
- `docs/04-llm-adapter.md:227` 引 `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:96`
  - 旧：`// Official passback rule (guides/thinking_mode.mdx): reasoning_content`
  - 新：`return defaults.thinking === undefined ? {} : { thinking: defaults.thinking }`
- `docs/04-llm-adapter.md:326` 引 `deepseek-harness!packages/llm/llm/src/retry-policy.ts:14`
  - 旧：`const DEFAULT_MAX_RETRIES = 2`
  - 新：`const DEFAULT_MAX_RETRIES = 5`
- `docs/04-llm-adapter.md:465` 引 `deepseek-harness!packages/llm/llm/src/retry-policy.ts:14`
  - 旧：`const DEFAULT_MAX_RETRIES = 2`
  - 新：`const DEFAULT_MAX_RETRIES = 5`
- `docs/05-session.md:252` 引 `deepseek-harness!packages/session/session-persistence-sqlite/src/schema.ts:48`
  - 旧：`/** An `events` table row: one `SessionEvent` mapped 1:1 (`data` is JSON text). */`
  - 新：`/** Durable journal modes accepted by the backend. */`
- `docs/05-session.md:254` 引 `deepseek-harness!packages/session/session-persistence-sqlite/src/schema.ts:26`
  - 旧：`* A row of the `sessions` table — the out-of-log metadata ({@link SessionHeader}).`
  - 新：`readonly created_at: number`
- `docs/05-session.md:264` 引 `deepseek-harness!packages/session/session-projection/src/index.ts:42`
  - 旧：`export interface ProjectionDefinition<K extends keyof SessionProjectionMap, S> {`
  - 新：`export interface ProjectionDefinition<`
- `docs/08-orchestration.md:200` 引 `deepseek-harness!packages/subagent/subagent-claude-code/src/index.ts:53`
  - 旧：`readonly name = 'claude-code'`
  - 新：`/** Grace in milliseconds for Claude Code process-tree termination. */`
- `docs/08-orchestration.md:211` 引 `deepseek-harness!packages/subagent/subagent-claude-code/README.md:79`
  - 旧：`Through `dsh-tool-subagent`, the parent sees only the strict final Claude Code answer or the consumer's exact error for `
  - 新：`name: '@deepseek-ai/dsh-tool-jobs'`
- `docs/08-orchestration.md:213` 引 `deepseek-harness!packages/subagent/subagent-codex/src/run.ts:41`
  - 旧：`: ['codex', 'app-server', '--stdio']`
  - 新：`}`
- `docs/11-web-client-and-host.md:135` 引 `deepseek-harness!packages/client/ui-trajectory/README.md:5`
  - 旧：`Trajectory renders a turn-aware event ledger with selectable User, Assistant, Tool, and nested Subtool records. Thick ru`
  - 新：`Trajectory renders a turn-aware event ledger with selectable User, Assistant, Tool, and nested Subtool records. Thick ru`
- `docs/11-web-client-and-host.md:313` 引 `deepseek-harness!packages/client/modules/src/index.ts:170`
  - 旧：`const script = `<script>window.__DSH_BOOT__ = ${json}</script>``
  - 新：`url: `/plugins/${id}/client.js?rev=${rev}`,`
- `docs/11-web-client-and-host.md:329` 引 `deepseek-harness!packages/client/web/README.md:5`
  - 旧：`Web shell kernel: `new AppWebEntry(el, seams?).run()` mounts the whole client through the two-stage boot (web2). Stage o`
  - 新：`Web boot kernel: `new AppWebEntry(el, seams?).run()` mounts the client through two stages. The module stage calls the Ho`
- `docs/11-web-client-and-host.md:394` 引 `deepseek-harness!packages/client/connection/README.md:5`
  - 旧：`Wire consumer layer: the client plugin's apply mounts `ctx.connection` (shared api client + current-page loopback state `
  - 新：`Wire consumer layer: the client plugin's apply mounts `ctx.connection` (shared api client + current-page loopback state `
- `docs/13-self-verification.md:191` 引 `deepseek-harness!docs/testing.md:49`
  - 旧：`Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless scenario in the same PR through a`
  - 新：`Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless scenario in the same PR through a`

## moved：内容没变，行号要改

| 出处 | 引用 | 新行号 |
| --- | --- | ---: |
| `docs/07-tools-approval-sandbox.md:165` | `deepseek-harness!docs/tool-catalog.md:667` | 696 |

