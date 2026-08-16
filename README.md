<p align="center">
  <img src="assets/deepseek-harness-atlas.svg" width="152" alt="DeepSeek Harness Internals">
</p>

<h1 align="center">DeepSeek Harness Internals</h1>

<p align="center">从源码读懂一个现代 agent harness 是怎么造出来的</p>

<p align="center">
  <a href="https://github.com/plwslpld-arch/deepseek-harness-internals/actions/workflows/verify.yml"><img alt="Verify" src="https://github.com/plwslpld-arch/deepseek-harness-internals/actions/workflows/verify.yml/badge.svg?branch=main"></a>
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek-Harness-4D6BFE">
  <a href="LICENSE-CODE"><img alt="Code MIT" src="https://img.shields.io/badge/code-MIT-2F855A"></a>
  <a href="LICENSE-DOCS"><img alt="Docs CC BY 4.0" src="https://img.shields.io/badge/docs-CC_BY_4.0-D97706"></a>
</p>

---

## 这是什么

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（简称 dsh）是 DeepSeek 在 2026 年 8 月开源的 agent harness：包在模型外面、负责拼上下文、调工具、管权限、记轨迹的那一层。

这个仓库是它的中文源码分析。**目标只有一个：把「模型每一步到底收到了什么、这些东西是怎么被拼出来的」讲到你能自己复现的程度**，然后告诉你 Claude Code、Codex、OpenCode、pi、mini-swe-agent 在同一件事上是怎么做的。

不需要用过 dsh，但需要能读 TypeScript。所有结论绑定上游一个固定 commit，行号由 CI 校验。

## 从哪读

**只想看最有信息量的三篇**：[System Prompt](docs/01-system-prompt.md) → [KV-Cache](docs/02-kv-cache.md) → [横向对照](docs/14-comparison.md)。

**想系统地读**，按下面的顺序：

| # | 文章 | 读完你会明白 |
| --- | --- | --- |
| 00 | [总览](docs/00-overview.md) | 一次请求从进程启动到落盘的完整路径，以及 49 个包组各管什么 |
| 01 | [System Prompt](docs/01-system-prompt.md) | 模型第一眼看到的那段文字逐字长什么样、由谁贡献、顺序怎么定 |
| 02 | [KV-Cache](docs/02-kv-cache.md) | 为什么 dsh 没有一行缓存管理代码却能一直命中，以及什么时候会塌 |
| 03 | [Agent Loop](docs/03-agent-loop.md) | 一个 turn 里发生了什么，工具怎么并行、怎么取消 |
| 04 | [LLM 层](docs/04-llm-adapter.md) | 请求 JSON 怎么序列化、SSE 怎么解析、重试怎么退避 |
| 05 | [Session](docs/05-session.md) | 事件日志、surface 投影、以及「模型可见 ⟺ 已记录」这条不变量 |
| 06 | [压缩](docs/06-compaction.md) | 什么时候触发、砍哪一段、摘要请求怎么少付一次全价 |
| 07 | [工具、审批与沙箱](docs/07-tools-approval-sandbox.md) | 到底什么时候会弹窗（不是你以为的那样），以及沙箱怎么落地 |
| 08 | [编排层](docs/08-orchestration.md) | 子代理、计划、目标、钩子、工作流各挂在循环的哪个点 |
| 09 | [Extensions 与 Code Mode](docs/09-extensions-and-code-mode.md) | 让模型在运行时改自己的插件树，以及只给它一个 `run_code` 会怎样 |
| 10 | [Cordis、启动与 preset](docs/10-cordis-boot-preset.md) | 默认到底装了什么、四个 preset 差在哪、为什么要 fork Cordis |
| 11 | [Web 客户端与 host](docs/11-web-client-and-host.md) | 39 个 UI 包如何把事件日志变成你看到的界面 |
| 12 | [产品表面与协议](docs/12-surfaces-and-protocols.md) | Web / headless / ACP / MCP / SDK 各是什么，谁驱动谁 |
| 13 | [自证与工程化](docs/13-self-verification.md) | 219 个 invariant、测试多于源码、文档门禁，一个仓库如何证明自己没坏 |
| 14 | [横向对照](docs/14-comparison.md) | 六个 harness 在 prompt、缓存、压缩、审批、会话上的机制差异 |
| 15 | [设计记录导读](docs/15-agent-notes-guide.md) | 683 篇 Agent Note 里最值得读的那些，以及上游文档的分工 |
| A | [术语表](docs/appendix-a-glossary.md) | 每条带源码出处 |
| B | [怎么自己核对](docs/appendix-b-verification.md) | 不用凭据能核什么、要凭据才能核什么 |

## 结论是怎么来的

四种依据，正文里直接说清楚是哪一种：

- **源码**：锁定 commit 下的真实代码，带 `路径:行号`；
- **上游测试与 fixture**：尤其是 `system-prompt.expected.md` 这类渲染快照，它们是最好读的证据；
- **官方文档**：涉及 Claude Code 这类闭源产品时只用公开文档，不用泄露的 prompt 转储；
- **作者推断**：在正文里明写「这是推断」，不藏在标签里。

CI 会做一件别处不太做的事：**抽查正文里每一处 `路径:行号` 是否真的指向那一行**（`npm run check:anchors`）。行号写错、上游漂移，门禁直接失败。这是「结论可追溯」的唯一硬保证。

带 `DEEPSEEK_API_KEY` 的端到端验证**已经跑过**：上游的 `request-cache.e2e.ts` 与 `llm-deepseek/adapter.e2e.ts` 用真实 key 全部通过（去掉 key 则整组 skip），另有一个本仓库自己写的探针脚本量到了具体的缓存数字：改 system 一句话命中率从 85.7% 掉到 0，摘要请求复用前缀能拿到 93.4% 而另起 system prompt 是 0%。命令、环境、原始数字见 [research/runtime-evidence](research/runtime-evidence/)。正文里的实验只写跑过的，不写「预期输出」。

## 本地跑一遍

```bash
git clone https://github.com/plwslpld-arch/deepseek-harness-internals.git
cd deepseek-harness-internals
npm run bootstrap   # 按 lock 拉取 5 个上游 checkout
npm run check       # 全部门禁
```

拉取的 5 个来源：dsh 本体，以及横向对照要用到的 Codex、OpenCode、pi、mini-swe-agent。都按 commit 锁定，见 [sources/sources.lock.yml](sources/sources.lock.yml)。

## 几点说明

- 这不是 DeepSeek 的官方仓库、镜像或贡献入口。
- 上游自己有 110 篇英文文档、683 篇设计记录，讲得比这里全。这里补的是它不会写的：跨包的因果链、失效条件、横向对比、以及「当初为什么这么定」。
- Claude Code 闭源，相关内容只依据公开文档。
- Logo 的鱼形主标取自 dsh 上游 MIT 源码里的图标并加了子标，只用于标明研究对象，不代表 DeepSeek 认可或参与本项目。

## 其它

代码 [MIT](LICENSE-CODE)，文档 [CC BY 4.0](LICENSE-DOCS)。第三方边界见 [THIRD_PARTY.md](THIRD_PARTY.md)，写作与维护规则见 [AGENTS.md](AGENTS.md)，贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。
