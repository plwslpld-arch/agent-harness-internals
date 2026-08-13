---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 运行时拓扑：哪些能力在同一个执行世界

## 配置决定真实系统

运行配置从空树开始，依次叠加 bundle、profile patch、home patch 与命令行 overlay。`evidence: official-doc` 因此，分析真实行为必须看最终 `--dump-config`，不能只读仓库中的默认 patch。`evidence: inference`

## 能力 seam

一个完整 seam 包含接口定义、provider 实现和 consumer 使用者。例如文件系统抽象只有配上具体 provider 与面向模型的工具，才形成可用能力。`evidence: official-doc`

- 更换 provider 可以让相同工具表面转向本地或远程执行世界。`evidence: inference`
- 工具名称相同不代表信任边界相同，必须记录 provider 与部署配置。`evidence: inference`

## 三类事件域

| 域 | 用途 | 是否事实源 |
| --- | --- | --- |
| `session/event` | turn、step、message、tool 等可回放事实 | 是 |
| `agent/*` | inbox、状态、请求拦截、续跑与错误协调 | 否，属于实时控制 |
| 能力事件 | `tools/*`、`fs/*` 等策略和适配点 | 只有另行写入会话事件才持久 |

把实时状态当恢复依据，或把 UI 通知当永久审计记录，都会跨错边界。`evidence: inference`

## 工程验证

导出最终配置，选择一次工具调用，对照 `tool/call`、策略事件、工具自有事件和 `tool/result` 的顺序。实验必须记录版本、profile、provider、权限 preset 与工作目录。`evidence: runtime`

具体源码入口见[人工源码研究](../13-source-studies/README.md)，完整文件关系见[自动文件参考](../14-file-reference/README.md)。
