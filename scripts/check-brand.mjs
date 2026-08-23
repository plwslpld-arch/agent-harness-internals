#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, readDocument, root } from './lib.mjs';

const han = /[\u3400-\u9fff]/u;
const requiredAssets = {
  mark: 'assets/brand/logo-mark.svg',
  lockup: 'assets/brand/logo-lockup.svg',
  socialSvg: 'assets/brand/social-preview.svg',
  socialPng: 'assets/brand/social-preview.png',
};
const requiredTopics = [
  'agent-harness', 'source-code-analysis', 'ai-evaluation',
  'deepseek-harness', 'openai-codex', 'gemini-cli', 'claude-code', 'pi-coding-agent', 'opencode',
];

function safeRelativePath(value) {
  return typeof value === 'string'
    && !/^(?:[A-Za-z]:|\/|\\)/u.test(value)
    && !value.includes('..')
    && !value.includes('\\');
}

export function validateBrandManifest(manifest, options = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ['品牌 Manifest 必须是对象'];
  if (manifest.schemaVersion !== 1) errors.push('品牌 Manifest schemaVersion 必须是 1');
  if (!['designing', 'published'].includes(manifest.status)) errors.push('品牌状态必须是 designing 或 published');
  if (manifest.repository !== 'agent-harness-internals') errors.push('仓库标识必须是 agent-harness-internals');
  if (manifest.title !== 'Agent Harness 内部原理' || !han.test(manifest.title ?? '')) {
    errors.push('中文标题必须是 Agent Harness 内部原理');
  }
  if (typeof manifest.concept !== 'string' || !han.test(manifest.concept)) errors.push('品牌概念必须使用中文说明');
  if (/(?:机器人|吉祥物|厂商\s*Logo|供应商\s*Logo)/iu.test(manifest.concept ?? '')) {
    errors.push('品牌概念命中禁用概念：机器人、吉祥物或厂商 Logo');
  }
  for (const [key, expected] of Object.entries(requiredAssets)) {
    const actual = manifest.assets?.[key];
    if (actual !== expected) errors.push(`正式资产 ${key} 必须是 ${expected}`);
    else if (!safeRelativePath(actual)) errors.push(`正式资产 ${key} 必须使用仓库相对路径`);
  }
  if (manifest.socialPreview?.width !== 1280 || manifest.socialPreview?.height !== 640) {
    errors.push('Social preview 尺寸必须是 1280×640');
  }
  if (manifest.status === 'published') {
    if (typeof manifest.winner !== 'string' || !manifest.winner.trim()) errors.push('发布状态必须记录评审赢家');
    if (options.root) {
      for (const path of Object.values(requiredAssets)) {
        if (!existsSync(join(options.root, path))) errors.push(`发布状态缺少正式资产：${path}`);
      }
    }
  } else if (manifest.winner !== null) {
    errors.push('设计状态的评审赢家必须是 null');
  }
  return errors;
}

export function validateRepositoryMetadata(metadata) {
  const errors = [];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ['GitHub 元数据必须是对象'];
  if (metadata.schemaVersion !== 1) errors.push('GitHub 元数据 schemaVersion 必须是 1');
  if (metadata.name !== 'agent-harness-internals') errors.push('GitHub 仓库名必须是 agent-harness-internals');
  if (metadata.visibility !== 'public') errors.push('GitHub 仓库必须保持 public');
  if (metadata.defaultBranch !== 'main') errors.push('GitHub 默认分支必须是 main');
  if (typeof metadata.about !== 'string' || !han.test(metadata.about)) errors.push('必须提供中文 About');
  else if (metadata.about.length > 160) errors.push('中文 About 不能超过 160 个字符');
  if (!Array.isArray(metadata.topics)) {
    errors.push('Topics 必须是数组');
  } else {
    for (const topic of metadata.topics) {
      if (typeof topic !== 'string' || !/^[a-z0-9][a-z0-9-]{0,49}$/u.test(topic)) errors.push(`Topic 非法：${topic}`);
    }
    for (const topic of requiredTopics) {
      if (!metadata.topics.includes(topic)) errors.push(`缺少核心 Topic：${topic}`);
    }
  }
  if (!safeRelativePath(metadata.socialPreview) || metadata.socialPreview !== requiredAssets.socialPng) {
    errors.push('Social preview 必须使用正式 PNG 的仓库相对路径');
  }
  if (metadata.applyAt !== 'phase-6-deployment') errors.push('GitHub 元数据只能在最终部署阶段应用');
  if (!Array.isArray(metadata.branchProtection?.requiredStatusChecks)
    || !metadata.branchProtection.requiredStatusChecks.includes('verify')) {
    errors.push('分支保护必须要求 verify 状态检查');
  }
  return errors;
}

export function validateRepositoryIdentity({ packageJson, workflow, readme, nvmrcExists }) {
  const errors = [];
  if (packageJson?.name !== 'agent-harness-internals') errors.push('package.json 包名必须是 agent-harness-internals');
  if (packageJson?.engines?.node !== '>=24.0.0 <25') errors.push('Node 版本契约必须固定为 Node 24');
  if (typeof workflow !== 'string' || !/^name:\s*仓库验证\s*$/mu.test(workflow)
    || !/^\s*node-version:\s*['"]?24['"]?\s*$/mu.test(workflow)) {
    errors.push('GitHub 工作流必须使用中文名称并显式配置 Node 24');
  }
  for (const match of (workflow ?? '').matchAll(/^(?:name:|\s*-\s+name:)\s*(.+?)\s*$/gmu)) {
    if (!han.test(match[1])) errors.push(`GitHub 工作流可见名称必须使用中文：${match[1]}`);
  }
  if (nvmrcExists || /(?:node-version-file\s*:|\.nvmrc|\bnvm\b)/iu.test(workflow ?? '')) {
    errors.push('仓库不得依赖 NVM 或 .nvmrc');
  }
  if (typeof readme !== 'string' || !readme.includes('github.com/plwslpld-arch/agent-harness-internals')) {
    errors.push('README 缺少新远端地址');
  }
  if (/github\.com\/plwslpld-arch\/harness-internals/u.test(readme ?? '')) errors.push('README 仍含旧远端地址');
  return errors;
}

export function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)
    || buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('文件不是有效的 PNG');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export function validateBrandPublication(manifest, diagramManifest, options = {}) {
  const errors = validateBrandManifest(manifest, options);
  if (manifest?.status !== 'published') errors.push('正式品牌必须处于 published 状态');
  if (manifest?.winner !== 'candidate-b-bracket') errors.push('正式品牌必须来自已通过复核的约束括架赢家');
  const entries = new Map((diagramManifest?.diagrams ?? []).map((entry) => [entry.path, entry]));
  for (const path of [requiredAssets.mark, requiredAssets.lockup, requiredAssets.socialSvg]) {
    const entry = entries.get(path);
    if (!entry) errors.push(`正式品牌 SVG 未登记到图示 Manifest：${path}`);
    else if (entry.type !== 'brand' || entry.scope !== 'repository') errors.push(`正式品牌 SVG 登记类型错误：${path}`);
  }
  if (options.root && existsSync(join(options.root, requiredAssets.socialPng))) {
    try {
      const dimensions = pngDimensions(readFileSync(join(options.root, requiredAssets.socialPng)));
      if (dimensions.width !== 1280 || dimensions.height !== 640) errors.push('正式 Social preview PNG 必须是 1280×640');
    } catch (error) {
      errors.push(`正式 Social preview PNG 无效：${error.message}`);
    }
    const selectionPath = join(options.root, 'evidence', 'reviews', '2026-08-23-brand-selection.yml');
    if (!existsSync(selectionPath)) errors.push('缺少 Logo 选择复核记录');
    else if (readDocument(selectionPath).selection?.winner !== manifest.winner) errors.push('正式品牌与 Logo 选择复核赢家不一致');
  }
  return errors;
}

export function validateReadme(content) {
  const errors = [];
  if (typeof content !== 'string') return ['README 必须是文本'];
  if (!/<img\b[^>]*src=["']assets\/brand\/logo-lockup\.svg["'][^>]*alt=["'][^"']*[\u3400-\u9fff][^"']*["']/iu.test(content)
    && !/<img\b[^>]*alt=["'][^"']*[\u3400-\u9fff][^"']*["'][^>]*src=["']assets\/brand\/logo-lockup\.svg["']/iu.test(content)) {
    errors.push('README 顶部必须使用带中文替代文本的正式中文组合标');
  }
  const required = [
    'Agent Harness 内部原理', 'Agent Harness 是唯一主线', 'Eval 是横切验证能力', '当前状态', '阅读路径',
    '证据等级', '能力状态', '锁定来源', 'Node 24', 'npm run check', '不证明生产就绪', '不是任何上游项目的官方仓库',
  ];
  for (const phrase of required) if (!content.includes(phrase)) errors.push(`README 缺少必要说明：${phrase}`);
  for (const harness of ['DSH', 'Codex', 'Gemini CLI', 'Claude', 'pi', 'OpenCode']) {
    if (!content.includes(harness)) errors.push(`README 缺少一级主线：${harness}`);
  }
  for (const status of ['outline', 'draft', 'reviewed', 'verified', 'stale']) {
    if (!new RegExp(`\\b${status}\\b`, 'u').test(content)) errors.push(`README 缺少文章状态：${status}`);
  }
  for (const grade of ['A', 'B', 'C', 'D', 'U']) {
    if (!new RegExp(`(?:^|[|、/ ])${grade}(?:$|[|、/ ])`, 'mu').test(content)) errors.push(`README 缺少证据等级：${grade}`);
  }
  const oldPatterns = [
    /assets\/(?:harness-internals|harness-coupling|agent-harness-matrix|dsh-codex-subsystems|harness-model-cross)\.svg/u,
    /README\.en\.md/u,
    /两种 harness，一个可核对的源码知识库/iu,
    /plwslpld-arch\/harness-internals/u,
    /<h1[^>]*>\s*Harness Internals\s*<\/h1>/iu,
  ];
  if (oldPatterns.some((pattern) => pattern.test(content))) errors.push('README 仍含旧定位、旧仓库标识或旧视觉');
  if (/\[(?:English|英文)\]\([^)]*\)/iu.test(content)) errors.push('README 不得提供英文入口');
  if (/(?:可直接证明生产就绪|已经生产就绪|保证生产就绪|所有课程已经完整覆盖)/u.test(content)) errors.push('README 含过度承诺');
  return errors;
}

function main() {
  const brand = readDocument(join(root, 'assets', 'brand', 'brand.yml'));
  const metadata = readDocument(join(root, '.github', 'repository-metadata.yml'));
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const packageJson = readDocument(join(root, 'package.json'));
  const workflow = ['verify.yml', 'drift.yml']
    .map((name) => readFileSync(join(root, '.github', 'workflows', name), 'utf8'))
    .join('\n');
  const errors = [
    ...validateBrandPublication(brand, readDocument(join(root, 'assets', 'diagrams', 'manifest.yml')), { root }),
    ...validateRepositoryMetadata(metadata),
    ...validateReadme(readme),
    ...validateRepositoryIdentity({ packageJson, workflow, readme, nvmrcExists: existsSync(join(root, '.nvmrc')) }),
  ];
  if (!fail(errors)) console.log(`品牌门禁：${brand.title}（${brand.status}），GitHub 元数据等待最终部署阶段应用`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
