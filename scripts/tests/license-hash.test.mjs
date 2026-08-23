import { strictEqual, notStrictEqual } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readDocument, root, sha256, sha256Text } from '../lib.mjs';

// Windows 上 core.autocrlf=true 会把 checkout 出来的 LICENSE 换成 CRLF。
// 逐字节哈希因此对不上 lock，门禁在 Windows 上永远失败。归一化之后
// 同一份条款不管哪种换行都得到同一个哈希。
const dir = mkdtempSync(join(tmpdir(), 'license-hash-'));
const lf = join(dir, 'LICENSE.lf');
const crlf = join(dir, 'LICENSE.crlf');
const body = ['MIT License', '', 'Permission is hereby granted, free of charge.', ''];
writeFileSync(lf, body.join('\n'));
writeFileSync(crlf, body.join('\r\n'));

test('sha256Text treats CRLF and LF as the same license text', () => {
  strictEqual(sha256Text(crlf), sha256Text(lf));
});

test('byte-level sha256 still differs, which is why the text variant exists', () => {
  notStrictEqual(sha256(crlf), sha256(lf));
});

test('sha256Text still detects a real change to the terms', () => {
  const changed = join(dir, 'LICENSE.changed');
  writeFileSync(changed, ['MIT License', '', 'Permission is NOT granted.', ''].join('\n'));
  notStrictEqual(sha256Text(changed), sha256Text(lf));
});

test('Claude 双 SDK 分别锁定实际许可证条款', () => {
  const manifest = readDocument(join(root, 'sources', 'sources.yml'));
  const lock = readDocument(join(root, 'sources', 'sources.lock.yml'));
  const byId = new Map(manifest.sources.map((source) => [source.id, source]));
  const locks = new Map(lock.sources.map((source) => [source.id, source]));

  strictEqual(byId.get('claude-agent-sdk-python').license.spdx, 'MIT');
  strictEqual(byId.get('claude-agent-sdk-python').license.file, 'LICENSE');
  strictEqual(byId.get('claude-agent-sdk-typescript').license.spdx, 'LicenseRef-Anthropic-Commercial-Terms');
  strictEqual(byId.get('claude-agent-sdk-typescript').license.file, 'LICENSE.md');
  strictEqual(
    sha256Text(join(root, 'sources', 'checkouts', 'claude-agent-sdk-typescript', 'LICENSE.md')),
    locks.get('claude-agent-sdk-typescript').licenseSha256,
  );
  strictEqual(
    readFileSync(join(root, 'sources', 'checkouts', 'claude-agent-sdk-typescript', 'LICENSE.md'), 'utf8').includes('Commercial Terms of Service'),
    true,
  );
});
