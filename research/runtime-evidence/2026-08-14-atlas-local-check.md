# Runtime evidence: Atlas local check

| Field | Value |
| --- | --- |
| study_id | `2026-08-14-atlas-local-check` |
| recorded_at_utc | `2026-08-14T08:38:51Z` |
| atlas_commit_before_change | `ff86d91f44148e5c8580feb4993189f21c4a3e17` |
| deepseek_harness_commit | `47f943859bef60e4160492346772ded9b24f765a` |
| command | `npm run check` |
| working_directory | repository root |
| exit_code | `0` |
| credential_ref | none |

## Result summary

The local Atlas verification suite passed after the course evidence-card expansion.

Checks passed:

- `sources:verify`: 15 source definitions and available fixed checkouts verified.
- `catalogs:verify`: generated catalogs reproducible.
- `check:analysis`: 86 human analysis documents source-bound and reviewed.
- `check:portability`: relative path, LF and zero-dependency checks passed.
- `check:licenses`: license policy and available license files verified.
- `check:links`: 118 Markdown files checked.
- `check:secrets`: sensitive-information scan passed.
- `test`: 5 script tests passed.

## Evidence level

This proves the learning repository was internally consistent at the recorded commit. It does not prove an authenticated DeepSeek API task completed.

## Known gaps

- No `DEEPSEEK_API_KEY` was present in the current environment.
- No authenticated provider request was executed in this record.
- No Web browser task or tool side-effect task was executed in this record.
