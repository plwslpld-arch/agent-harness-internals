# DeepSeek Harness Atlas

面向产品经理、工程师和开源维护者的 DeepSeek Harness 中文深度研究库。
它不复制一堆仓库后给出文件列表，而是把产品问题、系统架构、运行链路、
源码文件、测试证据、设计决策和生态变化连接成一套可持续更新的学习系统。

> 当前状态：建设中。所有分析固定到 `sources/sources.lock.yml` 中的上游
> Commit；“存在源码”不等于“默认启用”，“测试通过”也不等于真实业务闭环。

## 你能在这里学到什么

- 产品：Harness 为谁解决什么问题，完整用户旅程、信任模型、插件平台和成熟度。
- 架构：Cordis 插件底座、Agent Loop、模型适配、工具权限、沙箱、Session、编排和 Web。
- 源码：从能力域进入具体文件、符号、测试、配置、事件和设计决策。
- 实验：区分模型与 Harness 变量，记录成功率、成本、延迟、缓存、人工介入和危险操作。
- 生态：MCP、ACP、E2B、Pi、Codex、Claude Agent SDK、OpenCode、Qwen Code、mini-swe-agent 与评测层的可比/不可比边界。
- 维护：每 6 小时检查上游；发现变化后生成差异和过期提示，通过 PR 审核更新。

## 三条学习路线

| 读者 | 从哪里开始 | 最终获得什么 |
| --- | --- | --- |
| 产品经理 | `docs/00-start-here/product-path.md` | 用户、能力、旅程、风险、平台策略和选型框架 |
| 工程师 | `docs/00-start-here/engineering-path.md` | 从启动到任务完成的端到端实现和源码证据 |
| 维护者 | `docs/00-start-here/maintainer-path.md` | 来源、许可证、更新、评审、验证和发布流程 |

完整导航见 [`docs/README.md`](docs/README.md)。

## 当前基线的几个关键结论

- **插件是主线。** Cordis 不只是扩展 API，而是 profile、模型、工具、权限、
  Session、编排与 Web 组合的运行底座；参见[插件系统全景](docs/03-cordis-foundation/plugin-system-mainline.md)。
- **Web 是当前官方交互产品面。** 固定 Harness SHA 已删除内置 TUI package 和
  shipped composition；Headless、ACP 与 JSON-RPC 是非 Web 入口。通用终端/审批
  零件仍在，但不等于存在完整 TUI 产品。
- **219 个 workspace packages 不等于 219 个社区插件。** 第一方模块化程度与
  外部插件供给、兼容、安全审核和真实采用是不同指标。
- **代码存在不等于用户可用。** Atlas 分别核对源码、profile 挂载、运行时 ready、
  权限/隔离和用户旅程。
- **评测结果属于模型加 Harness 的完整组合。** Prompt、工具、上下文、沙箱、
  重试、预算和终止条件都必须进入实验清单。

## 证据等级

每篇人工分析都应声明证据来源：

| 标签 | 含义 |
| --- | --- |
| `code` | 固定 Commit 中可以定位的实现 |
| `test` | 自动测试、fixture 或 snapshot 所表达的契约 |
| `runtime` | 记录了环境、命令、退出码和产物的实际运行 |
| `official-doc` | 上游官方文档、公告或发布元数据 |
| `community` | Discussion、社交媒体或第三方实践，仅代表样本 |
| `inference` | 基于证据的推断，不能写成已验证事实 |

## 源码如何对应

15 个第三方源码仓库以固定 SHA 的 Git submodule 指针存在：GitHub 保存来源
指针，桌面目录可展开真实源码。默认流程只拉取许可明确的自动来源：

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone \
  https://github.com/plwslpld-arch/deepseek-harness-atlas.git
cd deepseek-harness-atlas
npm run bootstrap
```

只有在自行核对并接受上游条款后，才显式拉取 Cordis 论文与 Claude SDK：

```bash
npm run bootstrap -- --include-restricted
npm run catalogs:generate
```

脚本会校验/补齐 `sources/checkouts/` 并切到锁文件 SHA，然后生成：

- 文件目录与职责卡片；
- 轻量导出符号、静态相对依赖和反向依赖；
- 源码到直接静态测试、fixture、文档和 Agent Note 的关系；
- 上游版本和许可证账本。

自动目录只是“全覆盖导航”，人工深度分析位于
`docs/13-source-studies/`，两者不会混为一谈。

Cordis 论文没有明确再发布许可证，Claude Agent SDK 受商业条款约束；默认
bootstrap、CI 和机器目录均不读取它们。显式选择时 Git 从公开上游按 SHA 获取，
本项目仍不复制或重新授权其内容。

## 自动更新

GitHub Actions 每 6 小时检查 DeepSeek Harness 及关键生态仓库：

1. 比较锁定 Commit 与上游默认分支；
2. 报告新增、删除、重命名和修改的文件；
3. 以路径级规则提示许可证、依赖、测试、文档或实现变化；
4. 将绑定旧 Commit 的人工文档标成 `stale`，生成待复核清单；
5. 仅创建更新 PR，不直接修改主分支；
6. 人工确认语义分析后再提升基线。

自动化不能替代人工判断。架构结论、产品判断、论文解释和安全结论必须审核。

## API Key

真实 DeepSeek API 实验从环境变量读取：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

仓库、日志、fixture 和更新报告禁止保存真实密钥。无密钥 CI 与带密钥真实 E2E
必须分开；公共 fork 默认只运行无密钥检查。

## 开源边界

- 本项目原创脚本：MIT，见 `LICENSE-CODE`。
- 本项目原创文档：CC BY 4.0，见 `LICENSE-DOCS`。
- DeepSeek Harness：上游 MIT，但本仓库只保留引用和固定版本信息。
- Claude Agent SDK：受 Anthropic 商业条款约束，不随本仓库再分发。
- Cordis 论文：上游仓库未提供明确再发布许可证，只做引用、释义和阅读笔记。
- MCP SDK 等混合许可项目按文件和文档范围记录，不使用一个总许可证覆盖。

详见 [`THIRD_PARTY.md`](THIRD_PARTY.md)。

## 本地检查

```bash
npm run check
npm run sources:verify
npm run catalogs:verify
```

## 项目定位

这是独立研究与教学仓库，不是官方 Harness 的镜像、分叉或贡献入口。
欢迎修正文档事实、补充可复现实验、增加文件级分析和提交上游变化证据。
