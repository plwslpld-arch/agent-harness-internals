import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sourcesDir = join(root, 'sources');
export const checkoutsDir = join(sourcesDir, 'checkouts');
// 生成目录不入库：主干只保留人工分析，索引由 CI 生成并发布到 gh-pages 分支。
export const generatedDir = join(root, '.generated');
export const sourceProfiles = new Set(['core', 'samples', 'eval', 'all']);

export function parseSourceProfiles(args) {
  const selected = new Set();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--profile') continue;
    const profile = args[index + 1];
    if (!sourceProfiles.has(profile)) {
      throw new Error(`非法来源配置：${profile ?? '(缺失)'}`);
    }
    selected.add(profile);
    index += 1;
  }
  return selected.size ? selected : new Set(['core']);
}

export function selectManifestSources(manifest, profiles) {
  if (profiles.has('all')) return manifest.sources;
  return manifest.sources.filter((source) =>
    (source.profiles ?? []).some((profile) => profiles.has(profile)));
}

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
  const output = run('git', ['-c', 'advice.detachedHead=false', '-c', 'core.longpaths=true', ...args], { cwd, ...options });
  return typeof output === 'string' ? output.trim() : '';
}

export function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

// 许可证这类文本文件按内容比对，不按字节。Windows 上 `core.autocrlf=true`
// 会在 checkout 时把 LF 换成 CRLF，逐字节哈希必然对不上，门禁于是在 Windows
// 上永远失败（实测 codex / opencode / mini-swe-agent 三个源都会命中）。
// 许可证变没变看的是条款，不是换行符，所以先归一化再哈希。
export function sha256Text(path) {
  return createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/gu, '\n')).digest('hex');
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

export function parseGitmodules(content) {
  const entries = [];
  let current;
  for (const rawLine of content.split('\n')) {
    const stanza = /^\s*\[submodule "([^"]+)"\]\s*$/u.exec(rawLine);
    if (stanza) {
      current = { name: stanza[1], paths: [], urls: [] };
      entries.push(current);
      continue;
    }
    if (!current) continue;
    const setting = /^\s*(path|url)\s*=\s*(.*?)\s*$/u.exec(rawLine);
    if (!setting) continue;
    if (setting[1] === 'path') current.paths.push(setting[2]);
    else current.urls.push(setting[2]);
  }
  return entries;
}

export function listProjectFiles(start = root) {
  const ignoredEntries = new Set(['.git', '.worktrees', '.claude', '.generated', 'node_modules', 'checkouts', '.tmp', 'dist', 'build', 'coverage']);
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = join(directory, entry.name);
      if (ignoredEntries.has(entry.name)) continue;
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(absolute);
      }
    }
  }
  visit(start);
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
