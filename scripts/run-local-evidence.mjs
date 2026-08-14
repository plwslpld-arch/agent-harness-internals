#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { root } from './lib.mjs';

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return fallback;
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80) || 'local-evidence';
}

const scenario = slug(argValue('scenario', 'local-first-run'));
const date = new Date().toISOString().slice(0, 10);
const outputDirArg = argValue('out-dir', join('research', 'runtime-evidence'));
const outputDir = isAbsolute(outputDirArg) ? outputDirArg : resolve(root, outputDirArg);
mkdirSync(outputDir, { recursive: true });
let output = join(outputDir, `${date}-${scenario}.md`);
let counter = 2;
while (existsSync(output)) {
  output = join(outputDir, `${date}-${scenario}-${counter}.md`);
  counter += 1;
}

const hasKey = process.env.DEEPSEEK_API_KEY !== undefined && process.env.DEEPSEEK_API_KEY.length > 0;
const content = `# ${scenario} runtime evidence

Runtime claims require sanitized evidence. Do not paste API keys, private paths, private prompts, or full raw logs.

## Source baseline

- atlas_commit: ${process.env.GITHUB_SHA ?? '<fill-after-run>'}
- deepseek_harness_commit: 47f943859bef60e4160492346772ded9b24f765a
- generated_at_utc: ${new Date().toISOString()}

## Environment

- os_arch: <fill>
- node_version: <fill>
- deepseek_api_key: ${hasKey ? 'present in environment as DEEPSEEK_API_KEY; value redacted' : 'missing from current environment'}
- network: <fill>

## Scenario

- scenario: ${scenario}
- purpose: <success path | missing credential | tool denial | sandbox denial | cancel | repair>
- profile: <fill>
- provider: deepseek-official
- model: <fill>

## Command

\`\`\`bash
<fill sanitized command>
\`\`\`

## Result

- start_time_utc: <fill>
- end_time_utc: <fill>
- exit_code: <fill>
- status: <success | expected_failure | unexpected_failure | partial>

## Session event summary

Record event names and counts only. Do not paste private content.

| event | count | notes |
| --- | ---: | --- |
| turn/start | <fill> | |
| step/start | <fill> | |
| request/header | <fill> | |
| request/context | <fill> | |
| assistant/message | <fill> | |
| tool/call | <fill> | |
| tool/result | <fill> | |
| turn/end | <fill> | |

## Evidence artifacts

- sanitized_log_path: <fill or n/a>
- artifact_sha256: <fill or n/a>
- session_id_or_hash: <fill or n/a>

## Known gaps

- <fill>

## Reviewer conclusion

<fill one paragraph separating code evidence, runtime evidence, and unverified assumptions>
`;

writeFileSync(output, content);
console.log(output.replace(`${root}/`, ''));
