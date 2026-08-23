# Agent Harness 全仓重建总执行路线

> 本路线把总规格拆为可以独立验收的阶段。每个阶段拥有单独实施计划、独立提交和对抗复核；只有复核记录通过后才能开始下一阶段。

**目标：** 完成 `specs/2026-08-23-agent-harness-internals-redesign.md` 定义的全仓重建，并把最终结果部署到 GitHub 公共仓库。

**执行方式：** 当前任务内联执行，不使用子代理。所有代码和门禁变更采用测试先行；所有文档阶段先建立证据清单，再写正文；所有视觉资产先渲染检查，再进入 README。

## 阶段与独立计划

- [ ] 阶段 0：地基、来源配置、证据模型和门禁。
  - 计划：`specs/2026-08-23-phase-0-foundation-implementation-plan.md`
  - 验收：新 Schema 和门禁有单元测试，旧双 Harness 规则退出，阶段复核通过。
- [ ] 阶段 1：品牌、Logo、中文视觉、README 和 GitHub 对外信息。
  - 计划在阶段 0 复核通过后根据已落地接口编写。
  - 验收：三个 Logo 方向完成渲染比较，最佳方案及 Social preview 发布，入口不夸大完成度。
- [ ] 阶段 2：共同基础课程。
  - 计划在阶段 1 复核通过后编写。
  - 验收：六篇基础课程达到 `reviewed`，图示、证据、中文和内容门禁通过。
- [ ] 阶段 3A：DeepSeek Harness 主线。
  - 验收：现有长文逐篇重审，完整任务链、评测接口、图示和实验通过。
- [ ] 阶段 3B：Codex 主线。
  - 验收：Rust 核心、工具、沙箱、会话、协议和评测接口形成完整课程。
- [ ] 阶段 3C：Gemini CLI 主线。
  - 验收：Core/CLI、Policy/Safety/Confirmation、工具、会话和评测形成完整课程。
- [ ] 阶段 3D：Claude 主线。
  - 验收：Claude Code 文档证据与 Python/TypeScript SDK 源码证据严格分层。
- [ ] 阶段 3E：pi 主线。
  - 验收：AI、Agent、Coding Agent、Protocol、Session、Telemetry 和 Evals 全链路完成。
- [ ] 阶段 3F：OpenCode 主线。
  - 验收：Provider、Session、Permission、Server、Protocol、多客户端和评测全链路完成。
- [ ] 阶段 4：横向比较、角色路径、评测集成和控制实验。
  - 验收：比较结论来自六方独立证据，不产生总分，角色建议可追溯。
- [ ] 阶段 5：mini-swe-agent、OpenHands、Cline、goose、Aider、Qwen Code 扩展样本。
  - 验收：每个样本只讲独特机制，来源锁定和状态承诺准确。
- [ ] 阶段 6：全仓审计、合并、推送和 GitHub 部署。
  - 验收：Node 24 完整检查通过，仓库名、About、Topics、Social preview、保护规则和公开页面完成核验。

## 每阶段固定闭环

1. 从总规格派生阶段实施计划。
2. 逐任务执行测试、实现、验证和提交。
3. 列出阶段承诺和逐项证据。
4. 主动寻找空壳、证据滑坡、条件遗漏、视觉缺陷和导航夸大。
5. 修复发现的问题并重跑验证。
6. 把结果写入 `evidence/reviews/`。
7. 复核通过后才勾选阶段并开始下一阶段。

## 全局约束

- 全部自然语言和图中可见说明使用中文。
- 不调用 NVM，验证使用当前可用 Node 24。
- 公开内容不出现机器绝对路径。
- 不维护旧目录兼容和英文 README。
- 不使用泄露材料或未经授权的逆向材料。
- 不把测试、课程或第三方评测扩大解释为生产就绪或发布授权。
- 不在六条主线完成前把扩展样本放入正式导航。

