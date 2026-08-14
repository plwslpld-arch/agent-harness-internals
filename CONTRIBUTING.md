# 贡献指南

## 可以贡献什么

- 修正与锁定 Commit 不一致的路径、符号、行号或行为说明；
- 补充跨包因果链、失效条件和源码级实现分析；
- 提交可复现的协议、安全、性能和 UX 实验；
- 增加经过分级的官方、社区和采用证据；
- 改进自动更新、可移植性和许可证检查。

不接受：上游文档的翻译或复述、纯 API 手册、入门教程。上游自带 54,584 行双语文档，覆盖度这条路没有意义。

## 文章结构

`docs/` 下每篇文章按固定五段组织：

| 段 | 内容 |
| --- | --- |
| 产品现象 | 用户或 PM 能观察到什么 |
| 源码路径 | 精确到 `packages/<group>/<pkg>/src/<file>.ts:<line>`，绑定锁定 Commit |
| 机制 | 数据怎么流，关键类型与函数签名 |
| 约束与失效条件 | 什么情况下这个机制不成立 —— **最有价值也最容易漏的一段** |
| 可复核实验 | 一条能跑的命令 + 该看哪个指标 |

文件名用 ASCII slug（`docs/06-kv-cache-discipline.md`），标题用中文。不要新建子目录。

## 事实要求

每个重要结论至少包含一种证据，用反引号后缀标在句末：

```markdown
DeepSeek 的 `prompt_tokens` 包含缓存命中，适配器扣除后映射到互不重叠的内部字段。 `evidence: code`
```

| 标签 | 含义 |
| --- | --- |
| `code` | 锁定 Commit 的源码 |
| `test` | 上游测试文件 |
| `runtime` | 本地实际运行结果 |
| `official-doc` | 官方文档或公告 |
| `community` | 社区样本，只能支持采样性结论 |

**不使用 `inference` 标签。** 属于推断的句子在正文直接写明是推断。也不要用 `[code]` 段首前缀或自造标签。

运行类结论需记录版本、环境、命令、开始/结束时间、退出码、跳过项、日志或产物路径。

不要把路线图当成已实现，不要把默认关闭的插件写成默认能力，不要把 HTTP 200、编译成功或 benchmark 分数当作完整业务 E2E。

## 文档元数据

`docs/` 下每个 `.md` 都必须有 frontmatter。解析器是行式正则，**列表必须写在单行**：

```yaml
---
sources: [{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/index.ts","commit":"<40-hex>"}]
last_verified: YYYY-MM-DD
status: draft # draft | reviewed | verified | stale
depth: L2 # L0 | L1 | L2 | L3
audience: [engineering]
evidence: [code, test]
---
```

约束（由 `scripts/verify-analysis.mjs` 强制）：

- `sources[].repo` 必须存在于 `sources.yml`；
- `sources[].commit` 必须等于 lock 中的 Commit（`status: stale` 除外）；
- `sources[].path` 会用 `git cat-file -e` 实证在上游确实存在——合并多篇文章时逐条核对，不要照抄；
- `status: stale` 的文档路径必须出现在 `sources/stale-documents.md`。

## 提交流程

1. 从当前 `main` 创建分支。
2. 不提交 `sources/checkouts`、依赖、构建产物、模型权重、真实日志或密钥。
3. 运行 `npm run check`。
4. PR 说明上游 SHA、变更证据、验证结果和未覆盖项。
5. 自动更新 PR 需要人工确认语义变化后才能合并。

第三方内容必须遵守原始许可证。不能确认再发布权利时，只提交 URL、SHA、少量合规引用和自己的分析。

## 维护

- 上游每 6 小时检查一次，变动只生成候选 PR 并把受影响文档标记为 `stale`，不自动改写结论。
- Cordis fork 的维护不能直接复制上游目录，先读上游 `vendor/README.md` 再逐项决定重放、改写、退役还是拒绝。
- 源码索引由 `npm run catalogs:generate` 产出到本地 `.generated/`，CI 发布到 `gh-pages`，不入主干。
- 上游变化后，绑定旧 Commit 的人工结论需要重新审核。
