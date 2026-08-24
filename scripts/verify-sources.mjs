#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkoutsDir,
  fail,
  git,
  parseGitlink,
  parseGitmodules,
  parseSourceProfiles,
  readManifest,
  root,
  selectManifestSources,
} from './lib.mjs';

const requireRestricted = process.argv.includes('--include-restricted');
const { manifest, lock, locks } = readManifest();
const profiles = parseSourceProfiles(process.argv.slice(2));
const selectedSources = selectManifestSources(manifest, profiles);
const selectedIds = new Set(selectedSources.map(({ id }) => id));
const errors = [];
const ids = new Set();
const lockIds = new Set();
const moduleEntries = parseGitmodules(readFileSync(join(root, '.gitmodules'), 'utf8'));
const moduleNames = new Set();

for (const entry of lock.sources) {
  if (lockIds.has(entry.id)) errors.push(`Duplicate lock source id: ${entry.id}`);
  lockIds.add(entry.id);
}
for (const entry of moduleEntries) {
  if (moduleNames.has(entry.name)) errors.push(`Duplicate .gitmodules stanza: ${entry.name}`);
  moduleNames.add(entry.name);
  if (entry.paths.length !== 1) errors.push(`${entry.name}: .gitmodules must declare exactly one path`);
  if (entry.urls.length !== 1) errors.push(`${entry.name}: .gitmodules must declare exactly one URL`);
}

if (manifest.schemaVersion !== 2 || lock.schemaVersion !== 2) errors.push('Unsupported source schema version');
if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) errors.push('sources.yml must contain at least one source');
for (const source of manifest.sources) {
  if (ids.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
  ids.add(source.id);
  if (!/^[a-z0-9][a-z0-9-]+$/.test(source.id)) errors.push(`${source.id}: 来源标识不合法`);
  if (!['automatic', 'restricted'].includes(source.fetchPolicy)) errors.push(`${source.id}: invalid fetchPolicy`);
  if (!Array.isArray(source.profiles) || source.profiles.length === 0) {
    errors.push(`${source.id}: profiles must contain at least one source profile`);
  } else if (source.profiles.some((profile) => !['core', 'samples', 'eval'].includes(profile))) {
    errors.push(`${source.id}: profiles contain an unsupported source profile`);
  }
  if (!source.license?.spdx || !source.redistribution?.policy) errors.push(`${source.id}: license and redistribution policy are required`);
  const locked = locks.get(source.id);
  if (!locked) {
    errors.push(`${source.id}: missing lock entry`);
    continue;
  }
  if (!/^[0-9a-f]{40}$/.test(locked.commit)) errors.push(`${source.id}: 锁定提交必须使用完整 SHA`);
  const relativeCheckout = `sources/checkouts/${source.id}`;
  try {
    const entries = moduleEntries.filter(({ name }) => name === relativeCheckout);
    if (entries.length !== 1) throw new Error(`expected exactly one .gitmodules stanza named ${relativeCheckout}`);
    const [module] = entries;
    if (module.paths.length !== 1 || module.paths[0] !== relativeCheckout) {
      errors.push(`${source.id}: .gitmodules path ${module.paths.join(', ') || '(missing)'} != ${relativeCheckout}`);
    }
    const moduleUrl = module.urls[0] ?? '';
    if (moduleUrl.replace(/\.git$/u, '') !== source.url.replace(/\.git$/u, '')) {
      errors.push(`${source.id}: .gitmodules URL ${moduleUrl} != manifest ${source.url}`);
    }
    const indexEntry = git(root, ['ls-files', '--stage', '--', relativeCheckout]);
    const gitlink = parseGitlink(indexEntry);
    if (!gitlink) errors.push(`${source.id}: ${relativeCheckout} is not a tracked Git submodule`);
    else if (gitlink !== locked.commit) errors.push(`${source.id}: gitlink ${gitlink} != lock ${locked.commit}`);
  } catch (error) {
    errors.push(`${source.id}: submodule metadata missing or invalid (${error.message.split('\n')[0]})`);
  }
  if (!selectedIds.has(source.id)) continue;
  const checkout = join(checkoutsDir, source.id);
  const required = source.fetchPolicy === 'automatic' || requireRestricted;
  if (!existsSync(join(checkout, '.git'))) {
    if (required) {
      const profileArgs = [...profiles].flatMap((profile) => ['--profile', profile]).join(' ');
      const restrictedArg = requireRestricted ? ' --include-restricted' : '';
      errors.push(`${source.id}: checkout missing; run npm run bootstrap -- ${profileArgs}${restrictedArg}`);
    }
    continue;
  }
  try {
    const head = git(checkout, ['rev-parse', 'HEAD']);
    if (head !== locked.commit) errors.push(`${source.id}: checkout ${head} != lock ${locked.commit}`);
    if (git(checkout, ['status', '--porcelain'])) errors.push(`${source.id}: checkout has local changes`);
  } catch (error) {
    errors.push(`${source.id}: ${error.message}`);
  }
}
for (const entry of lock.sources) if (!ids.has(entry.id)) errors.push(`${entry.id}: lock entry has no manifest source`);
for (const entry of moduleEntries) {
  if (!manifest.sources.some(({ id }) => entry.name === `sources/checkouts/${id}`)) errors.push(`${entry.name}: .gitmodules stanza has no manifest source`);
}

if (!fail(errors)) {
  console.log(`已验证 ${manifest.sources.length} 个来源定义和 ${selectedSources.length} 个 ${[...profiles].join('+')} 配置 Checkout`);
  console.log('提示：使用 --profile all 可验证全部 Checkout。');
}
