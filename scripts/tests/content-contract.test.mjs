import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentContractDisposition,
  contentContractFailures,
} from '../check-content-contract.mjs';

const paragraph = '这一段用于解释机制、适用条件、数据流和证据边界，读者可以据此复核结论，而不是只看到没有上下文的术语列表。';
const deepProse = Array.from({ length: 26 }, (_, index) => `${paragraph}第 ${index + 1} 段还会说明该步骤与前后状态之间的关系，以及出现偏差时应当观察什么。`).join('\n\n');

function harnessContent() {
  return `# Codex 工具系统

## 读者会得到什么

读完后可以解释一次工具调用如何进入策略判断、执行环境和结果回传。

## 真实输入与输出

### 输入

\`\`\`json
{"command":"git status"}
\`\`\`

### 输出

\`\`\`json
{"exitCode":0,"stdout":"clean"}
\`\`\`

## 调用链

1. 请求先转换为工具调用。
2. 策略层检查命令和权限。
3. 执行层运行命令并回传结构化结果。

## 源码证据

\`\`\`rust
fn decide(command: &str) -> bool { !command.is_empty() }
\`\`\`

${deepProse}

## 失败与限制

这里只证明锁定版本和指定表面，不能外推所有平台。

## 验证方法

使用固定输入运行最小实验，并把 Trace 与源码路径逐项对照。

## 自检

### 问题 1

工具调用先进入哪里？

**答案：** 先进入策略判断。

### 问题 2

为什么要记录真实输出？

**答案：** 为了区分实现事实与推断。

### 问题 3

结论能否外推全部平台？

**答案：** 不能，必须保留平台限定。
`;
}

const foundationDeepProse = Array.from({ length: 34 }, (_, index) =>
  `${paragraph}第 ${index + 1} 段会继续区分直接事实、项目示例和跨实现推断，避免把一个实现的命名扩大成共同标准。`).join('\n\n');

function foundationContent() {
  return `# Agent Harness 的职责与边界

## 读者会得到什么

读完后可以区分模型、Harness、环境和评测的责任边界。

## 核心概念

![四层职责边界图](../../assets/diagrams/foundations/01-boundaries.svg)

Claim: foundation.boundaries.four-layers

${foundationDeepProse}

## 最小例子

同一个输入只改变工具权限，用来观察 Harness 层带来的差异。

## 常见误区

不能把一次结果变化全部归因于模型。

## 验证方法

固定另外三层，只改变一个变量并记录运行产物。

## 自检

### 问题 1

为什么要分层？

**答案：** 为了避免错误归因。

### 问题 2

环境与 Harness 是否相同？

**答案：** 不同，环境提供外部状态与资源。

### 问题 3

评测是否负责执行工具？

**答案：** 通常不负责，评测固定任务并解释产物。
`;
}

function article(content = harnessContent(), status = 'reviewed') {
  return {
    relativePath: 'docs/harnesses/codex/03-tools.md',
    content,
    metadata: { status },
  };
}

test('结构完整且具有解释深度的 Harness 文章通过', () => {
  assert.deepEqual(contentContractFailures(article()), []);
});

test('缺少真实数据、调用链、失败条件、验证或完整答案时分别失败', () => {
  assert.match(contentContractFailures(article(harnessContent().replace('## 真实输入与输出', '## 示例'))).join('\n'), /真实输入与输出/u);
  assert.match(contentContractFailures(article(harnessContent().replace('3. 执行层运行命令并回传结构化结果。', '执行层随后运行。'))).join('\n'), /至少 3 步/u);
  assert.match(contentContractFailures(article(harnessContent().replace('## 失败与限制', '## 备注'))).join('\n'), /失败与限制/u);
  assert.match(contentContractFailures(article(harnessContent().replace('## 验证方法', '## 后续'))).join('\n'), /验证方法/u);
  assert.match(contentContractFailures(article(harnessContent().replace('**答案：** 不能，必须保留平台限定。', '尚未回答。'))).join('\n'), /自检/u);
});

test('长文缺少调用链仍失败，结构齐全但解释正文太短也失败', () => {
  const noChain = harnessContent().replace(/1\. 请求先转换[\s\S]*?3\. 执行层运行命令并回传结构化结果。/u, deepProse);
  assert.match(contentContractFailures(article(noChain)).join('\n'), /至少 3 步/u);

  const tooShort = harnessContent().replace(deepProse, '只有一句简短说明。');
  assert.match(contentContractFailures(article(tooShort)).join('\n'), /解释性正文不足/u);
});

test('大段源码不能冒充解释性正文', () => {
  const sourceDump = `\`\`\`text\n${paragraph.repeat(80)}\n\`\`\``;
  const content = harnessContent().replace(deepProse, sourceDump);

  assert.match(contentContractFailures(article(content)).join('\n'), /解释性正文不足/u);
});

test('draft 报告缺失项但不作为阻断错误', () => {
  const disposition = contentContractDisposition(article('# 草稿\n', 'draft'));

  assert.deepEqual(disposition.errors, []);
  assert.ok(disposition.warnings.length > 0);
});

test('缺失或非法状态不能绕过内容门禁', () => {
  const disposition = contentContractDisposition(article('# 空壳\n', 'complete'));

  assert.ok(disposition.errors.length > 0);
  assert.deepEqual(disposition.warnings, []);
});

test('基础、比较、角色和实验文章使用各自结构', () => {
  const cases = [
    ['docs/00-start-here.md', 'start', '概念地图'],
    ['docs/foundations/01-one-turn.md', 'foundation', '核心概念'],
    ['docs/comparisons/01-agent-loop.md', 'comparison', '控制变量'],
    ['docs/roles/researcher.md', 'role', '决策问题'],
    ['docs/labs/01-trace.md', 'lab', '实验目标'],
  ];
  for (const [relativePath, kind, expected] of cases) {
    const failures = contentContractFailures({ relativePath, content: '# 空壳\n', metadata: { status: 'reviewed' } });
    assert.match(failures.join('\n'), new RegExp(expected, 'u'), `${kind} 应检查 ${expected}`);
  }
});

test('共同基础必须达到深度并引用正式中文图与 Claim', () => {
  const article = {
    relativePath: 'docs/foundations/01-boundaries.md',
    content: foundationContent(),
    metadata: { status: 'reviewed' },
  };
  assert.deepEqual(contentContractFailures(article), []);
  assert.match(contentContractFailures({
    ...article,
    content: foundationContent().replace('![四层职责边界图](../../assets/diagrams/foundations/01-boundaries.svg)', ''),
  }).join('\n'), /正式中文 SVG/u);
  assert.match(contentContractFailures({
    ...article,
    content: foundationContent().replace('Claim: foundation.boundaries.four-layers', ''),
  }).join('\n'), /Claim/u);
  assert.match(contentContractFailures({
    ...article,
    content: foundationContent().replace(foundationDeepProse, paragraph.repeat(8)),
  }).join('\n'), /至少 2600/u);
});

test('一级主线入口必须同时具备两张核心图、课程状态表与 Claim', () => {
  const entryAdditions = `
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | reviewed |

![系统架构图](../../../assets/diagrams/deepseek-harness/system-architecture.svg)

![端到端任务流程图](../../../assets/diagrams/deepseek-harness/end-to-end-task.svg)

Claim: deepseek-harness.architecture.layered-runtime
`;
  const entry = {
    relativePath: 'docs/harnesses/deepseek-harness/README.md',
    content: `${harnessContent()}${entryAdditions}`,
    metadata: { status: 'reviewed' },
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('![系统架构图](../../../assets/diagrams/deepseek-harness/system-architecture.svg)', ''),
  }).join('\n'), /系统架构图/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('![端到端任务流程图](../../../assets/diagrams/deepseek-harness/end-to-end-task.svg)', ''),
  }).join('\n'), /端到端任务流程图/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('## 课程状态与顺序', '## 课程'),
  }).join('\n'), /课程状态与顺序/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claim: deepseek-harness.architecture.layered-runtime', ''),
  }).join('\n'), /Claim/u);
});

test('Gemini CLI 一级入口沿用同一核心图与 Claim 发布契约', () => {
  const entry = {
    relativePath: 'docs/harnesses/gemini-cli/README.md',
    metadata: { status: 'reviewed' },
    content: `${harnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![Gemini CLI 中文系统架构图](../../../assets/diagrams/gemini-cli/system-architecture.svg)

![Gemini CLI 中文端到端任务流程图](../../../assets/diagrams/gemini-cli/end-to-end-task.svg)

Claim: gemini-cli.architecture.session-turn-scheduler
`,
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('gemini-cli/end-to-end-task.svg', 'gemini-cli/task.svg'),
  }).join('\n'), /端到端任务流程图/u);
});

test('Claude 一级入口必须声明闭源产品与双 SDK 的不对称证据边界', () => {
  const entry = {
    relativePath: 'docs/harnesses/claude/README.md',
    metadata: { status: 'reviewed' },
    content: `${harnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![Claude 中文系统架构图](../../../assets/diagrams/claude/system-architecture.svg)

![Claude 中文端到端任务流程图](../../../assets/diagrams/claude/end-to-end-task.svg)

Claude Code 是闭源产品，本课程只引用官方公开契约，不从 SDK 反推内部实现。Python Agent SDK 提供可核对的主体源码与测试；TypeScript Agent SDK 的锁定仓库没有 SDK 主体源码，只能核对公开 API、README、CHANGELOG 与 Session Store 示例。

Claim: claude.architecture.product-sdk-boundaries

Claim: claude.task.transport-control-loop
`,
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claude Code 是闭源产品，本课程只引用官方公开契约，不从 SDK 反推内部实现。', ''),
  }).join('\n'), /闭源产品/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Python Agent SDK 提供可核对的主体源码与测试；', ''),
  }).join('\n'), /Python Agent SDK/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('TypeScript Agent SDK 的锁定仓库没有 SDK 主体源码，只能核对公开 API、README、CHANGELOG 与 Session Store 示例。', ''),
  }).join('\n'), /TypeScript Agent SDK/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claim: claude.task.transport-control-loop', ''),
  }).join('\n'), /至少两个正式 Claim/u);
});

test('pi 一级入口必须声明模块分层、设计边界与默认宿主权限', () => {
  const entry = {
    relativePath: 'docs/harnesses/pi/README.md',
    metadata: { status: 'reviewed' },
    content: `${harnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![pi 中文系统架构图](../../../assets/diagrams/pi/system-architecture.svg)

![pi 中文端到端任务流程图](../../../assets/diagrams/pi/end-to-end-task.svg)

pi 沿着 ai、agent 与 coding-agent 三层组合任务，并由 Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 提供横切表面。

现行运行时源码、未来设计文档、扩展示例与外部项目必须分开核对；设计目标和示例存在不等于默认运行能力。

pi 默认继承启动它的宿主进程权限，不内建文件系统、进程、网络或凭据隔离；需要使用外部容器或沙箱建立边界。

Claim: pi.architecture.layers-are-composed

Claim: pi.task.coding-agent-composes-core
`,
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('pi 沿着 ai、agent 与 coding-agent 三层组合任务，并由 Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 提供横切表面。', ''),
  }).join('\n'), /ai、agent 与 coding-agent/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('现行运行时源码、未来设计文档、扩展示例与外部项目必须分开核对；设计目标和示例存在不等于默认运行能力。', ''),
  }).join('\n'), /设计文档/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('pi 默认继承启动它的宿主进程权限，不内建文件系统、进程、网络或凭据隔离；需要使用外部容器或沙箱建立边界。', ''),
  }).join('\n'), /默认宿主权限/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claim: pi.task.coding-agent-composes-core', ''),
  }).join('\n'), /至少两个正式 Claim/u);
});
