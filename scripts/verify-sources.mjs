#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutsDir, fail, git, parseGitlink, readManifest, root } from './lib.mjs';

const requireRestricted = process.argv.includes('--include-restricted');
const { manifest, lock, locks } = readManifest();
const errors = [];
const ids = new Set();

if (manifest.schemaVersion !== 1 || lock.schemaVersion !== 1) errors.push('Unsupported source schema version');
if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) errors.push('sources.yml must contain at least one source');
for (const source of manifest.sources) {
  if (ids.has(source.id)) errors.push(`Duplicate source id: ${source.id}`);
  ids.add(source.id);
  if (!/^[a-z0-9][a-z0-9-]+$/.test(source.id)) errors.push(`${source.id}: invalid id`);
  if (!['automatic', 'restricted'].includes(source.fetchPolicy)) errors.push(`${source.id}: invalid fetchPolicy`);
  if (!source.license?.spdx || !source.redistribution?.policy) errors.push(`${source.id}: license and redistribution policy are required`);
  const locked = locks.get(source.id);
  if (!locked) {
    errors.push(`${source.id}: missing lock entry`);
    continue;
  }
  if (!/^[0-9a-f]{40}$/.test(locked.commit)) errors.push(`${source.id}: lock commit must be a full SHA`);
  const relativeCheckout = `sources/checkouts/${source.id}`;
  try {
    const moduleUrl = git(root, ['config', '-f', '.gitmodules', '--get', `submodule.${relativeCheckout}.url`]);
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
  const checkout = join(checkoutsDir, source.id);
  const required = source.fetchPolicy === 'automatic' || requireRestricted;
  if (!existsSync(join(checkout, '.git'))) {
    if (required) errors.push(`${source.id}: checkout missing; run npm run bootstrap${requireRestricted ? ' -- --include-restricted' : ''}`);
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

if (!fail(errors)) console.log(`verified ${manifest.sources.length} source definitions and available fixed checkouts`);
