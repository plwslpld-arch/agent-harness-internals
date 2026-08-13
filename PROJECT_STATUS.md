# Project status

| Layer | Meaning | Current target |
| --- | --- | --- |
| L0 inventory | Every tracked file classified and addressable | Generated for every locked source |
| L1 file card | Purpose, symbols, dependencies, tests, docs | All meaningful Harness source files |
| L2 deep study | State, control flow, errors, edge cases, product meaning | Core Harness execution paths |
| L3 verified study | Runtime trace, test evidence and reproducible experiment | Security- and product-critical paths |

## Completion is measured, not implied

Each human source study carries a source SHA and review status. Generated catalogs list
their complete source baselines and are checked for deterministic reproduction. A
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
