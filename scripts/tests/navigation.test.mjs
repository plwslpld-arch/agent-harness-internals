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
