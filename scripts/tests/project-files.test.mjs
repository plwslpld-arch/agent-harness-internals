import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('公开树不再保留英文入口和旧定位视觉', () => {
  const legacyFiles = [
    'README.en.md',
    'docs/00-overview.md',
    'docs/concepts.md',
    'docs/e1-what-is-eval-harness.md',
    'docs/e2-tasks-and-envs.md',
    'docs/e3-run-and-score.md',
    'docs/e4-harness-decides-score.md',
    'assets/harness-internals.svg',
    'assets/harness-coupling.svg',
    'assets/agent-harness-matrix.svg',
    'assets/dsh-codex-subsystems.svg',
    'assets/harness-model-cross.svg',
  ];
  for (const relativePath of legacyFiles) {
    assert.equal(existsSync(join(root, relativePath)), false, `旧文件仍存在：${relativePath}`);
  }

  const publicFiles = listProjectFiles(root).filter((path) => {
    const relativePath = path.slice(root.length + 1).replaceAll('\\', '/');
    return relativePath === 'README.md'
      || relativePath === 'THIRD_PARTY.md'
      || relativePath.startsWith('docs/');
  });
  const content = publicFiles.map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(content, /README\.en\.md|assets\/(?:harness-internals|harness-coupling|agent-harness-matrix|dsh-codex-subsystems|harness-model-cross)\.svg/u);
  assert.doesNotMatch(content, /两种 Harness|Part B：Eval Harness|Eval Harness：同名的另一层系统/u);
});

test('发布验证工作流准备全部锁定来源', () => {
  const workflow = readFileSync(join(root, '.github', 'workflows', 'verify.yml'), 'utf8');

  assert.match(workflow, /npm run bootstrap -- --profile all/u);
});
