# 阶段 1：品牌、中文入口与对外信息实施计划

> **执行要求：** 按任务顺序在当前会话内执行；自动化变更采用测试先行，视觉资产先渲染后发布，每个任务完成后独立提交并做一次局部反向检查。

**目标：** 建立与“Agent Harness 内部原理”定位一致的非吉祥物品牌，发布中文 README 和总入口，并用机器门禁约束仓库标识、公开承诺、正式视觉和 GitHub 元数据。

**架构：** 品牌事实由 `assets/brand/brand.yml` 统一描述，正式 SVG 继续登记到图示 Manifest；`scripts/check-brand.mjs` 检查命名、尺寸、文本和 README 使用关系，现有视觉门禁负责 SVG 安全性与中文可见文字。三个候选只保存在评审证据目录，最佳方案才进入正式资产目录。GitHub 远端变更在最终部署阶段执行，本阶段先形成可校验的目标元数据，避免公开页面与尚未合并的内容错位。

**技术栈：** Node.js 24、ES Modules、`node:test`、零依赖 SVG、Markdown、JSON 兼容 YAML。

**规格：** `specs/2026-08-23-agent-harness-internals-redesign.md`

## 全局约束

- 全部可见自然语言使用中文；产品名、协议名、命令和代码标识符可保留原文。
- 不调用 NVM；验证使用当前 Node 24。
- Logo 不使用机器人脸、吉祥物、厂商 Logo 或供应商配色拼贴。
- 公开文件只使用仓库相对路径，不出现机器绝对路径。
- README 只把 `reviewed` 和 `verified` 内容作为正式课程链接；未完成主线只能显示状态。
- 候选评审必须包含小尺寸辨识度、独特性、内部结构关联、中文组合效果和商标混淆风险。
- 每个正式 SVG 必须有中文 `title`、`desc`、Manifest `alt`，且不依赖外部资源。
- Social preview 固定为 1280×640，并生成经渲染检查的 PNG。
- 本阶段不执行仓库改名、强推或 Contributors 清理；这些动作在所有内容提交完成后的最终部署阶段一次执行。

---

### Task 1：品牌与仓库元数据契约

**文件：**

- 新建：`scripts/check-brand.mjs`
- 新建：`scripts/tests/brand.test.mjs`
- 新建：`assets/brand/brand.yml`
- 新建：`.github/repository-metadata.yml`
- 修改：`package.json`
- 修改：`scripts/check-all.mjs`

**接口：**

- 输入：品牌 Manifest、README、图示 Manifest、正式资产和 GitHub 目标元数据。
- 输出：`validateBrandManifest()`、`validateRepositoryMetadata()`、`check:brand`。

- [ ] 先写失败测试，覆盖仓库标识、中文标题、Logo 禁用元素、正式资产清单、Social preview 尺寸、About 和 Topics。
- [ ] 运行测试，确认因缺少实现而失败。
- [ ] 最小实现品牌门禁并接入聚合检查。
- [ ] 运行单测与 `check:brand`，确认通过。
- [ ] 反向注入旧仓库名、机器人描述、英文 About、错误尺寸和缺失资产，确认门禁逐一拒绝。
- [ ] 提交：`feat(brand): 建立品牌与仓库元数据契约`。

### Task 2：三个矢量 Logo 候选

**文件：**

- 新建：`evidence/reviews/brand-candidates/candidate-a-track.svg`
- 新建：`evidence/reviews/brand-candidates/candidate-b-bracket.svg`
- 新建：`evidence/reviews/brand-candidates/candidate-c-kernel.svg`
- 新建：`evidence/reviews/brand-candidates/README.md`

**候选方向：**

1. 并行轨道：表达模型、工具、状态和证据在 Harness 中汇合。
2. 约束括架：表达 Harness 为任务循环提供边界和控制点。
3. 分层内核：表达界面、编排、执行与证据的内部剖面。

- [ ] 为三个方向分别绘制纯矢量标记和中文组合预览。
- [ ] 在 16、24、32、64、128、256 像素下生成渲染样张。
- [ ] 检查单色、浅色背景、深色背景和灰度情况下的辨识度。
- [ ] 反向检查是否像机器人、聊天气泡、厂商标志、无限符号或通用 AI 火花。
- [ ] 提交：`feat(brand): 生成三个非吉祥物 Logo 候选`。

### Task 3：Logo 对抗评审与选择

**文件：**

- 新建：`evidence/reviews/2026-08-23-brand-selection.yml`
- 新建：`evidence/reviews/brand-candidates/contact-sheet.png`

- [ ] 以五项强制维度和可访问性、可维护性两个附加维度进行逐项评分。
- [ ] 每个候选列出至少三个失败模式，不允许只写优点。
- [ ] 对最高分方案再做相似性、缩放、负形、线宽和中文字标压力测试。
- [ ] 若最高分方案存在高严重度问题，先修复并重新渲染，不带问题进入正式目录。
- [ ] 记录选择理由、被否决方向和证据文件。
- [ ] 提交：`docs(review): 完成 Logo 候选对抗评审`。

### Task 4：正式品牌资产与渲染产物

**文件：**

- 新建：`assets/brand/logo-mark.svg`
- 新建：`assets/brand/logo-lockup.svg`
- 新建：`assets/brand/social-preview.svg`
- 新建：`assets/brand/social-preview.png`
- 新建：`scripts/render-brand.mjs`
- 修改：`assets/diagrams/manifest.yml`
- 修改：`scripts/tests/brand.test.mjs`
- 修改：`scripts/tests/visuals.test.mjs`

- [ ] 先扩展测试，要求正式资产与评审赢家一致、全部登记 Manifest、PNG 尺寸正确。
- [ ] 运行测试并确认缺少资产时失败。
- [ ] 从评审赢家派生核心标记、中文组合标和 1280×640 社交预览。
- [ ] 使用确定性渲染脚本生成 PNG，不把渲染依赖加入项目依赖。
- [ ] 运行品牌、视觉和 PNG 尺寸测试。
- [ ] 打开渲染结果目视检查文字截断、像素糊化、负形粘连、对比度和窄屏效果。
- [ ] 提交：`feat(brand): 发布正式中文品牌资产`。

### Task 5：中文 README 公共入口

**文件：**

- 修改：`README.md`
- 修改：`scripts/tests/brand.test.mjs`
- 修改：`scripts/check-links.mjs`（仅在现有链接门禁无法覆盖 README 时）

**README 必须回答：**

- 仓库研究什么，为什么以 Agent Harness 为主线。
- DSH、Codex、Gemini CLI、Claude、pi、OpenCode 六条主线分别处于什么状态。
- Eval 如何作为每条主线的横切能力，而不是第二套并列百科。
- 读者如何按入门、实现、安全、评测、产品和研究路径阅读。
- 证据等级、能力状态、锁定来源和本地验证分别意味着什么。
- 当前完成度和证据边界是什么，不夸大为生产就绪或官方结论。

- [ ] 先增加 README 契约失败测试：必须使用正式组合标、中文主标题、六条主线、状态说明、证据边界和 Node 24 验证；不得出现旧标语、旧仓库名、英文入口或未审课程链接。
- [ ] 运行测试并确认旧 README 失败。
- [ ] 重写 README，使用状态表展示未完成主线但不链接为正式课程。
- [ ] 运行品牌、链接、样式和敏感信息检查。
- [ ] 反向检查“完整”“覆盖所有”“生产可用”等过度承诺，以及隐性双主线表述。
- [ ] 提交：`docs(readme): 重建 Agent Harness 中文公共入口`。

### Task 6：中文总入口页

**文件：**

- 新建：`docs/00-start-here.md`
- 修改：`scripts/analysis-metadata.mjs`
- 修改：`scripts/check-content-contract.mjs`
- 修改：`scripts/tests/article-contract.test.mjs`
- 修改：`scripts/tests/content-contract.test.mjs`
- 修改：`scripts/tests/navigation.test.mjs`

- [ ] 先测试 `start` 文章类型、入口内容契约和正式导航状态限制。
- [ ] 运行测试并确认当前元数据模型不认识总入口。
- [ ] 为总入口增加专用文章类型，要求定位、概念图、阅读路径、状态解释、证据方法、验证入口和边界说明。
- [ ] 写成可独立理解的完整入口，不使用一两句话占位；本阶段状态设为 `reviewed`。
- [ ] README 正式导航只链接这一篇已复核入口；六条主线仍只显示状态。
- [ ] 运行分析、内容、导航、链接和样式检查。
- [ ] 提交：`docs(entry): 发布中文总入口`。

### Task 7：清理旧英文入口和旧视觉

**文件：**

- 删除：`README.en.md`
- 删除：根 `assets/` 下五张旧定位 SVG
- 修改：所有指向旧入口和旧图的仓库文件
- 修改：`scripts/tests/project-files.test.mjs`

- [ ] 先增加失败测试，禁止英文 README、旧 Logo 文件、旧仓库标识和旧“双 Harness”标语回到公开树。
- [ ] 运行测试并确认旧文件触发失败。
- [ ] 删除旧文件并修复所有相对链接。
- [ ] 用 `rg` 检查旧文件名、旧仓库名、英文入口和旧标语零残留；历史规格中的明确否定说明不计为公开残留。
- [ ] 运行项目文件、链接、视觉和可移植性检查。
- [ ] 提交：`refactor(repo): 移除旧英文入口与旧视觉`。

### Task 8：对外元数据部署准备

**文件：**

- 修改：`package.json`
- 修改：`.github/repository-metadata.yml`
- 修改：`.github/workflows/verify.yml`
- 修改：`scripts/tests/brand.test.mjs`

- [ ] 先测试包名、工作流徽章目标、仓库标识、About、Topics 和社交预览路径一致。
- [ ] 将包名改为 `agent-harness-internals`，工作流与 README 不再引用旧远端名。
- [ ] 固定中文 About 和 Topics 目标清单，记录最终阶段所需的远端应用与复核动作。
- [ ] 不在功能分支提前修改远端仓库，以免公开元数据指向尚未发布内容。
- [ ] 运行品牌、项目文件、链接和聚合检查。
- [ ] 提交：`chore(github): 固定仓库对外元数据目标`。

### Task 9：阶段 1 全量对抗复核

**文件：**

- 新建：`evidence/reviews/2026-08-23-phase-1-brand-entry.yml`
- 修改：`specs/2026-08-23-agent-harness-internals-program-plan.md`

- [ ] 从已提交基线运行 Node 24 聚合检查和全部单元测试。
- [ ] 逐项审计品牌契约、三个候选、评审证据、正式资产、PNG、README、总入口、旧文件清理和远端元数据目标。
- [ ] 再次目视检查三种尺寸、浅深背景、README 顶图和 Social preview。
- [ ] 主动寻找：品牌通用化、机器人残影、英文自然语言、状态夸大、死链接、未登记 SVG、绝对路径、远端提前变更和旧双主线残留。
- [ ] 修复全部高严重度发现并重跑验证；中低风险必须明确记录去向。
- [ ] 写入复核记录；只有记录通过后才勾选总路线阶段 1。
- [ ] 提交：`chore(review): 完成阶段 1 品牌与入口复核`。

## 阶段完成证据

阶段 1 只有同时满足以下条件才算完成：

1. 三个候选均有多尺寸渲染证据和失败模式分析。
2. 正式 Logo、组合标和 Social preview 来自评审赢家。
3. 正式 SVG 全部通过中文、安全和 Manifest 门禁，PNG 已目视复核。
4. README 与总入口完整解释定位、六条主线、Eval 横切能力、状态、阅读路径和证据边界。
5. 英文 README、旧 Logo、旧英文图和旧仓库标识不再出现在公开树。
6. GitHub 目标元数据可机器检查，但远端变更保留到最终部署阶段。
7. Node 24 聚合检查通过，阶段复核记录没有未解决高严重度发现。

