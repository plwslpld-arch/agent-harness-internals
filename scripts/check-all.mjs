#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './lib.mjs';

export const checkCommands = [
  { label: '来源与核心 Checkout', args: ['scripts/verify-sources.mjs', '--profile', 'core'] },
  { label: '内容质量契约', args: ['scripts/check-content-contract.mjs'] },
  { label: '品牌与仓库元数据', args: ['scripts/check-brand.mjs'] },
  { label: '中文视觉资产', args: ['scripts/check-visuals.mjs'] },
  { label: '源码锚点', args: ['scripts/verify-anchors.mjs'] },
  { label: '中文文风', args: ['scripts/check-style.mjs'] },
  { label: '仓库可移植性', args: ['scripts/verify-portability.mjs'] },
  { label: '第三方许可证', args: ['scripts/verify-licenses.mjs'] },
  { label: '本地链接', args: ['scripts/check-links.mjs'] },
  { label: '敏感信息', args: ['scripts/scan-secrets.mjs'] },
  { label: '门禁单元测试', args: ['scripts/run-tests.mjs'] },
];

export function runChecks(commands = checkCommands) {
  for (const { label, args } of commands) {
    console.log(`\n▶ ${label}`);
    const result = spawnSync(process.execPath, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  console.log(`\n全部 ${commands.length} 组聚合检查通过（Node ${process.version}）`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runChecks();
}
