#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './analysis-metadata.mjs';
import { fail, listProjectFiles, posixPath, root } from './lib.mjs';

const startMarker = '<!-- course-navigation:start -->';
const endMarker = '<!-- course-navigation:end -->';
const localLink = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
const publishableStatuses = new Set(['reviewed', 'verified']);

function withoutFencedCode(content) {
  let inFence = false;
  return content.split('\n').map((line) => {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      return '';
    }
    return inFence ? '' : line;
  }).join('\n');
}

function navigationRegions(content) {
  const clean = withoutFencedCode(content);
  const regions = [];
  const markers = new RegExp(`${startMarker}|${endMarker}`, 'gu');
  let activeStart = null;
  for (const match of clean.matchAll(markers)) {
    if (match[0] === startMarker) {
      if (activeStart !== null) return null;
      activeStart = match.index + startMarker.length;
    } else {
      if (activeStart === null) return null;
      regions.push(clean.slice(activeStart, match.index));
      activeStart = null;
    }
  }
  return activeStart === null ? regions : null;
}

export function navigationFailures(content, resolveDocument, options = {}) {
  const errors = [];
  const regions = navigationRegions(content);
  if (!regions) return ['正式导航标记不成对或发生嵌套'];
  const linkedTargets = new Set();
  for (const region of regions) {
    for (const match of region.matchAll(localLink)) {
      const raw = match[1];
      if (raw.startsWith('#') || /^(?:https?:|mailto:)/u.test(raw)) continue;
      const pathPart = raw.split('#')[0].split('?')[0];
      if (!pathPart || pathPart.endsWith('/') || !/\.md$/iu.test(pathPart)) continue;
      let target;
      try {
        target = decodeURI(pathPart);
      } catch {
        errors.push(`${raw}: 正式导航链接 URL 编码非法`);
        continue;
      }
      linkedTargets.add(target);
      for (const rule of options.forbiddenPrefixes ?? []) {
        if (target.startsWith(rule.prefix)) {
          errors.push(`${target}: ${rule.name}不得进入正式导航`);
        }
      }
      const document = resolveDocument(target);
      if (typeof document !== 'string') {
        errors.push(`${target}: 正式导航目标不存在`);
        continue;
      }
      const { metadata } = parseFrontmatter(document);
      if (!metadata) {
        errors.push(`${target}: 正式导航目标缺少 Frontmatter`);
        continue;
      }
      if (!publishableStatuses.has(metadata.status)) {
        errors.push(`${target}: 正式导航不能链接 status=${metadata.status ?? '(缺失)'}`);
      }
    }
  }
  for (const batch of options.requiredBatches ?? []) {
    const present = batch.targets.filter((target) => linkedTargets.has(target));
    if (present.length === 0 && !batch.required) continue;
    const missing = batch.targets.filter((target) => !linkedTargets.has(target));
    if (missing.length > 0) {
      errors.push(`${batch.name}批量导航不完整：缺少 ${missing.join('、')}`);
      continue;
    }
    for (const target of batch.targets) {
      const document = resolveDocument(target);
      if (typeof document !== 'string') {
        errors.push(`${batch.name}批量发布失败：${target} 不存在`);
        continue;
      }
      const { metadata } = parseFrontmatter(document);
      if (!publishableStatuses.has(metadata?.status)) {
        errors.push(`${batch.name}批量发布失败：${target} status=${metadata?.status ?? '(缺失)'}`);
      }
    }
  }
  return errors;
}

function main() {
  const files = listProjectFiles().filter((path) => path.endsWith('.md'));
  const errors = [];
  let checked = 0;
  for (const path of files) {
    const relativePath = posixPath(relative(root, path));
    const content = readFileSync(path, 'utf8');
    const foundationTargets = relativePath === 'README.md'
      ? [
          'docs/foundations/01-boundaries.md',
          'docs/foundations/02-agent-turn.md',
          'docs/foundations/03-model-tool-io.md',
          'docs/foundations/04-tools-permissions-sandbox.md',
          'docs/foundations/05-session-context-memory.md',
          'docs/foundations/06-trace-feedback-eval.md',
        ]
      : relativePath === 'docs/00-start-here.md'
        ? [
            'foundations/01-boundaries.md',
            'foundations/02-agent-turn.md',
            'foundations/03-model-tool-io.md',
            'foundations/04-tools-permissions-sandbox.md',
            'foundations/05-session-context-memory.md',
            'foundations/06-trace-feedback-eval.md',
          ]
        : [];
    const dshTargets = relativePath === 'docs/harnesses/deepseek-harness/README.md'
      ? [
          'README.md',
          '01-boot-preset.md',
          '02-prompt-context-cache.md',
          '03-loop-model-tool.md',
          '04-tools-security.md',
          '05-session-compaction.md',
          '06-orchestration-extensions.md',
          '07-surfaces-feedback-eval.md',
          '08-verification-design-limits.md',
        ]
      : [];
    const codexTargets = relativePath === 'docs/harnesses/codex/README.md'
      ? [
          'README.md',
          '01-config-prompt-context.md',
          '02-thread-task-turn.md',
          '03-model-tool-loop.md',
          '04-exec-policy-sandbox.md',
          '05-rollout-history-memory.md',
          '06-extensions-code-mode.md',
          '07-subagents-orchestration.md',
          '08-surfaces-trace-eval-design.md',
      ]
      : [];
    const geminiTargets = relativePath === 'docs/harnesses/gemini-cli/README.md'
      ? [
          'README.md',
          '01-config-prompt-context.md',
          '02-turn-scheduler-routing.md',
          '03-tools-lifecycle.md',
          '04-confirmation-policy-safety-sandbox.md',
          '05-session-history-compression-memory.md',
          '06-agents-hooks-skills-mcp.md',
          '07-surfaces-output-protocol.md',
          '08-telemetry-errors-eval-design.md',
        ]
      : [];
    const claudeTargets = relativePath === 'docs/harnesses/claude/README.md'
      ? [
          'README.md',
          '01-evidence-product-sdk-boundaries.md',
          '02-python-entry-transport-control.md',
          '03-messages-stream-lifecycle.md',
          '04-tools-permissions-hooks.md',
          '05-sessions-resume-store.md',
          '06-mcp-agents-skills.md',
          '07-typescript-contract-parity.md',
          '08-surfaces-errors-eval-design.md',
      ]
      : [];
    const piTargets = relativePath === 'docs/harnesses/pi/README.md'
      ? [
          'README.md',
          '01-evidence-runtime-design-boundaries.md',
          '02-ai-provider-stream-normalization.md',
          '03-agent-loop-state-tools.md',
          '04-coding-agent-prompt-extensions.md',
          '05-session-context-compaction-storage.md',
          '06-protocol-server-client.md',
          '07-cli-tui-permissions-containerization.md',
          '08-telemetry-evals-data-contracts.md',
        ]
      : [];
    const opencodeTargets = relativePath === 'docs/harnesses/opencode/README.md'
      ? [
          'README.md',
          '01-runtime-project-config-provider.md',
          '02-session-prompt-llm-processor.md',
          '03-tools-permission-question-patch.md',
          '04-storage-history-compaction-revert.md',
          '05-agents-skills-plugins-mcp-lsp.md',
          '06-server-protocol-sdk-events.md',
          '07-tui-desktop-web-acp-surfaces.md',
          '08-share-telemetry-eval-boundaries.md',
        ]
      : [];
    const fileErrors = navigationFailures(content, (target) => {
      checked += 1;
      const absolute = resolve(dirname(path), target);
      const repositoryRelative = relative(root, absolute);
      if (repositoryRelative.startsWith('..') || isAbsolute(repositoryRelative)) return undefined;
      return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
    }, {
      requiredBatches: [
        ...(foundationTargets.length > 0 ? [{ name: '共同基础', targets: foundationTargets }] : []),
        ...(dshTargets.length > 0 ? [{ name: 'DSH 主线', targets: dshTargets, required: true }] : []),
        ...(codexTargets.length > 0 ? [{ name: 'Codex 主线', targets: codexTargets, required: true }] : []),
        ...(geminiTargets.length > 0 ? [{ name: 'Gemini CLI 主线', targets: geminiTargets, required: true }] : []),
        ...(claudeTargets.length > 0 ? [{ name: 'Claude 主线', targets: claudeTargets, required: true }] : []),
        ...(piTargets.length > 0 ? [{ name: 'pi 主线', targets: piTargets, required: true }] : []),
        ...(opencodeTargets.length > 0 ? [{ name: 'OpenCode 主线', targets: opencodeTargets, required: true }] : []),
      ],
      forbiddenPrefixes: relativePath === 'README.md'
        ? [{ name: '扩展样本', prefix: 'docs/samples/' }]
        : relativePath === 'docs/00-start-here.md'
          ? [{ name: '扩展样本', prefix: 'samples/' }]
          : relativePath === 'docs/harnesses/deepseek-harness/README.md'
            ? [{ name: '扩展样本', prefix: '../../samples/' }]
            : relativePath === 'docs/harnesses/codex/README.md'
              ? [{ name: '扩展样本', prefix: '../../samples/' }]
              : relativePath === 'docs/harnesses/gemini-cli/README.md'
                ? [{ name: '扩展样本', prefix: '../../samples/' }]
                : relativePath === 'docs/harnesses/claude/README.md'
                  ? [{ name: '扩展样本', prefix: '../../samples/' }]
                  : relativePath === 'docs/harnesses/pi/README.md'
                    ? [{ name: '扩展样本', prefix: '../../samples/' }]
                    : relativePath === 'docs/harnesses/opencode/README.md'
                      ? [{ name: '扩展样本', prefix: '../../samples/' }]
                      : [],
    });
    for (const error of fileErrors) errors.push(`${relativePath}: ${error}`);
  }
  if (!fail(errors)) console.log(`已检查 ${checked} 个正式导航文章链接（扫描 ${files.length} 个 Markdown 文件）`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
