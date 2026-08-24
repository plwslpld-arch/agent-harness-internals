import assert from 'node:assert/strict';
import test from 'node:test';
import { navigationFailures } from '../check-navigation.mjs';

const documents = {
  'reviewed.md': '---\nstatus: reviewed\n---\n',
  'verified.md': '---\nstatus: verified\n---\n',
  'draft.md': '---\nstatus: draft\n---\n',
  'outline.md': '---\nstatus: outline\n---\n',
  'stale.md': '---\nstatus: stale\n---\n',
  'reviewed article.md': '---\nstatus: reviewed\n---\n',
  'plain.md': '# 没有元数据\n',
};
const read = (target) => documents[target];

test('正式导航只接受 reviewed 和 verified', () => {
  const content = `<!-- course-navigation:start -->
[已复核](reviewed.md)
[已验证](verified.md)
[草稿](draft.md)
[提纲](outline.md)
[过期](stale.md)
<!-- course-navigation:end -->`;

  assert.deepEqual(navigationFailures(content, read), [
    'draft.md: 正式导航不能链接 status=draft',
    'outline.md: 正式导航不能链接 status=outline',
    'stale.md: 正式导航不能链接 status=stale',
  ]);
});

test('标记区域外的普通正文链接不受发布状态限制', () => {
  assert.deepEqual(navigationFailures('[草稿参考](draft.md)', read), []);
});

test('缺失目标或 Frontmatter 会失败', () => {
  const content = `<!-- course-navigation:start -->
[不存在](missing.md)
[无元数据](plain.md)
<!-- course-navigation:end -->`;

  assert.deepEqual(navigationFailures(content, read), [
    'missing.md: 正式导航目标不存在',
    'plain.md: 正式导航目标缺少 Frontmatter',
  ]);
});

test('正确处理锚点和 URL 编码，不误判纯锚点、外链、图片与目录', () => {
  const content = `<!-- course-navigation:start -->
[编码标题](reviewed%20article.md#工具)
[页内](#工具)
[外部](https://example.com/docs)
![说明图](diagram.svg)
[目录](docs/)
<!-- course-navigation:end -->`;
  const seen = [];

  assert.deepEqual(navigationFailures(content, (target) => {
    seen.push(target);
    return read(target);
  }), []);
  assert.deepEqual(seen, ['reviewed article.md']);
});

test('不成对或嵌套的正式导航标记不能静默绕过检查', () => {
  assert.deepEqual(navigationFailures(`<!-- course-navigation:start -->
[草稿](draft.md)`, read), ['正式导航标记不成对或发生嵌套']);
  assert.deepEqual(navigationFailures(`<!-- course-navigation:start -->
<!-- course-navigation:start -->
<!-- course-navigation:end -->
<!-- course-navigation:end -->`, read), ['正式导航标记不成对或发生嵌套']);
});

test('README 可以把已复核总入口作为唯一正式课程链接', () => {
  const content = `<!-- course-navigation:start -->
[从总入口开始](reviewed.md)
<!-- course-navigation:end -->`;

  assert.deepEqual(navigationFailures(content, read), []);
});

test('共同基础必须六篇同时达到发布状态才能批量进入导航', () => {
  const targets = [
    'foundations/01.md',
    'foundations/02.md',
    'foundations/03.md',
    'foundations/04.md',
    'foundations/05.md',
    'foundations/06.md',
  ];
  const batch = [{ name: '共同基础', targets }];
  const allReviewed = Object.fromEntries(targets.map((target) => [target, '---\nstatus: reviewed\n---\n']));
  const resolveFoundation = (target) => allReviewed[target];

  const incomplete = `<!-- course-navigation:start -->
${targets.slice(0, 5).map((target) => `[基础](${target})`).join('\n')}
<!-- course-navigation:end -->`;
  assert.deepEqual(navigationFailures(incomplete, resolveFoundation, { requiredBatches: batch }), [
    '共同基础批量导航不完整：缺少 foundations/06.md',
  ]);

  allReviewed['foundations/06.md'] = '---\nstatus: draft\n---\n';
  const complete = `<!-- course-navigation:start -->
${targets.map((target) => `[基础](${target})`).join('\n')}
<!-- course-navigation:end -->`;
  assert.deepEqual(navigationFailures(complete, resolveFoundation, { requiredBatches: batch }), [
    'foundations/06.md: 正式导航不能链接 status=draft',
    '共同基础批量发布失败：foundations/06.md status=draft',
  ]);
});

test('DSH 主线九篇必须完整且全部达到发布状态', () => {
  const targets = [
    'README.md',
    '01-boot-preset.md',
    '02-prompt-context-cache.md',
    '03-loop-model-tool.md',
    '04-tools-security.md',
    '05-session-compaction.md',
    '06-orchestration-extensions.md',
    '07-surfaces-feedback-eval.md',
    '08-verification-design-limits.md',
  ];
  const batch = [{ name: 'DSH 主线', targets }];
  const documents = Object.fromEntries(targets.map((target) => [target, '---\nstatus: reviewed\n---\n']));
  const incomplete = `<!-- course-navigation:start -->
${targets.slice(0, 8).map((target) => `[DSH](${target})`).join('\n')}
<!-- course-navigation:end -->`;

  assert.deepEqual(navigationFailures(incomplete, (target) => documents[target], { requiredBatches: batch }), [
    'DSH 主线批量导航不完整：缺少 08-verification-design-limits.md',
  ]);

  documents['08-verification-design-limits.md'] = '---\nstatus: outline\n---\n';
  const complete = `<!-- course-navigation:start -->
${targets.map((target) => `[DSH](${target})`).join('\n')}
<!-- course-navigation:end -->`;
  assert.deepEqual(navigationFailures(complete, (target) => documents[target], { requiredBatches: batch }), [
    '08-verification-design-limits.md: 正式导航不能链接 status=outline',
    'DSH 主线批量发布失败：08-verification-design-limits.md status=outline',
  ]);
});

test('已配置为必需的主线不能用零链接绕过整批导航', () => {
  const targets = ['README.md', '01-course.md', '02-course.md'];
  const batch = [{ name: 'Codex 主线', targets, required: true }];
  const content = `<!-- course-navigation:start -->
<!-- course-navigation:end -->`;

  assert.deepEqual(navigationFailures(content, () => undefined, { requiredBatches: batch }), [
    'Codex 主线批量导航不完整：缺少 README.md、01-course.md、02-course.md',
  ]);
});

test('扩展样本不得进入正式导航', () => {
  const content = `<!-- course-navigation:start -->
[主线](reviewed.md)
[扩展样本](samples/mini-swe-agent.md)
<!-- course-navigation:end -->`;
  const documents = {
    'reviewed.md': '---\nstatus: reviewed\n---\n',
    'samples/mini-swe-agent.md': '---\nstatus: reviewed\n---\n',
  };

  assert.deepEqual(navigationFailures(content, (target) => documents[target], {
    forbiddenPrefixes: [{ name: '扩展样本', prefix: 'samples/' }],
  }), ['samples/mini-swe-agent.md: 扩展样本不得进入正式导航']);
});
