# 锚点复核工作量：HEAD~1 → 当前 lock

比对了 1058 处落在已变化文件上的锚点。**真正需要人读的是 29 处**，其余 805 处行号内容都没动、224 处只是挪了位置。

| 档 | 数量 | 怎么处理 |
| --- | ---: | --- |
| same 未动 | 805 | 不用读 |
| moved 挪位 | 224 | 按新行号改，改完抽查上下文 |
| changed 内容变了 | 24 | **必须人读**：这一行现在讲的还是原来那件事吗 |
| gone 找不到了 | 5 | **必须人读**：多半实现换了，正文结论要重写 |

## 逐篇

| 篇目 | 需要人读 | same | moved | changed | gone |
| --- | ---: | ---: | ---: | ---: | ---: |
| `docs/11-web-client-and-host.md` | 9 | 44 | 22 | 4 | 5 |
| `docs/04-llm-adapter.md` | 5 | 49 | 69 | 5 | 0 |
| `docs/08-orchestration.md` | 5 | 99 | 17 | 5 | 0 |
| `docs/02-kv-cache.md` | 4 | 60 | 18 | 4 | 0 |
| `docs/05-session.md` | 4 | 59 | 6 | 4 | 0 |
| `docs/12-surfaces-and-protocols.md` | 1 | 39 | 10 | 1 | 0 |
| `docs/13-self-verification.md` | 1 | 40 | 5 | 1 | 0 |
| `docs/00-overview.md` | 0 | 11 | 3 | 0 | 0 |
| `docs/01-system-prompt.md` | 0 | 78 | 8 | 0 | 0 |
| `docs/03-agent-loop.md` | 0 | 20 | 4 | 0 | 0 |
| `docs/06-compaction.md` | 0 | 47 | 0 | 0 | 0 |
| `docs/07-tools-approval-sandbox.md` | 0 | 63 | 26 | 0 | 0 |
| `docs/09-extensions-and-code-mode.md` | 0 | 60 | 20 | 0 | 0 |
| `docs/10-cordis-boot-preset.md` | 0 | 48 | 2 | 0 | 0 |
| `docs/14-comparison.md` | 0 | 13 | 6 | 0 | 0 |
| `docs/15-agent-notes-guide.md` | 0 | 14 | 0 | 0 | 0 |
| `docs/appendix-a-glossary.md` | 0 | 58 | 8 | 0 | 0 |
| `docs/appendix-b-verification.md` | 0 | 3 | 0 | 0 | 0 |

## gone：内容在新版本里找不到了

- `docs/11-web-client-and-host.md:111` 引 `deepseek-harness!packages/client/web-react/src/bind.ts:18`（文件在新版本里不存在）
  - 原行：`export function bindSnapshotSelector<T>(w: HostObservable<T>): SnapshotSelectorHook<T> {`
- `docs/11-web-client-and-host.md:111` 引 `deepseek-harness!packages/client/web-react/README.md:5`（文件在新版本里不存在）
  - 原行：`Shell-side React glue for the slot terminal design: createSlotRenderer (the SlotRenderer implementation the shell instal`
- `docs/11-web-client-and-host.md:319` 引 `deepseek-harness!packages/client/web/src/boot.tsx:98`（文件在新版本里不存在）
  - 原行：`this.manifest = parseBootManifest((globalThis as DshWindow).__DSH_BOOT__)`
- `docs/11-web-client-and-host.md:415` 引 `deepseek-harness!packages/client/schema-form/src/model.ts:19`（文件在新版本里不存在）
  - 原行：`export function rehydrateSchema(serialized: unknown): SchemaNode {`
- `docs/11-web-client-and-host.md:415` 引 `deepseek-harness!packages/client/schema-form/README.md:5`（文件在新版本里不存在）
  - 原行：`Schema/draft model layer for settings editors. The wire's `settings.describe` carries each namespace's serialized schema`

## changed：行号还在，内容变了

- `docs/02-kv-cache.md:74` 引 `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:279`
  - 旧：`const body = serializeRequest(options, connection.defaults)`
  - 新：`+ `(${version.mediaType}, 8-bit ${colour}, ${version.width}x${version.height})``
- `docs/02-kv-cache.md:445` 引 `deepseek-harness!packages/llm/token-meter/src/usage-projection.ts:107`
  - 旧：`export const tokenUsageProjectionDefinition:`
  - 新：`type ContextPressureState = z.infer<typeof contextPressureStateSchema>`
- `docs/02-kv-cache.md:446` 引 `deepseek-harness!packages/client/ui-conversation/src/client/chat/StatsLine.tsx:109`
  - 旧：`export function cacheHitPercent(usage: TokenUsageProjection): number | null {`
  - 新：`let upper = 100`
- `docs/02-kv-cache.md:496` 引 `deepseek-harness!packages/llm/llm-pi-ai/src/replay.ts:21`
  - 旧：`export interface PiAiReplayState {`
  - 新：`/** Versioned response-level half of the pi-ai replay envelope. */`
- `docs/04-llm-adapter.md:186` 引 `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:169`
  - 旧：`// A short title budget must produce visible text; conversation and`
  - 新：`switch (block.type) {`
- `docs/04-llm-adapter.md:227` 引 `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:96`
  - 旧：`// Official passback rule (guides/thinking_mode.mdx): reasoning_content`
  - 新：`return defaults.thinking === undefined ? {} : { thinking: defaults.thinking }`
- `docs/04-llm-adapter.md:319` 引 `deepseek-harness!packages/llm/llm-pi-ai/src/replay.ts:20`
  - 旧：`/** Versioned adapter-private projection required to replay a pi-ai response. */`
  - 新：``
- `docs/04-llm-adapter.md:326` 引 `deepseek-harness!packages/llm/llm/src/retry-policy.ts:14`
  - 旧：`const DEFAULT_MAX_RETRIES = 2`
  - 新：`const DEFAULT_MAX_RETRIES = 5`
- `docs/04-llm-adapter.md:465` 引 `deepseek-harness!packages/llm/llm/src/retry-policy.ts:14`
  - 旧：`const DEFAULT_MAX_RETRIES = 2`
  - 新：`const DEFAULT_MAX_RETRIES = 5`
- `docs/05-session.md:250` 引 `deepseek-harness!packages/session/session-persistence-sqlite/src/schema.ts:20`
  - 旧：`export const SCHEMA_VERSION = 15`
  - 新：`export const SESSION_PERSISTENCE_SQLITE_APPLICATION_ID = 0x44534850`
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
- `docs/08-orchestration.md:205` 引 `deepseek-harness!packages/subagent/subagent-claude-code/src/index.ts:69`
  - 旧：`const executable = await this.ctx.subprocess.resolveExecutable(`
  - 新：`* the Codex sibling; each product's lifecycle remains package-private. */`
- `docs/08-orchestration.md:209` 引 `deepseek-harness!packages/subagent/subagent-claude-code/src/process.ts:63`
  - 旧：`? ['cmd.exe', '/d', '/v:off', '/s', '/c', `%${WINDOWS_BATCH_EXECUTABLE_ENV}%`, ...options.args]`
  - 新：`/**`
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
- `docs/12-surfaces-and-protocols.md:457` 引 `deepseek-harness!packages/acp/acp/src/index.ts:291`
  - 旧：`// record survives, so validate the record against the live registry`
  - 新：`// Single-version agent: the spec's "same version if supported, else`
- `docs/13-self-verification.md:191` 引 `deepseek-harness!docs/testing.md:49`
  - 旧：`Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless scenario in the same PR through a`
  - 新：`Every non-trivial model-, protocol-, or human-visible change adds or updates a keyless scenario in the same PR through a`

## moved：内容没变，行号要改

| 出处 | 引用 | 新行号 |
| --- | --- | ---: |
| `docs/00-overview.md:67` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:151` | 377 |
| `docs/00-overview.md:69` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:464` | 483 |
| `docs/00-overview.md:191` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:464` | 483 |
| `docs/01-system-prompt.md:115` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:161` | 344 |
| `docs/01-system-prompt.md:283` | `deepseek-harness!apps/cli/config/agent-presets/minimal/agent.cordis.yml:8` | 9 |
| `docs/01-system-prompt.md:314` | `deepseek-harness!packages/bundle/web-app/src/index.ts:142` | 236 |
| `docs/01-system-prompt.md:315` | `deepseek-harness!packages/bundle/web-app/src/index.ts:143` | 237 |
| `docs/01-system-prompt.md:317` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:225` | 243 |
| `docs/01-system-prompt.md:328` | `deepseek-harness!packages/web/tool-web/src/search.ts:216` | 316 |
| `docs/01-system-prompt.md:336` | `deepseek-harness!packages/subagent/tool-subagent/src/index.ts:459` | 468 |
| `docs/01-system-prompt.md:482` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:205` | 223 |
| `docs/02-kv-cache.md:16` | `deepseek-harness!packages/subagent/subagent-codex/tests/responses-fixture.ts:70` | 71 |
| `docs/02-kv-cache.md:26` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:151` | 377 |
| `docs/02-kv-cache.md:202` | `deepseek-harness!packages/llm/llm-deepseek/README.md:73` | 100 |
| `docs/02-kv-cache.md:206` | `deepseek-harness!packages/llm/llm-pi-ai/src/config.ts:130` | 154 |
| `docs/02-kv-cache.md:206` | `deepseek-harness!packages/llm/llm-pi-ai/src/adapter.ts:92` | 122 |
| `docs/02-kv-cache.md:259` | `deepseek-harness!packages/core/session/src/types.ts:372` | 376 |
| `docs/02-kv-cache.md:293` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:464` | 483 |
| `docs/02-kv-cache.md:316` | `deepseek-harness!packages/llm/llm/src/index.ts:779` | 824 |
| `docs/02-kv-cache.md:316` | `deepseek-harness!packages/llm/llm/src/index.ts:804` | 854 |
| `docs/02-kv-cache.md:423` | `deepseek-harness!packages/llm/llm-deepseek/README.md:107` | 134 |
| `docs/02-kv-cache.md:428` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:38` | 82 |
| `docs/02-kv-cache.md:429` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:225` | 243 |
| `docs/02-kv-cache.md:444` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:381` | 400 |
| `docs/02-kv-cache.md:481` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:228` | 246 |
| `docs/02-kv-cache.md:481` | `deepseek-harness!packages/bundle/web-app/src/index.ts:146` | 240 |
| `docs/02-kv-cache.md:492` | `deepseek-harness!docs/subsystems/llm-streaming.md:597` | 635 |
| `docs/02-kv-cache.md:496` | `deepseek-harness!packages/llm/llm/src/index.ts:823` | 878 |
| `docs/02-kv-cache.md:577` | `deepseek-harness!packages/llm/llm-deepseek/README.md:107` | 134 |
| `docs/03-agent-loop.md:18` | `deepseek-harness!packages/test-support/acp-snapshot/src/suite.ts:87` | 88 |
| `docs/03-agent-loop.md:20` | `deepseek-harness!examples/acp-agent/tests/acp.snapshot.ts:175` | 214 |
| `docs/03-agent-loop.md:331` | `deepseek-harness!packages/core/session/src/types.ts:343` | 347 |
| `docs/03-agent-loop.md:452` | `deepseek-harness!examples/acp-agent/tests/acp.snapshot.ts:382` | 455 |
| `docs/04-llm-adapter.md:18` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:173` | 131 |
| `docs/04-llm-adapter.md:39` | `deepseek-harness!packages/llm/llm-deepseek/tests/serialize.spec.ts:165` | 237 |
| `docs/04-llm-adapter.md:52` | `deepseek-harness!packages/llm/llm-deepseek/tests/mock-server.ts:28` | 30 |
| `docs/04-llm-adapter.md:104` | `deepseek-harness!packages/llm/llm/src/index.ts:338` | 365 |
| `docs/04-llm-adapter.md:104` | `deepseek-harness!packages/llm/llm/src/index.ts:405` | 432 |
| `docs/04-llm-adapter.md:106` | `deepseek-harness!packages/llm/llm/src/index.ts:387` | 414 |
| `docs/04-llm-adapter.md:106` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:258` | 449 |
| `docs/04-llm-adapter.md:108` | `deepseek-harness!packages/llm/llm/src/index.ts:734` | 770 |
| `docs/04-llm-adapter.md:110` | `deepseek-harness!packages/llm/llm/src/index.ts:779` | 824 |
| `docs/04-llm-adapter.md:110` | `deepseek-harness!packages/llm/llm/src/index.ts:155` | 156 |
| `docs/04-llm-adapter.md:112` | `deepseek-harness!packages/llm/llm/src/index.ts:913` | 985 |
| `docs/04-llm-adapter.md:112` | `deepseek-harness!packages/llm/llm/src/index.ts:921` | 993 |
| `docs/04-llm-adapter.md:127` | `deepseek-harness!packages/llm/llm/src/index.ts:843` | 898 |
| `docs/04-llm-adapter.md:127` | `deepseek-harness!packages/llm/llm/src/index.ts:931` | 1003 |
| `docs/04-llm-adapter.md:129` | `deepseek-harness!packages/llm/llm/src/index.ts:823` | 878 |
| `docs/04-llm-adapter.md:139` | `deepseek-harness!packages/llm/llm/src/assembler.ts:36` | 37 |
| `docs/04-llm-adapter.md:139` | `deepseek-harness!packages/llm/llm/src/assembler.ts:134` | 157 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:47` | 81 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:49` | 83 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:91` | 132 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:93` | 134 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:89` | 130 |
| `docs/04-llm-adapter.md:160` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:161` | 275 |
| `docs/04-llm-adapter.md:160` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:185` | 359 |
| `docs/04-llm-adapter.md:162` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:204` | 390 |
| `docs/04-llm-adapter.md:162` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:225` | 411 |
| `docs/04-llm-adapter.md:162` | `deepseek-harness!packages/llm/llm/src/index.ts:137` | 138 |
| `docs/04-llm-adapter.md:164` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:175` | 374 |
| `docs/04-llm-adapter.md:173` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:155` | 381 |
| `docs/04-llm-adapter.md:174` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:112` | 242 |
| `docs/04-llm-adapter.md:175` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:176` | 356 |
| `docs/04-llm-adapter.md:176` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:177` | 357 |
| `docs/04-llm-adapter.md:177` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:178` | 358 |
| `docs/04-llm-adapter.md:178` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:179` | 359 |
| `docs/04-llm-adapter.md:179` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:161` | 344 |
| `docs/04-llm-adapter.md:180` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:183` | 363 |
| `docs/04-llm-adapter.md:182` | `deepseek-harness!packages/llm/llm/src/types.ts:320` | 341 |
| `docs/04-llm-adapter.md:184` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:37` | 81 |
| `docs/04-llm-adapter.md:193` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:112` | 242 |
| `docs/04-llm-adapter.md:200` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:64` | 108 |
| `docs/04-llm-adapter.md:216` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:87` | 215 |
| `docs/04-llm-adapter.md:229` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:135` | 265 |
| `docs/04-llm-adapter.md:233` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:283` | 520 |
| `docs/04-llm-adapter.md:235` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:297` | 603 |
| `docs/04-llm-adapter.md:237` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:220` | 422 |
| `docs/04-llm-adapter.md:252` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:246` | 486 |
| `docs/04-llm-adapter.md:254` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:321` | 622 |
| `docs/04-llm-adapter.md:256` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:138` | 333 |
| `docs/04-llm-adapter.md:306` | `deepseek-harness!packages/llm/llm-deepseek/README.md:73` | 100 |
| `docs/04-llm-adapter.md:310` | `deepseek-harness!packages/llm/llm-pi-ai/package.json:45` | 46 |
| `docs/04-llm-adapter.md:316` | `deepseek-harness!packages/llm/llm-pi-ai/src/catalog.ts:100` | 98 |
| `docs/04-llm-adapter.md:316` | `deepseek-harness!packages/llm/llm-pi-ai/src/catalog.ts:69` | 74 |
| `docs/04-llm-adapter.md:317` | `deepseek-harness!packages/llm/llm-pi-ai/src/adapter.ts:92` | 122 |
| `docs/04-llm-adapter.md:318` | `deepseek-harness!packages/llm/llm-pi-ai/src/adapter.ts:96` | 126 |
| `docs/04-llm-adapter.md:320` | `deepseek-harness!packages/llm/llm-pi-ai/src/context.ts:39` | 58 |
| `docs/04-llm-adapter.md:379` | `deepseek-harness!packages/llm/token-meter/src/usage-projection.ts:109` | 120 |
| `docs/04-llm-adapter.md:379` | `deepseek-harness!packages/llm/token-meter/src/breakdown-projection.ts:44` | 56 |
| `docs/04-llm-adapter.md:379` | `deepseek-harness!packages/llm/token-meter/src/usage-projection.ts:70` | 75 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:449` | 468 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:464` | 483 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:486` | 505 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:349` | 350 |
| `docs/04-llm-adapter.md:406` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:355` | 374 |
| `docs/04-llm-adapter.md:413` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:297` | 603 |
| `docs/04-llm-adapter.md:414` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:64` | 108 |
| `docs/04-llm-adapter.md:420` | `deepseek-harness!packages/llm/llm/src/index.ts:387` | 414 |
| `docs/04-llm-adapter.md:461` | `deepseek-harness!packages/llm/llm/src/index.ts:734` | 770 |
| `docs/04-llm-adapter.md:467` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:138` | 333 |
| `docs/04-llm-adapter.md:471` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:349` | 350 |
| `docs/05-session.md:67` | `deepseek-harness!packages/core/session/src/types.ts:404` | 408 |
| `docs/05-session.md:95` | `deepseek-harness!packages/core/session/src/types.ts:412` | 24 |
| `docs/05-session.md:139` | `deepseek-harness!packages/core/session/src/types.ts:372` | 376 |
| `docs/05-session.md:184` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:464` | 483 |
| `docs/05-session.md:252` | `deepseek-harness!packages/session/session-persistence-sqlite/src/schema.ts:32` | 23 |
| `docs/05-session.md:284` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:465` | 484 |
| `docs/07-tools-approval-sandbox.md:108` | `deepseek-harness!packages/interaction/permission-presets/src/index.ts:168` | 184 |
| `docs/07-tools-approval-sandbox.md:108` | `deepseek-harness!packages/interaction/permission-presets/src/index.ts:400` | 416 |
| `docs/07-tools-approval-sandbox.md:119` | `deepseek-harness!packages/acp/acp/src/index.ts:215` | 271 |
| `docs/07-tools-approval-sandbox.md:119` | `deepseek-harness!packages/host/apiproxy/src/api-proxy.ts:1422` | 1363 |
| `docs/07-tools-approval-sandbox.md:163` | `deepseek-harness!docs/tool-catalog.md:180` | 182 |
| `docs/07-tools-approval-sandbox.md:164` | `deepseek-harness!docs/tool-catalog.md:224` | 226 |
| `docs/07-tools-approval-sandbox.md:165` | `deepseek-harness!docs/tool-catalog.md:638` | 667 |
| `docs/07-tools-approval-sandbox.md:166` | `deepseek-harness!docs/tool-catalog.md:688` | 717 |
| `docs/07-tools-approval-sandbox.md:167` | `deepseek-harness!docs/tool-catalog.md:603` | 632 |
| `docs/07-tools-approval-sandbox.md:168` | `deepseek-harness!docs/tool-catalog.md:667` | 696 |
| `docs/07-tools-approval-sandbox.md:169` | `deepseek-harness!docs/tool-catalog.md:720` | 749 |
| `docs/07-tools-approval-sandbox.md:170` | `deepseek-harness!docs/tool-catalog.md:745` | 774 |
| `docs/07-tools-approval-sandbox.md:171` | `deepseek-harness!docs/tool-catalog.md:533` | 562 |
| `docs/07-tools-approval-sandbox.md:172` | `deepseek-harness!docs/tool-catalog.md:1651` | 1680 |
| `docs/07-tools-approval-sandbox.md:173` | `deepseek-harness!docs/tool-catalog.md:1638` | 1667 |
| `docs/07-tools-approval-sandbox.md:174` | `deepseek-harness!docs/tool-catalog.md:1686` | 2031 |
| `docs/07-tools-approval-sandbox.md:175` | `deepseek-harness!docs/tool-catalog.md:1215` | 1244 |
| `docs/07-tools-approval-sandbox.md:176` | `deepseek-harness!docs/tool-catalog.md:153` | 155 |
| `docs/07-tools-approval-sandbox.md:177` | `deepseek-harness!docs/tool-catalog.md:1475` | 1504 |
| `docs/07-tools-approval-sandbox.md:179` | `deepseek-harness!docs/tool-catalog.md:1554` | 1583 |
| `docs/07-tools-approval-sandbox.md:180` | `deepseek-harness!docs/tool-catalog.md:1586` | 1615 |
| `docs/07-tools-approval-sandbox.md:181` | `deepseek-harness!docs/tool-catalog.md:1736` | 2081 |
| `docs/07-tools-approval-sandbox.md:182` | `deepseek-harness!docs/tool-catalog.md:1184` | 1213 |
| `docs/07-tools-approval-sandbox.md:183` | `deepseek-harness!docs/tool-catalog.md:945` | 974 |
| `docs/07-tools-approval-sandbox.md:184` | `deepseek-harness!docs/tool-catalog.md:1852` | 2197 |
| `docs/07-tools-approval-sandbox.md:185` | `deepseek-harness!docs/tool-catalog.md:47` | 49 |
| `docs/08-orchestration.md:52` | `deepseek-harness!packages/subagent/subagent/src/types.ts:307` | 314 |
| `docs/08-orchestration.md:52` | `deepseek-harness!packages/subagent/subagent/src/index.ts:481` | 497 |
| `docs/08-orchestration.md:96` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:291` | 297 |
| `docs/08-orchestration.md:110` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:1429` | 1491 |
| `docs/08-orchestration.md:116` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:638` | 664 |
| `docs/08-orchestration.md:194` | `deepseek-harness!packages/subagent/tool-subagent/src/index.ts:368` | 377 |
| `docs/08-orchestration.md:200` | `deepseek-harness!packages/subagent/subagent/src/out-of-process.ts:25` | 50 |
| `docs/08-orchestration.md:202` | `deepseek-harness!packages/subagent/subagent-claude-code/src/run.ts:177` | 309 |
| `docs/08-orchestration.md:215` | `deepseek-harness!packages/subagent/subagent-codex/src/wire.ts:294` | 612 |
| `docs/08-orchestration.md:223` | `deepseek-harness!apps/cli/config/agent-presets/standard/agent.cordis.yml:203` | 204 |
| `docs/08-orchestration.md:233` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:226` | 244 |
| `docs/08-orchestration.md:257` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:330` | 367 |
| `docs/08-orchestration.md:271` | `deepseek-harness!apps/cli/config/agent-presets/standard/agent.cordis.yml:240` | 241 |
| `docs/08-orchestration.md:459` | `deepseek-harness!apps/cli/config/agent-presets/standard/agent.cordis.yml:229` | 230 |
| `docs/08-orchestration.md:630` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:226` | 244 |
| `docs/08-orchestration.md:673` | `pi!packages/coding-agent/src/core/extensions/types.ts:1198` | 1214 |
| `docs/08-orchestration.md:678` | `pi!packages/coding-agent/src/core/extensions/types.ts:1198` | 1214 |
| `docs/09-extensions-and-code-mode.md:226` | `deepseek-harness!apps/cli/config/agent-presets/code/agent.cordis.yml:259` | 260 |
| `docs/09-extensions-and-code-mode.md:291` | `deepseek-harness!packages/core/tools/src/code-mode.ts:61` | 62 |
| `docs/09-extensions-and-code-mode.md:291` | `deepseek-harness!packages/core/tools/src/code-mode.ts:659` | 667 |
| `docs/09-extensions-and-code-mode.md:364` | `deepseek-harness!packages/core/tools/src/code-mode.ts:464` | 466 |
| `docs/09-extensions-and-code-mode.md:364` | `deepseek-harness!packages/core/tools/src/code-mode.ts:151` | 153 |
| `docs/09-extensions-and-code-mode.md:366` | `deepseek-harness!packages/core/tools/src/code-mode.ts:606` | 614 |
| `docs/09-extensions-and-code-mode.md:366` | `deepseek-harness!packages/core/tools/src/code-mode.ts:601` | 609 |
| `docs/09-extensions-and-code-mode.md:368` | `deepseek-harness!packages/core/tools/src/code-mode.ts:393` | 395 |
| `docs/09-extensions-and-code-mode.md:368` | `deepseek-harness!packages/core/tools/src/code-mode.ts:344` | 346 |
| `docs/09-extensions-and-code-mode.md:377` | `deepseek-harness!packages/core/tools/src/code-mode.ts:562` | 570 |
| `docs/09-extensions-and-code-mode.md:379` | `deepseek-harness!packages/core/tools/src/code-mode.ts:627` | 635 |
| `docs/09-extensions-and-code-mode.md:390` | `deepseek-harness!packages/core/tools/src/code-mode.ts:510` | 512 |
| `docs/09-extensions-and-code-mode.md:390` | `deepseek-harness!packages/core/tools/src/code-mode.ts:151` | 153 |
| `docs/09-extensions-and-code-mode.md:390` | `deepseek-harness!packages/core/tools/src/code-mode.ts:516` | 518 |
| `docs/09-extensions-and-code-mode.md:392` | `deepseek-harness!packages/core/tools/src/code-mode.ts:500` | 502 |
| `docs/09-extensions-and-code-mode.md:477` | `deepseek-harness!docs/tool-catalog.md:365` | 367 |
| `docs/09-extensions-and-code-mode.md:487` | `deepseek-harness!docs/tool-catalog.md:270` | 272 |
| `docs/09-extensions-and-code-mode.md:565` | `deepseek-harness!apps/cli/config/agent-presets/cordis/agent.cordis.yml:245` | 246 |
| `docs/09-extensions-and-code-mode.md:565` | `deepseek-harness!apps/cli/config/agent-presets/cordis/agent.cordis.yml:255` | 256 |
| `docs/09-extensions-and-code-mode.md:605` | `pi!packages/coding-agent/src/core/extensions/types.ts:1198` | 1214 |
| `docs/10-cordis-boot-preset.md:64` | `deepseek-harness!packages/bundle/web-app/cordis.patch.yml:283` | 304 |
| `docs/10-cordis-boot-preset.md:591` | `codex!codex-rs/mcp-server/src/codex_tool_config.rs:106` | 104 |
| `docs/11-web-client-and-host.md:32` | `deepseek-harness!packages/host/apiproxy/src/api-proxy.ts:3475` | 3373 |
| `docs/11-web-client-and-host.md:52` | `deepseek-harness!packages/host/apiproxy/src/api-proxy.ts:1285` | 1226 |
| `docs/11-web-client-and-host.md:52` | `deepseek-harness!packages/session/session-projection/src/index.ts:181` | 190 |
| `docs/11-web-client-and-host.md:94` | `deepseek-harness!packages/client/runtime/src/client/sessions/session.ts:467` | 471 |
| `docs/11-web-client-and-host.md:103` | `deepseek-harness!packages/client/runtime/src/client/sessions/session.ts:447` | 451 |
| `docs/11-web-client-and-host.md:125` | `deepseek-harness!packages/client/ui-conversation/src/client/chat/ChatView.tsx:150` | 162 |
| `docs/11-web-client-and-host.md:125` | `deepseek-harness!packages/client/ui-conversation/src/client/apply.ts:377` | 381 |
| `docs/11-web-client-and-host.md:252` | `deepseek-harness!packages/client/ui-conversation/src/client/apply.ts:371` | 375 |
| `docs/11-web-client-and-host.md:252` | `deepseek-harness!packages/client/ui-subagent/src/client/index.ts:121` | 69 |
| `docs/11-web-client-and-host.md:254` | `deepseek-harness!packages/client/ui-conversation/src/client/apply.ts:367` | 371 |
| `docs/11-web-client-and-host.md:279` | `deepseek-harness!packages/bundle/web-app/src/index.ts:96` | 143 |
| `docs/11-web-client-and-host.md:319` | `deepseek-harness!packages/client/modules/src/client/manifest.ts:110` | 149 |
| `docs/11-web-client-and-host.md:327` | `deepseek-harness!apps/web/vite.config.ts:7` | 8 |
| `docs/11-web-client-and-host.md:352` | `deepseek-harness!packages/host/webserver/src/index.ts:94` | 108 |
| `docs/11-web-client-and-host.md:354` | `deepseek-harness!packages/host/frontend-static/src/index.ts:98` | 109 |
| `docs/11-web-client-and-host.md:354` | `deepseek-harness!packages/bundle/web-app/src/index.ts:119` | 166 |
| `docs/11-web-client-and-host.md:380` | `deepseek-harness!packages/api/gateway/src/client/index.ts:406` | 408 |
| `docs/11-web-client-and-host.md:402` | `deepseek-harness!packages/bundle/web-app/src/startup.ts:70` | 75 |
| `docs/11-web-client-and-host.md:419` | `deepseek-harness!packages/client/locale/src/client/index.ts:114` | 144 |
| `docs/11-web-client-and-host.md:446` | `deepseek-harness!packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:562` | 581 |
| `docs/11-web-client-and-host.md:480` | `deepseek-harness!packages/api/remotes/src/client/index.ts:108` | 116 |
| `docs/11-web-client-and-host.md:494` | `codex!codex-rs/ext/extension-api/src/registry.rs:145` | 146 |
| `docs/12-surfaces-and-protocols.md:161` | `deepseek-harness!packages/acp/acp/src/index.ts:353` | 448 |
| `docs/12-surfaces-and-protocols.md:163` | `deepseek-harness!packages/acp/acp/src/index.ts:430` | 539 |
| `docs/12-surfaces-and-protocols.md:195` | `deepseek-harness!packages/acp/acp/src/index.ts:331` | 206 |
| `docs/12-surfaces-and-protocols.md:219` | `deepseek-harness!packages/acp/acp/src/index.ts:213` | 269 |
| `docs/12-surfaces-and-protocols.md:239` | `deepseek-harness!packages/mcp/mcp-client/src/tools.ts:96` | 111 |
| `docs/12-surfaces-and-protocols.md:252` | `deepseek-harness!packages/mcp/mcp-client/tests/mcp-client.e2e.ts:434` | 474 |
| `docs/12-surfaces-and-protocols.md:358` | `deepseek-harness!scripts/build-exe-for-python-sdk.ts:25` | 26 |
| `docs/12-surfaces-and-protocols.md:449` | `deepseek-harness!packages/acp/acp/src/index.ts:338` | 425 |
| `docs/12-surfaces-and-protocols.md:457` | `deepseek-harness!packages/acp/acp/src/index.ts:295` | 58 |
| `docs/12-surfaces-and-protocols.md:469` | `codex!codex-rs/mcp-server/src/codex_tool_config.rs:106` | 104 |
| `docs/13-self-verification.md:123` | `deepseek-harness!packages/llm/llm/src/index.ts:906` | 978 |
| `docs/13-self-verification.md:199` | `deepseek-harness!packages/test-support/acp-snapshot/src/suite.ts:104` | 105 |
| `docs/13-self-verification.md:205` | `deepseek-harness!scripts/run-gates.ts:581` | 215 |
| `docs/13-self-verification.md:235` | `deepseek-harness!scripts/build-exe-for-python-sdk.ts:25` | 26 |
| `docs/13-self-verification.md:235` | `deepseek-harness!scripts/build-exe-for-python-sdk.ts:390` | 391 |
| `docs/14-comparison.md:67` | `codex!codex-rs/core/src/config/mod.rs:210` | 224 |
| `docs/14-comparison.md:91` | `codex!codex-rs/core/src/client.rs:484` | 485 |
| `docs/14-comparison.md:93` | `pi!packages/coding-agent/src/core/compaction/compaction.ts:573` | 577 |
| `docs/14-comparison.md:116` | `codex!codex-rs/protocol/src/openai_models.rs:482` | 486 |
| `docs/14-comparison.md:139` | `pi!packages/coding-agent/src/core/agent-session.ts:665` | 676 |
| `docs/14-comparison.md:202` | `pi!packages/coding-agent/src/core/extensions/types.ts:1198` | 1214 |
| `docs/appendix-a-glossary.md:53` | `deepseek-harness!packages/core/session/src/types.ts:404` | 408 |
| `docs/appendix-a-glossary.md:54` | `deepseek-harness!packages/core/session/src/types.ts:357` | 361 |
| `docs/appendix-a-glossary.md:55` | `deepseek-harness!packages/core/session/src/types.ts:372` | 376 |
| `docs/appendix-a-glossary.md:56` | `deepseek-harness!packages/core/session/src/types.ts:378` | 382 |
| `docs/appendix-a-glossary.md:92` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:112` | 242 |
| `docs/appendix-a-glossary.md:106` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:403` | 409 |
| `docs/appendix-a-glossary.md:107` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:191` | 197 |
| `docs/appendix-a-glossary.md:114` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:180` | 198 |

