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

一组绑定固定上游 Commit 的中文深度解析，讲 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的核心机制**为什么这样设计、在什么条件下失效**。

**读者只有一类**：有工程背景、想搞懂现代 agent harness 如何构建的人。产品视角通过每篇文章的「产品现象」一节覆盖，不单独设路线。

**不做的事**：不翻译上游文档（上游自带 54,584 行双语文档，覆盖度这条路没有意义），不做 API 手册，不做入门教程。

## 为什么值得存在

上游文档按包组织、写给自己人看，有四类内容它结构上不会写：

| 上游不写 | 本仓库写 |
| --- | --- |
| 跨包的因果链 | 一个决策如何同时约束 5 个包 |
| 设计决策的通俗还原 | `.agents/notes/` 里 507 篇高密度记录，铺垫后讲清楚 |
| 横向对照 | 与 Claude Code / Codex / OpenCode 的实现差异 |
| 产品视角翻译 | 「KV-cache 契约」→「为什么长会话第二轮变便宜」 |

## 文章

每篇固定五段：**产品现象 → 源码路径（精确到文件行号，绑定锁定 Commit）→ 机制 → 约束与失效条件 → 可复核实验**。

| # | 文章 | 状态 |
| --- | --- | --- |
| 01 | [Harness 是什么：模型之外的那一层](docs/01-what-is-a-harness.md) | ✅ |
| 02 | [Cordis 与启动：插件树如何装配](docs/02-cordis-and-boot.md) | ✅ |
| 03 | [Agent Loop：turn、step 与工具调度](docs/03-agent-loop.md) | ✅ |
| 04 | [System Prompt 与上下文组装](docs/04-system-prompt.md) | ✅ |
| 05 | [Session：事件溯源、surface 与恢复](docs/05-session.md) | ✅ |
| 06 | **KV-cache 纪律：把缓存写进架构约束** | 规划中 |
| 07 | **压缩：为什么摘要请求不新开一个** | 规划中 |
| 08 | 工具、审批、沙箱与威胁模型 | 规划中 |
| 09 | DeepSeek Adapter：序列化 / SSE / thinking / usage | 规划中 |
| 10 | 产品表面与协议：Web / headless / ACP / MCP / SDK / DSML | 规划中 |
| 11 | **Invariant 与 Agent Note：一个仓库如何自证** | 规划中 |
| 12 | **横向对照：dsh vs Claude Code / Codex / OpenCode** | 规划中 |
| A | 附录：实验手册（本地跑通与证据留痕） | 规划中 |
| B | 附录：术语、证据方法与维护 | 规划中 |

加粗的四篇是上游与其它中文内容都不会有的部分。

> 重构进行中：旧的分章文档仍在 `docs/` 下，随每篇新文章发布逐步吸收并移除。

## 证据规则

每个结论至少绑定一种证据，并在句末标注：

```
DeepSeek 的 prompt_tokens 包含缓存命中，适配器扣除后映射到互不重叠的内部字段。 `evidence: code`
```

| 标签 | 含义 |
| --- | --- |
| `code` | 锁定 Commit 的源码 |
| `test` | 上游测试文件 |
| `runtime` | 本地实际运行结果（记环境、命令、退出码、产物） |
| `official-doc` | 官方文档或公告 |
| `community` | 社区样本，只能支持采样性结论 |

所有源码结论绑定 [`sources/sources.lock.yml`](sources/sources.lock.yml) 中的 Commit。上游每 6 小时检查一次，变动只生成候选 PR 并把受影响文档标记为 `stale`，不自动改写结论。

**三条边界**：源码存在 ≠ 默认启用；测试通过 ≠ 真实业务闭环；UI 可见 ≠ 副作用已隔离。

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

全量文件、符号、依赖、测试映射索引由 `npm run catalogs:generate` 从锁定 checkout 生成到本地 `.generated/`（不入库），并由 CI 发布到 [`gh-pages`](https://github.com/plwslpld-arch/deepseek-harness-internals/tree/gh-pages) 分支。

索引回答「有什么、在哪里」；`docs/` 下的人工文章回答「为什么、怎么失效」。两者不互相替代。

## 边界说明

- 本项目不是 DeepSeek 官方仓库、镜像或贡献入口。
- 自动生成索引是源码导航，不是人工分析。
- 社区内容只作为采样证据，不能替代源码、官方文档和运行记录。
- Cordis 论文、Claude Agent SDK 等受限来源不随默认流程再分发。
- Logo 使用 DeepSeek Harness 上游 MIT 源码中的鱼形图标并加子标；仅用于说明研究对象，不表示 DeepSeek 官方认可或维护本项目。

## 其它

代码 [MIT](LICENSE-CODE)，文档 [CC BY 4.0](LICENSE-DOCS)。第三方边界见 [THIRD_PARTY.md](THIRD_PARTY.md)，贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本记录见 [CHANGELOG.md](CHANGELOG.md)。
