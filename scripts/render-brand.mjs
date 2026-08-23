#!/usr/bin/env node
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './lib.mjs';

function loadSharp() {
  const externalModules = process.env.BRAND_RENDER_NODE_MODULES;
  const require = externalModules
    ? createRequire(join(resolve(externalModules), 'package.json'))
    : createRequire(import.meta.url);
  try {
    return require('sharp');
  } catch {
    throw new Error('未找到可选渲染器 sharp；请用 BRAND_RENDER_NODE_MODULES 指向外部 Node 模块目录。日常检查不需要重渲染。');
  }
}

export async function renderBrand({ projectRoot = root } = {}) {
  const sharp = loadSharp();
  const input = join(projectRoot, 'assets', 'brand', 'social-preview.svg');
  const output = join(projectRoot, 'assets', 'brand', 'social-preview.png');
  if (!existsSync(input)) throw new Error('缺少 Social preview SVG 源文件');
  mkdirSync(dirname(output), { recursive: true });
  const result = await sharp(input, { density: 96 })
    .resize(1280, 640, { fit: 'fill' })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toFile(output);
  if (result.width !== 1280 || result.height !== 640) throw new Error('渲染尺寸不是 1280×640');
  return { output: 'assets/brand/social-preview.png', width: result.width, height: result.height };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderBrand().then(({ output, width, height }) => {
    console.log(`品牌渲染完成：${output}（${width}×${height}）`);
  }).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
