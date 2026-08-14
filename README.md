<p align="center">
  <img src="assets/deepseek-harness-atlas.svg" width="152" alt="DeepSeek Harness Atlas Logo">
</p>

<h1 align="center">DeepSeek Harness Atlas</h1>

<p align="center">
  面向产品经理、工程师和开源维护者的 DeepSeek Harness 中文深度研究与学习库
</p>

<p align="center">
  <a href="https://github.com/plwslpld-arch/deepseek-harness-atlas/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/plwslpld-arch/deepseek-harness-atlas?display_name=tag&sort=semver"></a>
  <a href="https://github.com/plwslpld-arch/deepseek-harness-atlas/actions/workflows/verify.yml"><img alt="Verify" src="https://github.com/plwslpld-arch/deepseek-harness-atlas/actions/workflows/verify.yml/badge.svg?branch=main"></a>
  <a href="https://github.com/plwslpld-arch/deepseek-harness-atlas/actions/workflows/upstream-update.yml"><img alt="Upstream update" src="https://img.shields.io/badge/upstream_check-every_6h-4D6BFE"></a>
  <a href="LICENSE-CODE"><img alt="Code license MIT" src="https://img.shields.io/badge/code-MIT-2F855A"></a>
  <a href="LICENSE-DOCS"><img alt="Docs license CC BY 4.0" src="https://img.shields.io/badge/docs-CC_BY_4.0-D97706"></a>
</p>

<p align="center">
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek-Harness-4D6BFE">
  <img alt="Cordis" src="https://img.shields.io/badge/runtime-Cordis-6366F1">
  <img alt="Plugin system" src="https://img.shields.io/badge/focus-plugin_system-0891B2">
  <img alt="Chinese documentation" src="https://img.shields.io/badge/language-中文-EA580C">
</p>

DeepSeek Harness Atlas 是一个独立的中文研究与教学仓库。它基于固定版本的 DeepSeek Harness 源码，解释这个 Agent Harness 的产品定位、系统架构、插件机制、核心运行链路、源码实现、实验方法和生态边界。

它的目标不是复制一批仓库，也不是生成文件清单；而是帮助读者回答三个问题：

1. DeepSeek Harness 到底解决什么问题。
2. 它的 runtime、插件、模型、工具、Session 和 Web 是如何协作的。
3. 如果上游代码持续变化，哪些结论仍然有效，哪些需要重新审核。

当前基线：`v0.1.0`，持续维护中。所有核心分析都绑定到 [`sources/sources.lock.yml`](sources/sources.lock.yml) 中的上游 Commit。

## 直接开始

| 你是谁 | 入口 |
| --- | --- |
| 第一次打开仓库 | [QUICKSTART.md](QUICKSTART.md) |
| 想系统学习 | [docs/00-course/README.md](docs/00-course/README.md) |
| 想看学习路径 | [LEARNING_PATH.md](LEARNING_PATH.md) |
| 想改核心 runtime | [docs/00-start-here/paths/runtime-contributor.md](docs/00-start-here/paths/runtime-contributor.md) |
| 查完整目录 | [docs/README.md](docs/README.md) |

## 你能学到什么

- 产品定位：Harness 和模型、评测 Harness、聊天 UI 的区别。
- 系统架构：Cordis 插件底座、Agent Loop、模型适配、工具权限、沙箱、Session、编排和 Web。
- 源码实现：从重点文件、关键函数、全量文件卡片和测试索引进入源码。
- 本地实验：用个人 `DEEPSEEK_API_KEY` 跑通 headless/Web/插件/Session 证据。
- 生态判断：Cordis、DeepSeek API、DSML、MCP、ACP、E2B、Codex、Claude Code、OpenCode、Qwen Code、mini-swe-agent 的关系与边界。
- 开源维护：上游每 6 小时检查，source-bound 文档过期标记，许可证和证据治理。

## 当前关键结论

- 插件是主线。Cordis 不只是扩展 API，而是 profile、模型、工具、权限、Session、编排与 Web 的运行底座。
- Web 是当前主要产品表面。固定 Harness 基线中，内置 TUI 产品层已移除；通用终端零件或历史记录不等于当前可用 TUI。
- 219 个 workspace packages 不等于 219 个社区插件。内部模块化和外部插件生态成熟度是两件事。
- 代码存在不等于默认启用。Atlas 会区分源码、profile 挂载、运行 ready、权限隔离和用户旅程。
- 评测结果属于“模型 + Harness + 工具 + 上下文 + 沙箱 + 终止条件”的组合，不应只归因于模型。

## 内容结构

```text
docs/00-course/              主课程：从产品定位到源码、实验、生态和维护
docs/13-source-studies/   人工源码研究：解释关键实现为什么这样设计
docs/14-file-reference/   源码索引：文件、符号、依赖、测试和重点函数
docs/15-labs-and-tutorials/ 本地实验：把理解变成可复核证据
research/                 证据落账区，不是教程入口
sources/                  固定上游源码和 source lock
```

## 源码如何展开

默认只拉取许可清晰的自动来源：

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone \
  https://github.com/plwslpld-arch/deepseek-harness-atlas.git
cd deepseek-harness-atlas
npm run bootstrap
```

需要自行核对并接受上游条款后，再显式拉取受限来源：

```bash
npm run bootstrap -- --include-restricted
npm run catalogs:generate
```

真实 DeepSeek API 实验只从环境变量读取：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

仓库、日志、fixture 和更新报告禁止保存真实密钥。

## 状态与更新

| 项目 | 状态 |
| --- | --- |
| Atlas 版本 | [`v0.1.0`](https://github.com/plwslpld-arch/deepseek-harness-atlas/releases/tag/v0.1.0) |
| 固定源码生态 | 15 个上游仓库，由 submodule 与 lock 文件共同固定 |
| 文件导航 | DeepSeek Harness 7,412 张文件职责卡片，作为源码查询索引 |
| 主分支质量门 | [`Verify`](https://github.com/plwslpld-arch/deepseek-harness-atlas/actions/workflows/verify.yml) |
| 上游变化检查 | 每 6 小时运行，只创建候选更新 PR |
| 版本记录 | [CHANGELOG.md](CHANGELOG.md) 与 [GitHub Releases](https://github.com/plwslpld-arch/deepseek-harness-atlas/releases) |

更详细的覆盖度、证据边界和维护状态见 [PROJECT_STATUS.md](PROJECT_STATUS.md)。

## 边界说明

- 本项目不是 DeepSeek 官方仓库、镜像或贡献入口。
- 自动生成索引是源码导航，不是人工教程。
- 社交媒体和社区内容只作为采样证据，不能替代源码、官方文档和运行记录。
- Cordis 论文、Claude Agent SDK 等受限来源不随默认流程再分发。
- Logo 使用 DeepSeek Harness 上游 MIT 源码中的鱼形图标并加入 Atlas 罗盘子标；仅用于说明研究对象，不表示 DeepSeek 官方认可或维护本项目。

## 本地检查

```bash
npm run check
npm run sources:verify
npm run catalogs:verify
```

许可证和第三方边界见 [THIRD_PARTY.md](THIRD_PARTY.md)。
