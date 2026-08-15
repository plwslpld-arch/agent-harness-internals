# 仓库写作与维护规则

这是一个中文源码分析仓库，研究对象是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 dsh）。读者是想搞懂 agent harness 内部构造的工程师。

## 一条核心规则

**先给读者看模型/进程真实看到的东西，再解释机制。**

一篇文章如果通篇都是「某某函数在某某行」的索引，而没有一段真实的 prompt、一份真实的请求 JSON、一段真实的源码，那它没有完成工作。行号是脚注，不是内容。

## 写作要求

- **说人话。** 术语第一次出现就地解释，不要让读者跳到附录。不要写「本篇尚未覆盖」这种给自己找台阶的清单——写不完就不写那一节。
- **不硬套模板。** 每篇的结构服从内容。常见的顺序是：读者看得见的现象 → 真实数据 → 机制与源码 → 为什么这么设计 → 代价和失效点 → 别人怎么做。缺哪段都行，但不要为了凑格式注水。
- **贴真代码。** 引用上游源码时贴出来，标 `路径:行号`。**不要写伪代码再让它看起来像源码**——旧版 `docs/10` 出现过这个问题，函数名在上游根本不存在。
- **重要的引用请带原文片段。** 写成 `` `路径:行号`「被引内容的前几个词」 ``，`check:anchors` 会做一次子串匹配。纯行号只能保证「指到了一个真实存在的行」，挡不住「行号对、但指到了相邻的另一个声明」；带上原文就能让 CI 替你挡住这类错。
- **推断要写明。** 属于推断的句子直接写「这是推断」。不使用 `inference` 标签，也不使用任何行内证据标签。
- **横向对照就地给。** 讲完一个机制，顺手给一段「Claude Code / Codex / OpenCode / pi 怎么做」。不要把对照全部推到最后一篇。
- **不复述上游文档。** 上游有 110 篇英文文档、683 篇设计记录，讲得比这里全。这里补的是它不会写的：跨包的因果链、失效条件、横向对比、以及「为什么当初这么定」。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `README.md` | 唯一导航入口。不要新增平行的 QUICKSTART / LEARNING_PATH。 |
| `docs/` | 正文，扁平结构，ASCII slug 文件名 + 中文标题。 |
| `sources/` | 上游 submodule 与 commit 锁定。 |
| `research/runtime-evidence/` | 真实运行记录：环境、命令、退出码、产物。**没跑过的实验不要写进这里。** |
| `scripts/` | 零依赖的校验脚本。 |

## frontmatter

`docs/` 下每篇都要有，解析器是行式正则，**列表必须写在一行**：

```yaml
---
title: KV-Cache：没有一行缓存代码，为什么还能一直命中
sources: [{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/serialize.ts","commit":"<40-hex>"}]
last_verified: 2026-08-16
status: draft
---
```

- `status` 取 `draft` / `reviewed` / `stale`。
- `sources[].commit` 必须等于 `sources/sources.lock.yml` 里的值（`stale` 除外）。
- `sources[].path` 会被 `git cat-file -e` 实证。

## 校验

改完跑 `npm run check`，它串联：

| 步骤 | 检查什么 |
| --- | --- |
| `sources:verify` | submodule 与 lock 一致、无本地改动 |
| `check:analysis` | frontmatter 完整、commit 与 lock 一致、路径存在 |
| `check:anchors` | **正文里的 `文件:行号` 真的指向那一行**（行号越界或指向空行即失败）；引用后面跟了「原文片段」时，还会校验那段文字确实出现在被引区间里 |
| `check:portability` | LF 换行、无机器绝对路径、零依赖 |
| `check:licenses` | 许可证文件与哈希 |
| `check:links` | 相对链接目标存在 |
| `check:secrets` | 密钥模式扫描 |
| `test` | 脚本自身的单元测试 |

上游变化后，绑定旧 commit 的结论需要重新人工审核；不要让机器改写语义结论。
