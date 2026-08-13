---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 18｜维护者指南入口

Atlas 是独立研究仓库，不是 DeepSeek Harness 的源码镜像或下游发行版。维护者的首要责任是保持“结论—来源—版本—验证”可追溯，并守住版权、凭据和发布边界。

合并前要求：

- 源码结论绑定 `sources/sources.lock.yml` 中的 commit；
- 明确标注 code/test/runtime/official-doc/community/inference 证据层；
- 只提交相对链接或公开 HTTPS permalink；
- 不提交私有日志、凭据、权重、构建产物、嵌套 `.git`；
- 不复制 Cordis 论文全文或 Claude Agent SDK 源码；
- 文档变更运行 `npm run check`，锁或生成索引变更再运行对应 source/catalog 检查。

上游同步与法律边界见 [上游、发布与许可证](upstream-and-license.md)。
