#!/usr/bin/env node
// 直接对 DeepSeek API 测四件事，用来核对 docs/02-kv-cache.md 的核心论断：
//
//   A 前缀稳定 + 只追加 → 命中率随轮次上升
//   B 改 system 的第一个 token → 整个前缀作废
//   C 易变信息放 system（被上游否决的做法） vs 放尾部 user 消息（dsh 的做法）
//   D 摘要请求：复用主对话 system/tools + 指令放尾部（dsh 的做法）
//     vs 另起一个 summarizer system prompt（被上游否决的做法）
//
// 用法：
//   export DEEPSEEK_API_KEY=...        # 只从环境变量读，绝不写进文件
//   node scripts/experiments/cache-probe.mjs [--model deepseek-v4-flash] [--json out.json]
//
// 花费很小（几十次 flash 请求），但确实会真的调用 API 并计费。
import { writeFileSync } from 'node:fs';

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error('需要 DEEPSEEK_API_KEY 环境变量；这个脚本不接受把 key 写在命令行或文件里。');
  process.exit(2);
}
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const MODEL = argOf('model', 'deepseek-v4-flash');
const JSON_OUT = argOf('json', null);

// DeepSeek 的缓存按 64-token 块匹配，system 必须足够长才谈得上命中。
// 这段文字本身没有意义，只是用来占住一个稳定且够长的前缀。
const BASE_SYSTEM = [
  'You are an AI agent powered by DeepSeek Harness.',
  'Use the read tool — not shell commands like cat — to inspect text files. Results include line numbers. Use offset and limit to continue reading large files.',
  'Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first and prefer edit for targeted changes.',
  'Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once.',
  'Use the glob tool — not shell find — to discover files by path pattern. Results are files only, never directories, and include hidden and ignored files.',
  'Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.',
  'Check the [exit code: N] marker on every bash result; investigate failures before moving on.',
  'Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one.',
  'Use goal tools for one long-running completion objective in the current session. Call get_goal before update_goal and copy its exact goal_id and revision.',
  'When you successfully create or modify files, mention the primary outputs in your final response.',
].join('\n\n');

const TOOLS = [
  { name: 'read', description: 'Read a UTF-8 text file and return its contents with line numbers.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'Absolute or workspace-relative path.' }, offset: { type: 'number', description: 'First line to read.' } }, required: ['path'] } },
  { name: 'write', description: 'Create a file or completely replace its contents.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
].map(tool => ({ type: 'function', function: tool }));

let calls = 0;
let spentPromptTokens = 0;
let spentCompletionTokens = 0;

async function ask({ system, messages, label }) {
  const body = {
    model: MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: false,
    tools: TOOLS,
    max_tokens: 40,
    temperature: 0,
  };
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  const usage = payload.usage ?? {};
  calls += 1;
  spentPromptTokens += usage.prompt_tokens ?? 0;
  spentCompletionTokens += usage.completion_tokens ?? 0;
  const hit = usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0;
  const miss = usage.prompt_cache_miss_tokens ?? (usage.prompt_tokens ?? 0) - hit;
  return {
    label,
    promptTokens: usage.prompt_tokens ?? 0,
    hit,
    miss,
    text: payload.choices?.[0]?.message?.content?.slice(0, 60) ?? '',
  };
}

const rows = [];
function record(group, row) {
  rows.push({ group, ...row });
  const rate = row.promptTokens ? ((row.hit / row.promptTokens) * 100).toFixed(1) : '0.0';
  console.log(
    `${group.padEnd(3)} ${row.label.padEnd(46)} prompt=${String(row.promptTokens).padStart(6)}  hit=${String(row.hit).padStart(6)}  miss=${String(row.miss).padStart(5)}  命中率=${rate.padStart(5)}%`,
  );
}

// 让同一个前缀先写进服务端缓存，再测命中——否则测的是「第一次」，必然全 miss。
async function warm(system, messages) {
  await ask({ system, messages, label: 'warmup' });
}

const USER_TURNS = [
  '用一句话说明你能做什么。',
  '刚才那句话里最关键的词是哪个？只回一个词。',
  '再给一个同义词，只回一个词。',
  '这三个词按长度排序，只回排序结果。',
  '总结一下我们刚才在做什么，一句话。',
];

console.log(`模型 ${MODEL}\n`);

// ── A：前缀稳定 + 只追加 ───────────────────────────────────────────────
console.log('A 前缀稳定、历史只追加（dsh 的构造方式）');
{
  const messages = [];
  for (const [index, turn] of USER_TURNS.entries()) {
    messages.push({ role: 'user', content: turn });
    const result = await ask({ system: BASE_SYSTEM, messages, label: `第 ${index + 1} 轮` });
    record('A', result);
    messages.push({ role: 'assistant', content: result.text || '(空)' });
  }
}

// ── B：改 system 的第一个 token ────────────────────────────────────────
console.log('\nB 只改 system 开头一句话（其余完全不变）');
{
  const messages = [
    { role: 'user', content: USER_TURNS[0] },
    { role: 'assistant', content: '我可以读写文件、搜索代码、执行命令。' },
    { role: 'user', content: USER_TURNS[1] },
  ];
  await warm(BASE_SYSTEM, messages);
  record('B', await ask({ system: BASE_SYSTEM, messages, label: '同一个 system（热缓存）' }));
  const mutated = BASE_SYSTEM.replace(
    'You are an AI agent powered by DeepSeek Harness.',
    'You are an AI agent powered by DeepSeek Harness (build 2).',
  );
  record('B', await ask({ system: mutated, messages, label: 'system 首句改一处' }));
}

// ── C：易变状态放 system vs 放尾部 user 消息 ───────────────────────────
console.log('\nC 权限状态变化：写进 system（被否决） vs 尾部 user 快照（dsh 的做法）');
{
  const policies = [
    'Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace.',
    'Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode.',
    'Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.',
  ];
  const history = [
    { role: 'user', content: USER_TURNS[0] },
    { role: 'assistant', content: '我可以读写文件、搜索代码、执行命令。' },
  ];

  // C1：把策略拼进 system —— 每次切换都改动请求的第一段
  for (const [index, policy] of policies.entries()) {
    const system = `${BASE_SYSTEM}\n\n${policy}`;
    const messages = [...history, { role: 'user', content: USER_TURNS[1] }];
    if (index === 0) await warm(system, messages);
    record('C1', await ask({ system, messages, label: `策略进 system · 第 ${index + 1} 次` }));
  }

  // C2：策略作为尾部 user 快照 —— system 一个字节都不动
  for (const [index, policy] of policies.entries()) {
    const messages = [
      ...history,
      { role: 'user', content: `Current runtime context. This snapshot supersedes earlier runtime-context snapshots.\n\n${policy}` },
      { role: 'user', content: USER_TURNS[1] },
    ];
    if (index === 0) await warm(BASE_SYSTEM, messages);
    record('C2', await ask({ system: BASE_SYSTEM, messages, label: `策略进尾部 user · 第 ${index + 1} 次` }));
  }
}

// ── D：摘要请求 ───────────────────────────────────────────────────────
console.log('\nD 摘要请求：复用主对话前缀（dsh） vs 另起 summarizer system（被否决）');
{
  const history = [];
  for (const [index, turn] of USER_TURNS.entries()) {
    history.push({ role: 'user', content: turn });
    history.push({ role: 'assistant', content: `第 ${index + 1} 轮的回答，内容不重要，占位用。`.repeat(6) });
  }
  await warm(BASE_SYSTEM, history);
  record('D', await ask({ system: BASE_SYSTEM, messages: history, label: '主对话最后一次请求（热身）' }));

  const instruction = 'You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE into a structured summary.';
  record('D', await ask({
    system: BASE_SYSTEM,
    messages: [...history, { role: 'user', content: instruction }],
    label: '摘要：同 system/tools + 指令放尾部',
  }));
  record('D', await ask({
    system: instruction,
    messages: history,
    label: '摘要：另起 summarizer system',
  }));
}

console.log(`\n合计 ${calls} 次请求，prompt ${spentPromptTokens} tokens，completion ${spentCompletionTokens} tokens。`);
if (JSON_OUT) {
  writeFileSync(JSON_OUT, `${JSON.stringify({ model: MODEL, rows, calls, spentPromptTokens, spentCompletionTokens }, null, 2)}\n`);
  console.log(`结果已写入 ${JSON_OUT}`);
}
