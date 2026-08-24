import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentContractFailures,
} from '../check-content-contract.mjs';

const lockedSource = 'https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/codex_thread.rs#L130-L160';

function sourceGuide(overrides = '') {
  return `# Codex 的一次工具调用

这篇沿着一次真实任务回答：模型提出命令后，Codex 怎样把它变成受控制的执行结果。

## 先看任务

用户要求读取仓库状态。模型可以提出命令，但命令在策略和执行环境完成检查之前不会产生副作用。

\`\`\`json
{"tool":"shell","command":"git status --short"}
\`\`\`

## 仓库地图

- \`codex-rs/core\`：任务循环和会话状态。
- \`codex-rs/exec\`：无头运行入口。

## 沿调用链读源码

### 第 1 站：任务怎样进入核心循环

[查看锁定版本源码](${lockedSource})

\`\`\`rust
pub async fn run(&mut self) {
    // 上游源码节选；正文解释调用关系。
}
\`\`\`

- 调用者：无头入口或交互表面。
- 输入：用户任务和会话配置。
- 状态变化：创建本轮执行状态。
- 返回：事件进入统一输出流。
- 下一站：工具请求的分派函数。

## 回到任务

现在可以区分模型意图、策略决定和系统执行。即使模型提出命令，Harness 仍可以拒绝或要求确认。

## 怎样核对

打开永久链接确认符号和提交，再运行对应上游测试观察事件顺序。

${overrides}
`;
}

test('源码导读不依赖 Frontmatter、固定标题、固定篇幅或自检题', () => {
  assert.deepEqual(contentContractFailures({
    relativePath: 'docs/harnesses/codex/02-tool-loop.md',
    content: sourceGuide(),
  }), []);
});

test('公共文章拒绝内部状态、阶段验收、Claim ID 和公开 Frontmatter', () => {
  const cases = [
    ['---\nstatus: reviewed\n---\n# 标题\n', /Frontmatter/u],
    ['# 标题\n\n当前状态：已完成阶段验收。', /内部进度/u],
    ['# 标题\n\n本页已经 reviewed 并通过门禁。', /内部进度/u],
    ['# 标题\n\nClaim: codex.tools.dispatch', /Claim ID/u],
  ];

  for (const [text, expected] of cases) {
    assert.match(contentContractFailures({ relativePath: 'README.md', content: text }).join('\n'), expected);
  }
});

test('普通文案使用 DeepSeek Harness 全称，真实标识符允许保留 DSH', () => {
  assert.match(
    contentContractFailures({ relativePath: 'docs/00-start-here.md', content: '# DSH 的运行循环\n' }).join('\n'),
    /DeepSeek Harness 全称/u,
  );
  assert.deepEqual(
    contentContractFailures({ relativePath: 'docs/example.md', content: '# 配置示例\n\n使用 `$DSH_HOME` 和 `dsh.profile.bundles`。' }),
    [],
  );
});

test('源码课程要求提交级永久链接并拒绝 source 语言围栏', () => {
  assert.match(
    contentContractFailures({
      relativePath: 'docs/harnesses/codex/02-tool-loop.md',
      content: sourceGuide().replace(lockedSource, 'codex-rs/core/src/codex.rs:130-160'),
    }).join('\n'),
    /永久链接/u,
  );
  assert.match(
    contentContractFailures({
      relativePath: 'docs/harnesses/codex/02-tool-loop.md',
      content: sourceGuide().replace('```rust', '```source'),
    }).join('\n'),
    /语言标记/u,
  );
});

test('源码站点必须解释调用者、输入、状态、返回和下一站', () => {
  const missing = sourceGuide().replace('- 状态变化：创建本轮执行状态。\n', '');
  assert.match(
    contentContractFailures({ relativePath: 'docs/harnesses/codex/02-tool-loop.md', content: missing }).join('\n'),
    /状态变化/u,
  );
});

test('永久链接必须对应 sources 中的上游地址与锁定提交', () => {
  const wrongCommit = sourceGuide().replace(
    'c9b19deb09c1841ce7acc33ddb96276030936a29',
    '1111111111111111111111111111111111111111',
  );
  assert.match(
    contentContractFailures({ relativePath: 'docs/harnesses/codex/02-tool-loop.md', content: wrongCommit }).join('\n'),
    /锁定来源/u,
  );

  const wrongRepository = sourceGuide().replace('https://github.com/openai/codex/', 'https://github.com/example/codex/');
  assert.match(
    contentContractFailures({ relativePath: 'docs/harnesses/codex/02-tool-loop.md', content: wrongRepository }).join('\n'),
    /锁定来源/u,
  );
});

test('机制样本至少提供两个可直接打开的锁定源码链接', () => {
  const aiderSource = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/repomap.py#L103-L135';
  const oneLink = `# Aider 的上下文投影\n\n[查看源码](${aiderSource})\n`;
  assert.match(
    contentContractFailures({ relativePath: 'docs/samples/aider.md', content: oneLink }).join('\n'),
    /至少需要 2 个/u,
  );
  assert.deepEqual(
    contentContractFailures({
      relativePath: 'docs/samples/aider.md',
      content: `${oneLink}\n[再看一处源码](${aiderSource})\n`,
    }),
    [],
  );
});
