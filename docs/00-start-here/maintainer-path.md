# 维护者路线：让知识随上游变化而更新

维护者的对象不是一批静态 Markdown，而是一条证据供应链：来源定义 → 固定 Commit → 自动目录 → 人工语义分析 → 运行验证 → 版本与过期提示。

## 推荐顺序

1. 阅读根目录的 `AGENTS.md`、`THIRD_PARTY.md` 和 `PROJECT_STATUS.md`。
2. 从[人工源码研究](../13-source-studies/README.md)理解稳定的研究单元。
3. 从[自动文件参考](../14-file-reference/README.md)理解生成内容与人工内容的边界。
4. 检查 `sources/sources.yml` 与 `sources/sources.lock.yml`，所有源码结论绑定到锁定 Commit。`evidence: code`
5. 阅读[维护指南](../18-maintainer-guide/README.md)和[版本追踪](../17-version-tracking/README.md)。

## 维护原则

- 上游变更只能先生成差异和“待复核”提示，不能自动改写架构结论。
- 社区材料只能支持样本性结论。`evidence: community`
- 运行结论必须记录环境、命令、退出码和产物。`evidence: runtime`
- Cordis 论文与受限第三方源码只做引用和原创释义，不复制受限内容。

自动检查保证格式和链接，不代替产品、安全、法律与架构审查。`evidence: inference`
