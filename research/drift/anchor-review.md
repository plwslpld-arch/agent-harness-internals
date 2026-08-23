# 锚点复核工作量：HEAD~2 → 当前 lock

比对了 996 处落在已变化文件上的锚点。**真正需要人读的是 32 处**，其余 806 处行号内容都没动、158 处只是挪了位置。

| 档 | 数量 | 怎么处理 |
| --- | ---: | --- |
| same 未动 | 806 | 不用读 |
| moved 挪位 | 158 | 按新行号改，改完抽查上下文 |
| changed 内容变了 | 27 | **必须人读**：这一行现在讲的还是原来那件事吗 |
| gone 找不到了 | 5 | **必须人读**：多半实现换了，正文结论要重写 |

## 逐篇

| 篇目 | 需要人读 | same | moved | changed | gone |
| --- | ---: | ---: | ---: | ---: | ---: |
| `docs/11-web-client-and-host.md` | 9 | 44 | 21 | 4 | 5 |
| `docs/04-llm-adapter.md` | 6 | 49 | 37 | 6 | 0 |
| `docs/08-orchestration.md` | 5 | 99 | 14 | 5 | 0 |
| `docs/02-kv-cache.md` | 4 | 60 | 13 | 4 | 0 |
| `docs/05-session.md` | 4 | 60 | 5 | 4 | 0 |
| `docs/12-surfaces-and-protocols.md` | 1 | 39 | 5 | 1 | 0 |
| `docs/13-self-verification.md` | 1 | 40 | 4 | 1 | 0 |
| `docs/14-comparison.md` | 1 | 13 | 5 | 1 | 0 |
| `docs/appendix-a-glossary.md` | 1 | 58 | 6 | 1 | 0 |
| `docs/00-overview.md` | 0 | 11 | 2 | 0 | 0 |
| `docs/01-system-prompt.md` | 0 | 78 | 3 | 0 | 0 |
| `docs/03-agent-loop.md` | 0 | 20 | 3 | 0 | 0 |
| `docs/06-compaction.md` | 0 | 47 | 0 | 0 | 0 |
| `docs/07-tools-approval-sandbox.md` | 0 | 63 | 19 | 0 | 0 |
| `docs/09-extensions-and-code-mode.md` | 0 | 60 | 20 | 0 | 0 |
| `docs/10-cordis-boot-preset.md` | 0 | 48 | 1 | 0 | 0 |
| `docs/15-agent-notes-guide.md` | 0 | 14 | 0 | 0 | 0 |
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
- `docs/04-llm-adapter.md:316` 引 `deepseek-harness!packages/llm/llm-pi-ai/src/catalog.ts:98`
  - 旧：`* here or withheld above, so the offer never silently lags the upstream set.`
  - 新：`const THINKING_FORMAT_GATE: Record<PiAiThinkingFormat, true> = {`
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
- `docs/14-comparison.md:91` 引 `codex!codex-rs/core/src/client.rs:485`
  - 旧：`self.prompt_cache_key_override`
  - 新：`fn prompt_cache_key(&self, responses_metadata: &CodexResponsesMetadata) -> String {`
- `docs/appendix-a-glossary.md:106` 引 `deepseek-harness!packages/subagent/subagent/src/continuation.ts:409`
  - 旧：`const childId = SessionId(randomUUID())`
  - 新：`async startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart> {`

## moved：内容没变，行号要改

| 出处 | 引用 | 新行号 |
| --- | --- | ---: |
| `docs/00-overview.md:69` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:483` | 45 |
| `docs/00-overview.md:191` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:483` | 45 |
| `docs/01-system-prompt.md:283` | `deepseek-harness!apps/cli/config/agent-presets/minimal/agent.cordis.yml:9` | 10 |
| `docs/01-system-prompt.md:317` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:243` | 260 |
| `docs/01-system-prompt.md:482` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:223` | 241 |
| `docs/02-kv-cache.md:16` | `deepseek-harness!packages/subagent/subagent-codex/tests/responses-fixture.ts:71` | 72 |
| `docs/02-kv-cache.md:206` | `deepseek-harness!packages/llm/llm-pi-ai/src/config.ts:154` | 195 |
| `docs/02-kv-cache.md:206` | `deepseek-harness!packages/llm/llm-pi-ai/src/adapter.ts:122` | 70 |
| `docs/02-kv-cache.md:259` | `deepseek-harness!packages/core/session/src/types.ts:376` | 24 |
| `docs/02-kv-cache.md:293` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:483` | 45 |
| `docs/02-kv-cache.md:316` | `deepseek-harness!packages/llm/llm/src/index.ts:824` | 879 |
| `docs/02-kv-cache.md:316` | `deepseek-harness!packages/llm/llm/src/index.ts:854` | 145 |
| `docs/02-kv-cache.md:428` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:82` | 210 |
| `docs/02-kv-cache.md:429` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:243` | 260 |
| `docs/02-kv-cache.md:444` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:400` | 45 |
| `docs/02-kv-cache.md:481` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:246` | 263 |
| `docs/02-kv-cache.md:492` | `deepseek-harness!docs/subsystems/llm-streaming.md:635` | 673 |
| `docs/02-kv-cache.md:496` | `deepseek-harness!packages/llm/llm/src/index.ts:878` | 950 |
| `docs/03-agent-loop.md:18` | `deepseek-harness!packages/test-support/acp-snapshot/src/suite.ts:88` | 1 |
| `docs/03-agent-loop.md:20` | `deepseek-harness!examples/acp-agent/tests/acp.snapshot.ts:214` | 179 |
| `docs/03-agent-loop.md:452` | `deepseek-harness!examples/acp-agent/tests/acp.snapshot.ts:455` | 487 |
| `docs/04-llm-adapter.md:18` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:131` | 261 |
| `docs/04-llm-adapter.md:39` | `deepseek-harness!packages/llm/llm-deepseek/tests/serialize.spec.ts:237` | 309 |
| `docs/04-llm-adapter.md:52` | `deepseek-harness!packages/llm/llm-deepseek/tests/mock-server.ts:30` | 32 |
| `docs/04-llm-adapter.md:104` | `deepseek-harness!packages/llm/llm/src/index.ts:365` | 50 |
| `docs/04-llm-adapter.md:104` | `deepseek-harness!packages/llm/llm/src/index.ts:432` | 459 |
| `docs/04-llm-adapter.md:110` | `deepseek-harness!packages/llm/llm/src/index.ts:824` | 879 |
| `docs/04-llm-adapter.md:110` | `deepseek-harness!packages/llm/llm/src/index.ts:156` | 157 |
| `docs/04-llm-adapter.md:127` | `deepseek-harness!packages/llm/llm/src/index.ts:898` | 50 |
| `docs/04-llm-adapter.md:129` | `deepseek-harness!packages/llm/llm/src/index.ts:878` | 950 |
| `docs/04-llm-adapter.md:139` | `deepseek-harness!packages/llm/llm/src/assembler.ts:37` | 38 |
| `docs/04-llm-adapter.md:139` | `deepseek-harness!packages/llm/llm/src/assembler.ts:157` | 200 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:81` | 145 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:83` | 147 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:132` | 1 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:134` | 329 |
| `docs/04-llm-adapter.md:158` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:130` | 62 |
| `docs/04-llm-adapter.md:160` | `deepseek-harness!packages/llm/llm-deepseek/src/index.ts:275` | 157 |
| `docs/04-llm-adapter.md:162` | `deepseek-harness!packages/llm/llm/src/index.ts:138` | 139 |
| `docs/04-llm-adapter.md:182` | `deepseek-harness!packages/llm/llm/src/types.ts:341` | 362 |
| `docs/04-llm-adapter.md:184` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:81` | 209 |
| `docs/04-llm-adapter.md:200` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:108` | 238 |
| `docs/04-llm-adapter.md:256` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:333` | 650 |
| `docs/04-llm-adapter.md:310` | `deepseek-harness!packages/llm/llm-pi-ai/package.json:46` | 47 |
| `docs/04-llm-adapter.md:316` | `deepseek-harness!packages/llm/llm-pi-ai/src/catalog.ts:74` | 79 |
| `docs/04-llm-adapter.md:317` | `deepseek-harness!packages/llm/llm-pi-ai/src/adapter.ts:122` | 70 |
| `docs/04-llm-adapter.md:318` | `deepseek-harness!packages/llm/llm-pi-ai/src/adapter.ts:126` | 145 |
| `docs/04-llm-adapter.md:320` | `deepseek-harness!packages/llm/llm-pi-ai/src/context.ts:58` | 78 |
| `docs/04-llm-adapter.md:379` | `deepseek-harness!packages/llm/token-meter/src/usage-projection.ts:120` | 132 |
| `docs/04-llm-adapter.md:379` | `deepseek-harness!packages/llm/token-meter/src/breakdown-projection.ts:56` | 69 |
| `docs/04-llm-adapter.md:379` | `deepseek-harness!packages/llm/token-meter/src/usage-projection.ts:75` | 80 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:468` | 487 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:483` | 45 |
| `docs/04-llm-adapter.md:404` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:350` | 351 |
| `docs/04-llm-adapter.md:406` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:374` | 393 |
| `docs/04-llm-adapter.md:414` | `deepseek-harness!packages/llm/llm-deepseek/src/serialize.ts:108` | 238 |
| `docs/04-llm-adapter.md:467` | `deepseek-harness!packages/llm/llm-deepseek/src/adapter.ts:333` | 650 |
| `docs/04-llm-adapter.md:471` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:350` | 351 |
| `docs/05-session.md:67` | `deepseek-harness!packages/core/session/src/types.ts:408` | 412 |
| `docs/05-session.md:139` | `deepseek-harness!packages/core/session/src/types.ts:376` | 24 |
| `docs/05-session.md:184` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:483` | 45 |
| `docs/05-session.md:252` | `deepseek-harness!packages/session/session-persistence-sqlite/src/schema.ts:23` | 20 |
| `docs/05-session.md:284` | `deepseek-harness!packages/core/agent-loop/src/agent.ts:484` | 231 |
| `docs/07-tools-approval-sandbox.md:108` | `deepseek-harness!packages/interaction/permission-presets/src/index.ts:416` | 432 |
| `docs/07-tools-approval-sandbox.md:119` | `deepseek-harness!packages/acp/acp/src/index.ts:271` | 328 |
| `docs/07-tools-approval-sandbox.md:119` | `deepseek-harness!packages/host/apiproxy/src/api-proxy.ts:1363` | 1304 |
| `docs/07-tools-approval-sandbox.md:163` | `deepseek-harness!docs/tool-catalog.md:182` | 184 |
| `docs/07-tools-approval-sandbox.md:164` | `deepseek-harness!docs/tool-catalog.md:226` | 228 |
| `docs/07-tools-approval-sandbox.md:165` | `deepseek-harness!docs/tool-catalog.md:667` | 696 |
| `docs/07-tools-approval-sandbox.md:167` | `deepseek-harness!docs/tool-catalog.md:632` | 94 |
| `docs/07-tools-approval-sandbox.md:168` | `deepseek-harness!docs/tool-catalog.md:696` | 640 |
| `docs/07-tools-approval-sandbox.md:169` | `deepseek-harness!docs/tool-catalog.md:749` | 53 |
| `docs/07-tools-approval-sandbox.md:170` | `deepseek-harness!docs/tool-catalog.md:774` | 803 |
| `docs/07-tools-approval-sandbox.md:171` | `deepseek-harness!docs/tool-catalog.md:562` | 591 |
| `docs/07-tools-approval-sandbox.md:172` | `deepseek-harness!docs/tool-catalog.md:1680` | 1709 |
| `docs/07-tools-approval-sandbox.md:173` | `deepseek-harness!docs/tool-catalog.md:1667` | 1696 |
| `docs/07-tools-approval-sandbox.md:175` | `deepseek-harness!docs/tool-catalog.md:1244` | 53 |
| `docs/07-tools-approval-sandbox.md:176` | `deepseek-harness!docs/tool-catalog.md:155` | 157 |
| `docs/07-tools-approval-sandbox.md:180` | `deepseek-harness!docs/tool-catalog.md:1615` | 1644 |
| `docs/07-tools-approval-sandbox.md:182` | `deepseek-harness!docs/tool-catalog.md:1213` | 1242 |
| `docs/07-tools-approval-sandbox.md:183` | `deepseek-harness!docs/tool-catalog.md:974` | 53 |
| `docs/07-tools-approval-sandbox.md:185` | `deepseek-harness!docs/tool-catalog.md:49` | 51 |
| `docs/08-orchestration.md:52` | `deepseek-harness!packages/subagent/subagent/src/types.ts:314` | 321 |
| `docs/08-orchestration.md:52` | `deepseek-harness!packages/subagent/subagent/src/index.ts:497` | 132 |
| `docs/08-orchestration.md:96` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:297` | 303 |
| `docs/08-orchestration.md:116` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:664` | 690 |
| `docs/08-orchestration.md:194` | `deepseek-harness!packages/subagent/tool-subagent/src/index.ts:377` | 386 |
| `docs/08-orchestration.md:200` | `deepseek-harness!packages/subagent/subagent/src/out-of-process.ts:50` | 75 |
| `docs/08-orchestration.md:223` | `deepseek-harness!apps/cli/config/agent-presets/standard/agent.cordis.yml:204` | 187 |
| `docs/08-orchestration.md:233` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:244` | 261 |
| `docs/08-orchestration.md:257` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:367` | 54 |
| `docs/08-orchestration.md:271` | `deepseek-harness!apps/cli/config/agent-presets/standard/agent.cordis.yml:241` | 242 |
| `docs/08-orchestration.md:459` | `deepseek-harness!apps/cli/config/agent-presets/standard/agent.cordis.yml:230` | 231 |
| `docs/08-orchestration.md:630` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:244` | 261 |
| `docs/08-orchestration.md:673` | `pi!packages/coding-agent/src/core/extensions/types.ts:1214` | 1230 |
| `docs/08-orchestration.md:678` | `pi!packages/coding-agent/src/core/extensions/types.ts:1214` | 1230 |
| `docs/09-extensions-and-code-mode.md:226` | `deepseek-harness!apps/cli/config/agent-presets/code/agent.cordis.yml:260` | 261 |
| `docs/09-extensions-and-code-mode.md:291` | `deepseek-harness!packages/core/tools/src/code-mode.ts:62` | 47 |
| `docs/09-extensions-and-code-mode.md:291` | `deepseek-harness!packages/core/tools/src/code-mode.ts:667` | 675 |
| `docs/09-extensions-and-code-mode.md:364` | `deepseek-harness!packages/core/tools/src/code-mode.ts:466` | 468 |
| `docs/09-extensions-and-code-mode.md:364` | `deepseek-harness!packages/core/tools/src/code-mode.ts:153` | 155 |
| `docs/09-extensions-and-code-mode.md:366` | `deepseek-harness!packages/core/tools/src/code-mode.ts:614` | 622 |
| `docs/09-extensions-and-code-mode.md:366` | `deepseek-harness!packages/core/tools/src/code-mode.ts:609` | 38 |
| `docs/09-extensions-and-code-mode.md:368` | `deepseek-harness!packages/core/tools/src/code-mode.ts:395` | 397 |
| `docs/09-extensions-and-code-mode.md:368` | `deepseek-harness!packages/core/tools/src/code-mode.ts:346` | 348 |
| `docs/09-extensions-and-code-mode.md:377` | `deepseek-harness!packages/core/tools/src/code-mode.ts:570` | 578 |
| `docs/09-extensions-and-code-mode.md:379` | `deepseek-harness!packages/core/tools/src/code-mode.ts:635` | 643 |
| `docs/09-extensions-and-code-mode.md:390` | `deepseek-harness!packages/core/tools/src/code-mode.ts:512` | 514 |
| `docs/09-extensions-and-code-mode.md:390` | `deepseek-harness!packages/core/tools/src/code-mode.ts:153` | 155 |
| `docs/09-extensions-and-code-mode.md:390` | `deepseek-harness!packages/core/tools/src/code-mode.ts:518` | 520 |
| `docs/09-extensions-and-code-mode.md:392` | `deepseek-harness!packages/core/tools/src/code-mode.ts:502` | 504 |
| `docs/09-extensions-and-code-mode.md:477` | `deepseek-harness!docs/tool-catalog.md:367` | 53 |
| `docs/09-extensions-and-code-mode.md:487` | `deepseek-harness!docs/tool-catalog.md:272` | 53 |
| `docs/09-extensions-and-code-mode.md:565` | `deepseek-harness!apps/cli/config/agent-presets/cordis/agent.cordis.yml:246` | 247 |
| `docs/09-extensions-and-code-mode.md:565` | `deepseek-harness!apps/cli/config/agent-presets/cordis/agent.cordis.yml:256` | 257 |
| `docs/09-extensions-and-code-mode.md:605` | `pi!packages/coding-agent/src/core/extensions/types.ts:1214` | 1230 |
| `docs/10-cordis-boot-preset.md:64` | `deepseek-harness!packages/bundle/web-app/cordis.patch.yml:304` | 325 |
| `docs/11-web-client-and-host.md:32` | `deepseek-harness!packages/host/apiproxy/src/api-proxy.ts:3373` | 3271 |
| `docs/11-web-client-and-host.md:52` | `deepseek-harness!packages/host/apiproxy/src/api-proxy.ts:1226` | 4 |
| `docs/11-web-client-and-host.md:52` | `deepseek-harness!packages/session/session-projection/src/index.ts:190` | 199 |
| `docs/11-web-client-and-host.md:94` | `deepseek-harness!packages/client/runtime/src/client/sessions/session.ts:471` | 392 |
| `docs/11-web-client-and-host.md:103` | `deepseek-harness!packages/client/runtime/src/client/sessions/session.ts:451` | 40 |
| `docs/11-web-client-and-host.md:125` | `deepseek-harness!packages/client/ui-conversation/src/client/apply.ts:381` | 141 |
| `docs/11-web-client-and-host.md:252` | `deepseek-harness!packages/client/ui-conversation/src/client/apply.ts:375` | 379 |
| `docs/11-web-client-and-host.md:252` | `deepseek-harness!packages/client/ui-subagent/src/client/index.ts:69` | 17 |
| `docs/11-web-client-and-host.md:254` | `deepseek-harness!packages/client/ui-conversation/src/client/apply.ts:371` | 375 |
| `docs/11-web-client-and-host.md:279` | `deepseek-harness!packages/bundle/web-app/src/index.ts:143` | 237 |
| `docs/11-web-client-and-host.md:319` | `deepseek-harness!packages/client/modules/src/client/manifest.ts:149` | 53 |
| `docs/11-web-client-and-host.md:327` | `deepseek-harness!apps/web/vite.config.ts:8` | 9 |
| `docs/11-web-client-and-host.md:352` | `deepseek-harness!packages/host/webserver/src/index.ts:108` | 9 |
| `docs/11-web-client-and-host.md:354` | `deepseek-harness!packages/host/frontend-static/src/index.ts:109` | 120 |
| `docs/11-web-client-and-host.md:354` | `deepseek-harness!packages/bundle/web-app/src/index.ts:166` | 262 |
| `docs/11-web-client-and-host.md:380` | `deepseek-harness!packages/api/gateway/src/client/index.ts:408` | 410 |
| `docs/11-web-client-and-host.md:402` | `deepseek-harness!packages/bundle/web-app/src/startup.ts:75` | 80 |
| `docs/11-web-client-and-host.md:419` | `deepseek-harness!packages/client/locale/src/client/index.ts:144` | 6 |
| `docs/11-web-client-and-host.md:446` | `deepseek-harness!packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:581` | 599 |
| `docs/11-web-client-and-host.md:480` | `deepseek-harness!packages/api/remotes/src/client/index.ts:116` | 102 |
| `docs/11-web-client-and-host.md:494` | `codex!codex-rs/ext/extension-api/src/registry.rs:146` | 147 |
| `docs/12-surfaces-and-protocols.md:195` | `deepseek-harness!packages/acp/acp/src/index.ts:206` | 256 |
| `docs/12-surfaces-and-protocols.md:219` | `deepseek-harness!packages/acp/acp/src/index.ts:269` | 326 |
| `docs/12-surfaces-and-protocols.md:239` | `deepseek-harness!packages/mcp/mcp-client/src/tools.ts:111` | 126 |
| `docs/12-surfaces-and-protocols.md:358` | `deepseek-harness!scripts/build-exe-for-python-sdk.ts:26` | 27 |
| `docs/12-surfaces-and-protocols.md:449` | `deepseek-harness!packages/acp/acp/src/index.ts:425` | 534 |
| `docs/13-self-verification.md:199` | `deepseek-harness!packages/test-support/acp-snapshot/src/suite.ts:105` | 1 |
| `docs/13-self-verification.md:205` | `deepseek-harness!scripts/run-gates.ts:215` | 124 |
| `docs/13-self-verification.md:235` | `deepseek-harness!scripts/build-exe-for-python-sdk.ts:26` | 27 |
| `docs/13-self-verification.md:235` | `deepseek-harness!scripts/build-exe-for-python-sdk.ts:391` | 392 |
| `docs/14-comparison.md:67` | `codex!codex-rs/core/src/config/mod.rs:224` | 238 |
| `docs/14-comparison.md:93` | `pi!packages/coding-agent/src/core/compaction/compaction.ts:577` | 582 |
| `docs/14-comparison.md:116` | `codex!codex-rs/protocol/src/openai_models.rs:486` | 490 |
| `docs/14-comparison.md:139` | `pi!packages/coding-agent/src/core/agent-session.ts:676` | 407 |
| `docs/14-comparison.md:202` | `pi!packages/coding-agent/src/core/extensions/types.ts:1214` | 1230 |
| `docs/appendix-a-glossary.md:53` | `deepseek-harness!packages/core/session/src/types.ts:408` | 412 |
| `docs/appendix-a-glossary.md:54` | `deepseek-harness!packages/core/session/src/types.ts:361` | 365 |
| `docs/appendix-a-glossary.md:55` | `deepseek-harness!packages/core/session/src/types.ts:376` | 24 |
| `docs/appendix-a-glossary.md:56` | `deepseek-harness!packages/core/session/src/types.ts:382` | 24 |
| `docs/appendix-a-glossary.md:107` | `deepseek-harness!packages/subagent/subagent/src/continuation.ts:197` | 203 |
| `docs/appendix-a-glossary.md:114` | `deepseek-harness!packages/plan/plan-mode/src/index.ts:198` | 216 |

