<p align="center">
  <img src="assets/harness-internals.svg" width="168" alt="Harness Internals">
</p>

<h1 align="center">Harness Internals</h1>

<p align="center">Two harness layers, one source-verifiable knowledge base</p>

<p align="center">
  <a href="README.md">中文</a> ·
  <a href="https://github.com/plwslpld-arch/harness-internals/actions/workflows/verify.yml"><img alt="Verify" src="https://github.com/plwslpld-arch/harness-internals/actions/workflows/verify.yml/badge.svg?branch=main"></a>
  <a href="LICENSE-CODE"><img alt="Code MIT" src="https://img.shields.io/badge/code-MIT-2F855A"></a>
  <a href="LICENSE-DOCS"><img alt="Docs CC BY 4.0" src="https://img.shields.io/badge/docs-CC_BY_4.0-D97706"></a>
</p>

> Formerly `deepseek-harness-internals`. The full DeepSeek Harness package-by-package study remains under [`docs/deep/`](docs/deep/).

## What this repository studies

A model does not read files, call tools, retain sessions, or decide how a benchmark is scored by itself. Two software layers around the model determine how a task runs and how its outcome is interpreted:

- An **agent harness** turns a model into an acting agent by constructing context, exposing tools, running the loop, enforcing permissions, preserving trajectories, and recovering from infrastructure failures.
- An **eval harness** turns a run into comparable evidence by defining tasks and environments, scheduling Trials, collecting artifacts, executing scorers, and freezing the statistical contract.

The final score is jointly produced by the model, agent harness, eval harness, and environment. This repository compares four agent-harness surfaces and four eval harnesses under the same pinned commits and CI evidence gates.

![How agent and eval harnesses couple](assets/harness-coupling.svg)

## Reading map

The main analysis is written in Chinese, with source anchors that are machine-checked against pinned upstream commits.

| Question | Start here |
| --- | --- |
| What is a harness? | [Concepts](docs/concepts.md) |
| How does an agent run? | [Part A overview](docs/00-overview.md#part-aagent-harness) |
| How is a benchmark score produced? | [Part B overview](docs/00-overview.md#part-beval-harness) |
| How does DeepSeek Harness work package by package? | [DSH deep layer](docs/deep/dsh-overview.md) |
| How can I reproduce the checks? | [Verification guide](docs/appendix-b-verification.md) |

Part A covers system prompts, KV cache stability, the agent loop, compaction, tools and security, sessions, extensions, code mode, surfaces, and orchestration. It compares DeepSeek Harness, OpenAI Codex, Gemini CLI, and the public contract surface of the Claude Agent SDK. Claude Code itself is closed source; the repository does not infer its internals from the SDK.

Part B covers eval-harness boundaries, tasks and environments, Trial/Attempt semantics, artifacts and scoring, and the coupling between the two harness layers. Its source set is lm-evaluation-harness, Inspect AI, Terminal-Bench 1, and SWE-bench.

## Evidence contract

Claims are labeled as pinned source code, upstream tests and fixtures, official documentation, or explicit inference. Three dedicated CI gates enforce the contract:

1. **anchors** verify every `repo!path:line` reference against the locked checkout;
2. **coverage** enforces per-article cross-repository minimums declared in frontmatter;
3. **matrix** requires every marked comparison cell to contain a source anchor, an official HTTPS link, or an explicit inference label.

Repository verification is not proof of production deployment, personal capability, or release authorization. Training reward, checkpoint selection, and independent release evaluation remain separate. A Trial is the statistical unit; an Attempt may recover infrastructure failure, but cannot retry a product failure into a pass.

## Reproduce locally

Node.js 22.19 or newer is required; CI uses Node 24.

```bash
git clone https://github.com/plwslpld-arch/harness-internals.git
cd harness-internals
npm run bootstrap   # fetch 11 upstream checkouts at locked commits
npm run check       # sources, evidence, licenses, links, secrets, and tests
```

The 11 pinned sources are DeepSeek Harness, Codex, Gemini CLI, Claude Agent SDK, OpenCode, pi, mini-swe-agent, lm-evaluation-harness, Inspect AI, Terminal-Bench 1, and SWE-bench. See [`sources/sources.lock.yml`](sources/sources.lock.yml) for the machine-readable lock.

## Scope and licenses

This is not an official repository, mirror, or contribution channel for any upstream project. Claude-related implementation claims stop at the public MIT SDK contract and official documentation; leaked prompt dumps are excluded. The repository does not produce new benchmark scores.

Original code is [MIT](LICENSE-CODE), original documentation is [CC BY 4.0](LICENSE-DOCS), and third-party boundaries are documented in [THIRD_PARTY.md](THIRD_PARTY.md).
