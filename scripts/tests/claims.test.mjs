import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { validateClaim } from '../verify-claims.mjs';
import { readDocument, root } from '../lib.mjs';

const commit = '0123456789012345678901234567890123456789';
const sourceText = [
  'export function decide(command) {',
  '  return command.length > 0;',
  '}',
  '',
  'test("rejects empty commands", () => {});',
].join('\n');

const context = {
  sourceIds: new Set(['codex']),
  locks: new Map([['codex', { commit }]]),
  readSource: () => sourceText,
  experimentExists: (id) => id === 'codex-command-policy',
};

const sourceEvidence = {
  type: 'source',
  source: 'codex',
  path: 'codex-rs/core/src/lib.rs',
  commit,
  lines: '1-3',
  excerpt: 'return command.length > 0',
};

const testEvidence = {
  type: 'upstream-test',
  source: 'codex',
  path: 'codex-rs/core/tests/policy.rs',
  commit,
  lines: '5',
  excerpt: 'rejects empty commands',
};

function validClaim(overrides = {}) {
  return {
    id: 'codex.permissions.command-policy',
    harness: 'codex',
    dimension: 'permissions.command-policy',
    statement: '命令策略在执行前参与判定。',
    capability: 'default',
    version: commit,
    surface: 'CLI',
    platform: 'all',
    mode: 'default',
    evidence_level: 'B',
    evidence: [sourceEvidence, testEvidence],
    last_verified: '2026-08-23',
    ...overrides,
  };
}

test('完整 Claim 通过校验', () => {
  assert.deepEqual(validateClaim(validClaim(), context), []);
});

test('拒绝非法能力状态、证据等级和缺失限定条件', () => {
  assert.match(validateClaim(validClaim({ capability: 'built-in' }), context).join('\n'), /capability/u);
  assert.match(validateClaim(validClaim({ evidence_level: 'S' }), context).join('\n'), /evidence_level/u);
  assert.match(validateClaim(validClaim({ platform: '' }), context).join('\n'), /缺少 platform/u);
});

test('拒绝与 Lock 不一致的 Commit 和不匹配的源码摘录', () => {
  const wrongCommit = 'f'.repeat(40);
  assert.match(validateClaim(validClaim({
    evidence: [{ ...sourceEvidence, commit: wrongCommit }, testEvidence],
  }), context).join('\n'), /与 lock 不一致/u);
  assert.match(validateClaim(validClaim({
    evidence: [{ ...sourceEvidence, excerpt: '不存在的实现' }, testEvidence],
  }), context).join('\n'), /摘录与源码区间不匹配/u);
});

test('unknown 与 U 不要求伪造源码证据', () => {
  assert.deepEqual(validateClaim(validClaim({
    capability: 'unknown',
    evidence_level: 'U',
    evidence: [],
  }), context), []);
});

test('D 必须解释推断，A 必须同时具备源码、上游测试和实验', () => {
  assert.match(validateClaim(validClaim({
    evidence_level: 'D',
    evidence: [sourceEvidence],
  }), context).join('\n'), /inference/u);

  const experiment = { type: 'experiment', id: 'codex-command-policy' };
  assert.match(validateClaim(validClaim({
    evidence_level: 'A',
    evidence: [sourceEvidence, testEvidence],
  }), context).join('\n'), /experiment/u);
  assert.deepEqual(validateClaim(validClaim({
    evidence_level: 'A',
    evidence: [sourceEvidence, testEvidence, experiment],
  }), context), []);
});

test('实验和官方文档证据必须可核对', () => {
  assert.match(validateClaim(validClaim({
    evidence_level: 'A',
    evidence: [sourceEvidence, testEvidence, { type: 'experiment', id: 'missing' }],
  }), context).join('\n'), /实验记录不存在/u);
  assert.match(validateClaim(validClaim({
    evidence_level: 'C',
    evidence: [{ type: 'official-doc', title: '文档', url: 'http://example.com', accessed: '2026-08-23' }],
  }), context).join('\n'), /HTTPS/u);
});

test('合成 Schema 示例本身可执行且不冒充真实结论', () => {
  const example = readDocument(join(root, 'evidence', 'claims', 'schema.example.yml'));

  assert.deepEqual(validateClaim(example, context), []);
  assert.equal(example.capability, 'unknown');
  assert.equal(example.evidence_level, 'U');
  assert.deepEqual(example.evidence, []);
});
