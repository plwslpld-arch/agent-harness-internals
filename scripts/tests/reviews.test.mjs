import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewFailures } from '../verify-reviews.mjs';

const commit = '0123456789012345678901234567890123456789';

function validReview(overrides = {}) {
  return {
    stage: 'phase-0-foundation',
    date: '2026-08-23',
    commit,
    promises: [
      { id: 'p-source-profiles', statement: '默认只要求核心来源。' },
      { id: 'p-visual-chinese', statement: '正式 SVG 的说明文字使用中文。' },
    ],
    evidence: [
      { id: 'e-source-test', promise: 'p-source-profiles', type: 'test', reference: 'scripts/tests/source-profiles.test.mjs', summary: '来源配置测试通过。' },
      { id: 'e-visual-test', promise: 'p-visual-chinese', type: 'test', reference: 'scripts/tests/visuals.test.mjs', summary: '中文视觉测试通过。' },
    ],
    findings: [
      { id: 'f-profile-bypass', priority: 'high', status: 'resolved', summary: '默认配置曾可能漏验核心来源。' },
    ],
    resolutions: [
      { id: 'f-profile-bypass', action: '增加默认配置与双 SDK 断言。', evidence: ['e-source-test'] },
    ],
    commands: [
      { command: 'node --test scripts/tests/source-profiles.test.mjs', exit_code: 0, summary: '来源配置测试通过。' },
    ],
    result: 'pass',
    ...overrides,
  };
}

test('完整阶段复核记录通过', () => {
  assert.deepEqual(reviewFailures(validReview()), []);
});

test('必需字段、完整 SHA 和命令退出码不可缺失', () => {
  assert.match(reviewFailures(validReview({ stage: '' })).join('\n'), /缺少 stage/u);
  assert.match(reviewFailures(validReview({ commit: 'short' })).join('\n'), /完整 SHA/u);
  assert.match(reviewFailures(validReview({ commands: [{ command: 'node --test' }] })).join('\n'), /exit_code/u);
  assert.match(reviewFailures(validReview({
    commands: [{ command: 'node --test', exit_code: 1, summary: '测试失败。' }],
  })).join('\n'), /pass.*退出码 1/u);
});

test('每个 Promise 必须至少映射一项 Evidence', () => {
  const evidence = validReview().evidence.filter(({ promise }) => promise !== 'p-visual-chinese');

  assert.match(reviewFailures(validReview({ evidence })).join('\n'), /p-visual-chinese.*没有 Evidence/u);
});

test('pass 不能掩盖未解决的高优先级发现', () => {
  const findings = [{ id: 'f-critical', priority: 'high', status: 'open', summary: '仍可绕过门禁。' }];

  assert.match(reviewFailures(validReview({ findings, resolutions: [] })).join('\n'), /未解决的高优先级发现/u);
});

test('高优先级发现必须使用相同 ID 的 Resolution 并引用有效证据', () => {
  const resolutions = [{ id: 'f-other', action: '错误映射。', evidence: ['missing-evidence'] }];
  const failures = reviewFailures(validReview({ resolutions })).join('\n');

  assert.match(failures, /f-profile-bypass.*没有同 ID Resolution/u);
  assert.match(failures, /不存在的 Evidence/u);
});
