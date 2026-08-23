# 阶段 0：地基、来源与证据门禁实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立新仓库所需的来源配置、文章状态、关键结论、导航、视觉和阶段复核门禁，并让旧双 Harness 规则退出。

**Architecture:** 所有自动化继续使用 Node.js 标准库和 JSON 兼容 YAML，保持零依赖。来源、文章、关键结论和复核记录分别由小型验证器负责，通过 `npm run check` 聚合；新门禁只对新目录和明确标记的正式导航生效，避免把旧内容误判为新课程。

**Tech Stack:** Node.js 24、ES Modules、`node:test`、Git submodule、Markdown、JSON 兼容 YAML。

**Spec:** `specs/2026-08-23-agent-harness-internals-redesign.md`

## Global Constraints

- 自然语言、报错和文档使用中文；命令、协议和代码标识符保留原文。
- Node.js 版本为 24；不调用 NVM。
- `package.json` 保持零运行依赖和零开发依赖。
- 所有路径使用仓库相对 POSIX 形式，公开文件不含绝对路径。
- 新状态固定为 `outline`、`draft`、`reviewed`、`verified`、`stale`。
- 来源配置固定为 `core`、`samples`、`eval`、`all`。
- 每个任务完成后提交，并在任务末尾进行一次局部反向检查。

---

### Task 1: 来源配置选择器

**Files:**
- Modify: `scripts/lib.mjs`
- Create: `scripts/tests/source-profiles.test.mjs`

**Interfaces:**
- Consumes: `sources/sources.yml` 中每个来源的 `profiles: string[]`。
- Produces: `parseSourceProfiles(args)` 和 `selectManifestSources(manifest, profiles)`。

- [ ] **Step 1: 写来源配置失败测试**

在 `scripts/tests/source-profiles.test.mjs` 中覆盖默认 `core`、重复 `--profile`、`all` 和非法配置：

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSourceProfiles, selectManifestSources } from '../lib.mjs';

const manifest = { sources: [
  { id: 'codex', profiles: ['core'] },
  { id: 'cline', profiles: ['samples'] },
  { id: 'inspect-ai', profiles: ['eval'] },
] };

test('来源配置默认只选择 core', () => {
  assert.deepEqual([...parseSourceProfiles([])], ['core']);
  assert.deepEqual(selectManifestSources(manifest, new Set(['core'])).map(({ id }) => id), ['codex']);
});

test('all 选择全部来源且非法配置被拒绝', () => {
  assert.equal(selectManifestSources(manifest, new Set(['all'])).length, 3);
  assert.throws(() => parseSourceProfiles(['--profile', 'unknown']), /非法来源配置/u);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/source-profiles.test.mjs`

Expected: FAIL，提示缺少导出 `parseSourceProfiles` 或 `selectManifestSources`。

- [ ] **Step 3: 在 `scripts/lib.mjs` 实现选择器**

实现固定配置集合、参数解析和 Manifest 过滤：

```js
export const sourceProfiles = new Set(['core', 'samples', 'eval', 'all']);

export function parseSourceProfiles(args) {
  const selected = new Set();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--profile') continue;
    const profile = args[index + 1];
    if (!sourceProfiles.has(profile)) throw new Error(`非法来源配置：${profile ?? '(缺失)'}`);
    selected.add(profile);
    index += 1;
  }
  return selected.size ? selected : new Set(['core']);
}

export function selectManifestSources(manifest, profiles) {
  if (profiles.has('all')) return manifest.sources;
  return manifest.sources.filter((source) => source.profiles.some((profile) => profiles.has(profile)));
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test scripts/tests/source-profiles.test.mjs`

Expected: PASS。

- [ ] **Step 5: 反向检查并提交**

检查缺失 `--profile` 值、重复值和 `all` 与其他值并存时行为稳定。

```bash
git add scripts/lib.mjs scripts/tests/source-profiles.test.mjs
git commit -m "feat(sources): 增加来源配置选择器"
```

---

### Task 2: 来源 Manifest v2 与 Claude 双 SDK

**Files:**
- Modify: `sources/sources.yml`
- Modify: `sources/sources.lock.yml`
- Modify: `.gitmodules`
- Modify: `THIRD_PARTY.md`
- Modify: `NOTICE.md`
- Modify: `scripts/bootstrap.mjs`
- Modify: `scripts/verify-sources.mjs`
- Modify: `scripts/verify-licenses.mjs`
- Modify: `scripts/tests/license-hash.test.mjs`
- Modify: `scripts/tests/gitlink.test.mjs`
- Modify: `scripts/tests/source-profiles.test.mjs`
- Move: `sources/checkouts/claude-agent-sdk` → `sources/checkouts/claude-agent-sdk-python`
- Create submodule: `sources/checkouts/claude-agent-sdk-typescript`

**Interfaces:**
- Consumes: Task 1 的 `parseSourceProfiles` 和 `selectManifestSources`。
- Produces: `schemaVersion: 2` 来源清单、Claude Python/TypeScript 两个稳定来源 ID、按配置 Bootstrap 和 Verify。

- [ ] **Step 1: 扩展来源配置测试**

增加断言：每个来源至少有一个合法 Profile；`claude-agent-sdk-python` 和 `claude-agent-sdk-typescript` 都属于 `core`；默认 Bootstrap 不要求 `eval` Checkout。

- [ ] **Step 2: 运行来源相关测试并确认失败**

Run: `node --test scripts/tests/source-profiles.test.mjs scripts/tests/gitlink.test.mjs scripts/tests/license-hash.test.mjs`

Expected: FAIL，现有 Manifest 没有 `profiles`，Claude 来源 ID 仍为旧名称。

- [ ] **Step 3: 升级 Manifest 并移动 Python SDK gitlink**

把 Schema 升为 2，为现有来源增加 Profile：六条主线相关来源设为 `core`，mini-swe-agent 设为 `samples`，四个评测来源设为 `eval`。将 Claude Python SDK ID、Checkout 路径、Lock 和 `.gitmodules` 名称统一为 `claude-agent-sdk-python`。

Run: `git mv sources/checkouts/claude-agent-sdk sources/checkouts/claude-agent-sdk-python`

- [ ] **Step 4: 添加 Claude TypeScript SDK 锁定来源**

使用官方仓库 `https://github.com/anthropics/claude-agent-sdk-typescript.git`，锁定 `48275071e804139579fabada9bb8d90cfe02b062`，Profile 为 `core`，许可证按仓库实际 LICENSE 校验后写入第三方说明。

Run: `git submodule add https://github.com/anthropics/claude-agent-sdk-typescript.git sources/checkouts/claude-agent-sdk-typescript`

Run: `git -C sources/checkouts/claude-agent-sdk-typescript checkout --detach 48275071e804139579fabada9bb8d90cfe02b062`

- [ ] **Step 5: 接入 Bootstrap 和 Verify**

`bootstrap.mjs` 使用所选 Profile 遍历来源；`verify-sources.mjs` 始终校验全部 Manifest、Lock 和 `.gitmodules` 元数据，但只要求所选 Profile 的 Checkout 存在且干净。命令提示包含 `--profile all` 示例。

- [ ] **Step 6: 更新许可证证据**

把两个 Claude SDK 分开列入 `THIRD_PARTY.md`、`NOTICE.md` 和许可证哈希测试，许可证类型以锁定提交中的 LICENSE 为准。

- [ ] **Step 7: 运行来源与许可证验证**

Run: `node scripts/verify-sources.mjs --profile core`

Run: `node scripts/verify-licenses.mjs`

Run: `node --test scripts/tests/source-profiles.test.mjs scripts/tests/gitlink.test.mjs scripts/tests/license-hash.test.mjs`

Expected: 全部 PASS，输出核心来源数量和已验证 Checkout 数量。

- [ ] **Step 8: 反向检查并提交**

检查旧 ID `claude-agent-sdk` 在 Manifest、Lock、`.gitmodules` 和许可证文件中没有残留；正文锚点迁移由后续内容阶段处理，当前旧正文允许因来源重命名进入 `stale`。

```bash
git add .gitmodules sources THIRD_PARTY.md NOTICE.md scripts
git commit -m "feat(sources): 建立分组来源并锁定 Claude 双 SDK"
```

---

### Task 3: 新文章元数据和发布状态

**Files:**
- Modify: `scripts/analysis-metadata.mjs`
- Modify: `scripts/verify-analysis.mjs`
- Modify: `scripts/tests/analysis-metadata.test.mjs`
- Create: `scripts/tests/article-contract.test.mjs`

**Interfaces:**
- Consumes: 新目录 `docs/foundations/`、`docs/harnesses/`、`docs/comparisons/`、`docs/roles/`、`docs/labs/`、`docs/appendix/`。
- Produces: `articleKind(relativePath)`、五种发布状态和按文章类型验证的元数据。

- [ ] **Step 1: 写状态和文章类型失败测试**

```js
test('识别新目录的文章类型', () => {
  assert.equal(articleKind('docs/foundations/01-one-turn.md'), 'foundation');
  assert.equal(articleKind('docs/harnesses/codex/03-tools.md'), 'harness');
  assert.equal(articleKind('docs/comparisons/02-agent-loop.md'), 'comparison');
});

test('接受五种新状态并拒绝其他值', () => {
  for (const status of ['outline', 'draft', 'reviewed', 'verified', 'stale']) {
    assert.equal(validArticleStatus(status), true);
  }
  assert.equal(validArticleStatus('complete'), false);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/analysis-metadata.test.mjs scripts/tests/article-contract.test.mjs`

Expected: FAIL，缺少 `articleKind` 和 `validArticleStatus`。

- [ ] **Step 3: 实现元数据规则**

新目录文章必须包含 `title`、`article_type`、`status`、`last_verified` 和 `sources`。`article_type` 必须与目录匹配；Harness 文章还必须声明 `harness`。`outline` 可以使用空来源数组，其他状态必须至少有一项来源或官方文档证据。

- [ ] **Step 4: 运行测试和分析检查**

Run: `node --test scripts/tests/analysis-metadata.test.mjs scripts/tests/article-contract.test.mjs`

Run: `node scripts/verify-analysis.mjs`

Expected: PASS；旧目录暂按旧规则校验，新目录按新规则校验。

- [ ] **Step 5: 反向检查并提交**

验证 `stale` 不等于 `reviewed`，`outline` 不能进入正式导航，空来源只允许 `outline`。

```bash
git add scripts/analysis-metadata.mjs scripts/verify-analysis.mjs scripts/tests
git commit -m "feat(docs): 建立文章类型与发布状态契约"
```

---

### Task 4: 关键结论注册表

**Files:**
- Create: `evidence/claims/README.md`
- Create: `evidence/claims/schema.example.yml`
- Create: `scripts/verify-claims.mjs`
- Create: `scripts/tests/claims.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `sources/sources.lock.yml`、来源 Checkout 和 JSON 兼容 YAML Claim 文件。
- Produces: `validateClaim(claim, context)`、`check:claims` 命令和稳定 Claim ID。

- [ ] **Step 1: 写 Claim 验证失败测试**

覆盖完整 Claim、非法能力状态、非法证据等级、缺少限定条件、Lock 不一致和源码摘录不匹配。

```js
const valid = {
  id: 'codex.permissions.command-policy',
  harness: 'codex',
  dimension: 'permissions.command-policy',
  statement: '命令策略在执行前参与判定。',
  capability: 'default',
  version: '0123456789012345678901234567890123456789',
  surface: 'CLI',
  platform: 'all',
  mode: 'default',
  evidence_level: 'B',
  evidence: [{ type: 'source', source: 'codex', path: 'codex-rs/core/src/lib.rs', commit: '0123456789012345678901234567890123456789', lines: '1-8', excerpt: 'mod' }],
  last_verified: '2026-08-23',
};
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/claims.test.mjs`

Expected: FAIL，缺少 `verify-claims.mjs`。

- [ ] **Step 3: 实现 Claim 验证器**

能力状态固定为 `default`、`optional`、`extension`、`external`、`absent`、`unknown`、`not-applicable`；证据等级固定为 `A`、`B`、`C`、`D`、`U`。源码证据校验来源、Commit、路径、行号和摘录；官方文档证据要求 HTTPS URL 和访问日期；实验等级要求对应实验记录存在。

- [ ] **Step 4: 写中文说明和可执行示例**

`evidence/claims/README.md` 解释何时必须登记 Claim、能力与证据的区别，以及如何在正文中引用 Claim ID。`schema.example.yml` 使用有效的合成示例，不绑定真实结论。

- [ ] **Step 5: 接入命令并运行测试**

在 `package.json` 增加 `check:claims`，并放入 `check` 聚合命令。

Run: `node --test scripts/tests/claims.test.mjs`

Run: `npm run check:claims`

Expected: PASS。

- [ ] **Step 6: 反向检查并提交**

确认 `unknown` 不要求伪造源码证据，`D` 必须带推断说明，`A` 必须同时具有源码、上游测试和实验证据。

```bash
git add evidence/claims scripts/verify-claims.mjs scripts/tests/claims.test.mjs package.json
git commit -m "feat(evidence): 建立关键结论注册表门禁"
```

---

### Task 5: 正式导航状态门禁

**Files:**
- Create: `scripts/check-navigation.mjs`
- Create: `scripts/tests/navigation.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: Markdown 中 `<!-- course-navigation:start -->` 和 `<!-- course-navigation:end -->` 之间的本地链接。
- Produces: `navigationFailures(content, resolveDocument)` 和 `check:navigation`。

- [ ] **Step 1: 写失败测试**

```js
test('正式导航只接受 reviewed 和 verified', () => {
  const read = (target) => ({
    'reviewed.md': '---\nstatus: reviewed\n---\n',
    'draft.md': '---\nstatus: draft\n---\n',
  })[target];
  const content = '<!-- course-navigation:start -->\n[好](reviewed.md)\n[坏](draft.md)\n<!-- course-navigation:end -->';
  assert.deepEqual(navigationFailures(content, read), ['draft.md: 正式导航不能链接 status=draft']);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/navigation.test.mjs`

Expected: FAIL，缺少导航检查器。

- [ ] **Step 3: 实现导航检查器**

只检查显式标记区域；链接目标必须存在、具有 Frontmatter，且状态为 `reviewed` 或 `verified`。普通正文链接不受发布状态限制。

- [ ] **Step 4: 接入命令并验证**

Run: `node --test scripts/tests/navigation.test.mjs`

Run: `npm run check:navigation`

Expected: PASS；当前 README 没有正式导航标记时报告 0 个正式链接。

- [ ] **Step 5: 反向检查并提交**

检查锚点链接、URL 编码和目录链接不会被误判。

```bash
git add scripts/check-navigation.mjs scripts/tests/navigation.test.mjs package.json
git commit -m "feat(docs): 阻止草稿进入正式导航"
```

---

### Task 6: 内容质量契约门禁

**Files:**
- Create: `scripts/check-content-contract.mjs`
- Create: `scripts/tests/content-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: 新目录下状态为 `reviewed` 或 `verified` 的 Markdown。
- Produces: `contentContractFailures(article)` 和 `check:content`。

- [ ] **Step 1: 写源码文章空壳失败测试**

测试缺少真实数据、调用链、失败条件、验证和完整答案时分别失败；`draft` 不阻断发布门禁但报告缺失项。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/content-contract.test.mjs`

Expected: FAIL，缺少内容契约检查器。

- [ ] **Step 3: 实现按文章类型的语义结构检查**

Harness 文章要求正文出现读者提示、真实输入或输出、至少三步的调用链、源码围栏、失败或限制、验证方法和 `## 自检`；自检必须有 3 至 4 个问题及对应答案。基础、比较、实验和角色文章使用各自的必需结构。

机器检查只负责拦截明显空壳，不能把结构通过表述为内容正确。

- [ ] **Step 4: 接入命令并验证**

Run: `node --test scripts/tests/content-contract.test.mjs`

Run: `npm run check:content`

Expected: PASS；当前旧目录不作为新内容契约目标。

- [ ] **Step 5: 反向检查并提交**

构造一篇字数很长但没有调用链的文章，确认仍然失败；构造一篇结构完整但正文极短的文章，确认深度下限能够拦截。

```bash
git add scripts/check-content-contract.mjs scripts/tests/content-contract.test.mjs package.json
git commit -m "feat(docs): 增加文章内容质量门禁"
```

---

### Task 7: 中文 SVG 与图示清单门禁

**Files:**
- Create: `assets/diagrams/manifest.yml`
- Create: `assets/diagrams/README.md`
- Create: `scripts/check-visuals.mjs`
- Create: `scripts/tests/visuals.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `assets/brand/`、`assets/diagrams/` 中的 SVG 和图示 Manifest。
- Produces: `visualFailures(asset, manifestEntry)` 和 `check:visuals`。

- [ ] **Step 1: 写视觉失败测试**

覆盖缺少中文 `<title>`、缺少中文 `<desc>`、英文说明句、Manifest 缺少中文替代文本和不存在的源文件。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/visuals.test.mjs`

Expected: FAIL，缺少视觉检查器。

- [ ] **Step 3: 实现零依赖 SVG 检查**

只扫描正式品牌和图示目录。要求每张 SVG 有中文 `<title>` 和 `<desc>`；抽取 `<text>` 与 `aria-label` 中的可见字符串，允许代码标识符、产品名和协议名，但拒绝未解释的英文自然语言句子。Manifest 每项包含 `id`、`path`、`type`、`scope`、`alt` 和 `claims`。

- [ ] **Step 4: 写图示规范说明并接入命令**

说明架构图、流程图、时序图、状态图、数据流图和决策树的使用条件以及渲染复核要求。

Run: `node --test scripts/tests/visuals.test.mjs`

Run: `npm run check:visuals`

Expected: PASS；空 Manifest 合法，正式资产加入后必须逐项登记。

- [ ] **Step 5: 反向检查并提交**

确认 `Codex`、`MCP`、`Session` 等专名不会被误判，完整英文句子不能通过白名单逃逸。

```bash
git add assets/diagrams scripts/check-visuals.mjs scripts/tests/visuals.test.mjs package.json
git commit -m "feat(visuals): 建立中文图示质量门禁"
```

---

### Task 8: 阶段对抗复核记录门禁

**Files:**
- Create: `evidence/reviews/README.md`
- Create: `scripts/verify-reviews.mjs`
- Create: `scripts/tests/reviews.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `evidence/reviews/*.yml` 的 JSON 兼容 YAML。
- Produces: `reviewFailures(review)` 和 `check:reviews`。

- [ ] **Step 1: 写复核记录失败测试**

有效记录必须有 `stage`、`date`、`commit`、`promises`、`evidence`、`findings`、`resolutions`、`commands` 和 `result`。`result: pass` 时不能存在未解决的高优先级发现。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/reviews.test.mjs`

Expected: FAIL，缺少复核验证器。

- [ ] **Step 3: 实现验证器和中文说明**

Commit 必须是完整 SHA；命令必须记录退出码；每个 Promise 必须至少映射一项 Evidence；高优先级发现必须在 Resolutions 中有相同 ID。

- [ ] **Step 4: 接入命令并验证**

Run: `node --test scripts/tests/reviews.test.mjs`

Run: `npm run check:reviews`

Expected: PASS；没有阶段记录时允许通过，阶段结束时由验收流程强制要求对应文件。

- [ ] **Step 5: 反向检查并提交**

构造 `pass` 但仍有未解决高优先级问题的记录，确认验证器拒绝。

```bash
git add evidence/reviews scripts/verify-reviews.mjs scripts/tests/reviews.test.mjs package.json
git commit -m "feat(review): 记录逐阶段对抗复核证据"
```

---

### Task 9: 新仓库规则与旧设计退出

**Files:**
- Modify: `AGENTS.md`
- Delete: `specs/2026-08-23-multi-harness-internals-design.md`
- Delete: `specs/2026-08-23-harness-internals-implementation-plan.md`
- Delete: `specs/2026-08-23-dimensions.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: 已批准总规格和 Task 1–8 的新门禁。
- Produces: 唯一有效的仓库写作、证据、视觉和发布规则。

- [ ] **Step 1: 写规则一致性测试**

在 `scripts/tests/project-files.test.mjs` 增加断言：AGENTS 必须包含六条一级主线、五种状态、三组来源、图示规范、对抗复核、Node 24 和不调用 NVM；不得继续宣称“两种 Harness，一个仓库”或 A/E 目录规则。

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test scripts/tests/project-files.test.mjs`

Expected: FAIL，旧 AGENTS 仍包含双 Harness 和 A/E 规则。

- [ ] **Step 3: 覆盖式重写 AGENTS**

写入新定位、目录职责、文章质量、证据状态、关键结论、来源配置、中文视觉、发布状态、逐阶段复核和验证命令。删除指向外部未安装写作 Skill 的强制要求，保留受保护源码锚点和中文解释规则。

- [ ] **Step 4: 删除冲突设计并更新变更记录**

保留已批准总规格、总路线和当前阶段计划，删除三个与新定位冲突的旧规格。CHANGELOG 只记录覆盖式重建，不写面对读者的迁移教程。

- [ ] **Step 5: 验证、反向检查并提交**

Run: `node --test scripts/tests/project-files.test.mjs`

Run: `rg -n "两种 Harness|docs/aN|docs/eN|英文 README" AGENTS.md specs`

Expected: 测试 PASS；搜索只允许在“明确禁止”语境或总规格的非目标中出现。

```bash
git add AGENTS.md CHANGELOG.md specs scripts/tests/project-files.test.mjs
git commit -m "docs(governance): 切换到 Agent Harness 单主线规则"
```

---

### Task 10: 聚合检查与阶段 0 复核

**Files:**
- Modify: `package.json`
- Create: `evidence/reviews/2026-08-23-phase-0-foundation.yml`
- Modify: `specs/2026-08-23-agent-harness-internals-program-plan.md`

**Interfaces:**
- Consumes: Task 1–9 的全部命令和提交。
- Produces: Node 24 下完整通过的阶段 0 基线和可核复核记录。

- [ ] **Step 1: 更新测试聚合**

把新增测试文件全部加入 `npm test`，把 `check:claims`、`check:navigation`、`check:content`、`check:visuals` 和 `check:reviews` 加入 `npm run check`。来源验证显式使用 `--profile core`。

- [ ] **Step 2: 使用 Node 24 运行全部验证**

Run: `node --version`

Expected: `v24.x.x`。

Run: `npm run check`

Expected: 所有命令退出码为 0。

- [ ] **Step 3: 执行阶段承诺逐项审计**

逐项核对：来源配置、Claude 双 SDK、文章状态、Claim、导航、内容、视觉、复核记录、AGENTS 和旧规格退出。为每项记录文件或命令证据。

- [ ] **Step 4: 主动寻找反例**

至少检查：

- 非核心 Checkout 缺失时默认检查是否仍能运行。
- `draft` 是否可能进入正式导航。
- 长空话是否可能通过内容门禁。
- 英文说明 SVG 是否可能绕过中文门禁。
- `result: pass` 是否可能携带未解决高优先级发现。
- 旧双 Harness 术语是否仍被规则或脚本依赖。

发现问题先修复并重跑相关测试。

- [ ] **Step 5: 写阶段复核记录**

创建 `evidence/reviews/2026-08-23-phase-0-foundation.yml`，记录最终 Commit、承诺、证据、发现、处理、命令和退出码。将总路线阶段 0 勾选为完成。

- [ ] **Step 6: 最终提交**

```bash
git add package.json evidence/reviews specs/2026-08-23-agent-harness-internals-program-plan.md
git commit -m "chore(review): 完成阶段 0 地基对抗复核"
```

- [ ] **Step 7: 提交后复验**

Run: `npm run check`

Run: `git status --short`

Expected: 检查全部通过，工作树干净。

