#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { checkoutsDir, git, readManifest, root } from './lib.mjs';

const includeRestricted = process.argv.includes('--include-restricted');
const seeds = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] !== '--seed') continue;
  const value = process.argv[index + 1] ?? '';
  const separator = value.indexOf('=');
  if (separator < 1) throw new Error('--seed expects source-id=relative-path');
  const id = value.slice(0, separator);
  const path = value.slice(separator + 1);
  if (!path || isAbsolute(path)) throw new Error('--seed paths must be relative to the repository root');
  seeds.set(id, resolve(path));
  index += 1;
}
const { manifest, locks } = readManifest();
mkdirSync(checkoutsDir, { recursive: true });

for (const source of manifest.sources) {
  if (source.fetchPolicy === 'restricted' && !includeRestricted) {
    console.log(`skip ${source.id} (restricted; use --include-restricted)`);
    continue;
  }
  const locked = locks.get(source.id);
  if (!locked) throw new Error(`Missing lock entry for ${source.id}`);
  const checkout = join(checkoutsDir, source.id);
  const submodulePath = `sources/checkouts/${source.id}`;
  const env = source.largeFiles === 'skip-lfs' ? { GIT_LFS_SKIP_SMUDGE: '1' } : {};
  const stage = git(root, ['ls-files', '--stage', '--', submodulePath]);
  const isSubmodule = stage.startsWith('160000 ');
  if (isSubmodule && !existsSync(join(checkout, '.git'))) {
    console.log(`init submodule ${source.id}`);
    git(root, ['submodule', 'sync', '--', submodulePath], { capture: false, env });
    git(root, ['submodule', 'update', '--init', '--', submodulePath], { capture: false, env });
  }
  if (isSubmodule && existsSync(join(checkout, '.git'))) git(checkout, ['remote', 'set-url', 'origin', source.url]);
  if (!existsSync(join(checkout, '.git'))) {
    console.log(`clone ${source.id}`);
    const seed = seeds.get(source.id);
    if (seed) {
      if (!existsSync(join(seed, '.git'))) throw new Error(`${source.id}: seed is not a Git checkout: ${seed}`);
      git(checkoutsDir, ['clone', '--no-hardlinks', '--no-checkout', seed, source.id], { capture: false, env });
      git(checkout, ['remote', 'set-url', 'origin', source.url]);
    } else {
      git(checkoutsDir, ['clone', '--filter=blob:none', '--no-checkout', source.url, source.id], { capture: false, env });
    }
  } else {
    const origin = git(checkout, ['remote', 'get-url', 'origin']);
    if (origin.replace(/\.git$/, '') !== source.url.replace(/\.git$/, '')) {
      throw new Error(`${source.id}: origin is ${origin}, expected ${source.url}`);
    }
  }
  try {
    git(checkout, ['cat-file', '-e', `${locked.commit}^{commit}`]);
  } catch {
    console.log(`fetch ${source.id} @ ${locked.commit}`);
    git(checkout, ['fetch', '--filter=blob:none', '--no-tags', 'origin', locked.commit], { capture: false, env });
  }
  git(checkout, ['checkout', '--detach', locked.commit], { capture: false, env });
  console.log(`ready ${source.id} @ ${locked.commit.slice(0, 12)}`);
}
