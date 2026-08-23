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
