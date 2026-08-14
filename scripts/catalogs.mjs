import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix } from 'node:path';
import { checkoutsDir, generatedDir, isReadableText, readManifest, trackedFiles } from './lib.mjs';

// Only the analysis subjects are indexed file-by-file: DeepSeek Harness and the
// Cordis it vendors. The other checkouts are comparison baselines — their commits
// stay in the source summary and sources.lock.yml, and the cross-repo claims in
// docs/12-comparison.md are computed from the checkouts directly, not from here.
// Indexing all 15 produced a 77k-row symbol table whose 91% was never analysed.
const INDEXED_SOURCES = new Set(['deepseek-harness', 'cordis']);

const sourceExtensions = new Set(['.c', '.cc', '.cpp', '.go', '.java', '.js', '.jsx', '.mjs', '.py', '.rs', '.ts', '.tsx']);
const testPattern = /(^|\/)(__tests__\/|tests?\/|testdata\/|fixtures?\/)|(^|\/).+\.(spec|test)\.[^.]+$|(^|\/)test_[^/]+\.py$/i;
const agentNotePattern = /(^|\/)(AGENTS\.md|CLAUDE\.md)$/i;
let sourceReferences = new Map();

function classify(path) {
  if (path.startsWith('.agents/notes/')) return 'decision';
  if (testPattern.test(path)) return /fixture|snapshot|testdata/i.test(path) ? 'fixture/snapshot' : 'test';
  if (/\.(md|mdx|rst)$/i.test(path) || path.startsWith('docs/')) return 'documentation';
  if (/^(?:package\.json|pnpm-lock\.yaml|Cargo\.lock|uv\.lock)$|\.(?:ya?ml|toml|json|jsonl)$/i.test(basename(path))) return 'config/data';
  if (path.startsWith('vendor/')) return 'vendored-source';
  if (sourceExtensions.has(extname(path).toLowerCase())) return 'source';
  if (/\.(?:png|jpe?g|gif|svg|ico|woff2?|safetensors|pdf)$/i.test(path)) return 'asset/binary';
  return 'meta/other';
}

function areaFor(path) {
  const parts = path.split('/');
  if (parts[0] === 'packages' && parts.length >= 3) return `packages/${parts[1]}/${parts[2]}`;
  if (parts[0] === '.agents' && parts[1] === 'notes') return `.agents/notes/${parts[2] ?? 'root'}/${parts[3] ?? 'root'}`;
  return parts.slice(0, Math.min(2, parts.length - 1 || 1)).join('/') || 'repository-root';
}

function importSpecifiers(path, content) {
  const extension = extname(path).toLowerCase();
  const patterns = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts'].includes(extension)
    ? [/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/gu, /import\(\s*['"]([^'"]+)['"]\s*\)/gu, /require\(\s*['"]([^'"]+)['"]\s*\)/gu]
    : extension === '.py'
      ? [/^\s*from\s+([.\w]+)\s+import\s+/gmu, /^\s*import\s+([\w.]+)/gmu]
      : extension === '.rs'
        ? [/^\s*use\s+([^;]+);/gmu, /^\s*(?:pub\s+)?mod\s+([A-Za-z_]\w*)\s*;/gmu]
        : [];
  return [...new Set(patterns.flatMap((pattern) => [...content.matchAll(pattern)].map((match) => match[1])))].sort();
}

function resolveRelativeImport(from, specifier, knownPaths) {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(dirname(from), specifier));
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.py`, `${base}.rs`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`];
  if (/\.js$/u.test(base)) candidates.push(base.replace(/\.js$/u, '.ts'), base.replace(/\.js$/u, '.tsx'));
  return candidates.find((candidate) => knownPaths.has(candidate));
}

function purposeFor(file) {
  const name = basename(file.path);
  if (file.classification === 'decision') return `记录 ${areaFor(file.path)} 的设计决定、替代方案或后果`;
  if (file.classification === 'test') return `验证 ${areaFor(file.path)} 的行为契约`;
  if (file.classification === 'fixture/snapshot') return `为 ${areaFor(file.path)} 提供测试输入、轨迹或预期输出`;
  if (file.classification === 'documentation') return `说明 ${areaFor(file.path)} 的使用、契约或限制`;
  if (name === 'package.json') return `声明 ${areaFor(file.path)} 的包边界、依赖、入口与脚本`;
  if (/cordis(?:\.patch)?\.ya?ml$/i.test(name)) return `组合 ${areaFor(file.path)} 的 Cordis 插件树或覆盖层`;
  if (/^(?:index|mod)\.[^.]+$/i.test(name)) return `汇总并导出 ${areaFor(file.path)} 的公共入口`;
  if (file.classification === 'source' || file.classification === 'vendored-source') {
    const symbolText = file.symbols.slice(0, 3).map((item) => item.name).join('、');
    return symbolText ? `在 ${areaFor(file.path)} 中实现或声明 ${symbolText}` : `实现 ${areaFor(file.path)} 的内部逻辑`;
  }
  if (file.classification === 'config/data') return `保存 ${areaFor(file.path)} 的配置、协议数据或生成输入`;
  if (file.classification === 'asset/binary') return `提供 ${areaFor(file.path)} 使用的非文本资源`;
  return `支撑 ${areaFor(file.path)} 的仓库或构建元数据`;
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

// Paths are emitted as plain code spans, not per-row links. A full permalink is
// ~145 bytes and repeats on every row: with links these tables ran 238-403
// bytes per row and four of them exceeded GitHub's 1 MB Markdown render limit,
// so the index could not be read in a browser at all. The base URL is stated
// once per source in `sourceBaseUrls()`; append the path (and `#L<line>`) to
// rebuild any permalink. Nobody clicks 7,000 links — they grep and copy paths.
function cell(path, line) {
  return `\`${escapeCell(path)}${line ? `:${line}` : ''}\``;
}

/** Top-level segment a file card is grouped under; root files share `root`. */
function cardSegment(path) {
  const first = path.split('/')[0];
  return path.includes('/') ? first : 'root';
}

const CARD_COLUMNS = '| 路径 | 分类 | 行数 | 文件职责 | 公开符号 | 直接依赖 | 反向依赖 | 直接测试 |\n| --- | --- | ---: | --- | --- | ---: | ---: | ---: |\n';

function cardRow(file) {
  const symbols = file.symbols.slice(0, 5).map((item) => `\`${escapeCell(item.name)}\``).join('、') || '—';
  return `| ${cell(file.path)} | ${file.classification} | ${file.lines || '—'} | ${escapeCell(file.purpose)} | ${symbols} | ${file.imports.length} | ${file.importedBy.length} | ${file.tests.length} |`;
}

/**
 * Build the file-card index plus one part per top-level segment.
 * @returns entries of `[name, content]` for the catalog map.
 */
function fileCardParts(harnessFiles, header, baseUrls) {
  const groups = new Map();
  for (const file of harnessFiles) {
    const segment = cardSegment(file.path);
    (groups.get(segment) ?? groups.set(segment, []).get(segment)).push(file);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const detail = '每个跟踪文件都有机器生成的 L0/L1 导航；职责为启发式摘要，核心行为以人工源码研究为准。';
  const rows = ordered.map(([segment, group]) =>
    `| [\`${segment}\`](harness-file-cards-${segment}.md) | ${group.length} |`).join('\n');
  const index = `${header('DeepSeek Harness 文件卡片', detail)}${baseUrls}## 分区（共 ${harnessFiles.length} 个文件）\n\n按顶层目录拆分，每个分区都在 GitHub 网页可直接阅读。\n\n| 分区 | 文件数 |\n| --- | ---: |\n${rows}\n`;
  const parts = ordered.map(([segment, group]) => [
    `harness-file-cards-${segment}.md`,
    `${header(`DeepSeek Harness 文件卡片 · ${segment}`, detail)}${baseUrls}返回 [全部分区](harness-file-cards.md)。\n\n## 文件卡片（${group.length}）\n\n${CARD_COLUMNS}${group.map(cardRow).join('\n')}\n`,
  ]);
  return [['harness-file-cards.md', index], ...parts];
}

function sourceBaseUrls(ids) {
  const rows = ids.map((id) => {
    const source = sourceReferences.get(id);
    const base = source
      ? `${source.url.replace(/\.git$/u, '')}/blob/${source.commit}/`
      : `../sources/checkouts/${id}/`;
    return `- \`${id}\`: ${base}`;
  });
  return `## 链接构造\n\n把表中的路径接在对应基址后面即可得到永久链接；行号用 \`#L<行>\`。\n\n${rows.join('\n')}\n\n`;
}

function symbolsFor(path, content) {
  const extension = extname(path).toLowerCase();
  if (!sourceExtensions.has(extension)) return [];
  const patterns = extension === '.py'
    ? [/^\s*(?:async\s+)?def\s+([A-Za-z_$][\w$]*)/u, /^\s*class\s+([A-Za-z_$][\w$]*)/u]
    : extension === '.rs'
      ? [/^\s*pub(?:\([^)]*\))?\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const|static|mod)\s+([A-Za-z_$][\w$]*)/u]
      : extension === '.go'
        ? [/^\s*(?:func|type|const|var)\s+(?:\([^)]*\)\s*)?([A-Za-z_$][\w$]*)/u]
        : [/^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:class|function|interface|type|enum|const|let|var|namespace)\s+([A-Za-z_$][\w$]*)/u];
  const found = [];
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    for (const pattern of patterns) {
      const match = pattern.exec(lines[index]);
      if (match) {
        found.push({ name: match[1], line: index + 1 });
        break;
      }
    }
  }
  return found;
}

export function buildCatalogs() {
  const { manifest, locks } = readManifest();
  sourceReferences = new Map(manifest.sources.map((source) => [source.id, { ...source, commit: locks.get(source.id).commit }]));
  const files = [];
  const symbols = [];
  const tests = [];
  const notes = [];
  for (const source of manifest.sources) {
    // Restricted sources are deliberately excluded so public CI and a default
    // clone reproduce the committed catalogs without accepting extra terms.
    if (source.fetchPolicy === 'restricted') continue;
    if (!INDEXED_SOURCES.has(source.id)) continue;
    const checkout = join(checkoutsDir, source.id);
    if (!existsSync(join(checkout, '.git'))) continue;
    for (const path of trackedFiles(checkout)) {
      const file = { source: source.id, path, type: extname(path).slice(1) || 'none', classification: classify(path), lines: 0, symbols: [], imports: [] };
      files.push(file);
      const absolute = join(checkout, path);
      if (testPattern.test(path)) tests.push({ source: source.id, path, kind: /fixture|testdata/i.test(path) ? 'fixture' : 'test' });
      if (agentNotePattern.test(path) || path.startsWith('.agents/notes/')) notes.push({ source: source.id, path });
      if (isReadableText(absolute)) {
        const content = readFileSync(absolute, 'utf8');
        file.lines = content.split('\n').length;
        file.symbols = symbolsFor(path, content);
        file.imports = importSpecifiers(path, content);
        for (const symbol of file.symbols) symbols.push({ source: source.id, path, ...symbol });
      }
    }
  }
  const header = (title, detail) => `# ${title}\n\n> 由 \`npm run catalogs:generate\` 从固定提交生成。不要手工编辑。${detail}\n\n`;
  const sourceSummary = manifest.sources.map((source) => {
    const present = files.some((file) => file.source === source.id);
    const state = source.fetchPolicy === 'restricted'
      ? 'restricted; intentionally not indexed'
      : !INDEXED_SOURCES.has(source.id)
          ? 'comparison baseline; pinned but not file-indexed'
          : present ? 'indexed' : 'checkout absent';
    return `- \`${source.id}\`: \`${locks.get(source.id).commit}\` (${state})`;
  }).join('\n');
  const harnessFiles = files.filter((file) => file.source === 'deepseek-harness');
  const harnessPaths = new Set(harnessFiles.map((file) => file.path));
  const reverseDependencies = new Map();
  const dependencyEdges = [];
  for (const file of harnessFiles) {
    for (const specifier of file.imports) {
      const target = resolveRelativeImport(file.path, specifier, harnessPaths);
      if (!target) continue;
      dependencyEdges.push({ from: file.path, to: target });
      const consumers = reverseDependencies.get(target) ?? [];
      consumers.push(file.path);
      reverseDependencies.set(target, consumers);
    }
  }
  const testPaths = harnessFiles.filter((file) => file.classification === 'test' || file.classification === 'fixture/snapshot').map((file) => file.path);
  const directTests = new Map();
  for (const edge of dependencyEdges) {
    if (!testPattern.test(edge.from)) continue;
    const related = directTests.get(edge.to) ?? [];
    related.push(edge.from);
    directTests.set(edge.to, related);
  }
  for (const file of harnessFiles) {
    file.purpose = purposeFor(file);
    file.importedBy = (reverseDependencies.get(file.path) ?? []).sort();
    file.tests = (directTests.get(file.path) ?? []).sort();
  }
  const classCounts = [...new Set(harnessFiles.map((file) => file.classification))].sort().map((classification) => ({ classification, count: harnessFiles.filter((file) => file.classification === classification).length }));
  const sourceTestRows = harnessFiles.filter((file) => ['source', 'vendored-source'].includes(file.classification));
  const indexedIds = [...INDEXED_SOURCES];
  const harnessBase = sourceBaseUrls(['deepseek-harness']);
  const allBase = sourceBaseUrls(indexedIds);
  return new Map([
    ['files.md', `${header('文件索引', '相同路径的本地源码位于 sources/checkouts/<source-id>/。')}## 来源基线\n\n${sourceSummary}\n\n${allBase}## 文件（${files.length}）\n\n| 来源 | 路径 | 类型 |\n| --- | --- | --- |\n${files.map((item) => `| ${item.source} | ${cell(item.path)} | ${item.type} |`).join('\n')}\n`],
    ['symbols.md', `${header('符号索引', '这是轻量语法索引，不替代语言服务器。')}${allBase}## 导出或公开符号（${symbols.length}）\n\n| 来源 | 符号 | 定义 |\n| --- | --- | --- |\n${symbols.map((item) => `| ${item.source} | \`${escapeCell(item.name)}\` | ${cell(item.path, item.line)} |`).join('\n')}\n`],
    ['tests.md', `${header('测试与 Fixture 索引', '')}${allBase}## 测试资产（${tests.length}）\n\n| 来源 | 类型 | 路径 |\n| --- | --- | --- |\n${tests.map((item) => `| ${item.source} | ${item.kind} | ${cell(item.path)} |`).join('\n')}\n`],
    ['agent-notes.md', `${header('Agent Note 索引', '包含 AGENTS.md、CLAUDE.md 与 DeepSeek Harness 的 .agents/notes。')}${allBase}## 指令与设计记录（${notes.length}）\n\n| 来源 | 文件 |\n| --- | --- |\n${notes.map((item) => `| ${item.source} | ${cell(item.path)} |`).join('\n')}\n`],
    // File cards carry eight columns including a generated purpose sentence, so
    // even without per-row links the single table exceeds GitHub's 1 MB render
    // limit. Split by top-level segment: every part stays readable in a browser,
    // and "show me the cards under packages/" is how this table is actually used.
    ...fileCardParts(harnessFiles, header, harnessBase),
    ['harness-dependencies.md', `${header('DeepSeek Harness 文件依赖边', '只解析能够静态定位的仓库内相对 import/export/require；动态解析和 Cordis 运行时注入需结合人工分析。')}${harnessBase}## 静态依赖边（${dependencyEdges.length}）\n\n| 调用/导入方 | 被依赖文件 |\n| --- | --- |\n${dependencyEdges.map((edge) => `| ${cell(edge.from)} | ${cell(edge.to)} |`).join('\n')}\n`],
    ['harness-source-test-map.md', `${header('DeepSeek Harness 源码到测试映射', '直接测试来自静态 import 关系；0 不等于没有间接、组装或真实 E2E 覆盖。')}${harnessBase}## 源码与直接测试（${sourceTestRows.length}）\n\n| 源码 | 能力域 | 直接测试数 | 直接测试 |\n| --- | --- | ---: | --- |\n${sourceTestRows.map((file) => `| ${cell(file.path)} | ${escapeCell(areaFor(file.path))} | ${file.tests.length} | ${file.tests.slice(0, 8).map((path) => cell(path)).join('<br>') || '—'} |`).join('\n')}\n\n未直接映射的测试资产仍可在 [tests.md](tests.md) 查询，共 ${testPaths.length} 个。\n`],
    ['coverage-report.md', `${header('知识覆盖报告', '覆盖状态描述 Atlas 产物，不代表上游测试覆盖率或人工审核完成度。')}## Harness 基线\n\n- 固定 Commit：\`${locks.get('deepseek-harness').commit}\`\n- 跟踪文件：${harnessFiles.length}\n- 自动文件卡片：${harnessFiles.length}（L0/L1 启发式）\n- 可静态定位的仓库内依赖边：${dependencyEdges.length}\n- 源码/受 vendored 源码文件：${sourceTestRows.length}\n- 有直接静态测试映射的源码：${sourceTestRows.filter((file) => file.tests.length).length}\n- 人工核心源码研究：见主干分支 docs/ 下的深度文章\n\n## 文件分类\n\n| 分类 | 文件数 |\n| --- | ---: |\n${classCounts.map((item) => `| ${item.classification} | ${item.count} |`).join('\n')}\n\n## 解释边界\n\n自动卡片保证“每个文件可定位且有基础语义”，不声称每个文件已经人工逐行审阅。L2/L3 只授予包含 happy/error/edge path、测试和运行证据的人工研究；上游变化后由更新报告标记待复核。\n`],
  ]);
}

export function writeCatalogs({ check = false } = {}) {
  const catalogs = buildCatalogs();
  const mismatches = [];
  if (!check) mkdirSync(generatedDir, { recursive: true });
  for (const [name, content] of catalogs) {
    const path = join(generatedDir, name);
    if (check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) mismatches.push(name);
    } else {
      writeFileSync(path, content);
      console.log(`generated .generated/${name}`);
    }
  }
  return mismatches;
}
