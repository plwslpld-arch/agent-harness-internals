---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L1
evidence: [code, inference]
---

# Generated source indexes

本页解释 `generated/` 目录怎么用。`generated/` 本身只保存机器生成文件，不放人工说明。

## 怎么用

| 你要找什么 | 看哪个文件 | 用法 |
| --- | --- | --- |
| 某个文件负责什么 | [generated/harness-file-cards.md](generated/harness-file-cards.md) | 搜文件名或 package 名 |
| 某个符号在哪里 | [generated/symbols.md](generated/symbols.md) | 搜 class/function/service 名 |
| 哪些文件相互依赖 | [generated/harness-dependencies.md](generated/harness-dependencies.md) | 搜源文件路径 |
| 某个源码有什么测试 | [generated/harness-source-test-map.md](generated/harness-source-test-map.md) | 搜源码路径 |
| 测试文件有哪些 | [generated/tests.md](generated/tests.md) | 搜 package 或测试名 |
| Agent notes 关联 | [generated/agent-notes.md](generated/agent-notes.md) | 搜主题或文件路径 |
| 覆盖边界 | [generated/coverage-report.md](generated/coverage-report.md) | 看生成覆盖摘要 |

## 正确阅读顺序

1. 先在 [../00-course/](../00-course/README.md) 找到对应课程。
2. 再在 [source-reading-guide.md](source-reading-guide.md) 判断能力域。
3. 然后打开 `generated/` 的索引文件搜索具体路径。
4. 最后回到 `sources/checkouts/deepseek-harness` 阅读真实源码。

## 边界

- `generated/` 文件可以重新生成，不接受手工修补。
- 索引命中只证明源码存在，不证明默认启用或产品可用。
- 函数名和依赖边是导航线索，语义判断仍要回到人工源码研究和本地实验。
