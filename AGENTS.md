# Repository instructions

DeepSeek Harness Atlas is an independent evidence-backed learning repository.

## Content rules

- Keep all committed links relative or use public HTTPS permalinks.
- Never commit credentials, private logs, model weights, `node_modules`, build output, or nested `.git` directories.
- Distinguish code, test, runtime, official-doc, community, and inference evidence.
- Bind source claims to the commit recorded in `sources/sources.lock.yml`.
- Generated indexes belong under `docs/14-file-reference/generated/`; do not hand-edit them.
- Human analysis belongs under `docs/13-source-studies/`; generation must never overwrite it.
- Do not republish the Cordis paper or Claude Agent SDK source.

## Verification

Run `npm run check` for documentation-only changes. Run source and catalog checks
when the lock file or generated indexes change. An update bot may prepare a PR,
but semantic, architectural, product, legal, and security claims require human review.
