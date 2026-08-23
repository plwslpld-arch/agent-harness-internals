# 上游漂移体检

由 `node scripts/check-drift.mjs --write` 生成。变的文件不等于结论错了，但它是唯一值得人去复核的那一批。

## 各源与上游的差距

| 源 | lock | 上游 HEAD | 锁定日期 → HEAD 日期 | 相隔 | 变化文件 | 被引文件变化 | 锚点受影响 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| `deepseek-harness` | `47f943859b` | `b150a551b8` | 2026-08-13 → 2026-08-21 | 8 天 | 3451 | 116 / 330 (35%) | 396 / 1017 (39%) |
| `codex` | `c4941302c7` | `c9b19deb09` | 2026-08-15 → 2026-08-23 | 8 天 | 1560 | 7 / 9 (78%) | 8 / 12 (67%) |
| `opencode` | `4643e65ad6` | `3a31c4ea80` | 2026-08-14 → 2026-08-22 | 8 天 | 188 | 1 / 9 (11%) | 1 / 13 (8%) |
| `pi` | `086c32e745` | `c1279a65b3` | 2026-08-15 → 2026-08-23 | 8 天 | 181 | 5 / 7 (71%) | 10 / 12 (83%) |
| `mini-swe-agent` | `a83fcae82d` | `25941c89cf` | 2026-07-22 → 2026-08-17 | 26 天 | 1 | 0 / 4 (0%) | 0 / 5 (0%) |

## 逐篇复核优先级

比例高的先看。落在变化文件上的锚点，行号可能还指得中，但那一段讲的机制未必还成立。

| 篇目 | 受影响锚点 / 总锚点 | 比例 |
| --- | ---: | ---: |
| `docs/appendix-b-verification.md` | 3 / 3 | 100% |
| `docs/04-llm-adapter.md` | 82 / 123 | 67% |
| `docs/11-web-client-and-host.md` | 44 / 75 | 59% |
| `docs/09-extensions-and-code-mode.md` | 39 / 80 | 49% |
| `docs/14-comparison.md` | 9 / 19 | 47% |
| `docs/02-kv-cache.md` | 36 / 82 | 44% |
| `docs/00-overview.md` | 6 / 14 | 43% |
| `docs/13-self-verification.md` | 19 / 46 | 41% |
| `docs/05-session.md` | 28 / 69 | 41% |
| `docs/03-agent-loop.md` | 9 / 24 | 38% |
| `docs/08-orchestration.md` | 44 / 121 | 36% |
| `docs/12-surfaces-and-protocols.md` | 18 / 51 | 35% |
| `docs/07-tools-approval-sandbox.md` | 29 / 89 | 33% |
| `docs/10-cordis-boot-preset.md` | 13 / 50 | 26% |
| `docs/appendix-a-glossary.md` | 17 / 66 | 26% |
| `docs/01-system-prompt.md` | 18 / 86 | 21% |
| `docs/15-agent-notes-guide.md` | 1 / 14 | 7% |
| `docs/06-compaction.md` | 0 / 47 | 0% |

