#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { analysisFiles, markContentStale, parseFrontmatter } from './analysis-metadata.mjs';
import { checkoutsDir, git, readManifest, root, run, sourcesDir, writeDocument } from './lib.mjs';
import { join } from 'node:path';

const { manifest, lock, locks } = readManifest();
const offline = process.argv.includes('--offline');
const changes = [];
for (const source of manifest.sources) {
  const checkout = join(checkoutsDir, source.id);
  const output = offline
    ? git(checkout, ['rev-parse', `refs/remotes/origin/${source.defaultBranch}`])
    : run('git', ['ls-remote', source.url, `refs/heads/${source.defaultBranch}`]).trim().split(/\s+/)[0];
  const latest = output.trim();
  if (!/^[0-9a-f]{40}$/.test(latest)) throw new Error(`${source.id}: cannot resolve ${source.defaultBranch}`);
  const entry = locks.get(source.id);
  if (entry.commit !== latest) {
    let files = [];
    if (existsSync(join(checkout, '.git'))) {
      try {
        git(checkout, ['fetch', '--filter=blob:none', '--no-tags', 'origin', latest]);
        files = git(checkout, ['diff', '--name-status', '--find-renames', entry.commit, latest])
          .split('\n').filter(Boolean).map((line) => {
            const [status, ...paths] = line.split('\t');
            return { status, paths };
          });
      } catch (error) {
        files = [{ status: 'UNKNOWN', paths: [error.message.split('\n')[0]] }];
      }
    }
    const impact = [...new Set(files.flatMap(({ paths }) => paths).map((path) => {
      if (/license|notice|copying/i.test(path)) return 'license';
      if (/(^|\/)(test|tests|__tests__|fixtures?)(\/|$)|\.(test|spec)\./i.test(path)) return 'tests';
      if (/(^|\/)(AGENTS|CLAUDE)\.md$|\.agents\/notes\//i.test(path)) return 'agent-notes';
      if (/package(-lock)?\.json|Cargo\.lock|go\.(mod|sum)|requirements/i.test(path)) return 'dependencies';
      if (/README|docs?\//i.test(path)) return 'documentation';
      return 'implementation';
    }))].sort();
    changes.push({ id: source.id, from: entry.commit, to: latest, impact, files });
    entry.commit = latest;
    // The license hash is intentionally cleared until bootstrap + license verification records the new file.
    entry.licenseSha256 = source.license.file ? null : entry.licenseSha256;
  }
}
if (changes.length) {
  for (const change of changes) {
    const checkout = join(checkoutsDir, change.id);
    if (existsSync(join(checkout, '.git'))) git(checkout, ['checkout', '--detach', change.to]);
    git(root, ['update-index', '--add', '--cacheinfo', '160000', change.to, `sources/checkouts/${change.id}`]);
  }
  lock.generatedAt = new Date().toISOString();
  writeDocument(join(sourcesDir, 'sources.lock.yml'), lock);
  writeDocument(join(sourcesDir, 'upstream-update.json'), {
    generatedAt: lock.generatedAt,
    sources: changes,
  });
  for (const file of analysisFiles()) {
    const before = file.content;
    let after = before;
    for (const change of changes) after = markContentStale(after, change.id);
    if (after === before) continue;
    writeFileSync(file.path, after);
  }
  const staleDocuments = analysisFiles().flatMap((file) => {
    const { metadata } = parseFrontmatter(file.content);
    if (metadata?.status !== 'stale') return [];
    const affected = metadata.sources.filter(({ repo, commit }) => locks.get(repo)?.commit !== commit);
    return affected.length ? [{ path: file.relativePath, sources: affected }] : [];
  });
  const staleReport = staleDocuments.length
    ? [
        '# Stale human analysis',
        '',
        '> These documents remain bound to their previously reviewed commit. Update the analysis,',
        '> update the affected binding `commit`, and restore `status: reviewed` only after human review.',
        '',
        '| Document | Affected source bindings |',
        '| --- | --- |',
        ...staleDocuments.map((item) => `| \`${item.path}\` | ${item.sources.map(({ repo, commit }) => `\`${repo}@${commit}\``).join('<br>')} |`),
        '',
      ].join('\n')
    : '# Stale human analysis\n\nNo source-bound human analysis was affected by this update.\n';
  writeFileSync(join(sourcesDir, 'stale-documents.md'), staleReport);
  const report = [
    '# Upstream source update',
    '',
    `Generated: ${lock.generatedAt}`,
    '',
    '> This report is mechanical evidence. Human review is required before merging.',
    `> Source-bound documents marked stale: ${staleDocuments.length}.`,
    '',
    ...changes.flatMap((change) => [
      `## ${change.id}`,
      '',
      `- Baseline: \`${change.from}\``,
      `- Candidate: \`${change.to}\``,
      `- Impact areas: ${change.impact.length ? change.impact.map((item) => `\`${item}\``).join(', ') : 'none detected'}`,
      `- Changed paths: ${change.files.length}`,
      '',
      '| Status | Path |',
      '| --- | --- |',
      ...(change.files.length ? change.files.map((item) => `| ${item.status} | ${item.paths.map((path) => `\`${path.replaceAll('|', '\\|')}\``).join(' → ')} |`) : ['| — | No path diff available |']),
      '',
    ]),
  ].join('\n');
  writeFileSync(join(sourcesDir, 'upstream-update.md'), `${report.replace(/\n+$/u, '')}\n`);
  console.log(JSON.stringify({ updated: changes }, null, 2));
} else {
  for (const filename of ['upstream-update.json', 'upstream-update.md']) {
    const path = join(sourcesDir, filename);
    if (existsSync(path)) writeFileSync(path, filename.endsWith('.json') ? '{\n  "sources": []\n}\n' : '# Upstream source update\n\nNo upstream changes detected.\n');
  }
  console.log('all sources are current');
}
