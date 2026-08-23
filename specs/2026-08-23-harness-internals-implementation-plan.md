# Harness Internals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单一 DeepSeek Harness 源码导读升级为同时覆盖 agent harness 与 eval harness 的可核对中文知识库，并完成仓库品牌切换。

**Architecture:** 上游来源继续用 manifest + lock + gitlink 三重锁定；正文分成 `a1`–`a10`、`e1`–`e4` 与 `deep/` 三层。证据质量由 anchors、coverage、matrix 三道门禁共同约束，品牌与 GitHub 元数据最后切换，避免内容承诺领先于实际交付。

**Tech Stack:** Node.js 24、零第三方依赖的 ESM 校验脚本、Markdown、Git submodule、GitHub Actions 与 GitHub CLI。

**Spec:** `specs/2026-08-23-multi-harness-internals-design.md` 与 `specs/2026-08-23-dimensions.md`

## Global Constraints

- 所有源码结论绑定完整 40 位 commit，并用 `repo!path:line` 锚点校验。
- Claude Code 只描述官方 SDK 契约面和官方公开文档，不把闭源内部实现写成确定事实。
- 不运行昂贵 benchmark；交汇篇只复核公开结果及其口径。
- 校验脚本保持零第三方运行依赖，Windows 与 Linux 都能执行。
- 文档不写本机绝对路径，不纳入私有记录或 checkout 内容。
- 每个阶段必须通过 `npm run bootstrap` 与 `npm run check` 后才能进入下一阶段。

---

### Task 1: 锁定六个新增官方来源

**Files:**
- Modify: `.gitmodules`
- Modify: `sources/sources.yml`
- Modify: `sources/sources.lock.yml`
- Modify: `THIRD_PARTY.md`

**Interfaces:**
- Consumes: `readManifest()`、`verify-sources.mjs` 与 `verify-licenses.mjs`
- Produces: 11 个可 bootstrap、可校验许可证、可被正文引用的固定来源

- [ ] **Step 1: 用官方仓库默认分支 HEAD 写入 manifest、lock 与 gitlink**

Run: 分别对 `google-gemini/gemini-cli`、`anthropics/claude-agent-sdk-python`、`EleutherAI/lm-evaluation-harness`、`UKGovernmentBEIS/inspect_ai`、`laude-institute/terminal-bench` 与 `princeton-nlp/SWE-bench` 执行 `git ls-remote` 并记录 HEAD 完整 SHA；用 `git submodule add` 建立 gitlink，许可证经人工确认后写入 `THIRD_PARTY.md`。

- [ ] **Step 2: bootstrap 后刷新许可证哈希**

Run: `npm run bootstrap && node scripts/verify-licenses.mjs --update-lock`
Expected: 11 个 checkout 到达锁定 SHA，许可证哈希写回 lock。

- [ ] **Step 3: 运行完整来源校验**

Run: `npm run sources:verify && npm run check:licenses`
Expected: PASS，显示 11 个固定来源。

- [ ] **Step 4: 提交来源锁定**

Run: `git add .gitmodules sources THIRD_PARTY.md && git commit -m "feat(sources): 锁定完整 agent 与 eval harness 来源"`

### Task 2: 把 coverage 升为门禁并新增 matrix 门禁

**Files:**
- Modify: `scripts/analysis-metadata.mjs`
- Modify: `scripts/check-coverage.mjs`
- Create: `scripts/check-matrix.mjs`
- Modify: `package.json`
- Test: `scripts/tests/analysis-metadata.test.mjs`
- Test: `scripts/tests/coverage.test.mjs`
- Create: `scripts/tests/matrix.test.mjs`

**Interfaces:**
- Produces: `coverage_min` JSON 对象解析、`coverageFailures(rows)`、`matrixCellHasEvidence(cell)`
- Consumes: a/e 文档 frontmatter 与 Markdown 表格单元格

- [ ] **Step 1: 写 frontmatter JSON 对象失败测试**

```js
const parsed = parseFrontmatter('---\ncoverage_min: {"codex":2}\n---\n').metadata;
assert.deepEqual(parsed.coverage_min, { codex: 2 });
```

- [ ] **Step 2: 写 coverage 阈值失败测试**

```js
assert.deepEqual(coverageFailures([{ article: 'docs/a1.md', counts: { codex: 1 }, minimums: { codex: 2 } }]),
  ['docs/a1.md: codex=1 < 2']);
```

- [ ] **Step 3: 写 matrix 证据失败测试**

```js
assert.equal(matrixCellHasEvidence('`codex!codex-rs/core/src/lib.rs:10`'), true);
assert.equal(matrixCellHasEvidence('[官方文档](https://example.com)'), true);
assert.equal(matrixCellHasEvidence('这是推断：可能由运行时完成'), true);
assert.equal(matrixCellHasEvidence('支持插件'), false);
```

- [ ] **Step 4: 运行三组测试并确认缺少接口而失败**

Run: `node --test scripts/tests/analysis-metadata.test.mjs scripts/tests/coverage.test.mjs scripts/tests/matrix.test.mjs`
Expected: FAIL，缺少对象解析、阈值判断和 matrix 模块。

- [ ] **Step 5: 实现最小解析与门禁逻辑并接入 npm check**

`coverage_min` 必须覆盖文章对应的四个主角；任一计数低于阈值时退出 1。矩阵数据格必须含行号锚点、官方 URL 或「这是推断」之一。

- [ ] **Step 6: 运行测试确认变绿**

Run: `npm test`
Expected: 全部测试通过。

- [ ] **Step 7: 提交门禁**

Run: `git add scripts package.json AGENTS.md && git commit -m "feat(gates): 启用跨仓覆盖率与矩阵证据门禁"`

### Task 3: 完成 Part A 与 DSH 深度层重构

**Files:**
- Create: `docs/a1-system-prompt.md` 至 `docs/a10-orchestration.md`
- Create: `docs/deep/dsh-overview.md`、`dsh-llm-adapter.md`、`dsh-cordis-boot-preset.md`、`dsh-web-client.md`、`dsh-self-verification.md`、`dsh-agent-notes.md`
- Modify: `docs/00-overview.md`、`docs/concepts.md`、`docs/for-product.md`、`docs/for-ops.md`
- Remove after migration: `docs/01-*.md` 至 `docs/15-*.md` 与 `docs/14-comparison.md`
- Modify: `AGENTS.md`、`CHANGELOG.md`

**Interfaces:**
- Consumes: 四个主角的锁定源码和原 21 篇 DSH 分析
- Produces: 十篇逐维度对照文章、六篇 DSH 深读、四个跨角色入口

- [ ] **Step 1: 建立迁移映射并保留原 DSH 结论**

把 DSH 专属内容移动到 `deep/`，公共维度内容进入 a1–a10；旧文件只有在所有内部链接已替换后删除。

- [ ] **Step 2: 为每篇 a 文档写四源 frontmatter 与 coverage_min**

每个主角最低 1 个源码锚点；深度主题再提高 Codex/DSH 阈值。所有锚点在锁定 checkout 中逐行核对。

- [ ] **Step 3: 补齐四主角机制对照**

a1 prompt、a2 cache、a3 loop/request、a4 compaction、a5 tools/security/network、a6 session、a7 extensions、a8 code mode、a9 surfaces、a10 orchestration。

- [ ] **Step 4: 运行文档门禁并修复全部断链/失效锚点**

Run: `npm run check:analysis && npm run check:anchors && npm run check:coverage && npm run check:matrix && npm run check:links && npm run check:style`
Expected: 零错误；文风提醒可保留但要在 CHANGELOG 记录。

- [ ] **Step 5: 提交 Part A**

Run: `git add docs AGENTS.md CHANGELOG.md && git commit -m "docs(part-a): 完成四种 agent harness 逐维度对照"`

### Task 4: 完成 Part B 与交汇篇

**Files:**
- Create: `docs/e1-what-is-eval-harness.md`
- Create: `docs/e2-tasks-and-envs.md`
- Create: `docs/e3-run-and-score.md`
- Create: `docs/e4-harness-decides-score.md`
- Modify: `docs/a5-tools-approval-sandbox.md`
- Modify: `docs/a8-code-mode.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: 四个 eval harness 锁定源码与公开论文/官方结果
- Produces: 任务、执行、记分及 agent/eval harness 耦合的完整解释

- [ ] **Step 1: 写 e1–e4 frontmatter 与四源最低覆盖阈值**

每篇至少绑定四个 eval 来源各 1 个源码锚点，公开分数只作外部证据并明确未自行复跑。

- [ ] **Step 2: 写任务与环境、运行与记分、耦合三段内容**

明确 Trial 与 Attempt、任务规格与运行恢复、训练奖励与独立发布评估的边界；不把仓库验证写成生产能力证明。

- [ ] **Step 3: 补 a5 网络围栏与 a8 双实现 Code Mode**

分别对照 DSH、Codex 及缺失能力，不用排行榜语言。

- [ ] **Step 4: 运行全部文档门禁**

Run: `npm run check`
Expected: 11 个来源、所有 a/e 覆盖阈值、matrix、anchors、links、style 与 tests 全部通过。

- [ ] **Step 5: 提交 Part B**

Run: `git add docs CHANGELOG.md && git commit -m "docs(part-b): 补齐 eval harness 与两类 harness 交汇"`

### Task 5: 完成品牌、图表与公开入口

**Files:**
- Modify: `README.md`
- Create: `README.en.md`
- Replace: `assets/deepseek-harness-atlas.svg` with `assets/harness-internals.svg`
- Create: `assets/agent-harness-matrix.svg`
- Create: `assets/dsh-codex-subsystems.svg`
- Create: `assets/harness-model-cross.svg`
- Create: `assets/harness-coupling.svg`
- Modify: `NOTICE.md`、`THIRD_PARTY.md`、`package.json`

**Interfaces:**
- Produces: 不再以 DSH 为单一主角的中英文入口与四张可维护 SVG

- [ ] **Step 1: 重写中英文 README 与品牌 SVG**

README 包含两种 harness 的定义、角色分流、Part A/B 导航、11 源 bootstrap、三道证据门禁和证据边界。SVG 只使用仓库内文字与几何图形，不复用单一厂商 logo。

- [ ] **Step 2: 更新许可证声明并运行公开入口校验**

Run: `npm run check:links && npm run check:style && npm run check:portability && npm run check:secrets`
Expected: PASS，无断链、本机路径、敏感信息或文风错误。

- [ ] **Step 3: 提交品牌切换**

Run: `git add README.md README.en.md assets NOTICE.md THIRD_PARTY.md package.json && git commit -m "feat(brand): 发布 Harness Internals 中英文入口"`

### Task 6: 全量验证、PR、合并与仓库改名

**Files:**
- Modify: GitHub repository name、description、topics
- Modify: README badge/link after rename

**Interfaces:**
- Consumes: 完整 P1–P3 分支
- Produces: `harness-internals` 公开仓库与通过保护规则的 main

- [ ] **Step 1: 用 Node 24 跑全量验证**

Run: `npm run bootstrap && npm run check && npm run check:drift`
Expected: 11 个来源；全部门禁和测试退出 0。

- [ ] **Step 2: 推送分支并创建 PR**

PR 正文只写仓库相对名称，不包含本机绝对路径；列出来源、文档、门禁、品牌和验证证据。

- [ ] **Step 3: 等待 GitHub Verify 成功并按线性历史合并**

Run: `gh pr checks "$(gh pr list --head p1-p3/harness-internals --json number --jq '.[0].number')" --watch`，随后使用 rebase merge。

- [ ] **Step 4: 改名并更新 GitHub 元数据**

把仓库改名为 `harness-internals`，设置已批准的 description 与 20 个 topics，确认旧 URL 自动重定向。

- [ ] **Step 5: 修复改名后的 badge/link 并提交最终 PR（如需要）**

Run: `npm run check:links && npm run check`
Expected: README、Actions badge、clone 命令与远端地址全部指向新名称。

- [ ] **Step 6: 发布后复核**

确认默认分支、保护规则、Verify workflow、每周 Drift workflow、11 个 gitlink、README 渲染和中英文入口均可访问。
