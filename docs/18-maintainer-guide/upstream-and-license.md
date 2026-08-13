---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 上游、发布与许可证维护

## 内容分层

- `sources/`：版本锁与可再获取的 checkout 元数据，不放权重或私密材料。
- `research/`：证据账本、运行证据、benchmark 和未完成假设。
- `docs/`：经人工复核的教学与研究结论。
- 生成目录只放机器索引；人工分析绝不被生成任务覆盖。

研究记录可以引用本地 checkout 的相对路径，但对外发布前必须保证读者能通过 lock 与 canonical URL 重新获取相同源码。

## 上游同步评审

一次更新 PR 至少包含：旧/新 commit、来源 URL、差异分类、许可证变化、受影响页面、验证结果、未解决问题。机器人不得自动合并语义变更。

对主仓库重点审查：profile 默认能力、工具与审批流水线、session event/format、DeepSeek adapter、MCP/ACP/SDK wire、sandbox enforcement、动态插件安装、THIRD_PARTY_NOTICES 与 release scripts。

对 vendored Cordis 重点审查上游基点和每项本地补丁，保留 upstream license/notice，不把论文或上游源码复制到 Atlas 文档。

## 许可证边界

许可证判断以固定快照中的文件为准，不凭项目印象：

- DeepSeek Harness、V4 模型仓库和 Cordis upstream 在当前快照声明 MIT；
- ACP SDK、E2B、Codex 是 Apache-2.0；
- MCP SDK 当前 LICENSE 说明处于 MIT → Apache-2.0 迁移，文档贡献还涉及 CC-BY-4.0，不能简化成单一许可证；
- Pi 为 MIT；
- Claude Agent SDK 的 LICENSE.md 指向 Anthropic 商业条款，不应贴“开源参考实现”标签；
- Harness 自身的 `THIRD_PARTY_NOTICES.md` 还对 Claude Code 平台 payload 做了特定身份/版本授权说明，这不把其条款变成 permissive。

Atlas 的文档许可证、代码许可证与引用材料许可证分别处理。摘要、短引文和自绘图要保留来源；复制源码、图片、表格、论文或模型输出前单独判断授权。法律不确定时只保留链接、hash 和自己的事实描述，并请求专业审查。

## 发布前 closure

1. 检查 staged 文件中无 secret、绝对私有路径、权重、嵌套仓库与大二进制。
2. 验证相对链接和公开 permalink。
3. 检查每个 source claim 的 lock commit。
4. 运行 notices/license 扫描；新增依赖检查完整 transitive 与平台 optional payload。
5. 确认生成索引可重建且没有覆盖人工分析。
6. 运行 `npm run check`，记录结果；需要 API/key 的验证单独报告，不用 skipped 冒充通过。
7. changelog 写“新增/修正了哪些结论、证据和边界”，不宣称未验证的最新状态。

## 安全披露与勘误

可能导致凭据泄漏、沙箱逃逸、权限错绑或供应链风险的发现，先按 `SECURITY.md` 私下报告；公开文档只写已协调可披露信息。普通事实错误用 issue/PR 修正，并保留“旧结论为何错、受哪些页面影响”的简短决策记录。
