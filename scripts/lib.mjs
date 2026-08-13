import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sourcesDir = join(root, 'sources');
export const checkoutsDir = join(sourcesDir, 'checkouts');
export const generatedDir = join(root, 'docs', '14-file-reference', 'generated');

export function readDocument(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${relative(root, path)} must be JSON-compatible YAML: ${error.message}`);
  }
}

export function readManifest() {
  const manifest = readDocument(join(sourcesDir, 'sources.yml'));
  const lock = readDocument(join(sourcesDir, 'sources.lock.yml'));
  return { manifest, lock, locks: new Map(lock.sources.map((entry) => [entry.id, entry])) };
}

export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...options.env },
    ...options,
  });
}

export function git(cwd, args, options = {}) {
  const output = run('git', ['-c', 'advice.detachedHead=false', ...args], { cwd, ...options });
  return typeof output === 'string' ? output.trim() : '';
}

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function writeDocument(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function posixPath(path) {
  return path.split(sep).join('/');
}

export function parseGitlink(indexEntry) {
  return /^160000 ([0-9a-f]{40}) 0\t/u.exec(indexEntry)?.[1];
}

export function listProjectFiles({ includeGenerated = true } = {}) {
  const ignoredDirectories = new Set(['.git', 'node_modules', 'checkouts', '.tmp', 'dist', 'build', 'coverage']);
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      const rel = posixPath(relative(root, absolute));
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name) || (!includeGenerated && rel === 'sources/generated')) continue;
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  visit(root);
  return files;
}

export function trackedFiles(checkout) {
  return git(checkout, ['ls-files', '-z']).split('\0').filter(Boolean).sort();
}

export function isReadableText(path) {
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 1_000_000) return false;
  const buffer = readFileSync(path);
  return !buffer.subarray(0, 8192).includes(0);
}

export function assertRelativeSafe(value, label) {
  if (typeof value !== 'string' || value.startsWith('/') || value.includes('..') || value.includes('\\')) {
    throw new Error(`${label} must be a safe repository-relative POSIX path`);
  }
}

export function fail(errors) {
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return true;
  }
  return false;
}
