# Project status

| Layer | Meaning | Current target |
| --- | --- | --- |
| L0 inventory | Every tracked file classified and addressable | Generated for every locked source |
| L1 file card | Purpose, symbols, dependencies, tests, docs | All meaningful Harness source files |
| L2 deep study | State, control flow, errors, edge cases, product meaning | Core Harness execution paths |
| L3 verified study | Runtime trace, test evidence and reproducible experiment | Security- and product-critical paths |

## Completion is measured, not implied

Each of the 63 human documents under `docs/` carries one or more repository/path/SHA
bindings and a review status. CI verifies that every non-root path exists at its bound
commit. Generated catalogs list their complete source baselines and are checked for deterministic reproduction. A
directory existing does not make that subject complete. The maintained coverage report lists:

- files inventoried and files with semantic cards;
- core paths with L2/L3 analysis;
- source-to-test and source-to-decision relationships;
- experiments reproduced and unsupported environments;
- documents made stale by upstream changes.

The initial public release establishes the reproducible structure and high-value core
analysis. Full semantic review of thousands of files is an ongoing, versioned program.

## Initial public baseline

- 15 source repositories are present locally and pinned as Git submodules.
- DeepSeek Harness has 7,412 generated file cards, 3,135 statically resolved internal
  dependency edges, and source-to-test navigation for 1,575 source/vendored files.
- Product, engineering, plugin, protocol, security, ecosystem, evaluation and maintainer
  learning paths have an initial evidence-backed edition.
- Scheduled automation checks upstream every six hours and proposes changes by pull
  request. Human semantic review remains required.

## Information architecture

The public entry points are intentionally layered:

- `README.md`: short project overview and links to the right starting point.
- `QUICKSTART.md`: first-read guide for new visitors.
- `LEARNING_PATH.md`: short map from learning stages to the course.
- `docs/00-course/`: the primary 12-part teaching path.
- `docs/00-start-here/`: role-based routes and workbook.
- `docs/13-source-studies/`: human source studies.
- `docs/14-file-reference/`: machine-generated source navigation and selected deep dives.
- `research/`: evidence ledger, not a tutorial surface.

Generated catalogs are large by design and should not be treated as onboarding documents.
