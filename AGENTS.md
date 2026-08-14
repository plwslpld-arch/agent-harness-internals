# Repository instructions

DeepSeek Harness Internals 是一个独立的、以证据为基础的中文深度解析仓库。**受众只有一类**：有工程背景、想搞懂现代 agent harness 如何构建的人。

## 内容规则

- 每篇文章按固定五段组织：产品现象 → 源码路径 → 机制 → 约束与失效条件 → 可复核实验。
- 源码引用精确到 `packages/<group>/<pkg>/src/<file>.ts:<line>`，并绑定 `sources/sources.lock.yml` 中的 Commit。
- 结论至少标注一种证据：`code`、`test`、`runtime`、`official-doc`、`community`。**不使用 `inference` 标签**——它此前出现在每一篇文档里，没有区分度。属于推断的句子直接在正文写明「这是推断」。
- 行内证据标注统一用反引号后缀写法，放在句末：`` 这句话。`evidence: code` ``。不要用 `[code]` 段首前缀，也不要自造标签。
- 提交的链接保持相对路径，或使用公开 HTTPS 永久链接。
- 不提交凭据、私有日志、模型权重、`node_modules`、构建产物或嵌套 `.git` 目录。
- 不再分发 Cordis 论文与 Claude Agent SDK 源码，只做引用和原创释义。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `README.md` | **唯一导航入口**。不要新增 QUICKSTART / LEARNING_PATH 一类的平行导航文件。 |
| `docs/` | 人工深度文章，扁平结构，ASCII slug 文件名 + 中文标题。 |
| `sources/` | 上游 submodule、`sources.yml`、`sources.lock.yml`。 |
| `research/runtime-evidence/` | 真实运行记录：环境、命令、退出码、产物。 |
| `.generated/` | 本地生成的源码索引，**不入库**。由 CI 发布到 `gh-pages` 分支。 |

生成索引回答「有什么、在哪里」；`docs/` 回答「为什么、怎么失效」。生成流程绝不能覆盖人工分析。

## 重构进行中

仓库正从「21 章百科」转为「12 篇深度长文 + 2 附录」。`docs/` 下仍存在旧的编号分章文档，它们随每篇新文章发布被吸收并移除。新增内容一律写进新文章，不要再往旧分章里加。

已删除文件的内容可用 `git show <commit>:<path>` 取回；`docs/00-start-here/` 的角色路线、`QUICKSTART.md`、`LEARNING_PATH.md` 均在历史中。

## 验证

文档改动运行 `npm run check`（`sources:verify` → `check:analysis` → `check:portability` → `check:licenses` → `check:links` → `check:secrets` → `test`，`&&` 串联，任一步失败即短路）。

`npm run catalogs:generate` 只在本地产出 `.generated/`，不参与 `check`。

更新机器人可以准备 PR，但语义、架构、产品、法律和安全类结论必须人工复核。
