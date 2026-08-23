import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { listProjectFiles, root } from '../lib.mjs';

test('project file discovery ignores worktree control files and nested worktrees', () => {
  const project = mkdtempSync(join(tmpdir(), 'harness-project-files-'));
  try {
    writeFileSync(join(project, '.git'), 'gitdir: C:/machine-specific/repository.git\n');
    mkdirSync(join(project, '.worktrees', 'other'), { recursive: true });
    writeFileSync(join(project, '.worktrees', 'other', 'private.md'), 'private\n');
    writeFileSync(join(project, 'visible.md'), 'visible\n');

    assert.deepEqual(listProjectFiles(project).map((path) => basename(path)), ['visible.md']);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('AGENTS 使用 Agent Harness 单主线治理规则', () => {
  const content = readFileSync(join(root, 'AGENTS.md'), 'utf8');

  for (const harness of ['DSH', 'Codex', 'Gemini CLI', 'Claude', 'pi', 'OpenCode']) {
    assert.match(content, new RegExp(harness.replace('.', '\\.'), 'u'), `缺少一级主线 ${harness}`);
  }
  for (const status of ['outline', 'draft', 'reviewed', 'verified', 'stale']) {
    assert.match(content, new RegExp(`\\b${status}\\b`, 'u'), `缺少状态 ${status}`);
  }
  for (const profile of ['core', 'samples', 'eval']) {
    assert.match(content, new RegExp(`\\b${profile}\\b`, 'u'), `缺少来源组 ${profile}`);
  }
  for (const requirement of ['Agent Harness 是唯一主线', '关键结论注册表', '中文图示', '对抗复核', 'Node 24', '不调用 NVM']) {
    assert.match(content, new RegExp(requirement, 'u'), `缺少治理要求：${requirement}`);
  }
  assert.doesNotMatch(content, /docs\/aN|docs\/eN|agent harness 怎么造、eval harness 怎么把它量出来/u);
  assert.doesNotMatch(content, /shuorenhua|\.claude\/skills/u);
});
