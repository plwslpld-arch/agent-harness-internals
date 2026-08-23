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
const requiredTopics = ['agent-harness', 'source-code-analysis', 'ai-evaluation'];

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

function main() {
  const brand = readDocument(join(root, 'assets', 'brand', 'brand.yml'));
  const metadata = readDocument(join(root, '.github', 'repository-metadata.yml'));
  const errors = [
    ...validateBrandPublication(brand, readDocument(join(root, 'assets', 'diagrams', 'manifest.yml')), { root }),
    ...validateRepositoryMetadata(metadata),
  ];
  if (!fail(errors)) console.log(`品牌门禁：${brand.title}（${brand.status}），GitHub 元数据等待最终部署阶段应用`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
