# Runtime evidence

Runtime claims require a sanitized record containing source SHA, command, environment,
start/end time, exit code, pass/fail/skip counts, log or artifact path, artifact hash and
known gaps. HTTP 200, compilation, CI success and a ready process are different evidence
levels and must not be substituted for an authenticated task-level end-to-end result.

## Current records

- [2026-08-14 Atlas local check](2026-08-14-atlas-local-check.md): local `npm run check` passed; proves repository consistency, not authenticated model E2E.
- [2026-08-14 DeepSeek authenticated E2E pending](2026-08-14-deepseek-auth-e2e-pending.md): records that `DEEPSEEK_API_KEY` was not present in the current environment, so authenticated headless E2E remains pending.
