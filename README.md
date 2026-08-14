<p align="center">
  <img src="assets/deepseek-harness-atlas.svg" width="152" alt="DeepSeek Harness Internals Logo">
</p>

<h1 align="center">DeepSeek Harness Internals</h1>

<p align="center">
  从源码读懂一个现代 Agent Harness 是怎么造出来的
</p>

<p align="center">
  <a href="https://github.com/plwslpld-arch/deepseek-harness-internals/actions/workflows/verify.yml"><img alt="Verify" src="https://github.com/plwslpld-arch/deepseek-harness-internals/actions/workflows/verify.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/plwslpld-arch/deepseek-harness-internals/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/plwslpld-arch/deepseek-harness-internals?display_name=tag&sort=semver"></a>
  <img alt="Upstream check" src="https://img.shields.io/badge/upstream_check-every_6h-4D6BFE">
  <a href="LICENSE-CODE"><img alt="Code license MIT" src="https://img.shields.io/badge/code-MIT-2F855A"></a>
  <a href="LICENSE-DOCS"><img alt="Docs license CC BY 4.0" src="https://img.shields.io/badge/docs-CC_BY_4.0-D97706"></a>
</p>

<p align="center">
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek-Harness-4D6BFE">
  <img alt="Cordis" src="https://img.shields.io/badge/runtime-Cordis-6366F1">
  <img alt="Chinese" src="https://img.shields.io/badge/language-中文-EA580C">
</p>

---

## 这是什么

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（简称 dsh）是 DeepSeek 在 2026 年 8 月开源的 agent harness——包在模型外面、负责拼上下文、调工具、管权限、记轨迹的那一层。

这个仓库是它的中文源码分析，12 篇文章加 2 个附录，每篇讲清楚一个机制：它解决什么问题、代码在哪、怎么运作、什么时候会失效。所有结论都绑定一个固定的上游 commit，可以自己核。

适合想搞懂 agent harness 内部构造的人读。不需要用过 dsh，但需要能读 TypeScript。

上游自己有 5 万多行双语文档，讲得比这里全。这里补的是它不太会写的部分：一个设计决策如何同时约束好几个包、`.agents/notes/` 里那 500 多篇设计记录到底在说什么、和 Claude Code / Codex / OpenCode 比差在哪、以及像「KV-cache 契约」这种工程约定实际影响的是什么体验。

## 文章

每篇都按同一个顺序展开：先讲用户能看到的现象，再给源码位置（精确到行号），然后讲机制，接着讲它什么时候不成立，最后给可以自己跑的验证方法。

| # | 文章 | 状态 |
| --- | --- | --- |
| 01 | [Harness 是什么：模型之外的那一层](docs/01-what-is-a-harness.md) | ✅ |
| 02 | [Cordis 与启动：插件树如何装配](docs/02-cordis-and-boot.md) | ✅ |
| 03 | [Agent Loop：turn、step 与工具调度](docs/03-agent-loop.md) | ✅ |
| 04 | [System Prompt 与上下文组装](docs/04-system-prompt.md) | ✅ |
| 05 | [Session：事件溯源、surface 与恢复](docs/05-session.md) | ✅ |
| 06 | [**KV-cache 纪律：把缓存写进架构约束**](docs/06-kv-cache-discipline.md) | ✅ |
| 07 | [**压缩：为什么摘要请求不新开一个**](docs/07-compaction.md) | ✅ |
| 08 | [工具、审批、沙箱与威胁模型](docs/08-tools-approval-sandbox.md) | ✅ |
| 09 | [DeepSeek Adapter：序列化、SSE、thinking 与 usage](docs/09-deepseek-adapter.md) | ✅ |
| 10 | [产品表面与协议：Web / headless / ACP / MCP / SDK / DSML](docs/10-surfaces-and-protocols.md) | ✅ |
| 11 | [**Invariant 与 Agent Note：一个仓库如何自证**](docs/11-invariants-and-agent-notes.md) | ✅ |
| 12 | [**横向对照：dsh vs Claude Code / Codex / OpenCode**](docs/12-comparison.md) | ✅ |
| A | [附录：实验手册（本地跑通与证据留痕）](docs/appendix-a-labs.md) | ✅ |
| B | [附录：术语、证据方法与维护](docs/appendix-b-glossary-and-method.md) | ✅ |

加粗那四篇挖得比较深，别处不太容易看到，时间有限可以先读它们。

## 结论是怎么来的

每句重要的话后面都会标它的依据：

```
DeepSeek 的 prompt_tokens 包含缓存命中，适配器扣除后映射到互不重叠的内部字段。 `evidence: code`
```

| 标签 | 依据 |
| --- | --- |
| `code` | 锁定 commit 下的源码 |
| `test` | 上游的测试文件 |
| `runtime` | 本地真跑出来的结果，附环境、命令、退出码、产物 |
| `official-doc` | 官方文档或公告 |
| `community` | 社区里的个别样本，只能说明「有人遇到过」 |

所有源码结论都绑定 [`sources/sources.lock.yml`](sources/sources.lock.yml) 里的 commit。上游每 6 小时检查一次，有变动只会开一个候选 PR 并把受影响的文章标成 `stale`，不会自动改写结论。

读的时候有三件事容易混：**仓库里有代码，不等于默认开启；测试通过，不等于真实业务能跑通；界面上看得见，不等于副作用已经被隔离。** 文章里会反复区分这三层。

## 快速开始

```bash
git clone https://github.com/plwslpld-arch/deepseek-harness-internals.git
cd deepseek-harness-internals
npm run bootstrap    # 按 lock 拉取 15 个上游 checkout（submodule）
npm run check        # 仓库质量门
```

需要自行核对并接受上游条款后，再显式拉取受限来源：

```bash
npm run bootstrap -- --include-restricted
```

真实 DeepSeek API 实验只从环境变量读取，仓库、日志、fixture 和更新报告禁止保存真实密钥：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

## 源码索引

文件、符号、依赖、测试映射索引由 `npm run catalogs:generate` 从锁定 checkout 生成到本地 `.generated/`（不入库），并由 CI 发布到 [`gh-pages`](https://github.com/plwslpld-arch/deepseek-harness-internals/tree/gh-pages) 分支。

索引只覆盖 `deepseek-harness` 和它 vendored 的那份 `cordis`，共 23 个文件、30,642 行、3.5MB。另外 13 个仓库是做横向对比用的，commit 记在 `sources/sources.lock.yml` 里，但没做文件级索引——文章 12 只用到它们的目录结构，逐个符号列出来没人会看。

每个文件都控制在 1MB 以内，可以直接在 GitHub 网页上打开。路径是纯文本，每份索引开头写了怎么拼成永久链接；文件卡片按顶层目录分成了几份。

不过它们本质还是给机器用的，最常见的用法是 grep：

```bash
git clone --branch gh-pages --depth 1 \
  https://github.com/plwslpld-arch/deepseek-harness-internals.git dsh-index
grep -n "ReactLoopAgent" dsh-index/symbols.md
```

索引告诉你「有什么、在哪里」，`docs/` 下的文章告诉你「为什么这么设计、什么时候会失效」。

## 几点说明

- 这不是 DeepSeek 的官方仓库、镜像或贡献入口。
- 自动生成的索引只是导航，不是分析。
- 社区里的说法只当作个别样本，不能替代源码、官方文档和实际运行结果。
- Cordis 论文、Claude Agent SDK 这类有使用条款的来源，默认流程不会重新分发。
- Logo 取自 dsh 上游 MIT 源码里的鱼形图标并加了子标，只是为了标明研究对象，不代表 DeepSeek 认可或参与本项目。

## 其它

代码 [MIT](LICENSE-CODE)，文档 [CC BY 4.0](LICENSE-DOCS)。第三方边界见 [THIRD_PARTY.md](THIRD_PARTY.md)，贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。
