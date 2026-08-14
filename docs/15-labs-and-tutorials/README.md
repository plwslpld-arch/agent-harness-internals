---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 15｜实验与教程入口

Harness 实验单位不是“模型跑了一次”，而是：

`任务集 × 模型/API × profile/config × tools/permissions × sandbox/runtime × budget × scorer`

任一项变化，都不能把结果直接归因于模型。先按 [可复现实验协议](experiment-protocol.md) 建立 baseline，再进入 [benchmark 设计](../19-benchmarks-and-evaluation/benchmark-design.md)。

每个实验保存三层产物：manifest（版本/环境/配置/预算）、trajectory（session events/tools/approval/usage/error）、result（workspace diff/tests/scorer/human review）。最后一条 assistant 文本、HTTP 200 或进程退出 0 都不是任务完成的充分证据。

从零学习扩展系统时，继续做 [最小插件实验](minimal-plugin-lab.md)：先 host-only 可逆 service，再做配置/HMR，最后才加 client UI 与 tree 外安装。

第一次上手不要直接做 benchmark。先做 [本地第一次跑通](local-first-run.md)：配置个人 `DEEPSEEK_API_KEY`，跑 headless 正向任务，再跑缺 key 或工具失败的负向任务，并按模板记录证据层级。

如果只是准备证据记录格式，可以先运行仓库级草稿生成器：

```bash
npm run evidence:local -- --scenario local-first-run
```

它只生成脱敏模板，不调用模型、不打印密钥。真实运行后，再把命令、退出码、session 事件摘要和 known gaps 补进 `research/runtime-evidence/`。
