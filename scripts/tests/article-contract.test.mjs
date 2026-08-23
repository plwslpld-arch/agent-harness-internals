import assert from 'node:assert/strict';
import test from 'node:test';
import {
  articleMetadataFailures,
  validOfficialDocumentSource,
} from '../analysis-metadata.mjs';

const repositorySource = {
  repo: 'codex',
  path: 'codex-rs/core/src/codex.rs',
  commit: '0123456789012345678901234567890123456789',
};

function harnessMetadata(overrides = {}) {
  return {
    title: 'Codex 工具系统',
    article_type: 'harness',
    harness: 'codex',
    status: 'reviewed',
    last_verified: '2026-08-23',
    sources: [repositorySource],
    ...overrides,
  };
}

test('新文章要求目录类型匹配并为 Harness 文章声明 harness', () => {
  assert.deepEqual(articleMetadataFailures('docs/harnesses/codex/03-tools.md', harnessMetadata()), []);
  assert.match(
    articleMetadataFailures('docs/harnesses/codex/03-tools.md', harnessMetadata({ harness: '' })).join('\n'),
    /缺少 harness/u,
  );
  assert.match(
    articleMetadataFailures('docs/harnesses/codex/03-tools.md', harnessMetadata({ article_type: 'comparison' })).join('\n'),
    /article_type 必须是 harness/u,
  );
});

test('只有 outline 可以使用空来源数组', () => {
  assert.deepEqual(articleMetadataFailures('docs/foundations/01-one-turn.md', {
    title: '一轮请求',
    article_type: 'foundation',
    status: 'outline',
    last_verified: '2026-08-23',
    sources: [],
  }), []);
  assert.match(articleMetadataFailures('docs/foundations/01-one-turn.md', {
    title: '一轮请求',
    article_type: 'foundation',
    status: 'draft',
    last_verified: '2026-08-23',
    sources: [],
  }).join('\n'), /只有 outline 可以使用空 sources/u);
});

test('官方文档来源必须具备标题、HTTPS URL 和访问日期', () => {
  assert.equal(validOfficialDocumentSource({
    type: 'official-doc',
    title: 'Claude Agent SDK 概览',
    url: 'https://docs.anthropic.com/example',
    accessed: '2026-08-23',
  }), true);
  assert.equal(validOfficialDocumentSource({
    type: 'official-doc',
    title: '不安全链接',
    url: 'http://example.com',
    accessed: '2026-08-23',
  }), false);
});
