---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 04｜启动与配置：仓库能力如何变成实际产品

同一份源码可以启动成不同产品表面，因为 CLI 先选择 profile，再按顺序叠加 bundle 与 patch，最终由 Cordis 装载插件树。`evidence: official-doc`

## 产品轨

默认体验由组合配置决定，而不是由“仓库里有什么”决定。MCP、ACP、E2B、Codex 或 Claude 子 Agent 即使有实现，也可能未在当前 profile 挂载。`evidence: code`

这意味着产品说明必须回答三件事：默认启用了什么；用户怎样发现和修改；错误配置是启动失败、静默降级还是运行时失败。`evidence: inference`

## 工程轨

配置层从低到高为：bundle 列表 → profile `cordis.patch.yml` → home patch → `--patch` overlay。后层可按 id 替换配置或插入条目。`evidence: official-doc`

调试的第一证据应是最终配置：

```sh
dsh --profile web --dump-config
```

这条命令本身由官方文档给出。`evidence: official-doc` 它的输出只证明配置合成结果；插件是否成功激活还需启动日志或运行检查。`evidence: inference`

## CLI 中已经没有内置 TUI 产品

在固定快照 `47f943…`，合法发行组合是 `base`、`web-app` 和 `headless`；内置 TUI package 与 shipped composition 已删除。`evidence: code` CLI 参数解析测试里仍可能出现 `--profile tui` 作为通用 profile 名样例，但 built-bin E2E 明确拒绝 `dsh tui`。`evidence: code` 因此，不能从历史 note、测试字符串或底层 terminal 能力反推当前存在官方 TUI 产品。`evidence: inference` 外部 turtle-ui 示例目前不可取得，也不能当作可用替代入口。`evidence: runtime`

继续阅读：[配置组合](config-composition.md)、[插件系统全景](../03-cordis-foundation/plugin-system-mainline.md)、[Agent runtime](../05-agent-runtime/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动配置/文件参考](https://github.com/plwslpld-arch/deepseek-harness-internals/tree/gh-pages)
