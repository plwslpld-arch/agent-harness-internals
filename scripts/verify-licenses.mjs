#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkoutsDir, fail, readManifest, sha256, sourcesDir, writeDocument } from './lib.mjs';

const updateLock = process.argv.includes('--update-lock');
const { manifest, lock, locks } = readManifest();
const errors = [];
const allowedPolicies = new Set(['metadata-and-analysis-only', 'citation-only', 'file-scoped-review', 'no-redistribution']);

for (const required of ['LICENSE', 'LICENSE-CODE', 'LICENSE-DOCS', 'NOTICE.md', 'THIRD_PARTY.md']) {
  if (!existsSync(join(sourcesDir, '..', required))) errors.push(`missing project license file: ${required}`);
}
const licenseMap = existsSync(join(sourcesDir, '..', 'LICENSE'))
  ? readFileSync(join(sourcesDir, '..', 'LICENSE'), 'utf8')
  : '';
if (!licenseMap.includes('LICENSE-CODE') || !licenseMap.includes('LICENSE-DOCS') || !licenseMap.includes('THIRD_PARTY')) {
  errors.push('root LICENSE must map code, documentation, and third-party licensing boundaries');
}
for (const source of manifest.sources) {
  if (!allowedPolicies.has(source.redistribution.policy)) errors.push(`${source.id}: unknown redistribution policy`);
  if (source.license.spdx === 'NOASSERTION' && source.fetchPolicy !== 'restricted') errors.push(`${source.id}: unlicensed sources must be restricted`);
  if (source.redistribution.policy === 'no-redistribution' && source.fetchPolicy !== 'restricted') errors.push(`${source.id}: no-redistribution sources must be restricted`);
  const licenseFile = source.license.file;
  const checkout = join(checkoutsDir, source.id);
  if (!licenseFile || !existsSync(join(checkout, '.git'))) continue;
  const path = join(checkout, licenseFile);
  if (!existsSync(path)) {
    errors.push(`${source.id}: declared license file is missing: ${licenseFile}`);
    continue;
  }
  const actual = sha256(path);
  const locked = locks.get(source.id);
  if (updateLock && locked.licenseSha256 !== actual) {
    locked.licenseSha256 = actual;
  } else if (locked.licenseSha256 !== actual) {
    errors.push(`${source.id}: license hash changed (${actual}); review terms, then run node scripts/verify-licenses.mjs --update-lock`);
  }
}
if (updateLock && !errors.length) writeDocument(join(sourcesDir, 'sources.lock.yml'), lock);
if (!fail(errors)) console.log(`license policy and available license files verified${updateLock ? '; lock hashes refreshed' : ''}`);
