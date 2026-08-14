# Quickstart

第一次打开仓库时，按这个顺序走。

## 1. 先选目标

| 你的目标 | 先看 |
| --- | --- |
| 系统学习 Harness | [docs/00-course/README.md](docs/00-course/README.md) |
| 只想快速判断项目价值 | [docs/00-course/01-product-positioning.md](docs/00-course/01-product-positioning.md) |
| 想看懂核心实现 | [docs/00-course/05-agent-loop.md](docs/00-course/05-agent-loop.md) |
| 想理解 prompt/context | [docs/00-course/06-prompt-and-context.md](docs/00-course/06-prompt-and-context.md) |
| 想理解插件系统 | [docs/00-course/03-cordis-plugin-runtime.md](docs/00-course/03-cordis-plugin-runtime.md) |
| 想改核心 runtime | [docs/00-start-here/paths/runtime-contributor.md](docs/00-start-here/paths/runtime-contributor.md) |

## 2. 不要从这些地方开始

- `sources/`：这是固定源码，不是教程。
- `docs/14-file-reference/generated/`：这是机器索引，不是入门正文。
- `research/`：这是证据落账区，不是学习目录。

## 3. 需要本地跑时

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

## 4. 三个判断边界

1. Harness 不是模型本身，而是模型外面的 Agent 执行系统。
2. 代码存在不等于默认启用，测试通过不等于真实业务闭环。
3. 源码索引用来查文件；课程目录用来学习。
