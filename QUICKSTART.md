# Quickstart

如果你第一次打开这个仓库，不要从 `sources/` 或 `docs/14-file-reference/generated/` 开始。那两个地方是源码基线和机器索引，不是入门教程。

## 5 分钟判断读哪里

| 你的目标 | 先读 |
| --- | --- |
| 我不是研发，但想看懂 Harness 是什么 | [docs/00-start-here/paths/non-engineer.md](docs/00-start-here/paths/non-engineer.md) |
| 我要判断产品价值、成熟度和风险 | [docs/00-start-here/paths/product.md](docs/00-start-here/paths/product.md) |
| 我要看懂实现主链路 | [docs/00-start-here/paths/engineer.md](docs/00-start-here/paths/engineer.md) |
| 我要改 Agent runtime 核心 | [docs/00-start-here/paths/runtime-contributor.md](docs/00-start-here/paths/runtime-contributor.md) |
| 我要维护这个学习仓库 | [docs/00-start-here/paths/maintainer.md](docs/00-start-here/paths/maintainer.md) |
| 我要按阶段系统学习 | [LEARNING_PATH.md](LEARNING_PATH.md) |

## 最短学习顺序

1. 先读 [docs/00-start-here/README.md](docs/00-start-here/README.md)，建立基本概念。
2. 再读 [LEARNING_PATH.md](LEARNING_PATH.md)，确定从粗到精的学习路线。
3. 如果想看产品和成熟度，进入 [docs/01-product/](docs/01-product/README.md)。
4. 如果想看架构，进入 [docs/02-system-architecture/](docs/02-system-architecture/README.md)。
5. 如果想看插件系统，进入 [docs/03-cordis-foundation/](docs/03-cordis-foundation/README.md)。
6. 如果想看源码，先读 [docs/14-file-reference/source-reading-guide.md](docs/14-file-reference/source-reading-guide.md)，再看 generated 索引。
7. 如果想动手验证，进入 [docs/15-labs-and-tutorials/](docs/15-labs-and-tutorials/README.md)。

## 本地准备

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone \
  https://github.com/plwslpld-arch/deepseek-harness-atlas.git
cd deepseek-harness-atlas
npm run bootstrap
npm run check
```

真实 DeepSeek API 实验使用个人环境变量：

```bash
export DEEPSEEK_API_KEY="your-own-key"
```

不要把真实 key 写入仓库、日志、fixture 或 issue。

## 先记住三个边界

1. Harness 不是模型本身，而是模型外面的 Agent 执行系统。
2. 代码存在不等于默认启用，测试通过不等于真实业务闭环。
3. `generated/` 是机器索引，适合查文件；正式学习从 `docs/00-start-here/` 开始。
