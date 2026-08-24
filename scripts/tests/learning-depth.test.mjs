import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { root } from '../lib.mjs';

function markdownFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(root, directory, entry.name));
}

function content(path) {
  return readFileSync(path, 'utf8');
}

test('六条源码课程保持可学习的正文深度与源码密度', () => {
  const harnessRoot = join(root, 'docs', 'harnesses');
  for (const harness of readdirSync(harnessRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const directory = join(harnessRoot, harness.name);
    const articles = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^\d+-.+\.md$/u.test(entry.name));
    assert.ok(articles.length >= 7, `${harness.name} 至少需要七篇连续源码课`);
    for (const article of articles) {
      const text = content(join(directory, article.name));
      const links = [...text.matchAll(/https:\/\/github\.com\/[^\s)]+\/blob\/[0-9a-f]{40}\/[^\s)#]+#L\d+(?:-L\d+)?/gu)];
      assert.ok(text.length >= 2800, `${harness.name}/${article.name} 正文过短`);
      assert.ok(links.length >= 2, `${harness.name}/${article.name} 至少需要两个锁定源码站点`);
      assert.match(text, /^```(?:rust|rs|typescript|ts|tsx|javascript|js|python|py|json|yaml|yml|toml|bash|powershell|text)/mu, `${harness.name}/${article.name} 缺少源码或教学代码`);
    }
  }
});

test('每条课程入口同时提供系统图、任务图和三种阅读深度', () => {
  const harnessRoot = join(root, 'docs', 'harnesses');
  for (const harness of readdirSync(harnessRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const text = content(join(harnessRoot, harness.name, 'README.md'));
    assert.ok(text.length >= 2500, `${harness.name}/README.md 入口说明过短`);
    assert.match(text, /system-architecture\.svg/u);
    assert.match(text, /end-to-end-task\.svg/u);
    for (const level of ['Starter', 'Builder', 'Maintainer']) assert.match(text, new RegExp(level, 'u'));
  }
});

test('基础、比较与机制案例不会退回提纲式短页', () => {
  for (const directory of ['docs/foundations', 'docs/comparisons', 'docs/samples']) {
    for (const path of markdownFiles(directory)) {
      assert.ok(content(path).length >= 3500, `${path.slice(root.length + 1)} 正文过短`);
    }
  }
});
