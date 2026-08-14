# Runtime evidence: refactor verification

| Field | Value |
| --- | --- |
| study_id | `2026-08-14-refactor-verification` |
| recorded_at_utc | `2026-08-14T12:35:00Z` |
| atlas_commit_before_change | `833481af2ca62f0ee8dcb457429c87fbaf340330` |
| atlas_commit_after_change | `7cf5308` |
| deepseek_harness_commit | `47f943859bef60e4160492346772ded9b24f765a` |
| commands | `npm run check`, `npm run catalogs:generate` |
| working_directory | repository root |
| local_node | `v22.22.2` |
| ci_node | from `.nvmrc` (`24`) |
| exit_code | `0` |
| credential_ref | none |

## Result summary

The 21-chapter structure was replaced by 12 long-form articles plus 2 appendices. Verification ran locally after every article and on GitHub Actions for the two merged pull requests.

Local, at the final commit:

- `sources:verify`: 15 source definitions and available fixed checkouts verified.
- `check:analysis`: 32 human analysis documents source-bound and reviewed.
- `check:portability`: relative path, LF and zero-dependency checks passed.
- `check:licenses`: license policy and available license files verified.
- `check:links`: 35 Markdown files checked.
- `check:secrets`: sensitive-information scan passed.
- `test`: 6 script tests passed.
- `catalogs:generate`: produced 23 files, 30,642 lines, 3.5 MB into `.generated/`.

`catalogs:verify` was removed from the `check` chain in this change: the generated index is no longer committed, so comparing it against committed files no longer means anything. It still runs standalone after a generate.

On GitHub Actions (`ubuntu-latest`, Node from `.nvmrc`):

| Run | Branch | verify | publish-index |
| --- | --- | --- | --- |
| 31793826324 | `refactor/depth-over-coverage` | success | not applicable (PR) |
| 31794019392 | `main` | success | success |
| 31800339856 | `main` | success | success |

The `publish-index` job was newly added in this change and had never run before. Its first execution created the `gh-pages` orphan branch; the second republished it. Result confirmed by API: 25 files, none over 1 MB.

## Evidence level

This proves the repository is internally consistent at the recorded commit, that the documentation gates pass on both Node 22.22.2 (local) and the CI Node version, and that the index publication job works end to end.

It does not prove any DeepSeek Harness behaviour described in the articles. Every source-level claim in `docs/` rests on `evidence: code`, `evidence: test` or `evidence: official-doc` read from the pinned checkout — not on execution.

## Known gaps

- No `DEEPSEEK_API_KEY` was present; no authenticated provider request was executed.
- None of the 13 experiments in the articles that require credentials were run. Their expected results are stated as predictions to verify, not as measured outcomes.
- No Web browser task, tool side-effect task, sandbox enforcement check, or compaction observation was executed.
- The articles carry `status: draft`: they passed the mechanical gates but have not been reviewed by a human.
