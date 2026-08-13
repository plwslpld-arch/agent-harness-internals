# 许可证与引用边界

> 本页是工程维护清单，不是法律意见。发生再分发、商业交付或条款不明确时应请专业人士审查。

## 三种行为分开判断

1. **链接与事实研究**：通常只保存 canonical URL、commit/hash 和自己的摘要。
2. **复制/修改源码或文档**：遵守对应文件许可证、notice、attribution 和变更说明。
3. **分发构建物/平台 payload/模型权重**：检查完整 transitive closure、平台包、模型许可和服务条款。

根仓库是 MIT，不代表其中每个依赖、可选 CLI、论文、文档、模型或远端服务都自动成为 MIT。

## 当前快照注意点

- Harness 自身 `LICENSE` 为 MIT，第三方闭包由 `THIRD_PARTY_NOTICES.md` 和 lockfiles 描述。
- vendored Cordis 及基础库保留各自 LICENSE 与 upstream commit/local modification 记录。
- MCP SDK LICENSE 明示重许可过渡：部分贡献 MIT、已同意重许可和新代码 Apache-2.0、非规范文档 CC-BY-4.0；必须按具体文件/贡献判断。
- ACP SDK、E2B、Codex 为 Apache-2.0；发布修改版本通常需要保留许可证/NOTICE 并标示修改。
- Cordis paper 是阅读材料，不随 Atlas 再分发全文；只做注释、短引文和链接。
- Claude Agent SDK/Claude Code payload 受 Anthropic 条款约束。Harness notices 中的特定授权不是通用 permissive 许可证，Atlas 不复制其源码或二进制。
- DeepSeek V4 模型仓库当前声明 MIT，但模型权重很大且不应进入 Atlas；任何下游分发仍要核对锁定版本的 LICENSE 与承载平台规则。

## PR 检查

- 新增材料是否真的需要复制，还是链接+摘要即可？
- 许可证与 NOTICE 是否来自固定 commit？
- 是否包含第三方图片、表格、长引文、生成输出或数据集？
- 修改文件是否要求标注修改、保留版权或提供 source？
- optional/platform/transitive 包是否被忽略？
- 远端 API 的 ToS、隐私和数据出境是否另行审查？
- `THIRD_PARTY.md`、NOTICE、source lock 和发布包内容是否一致？

不确定时默认不复制、不分发，只保留可验证引用并打开维护决策记录。
