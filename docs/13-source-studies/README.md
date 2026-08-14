---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 13｜人工源码研究入口

这里放不能由文件/符号索引自动生成的解释：协议转换、框架分叉、论文主张与当前实现之间的关系。所有结论绑定 `sources/sources.lock.yml`，并区分 `[code]`、`[test]`、`[runtime]`、`[official-doc]` 与 `[inference]`。

当前关键研究：

- [协议实现对照](protocol-implementation-study.md)：DSML、DeepSeek adapter、MCP、ACP 和 SDK JSON-RPC 的真实边界；
- [Cordis 分叉与插件系统](../02-cordis-and-boot.md)：upstream 与 vendored 18 类差异、host/client 插件和 HMR；
- [论文注释方法](paper-annotation-method.md)：不复制 Cordis 论文全文，如何把理论 claim 变成源码/实验问题。

自动生成的全文件/符号/测试索引属于 `docs/14-file-reference/generated/`，不得反向覆盖本目录的人类分析。
