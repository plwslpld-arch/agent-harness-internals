import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  pngDimensions,
  validateBrandManifest,
  validateBrandPublication,
  validateReadme,
  validateRepositoryIdentity,
  validateRepositoryMetadata,
} from '../check-brand.mjs';
import { readDocument, root } from '../lib.mjs';

const brand = {
  schemaVersion: 1,
  status: 'designing',
  repository: 'agent-harness-internals',
  title: 'Agent Harness 内部原理',
  concept: '用抽象的约束边界、任务轨迹和核对点表达 Harness 内部结构。',
  winner: null,
  assets: {
    mark: 'assets/brand/logo-mark.svg',
    lockup: 'assets/brand/logo-lockup.svg',
    socialSvg: 'assets/brand/social-preview.svg',
    socialPng: 'assets/brand/social-preview.png',
  },
  socialPreview: { width: 1280, height: 640 },
};

const metadata = {
  schemaVersion: 1,
  name: 'agent-harness-internals',
  visibility: 'public',
  defaultBranch: 'main',
  about: '以 Agent Harness 为主线的中文源码知识库，覆盖六种实现及其评测接入。',
  topics: [
    'agent-harness',
    'coding-agents',
    'source-code-analysis',
    'ai-evaluation',
    'deepseek-harness',
    'openai-codex',
    'gemini-cli',
    'claude-code',
    'pi-coding-agent',
    'opencode',
    'chinese',
  ],
  socialPreview: 'assets/brand/social-preview.png',
  applyAt: 'phase-6-deployment',
  branchProtection: { requiredStatusChecks: ['verify'] },
};

test('阶段设计中的品牌与仓库元数据通过', () => {
  assert.deepEqual(validateBrandManifest(brand), []);
  assert.deepEqual(validateRepositoryMetadata(metadata), []);
});

test('品牌名称、中文标题和 Social preview 尺寸固定', () => {
  assert.match(validateBrandManifest({ ...brand, repository: 'harness-internals' }).join('\n'), /仓库标识/u);
  assert.match(validateBrandManifest({ ...brand, title: 'Harness Internals' }).join('\n'), /中文标题/u);
  assert.match(validateBrandManifest({ ...brand, socialPreview: { width: 1200, height: 630 } }).join('\n'), /1280×640/u);
});

test('品牌概念拒绝机器人、吉祥物和厂商 Logo', () => {
  for (const concept of ['使用机器人脸作为核心标记。', '设计一个可爱的吉祥物。', '拼贴厂商 Logo。']) {
    assert.match(validateBrandManifest({ ...brand, concept }).join('\n'), /禁用概念/u);
  }
});

test('发布状态要求赢家和四个正式资产', () => {
  const published = { ...brand, status: 'published', winner: null, assets: { mark: 'logo.svg' } };
  const failures = validateBrandManifest(published).join('\n');

  assert.match(failures, /评审赢家/u);
  assert.match(failures, /logo-lockup\.svg/u);
  assert.match(failures, /social-preview\.png/u);
});

test('GitHub 元数据要求中文 About、核心 Topics 和最终阶段应用', () => {
  assert.match(validateRepositoryMetadata({ ...metadata, about: 'Source-verifiable agent harness knowledge base.' }).join('\n'), /中文 About/u);
  assert.match(validateRepositoryMetadata({ ...metadata, topics: ['coding-agents'] }).join('\n'), /核心 Topic/u);
  assert.match(validateRepositoryMetadata({ ...metadata, applyAt: 'now' }).join('\n'), /最终部署阶段/u);
});

test('仓库元数据拒绝绝对路径和非法 Topic', () => {
  assert.match(validateRepositoryMetadata({ ...metadata, socialPreview: 'C:/temp/preview.png' }).join('\n'), /仓库相对路径/u);
  assert.match(validateRepositoryMetadata({ ...metadata, topics: [...metadata.topics, 'Agent Harness'] }).join('\n'), /Topic 非法/u);
});

test('正式品牌资产来自评审赢家且 Social preview 尺寸正确', () => {
  const actualBrand = readDocument(join(root, 'assets', 'brand', 'brand.yml'));
  const diagrams = readDocument(join(root, 'assets', 'diagrams', 'manifest.yml'));
  const preview = readFileSync(join(root, actualBrand.assets.socialPng));

  assert.equal(actualBrand.status, 'published');
  assert.equal(actualBrand.winner, 'candidate-b-bracket');
  assert.deepEqual(pngDimensions(preview), { width: 1280, height: 640 });
  assert.deepEqual(validateBrandPublication(actualBrand, diagrams, { root }), []);
});

test('README 使用正式组合标并完整解释定位、状态和证据边界', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');

  assert.deepEqual(validateReadme(readme), []);
});

test('README 契约拒绝旧定位、英文入口和过度承诺', () => {
  const bad = `<img src="assets/harness-internals.svg" alt="Harness Internals">
# Harness Internals
两种 harness，一个可核对的源码知识库
[English](README.en.md)
所有课程已经完整覆盖，可直接证明生产就绪。
`;
  const failures = validateReadme(bad).join('\n');

  assert.match(failures, /正式中文组合标/u);
  assert.match(failures, /旧定位/u);
  assert.match(failures, /英文入口/u);
  assert.match(failures, /过度承诺/u);
});

test('包名、Node 24 工作流和目标仓库标识一致', () => {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const workflow = ['verify.yml', 'drift.yml']
    .map((name) => readFileSync(join(root, '.github', 'workflows', name), 'utf8'))
    .join('\n');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');

  assert.deepEqual(validateRepositoryIdentity({
    packageJson,
    workflow,
    readme,
    nvmrcExists: existsSync(join(root, '.nvmrc')),
  }), []);
});

test('仓库身份契约拒绝旧包名、NVM 和旧远端地址', () => {
  const failures = validateRepositoryIdentity({
    packageJson: { name: 'harness-internals', engines: { node: '>=22' } },
    workflow: 'name: Verify\nnode-version-file: .nvmrc\n',
    readme: 'https://github.com/plwslpld-arch/harness-internals',
    nvmrcExists: true,
  }).join('\n');

  assert.match(failures, /包名/u);
  assert.match(failures, /Node 24/u);
  assert.match(failures, /NVM/u);
  assert.match(failures, /旧远端地址/u);
});
