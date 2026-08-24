import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanCommitMessage,
  forbiddenMetadataLines,
  verifyRewriteInvariants,
} from '../rewrite-history-metadata.mjs';

test('只删除 Codex 和 Claude 协作者尾注及 Claude Session 行', () => {
  const original = [
    'feat: 保留中文主题',
    '',
    '正文中的 Claude 与 Codex 名称必须保留。',
    '',
    'Co-Authored-By: Human Reviewer <human@example.com>',
    'Co-Authored-By: Codex <noreply@openai.com>',
    'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
    'Claude-Session: https://claude.ai/code/session_example',
    '',
  ].join('\n');

  const cleaned = cleanCommitMessage(original);
  assert.match(cleaned, /^feat: 保留中文主题/mu);
  assert.match(cleaned, /正文中的 Claude 与 Codex 名称必须保留。/u);
  assert.match(cleaned, /Co-Authored-By: Human Reviewer/u);
  assert.doesNotMatch(cleaned, /noreply@openai\.com/u);
  assert.doesNotMatch(cleaned, /noreply@anthropic\.com/u);
  assert.doesNotMatch(cleaned, /Claude-Session:/u);
  assert.deepEqual(forbiddenMetadataLines(cleaned), []);
});

test('不删除普通正文、相似词或人类协作者', () => {
  const original = [
    'docs: Claude 与 Codex 主线',
    '',
    '本提交分析 Claude Code 和 Codex 的公开行为。',
    'Co-Authored-By: Claude Zhang <claude.zhang@example.com>',
    'Session-Claude: 这不是目标元数据键',
  ].join('\n');
  assert.equal(cleanCommitMessage(original), original);
});

test('重写不变量要求树、主题、作者、时间和父节点数量逐项一致', () => {
  const before = [{
    tree: 'a'.repeat(40),
    subject: '主题',
    author: '人类 <human@example.com> 1 +0800',
    committer: '人类 <human@example.com> 2 +0800',
    parentCount: 1,
  }];
  assert.deepEqual(verifyRewriteInvariants(before, structuredClone(before)), []);
  const changed = structuredClone(before);
  changed[0].tree = 'b'.repeat(40);
  assert.match(verifyRewriteInvariants(before, changed).join('\n'), /tree/u);
});
