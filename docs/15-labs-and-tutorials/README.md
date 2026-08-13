# 15｜实验与教程入口

Harness 实验单位不是“模型跑了一次”，而是：

`任务集 × 模型/API × profile/config × tools/permissions × sandbox/runtime × budget × scorer`

任一项变化，都不能把结果直接归因于模型。先按 [可复现实验协议](experiment-protocol.md) 建立 baseline，再进入 [benchmark 设计](../19-benchmarks-and-evaluation/benchmark-design.md)。

每个实验保存三层产物：manifest（版本/环境/配置/预算）、trajectory（session events/tools/approval/usage/error）、result（workspace diff/tests/scorer/human review）。最后一条 assistant 文本、HTTP 200 或进程退出 0 都不是任务完成的充分证据。

从零学习扩展系统时，继续做 [最小插件实验](minimal-plugin-lab.md)：先 host-only 可逆 service，再做配置/HMR，最后才加 client UI 与 tree 外安装。
