import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { listProjectFiles } from '../lib.mjs';

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
