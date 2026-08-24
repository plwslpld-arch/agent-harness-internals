import assert from 'node:assert/strict';
import test from 'node:test';
import {
  manifestFailures,
  visualFailures,
} from '../check-visuals.mjs';

const entry = {
  id: 'codex-tool-flow',
  path: 'assets/diagrams/codex-tool-flow.svg',
  type: 'flow',
  scope: 'codex',
  alt: 'Codex 工具调用流程图',
  claims: [],
};

function svg(body = '<text>Codex</text><text>MCP</text><text>Session</text>') {
  return `<svg xmlns="http://www.w3.org/2000/svg">
  <title>Codex 工具流程</title>
  <desc>展示请求、策略与执行结果之间的关系。</desc>
  ${body}
</svg>`;
}

test('中文可访问元数据和允许的专名通过', () => {
  assert.deepEqual(visualFailures({ path: entry.path, content: svg() }, entry), []);
  assert.deepEqual(visualFailures({
    path: entry.path,
    content: svg('<text>六条主线：DSH、Codex、Gemini CLI、Claude、pi、OpenCode</text>'),
  }, entry), []);
  assert.deepEqual(visualFailures({
    path: entry.path,
    content: svg('<text>macOS、Linux 与 Windows 使用不同平台后端</text>'),
  }, entry), []);
  assert.deepEqual(visualFailures({
    path: entry.path,
    content: svg('<text>Skill、Plugin、Connector 与 Code Mode 受 Feature 和 Schema 约束</text>'),
  }, entry), []);
  assert.deepEqual(visualFailures({
    path: entry.path,
    content: svg('<text>Thread、Session、Turn 与 Rollout 共同服务一个 Trial</text>'),
  }, entry), []);
  assert.deepEqual(visualFailures({
    path: entry.path,
    content: svg('<text>App Server、MCP Server、Cloud、OTel 与 Feedback 为 Artifact、Scorer 和 RewardAdapter 提供证据</text>'),
  }, entry), []);
});

test('缺少中文 title 或 desc 会失败', () => {
  assert.match(visualFailures({ path: entry.path, content: svg().replace('<title>Codex 工具流程</title>', '<title>Codex flow</title>') }, entry).join('\n'), /中文 <title>/u);
  assert.match(visualFailures({ path: entry.path, content: svg().replace('<desc>展示请求、策略与执行结果之间的关系。</desc>', '') }, entry).join('\n'), /中文 <desc>/u);
});

test('完整英文说明句不能借专名白名单逃逸', () => {
  const content = svg('<text>Requests flow through Codex tools.</text>');

  assert.match(visualFailures({ path: entry.path, content }, entry).join('\n'), /未解释的英文自然语言/u);
  assert.match(visualFailures({
    path: entry.path,
    content: svg('<text>说明：Requests flow through Codex tools.</text>'),
  }, entry).join('\n'), /未解释的英文自然语言/u);
  assert.match(visualFailures({
    path: entry.path,
    content: svg().replace('展示请求、策略与执行结果之间的关系。', '说明：Requests flow through tools.'),
  }, entry).join('\n'), /未解释的英文自然语言/u);
});

test('Manifest 缺少中文替代文本或源文件不存在会失败', () => {
  assert.match(visualFailures({ path: entry.path, content: svg() }, { ...entry, alt: 'Codex tool flow' }).join('\n'), /中文 alt/u);
  assert.match(visualFailures({ path: entry.path, content: svg() }, { ...entry, alt: '说明 Codex tool flow' }).join('\n'), /alt 含未解释的英文/u);
  assert.match(visualFailures(null, entry).join('\n'), /源文件不存在/u);
});

test('Manifest 要求完整字段、合法类型且不能重复', () => {
  const manifest = { schemaVersion: 1, diagrams: [entry, { ...entry }] };
  const failures = manifestFailures(manifest);

  assert.match(failures.join('\n'), /重复的图示 id/u);
  assert.match(failures.join('\n'), /重复的图示 path/u);
  assert.match(manifestFailures({ schemaVersion: 1, diagrams: [{ ...entry, type: 'decorative', claims: undefined }] }).join('\n'), /type 非法/u);
});

test('拒绝脚本、事件处理器和外部资源', () => {
  const unsafe = svg('<script>alert(1)</script><image href="https://example.com/a.png" onload="run()"/>');
  const failures = visualFailures({ path: entry.path, content: unsafe }, entry).join('\n');

  assert.match(failures, /不安全元素/u);
  assert.match(failures, /事件处理器/u);
  assert.match(failures, /外部资源/u);
});
