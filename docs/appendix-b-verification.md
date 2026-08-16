---
title: 附录 B：怎么自己核对这些结论
sources: [{"repo":"deepseek-harness","path":"package.json","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# 附录 B：怎么自己核对这些结论

*写给不打算全盘照信的读者。读完你能回答：一句结论怎么自己验回去、机器帮你保证到哪一步、哪些结论本仓库自己也还没核过。*

正文里每隔几行就挂着一个 `路径:行号`，看上去句句有据。可行号能证明的只有「这一行真的存在」，它指的那段代码是不是在讲文章说的那件事，机器判断不了。更麻烦的是还有一整类结论，本仓库自己都没跑过。所以先把话说在前面：下面这些动作你做一遍，就知道该信到什么程度。

这个仓库的全部价值取决于一件事：**你能不能自己把结论核回去**。这一篇讲怎么核，以及哪些东西**本仓库自己也还没核过**。

## 一、四种依据

正文里的每句话都来自下面四种之一：

| 依据 | 是什么 | 怎么核 |
| --- | --- | --- |
| **源码** | 锁定 commit `47f9438` 下的真实代码，带 `路径:行号` | `sed -n '<行号>p'` 一句就能验；行号本身由 CI 校验 |
| **上游测试与 fixture** | fixture 指测试里预先存好的固定数据文件，尤其是 `system-prompt.expected.md`、`tool-schemas.expected.json`、`session.jsonl` 这类渲染快照 | 直接 `cat`，它们是纯文本 |
| **官方文档** | 上游 110 篇英文文档、683 篇 Agent Note；涉及闭源产品（Claude Code）时只用公开文档 | 在 checkout 里读原文 |
| **作者推断** | 从前三者推出、但上游没明说的判断 | 正文里**直接写「这是推断」**，不用行内标签，不用脚注 |

「推断在正文里是明写的」这条再说一次：本仓库不使用 `evidence: code`（意思是「这句的证据类型是源码」）这类行内证据标签。理由是标签会让人以为「没标签的句子就没证据」，而实际情况是每句话都该有证据，只是有的证据是行号，有的证据是「我从 A 和 B 推出来的」。后者写成中文句子比写成标签更诚实。

## 二、不需要凭据就能做的核对

以下全部不需要 `DEEPSEEK_API_KEY`，也不需要联网调用模型。

### 2.1 把 dsh 拉到锁定 commit

本仓库自带 bootstrap：

```bash
git clone https://github.com/plwslpld-arch/deepseek-harness-internals.git
cd deepseek-harness-internals
npm run bootstrap
```

三条命令分别做：把分析仓库克隆下来、进到目录里、让它自己去把五个上游来源拉齐。`scripts/bootstrap.mjs` 按 `sources/sources.lock.yml` 逐个初始化 submodule 或 `git clone --filter=blob:none`（只下历史元数据，文件内容用到才拉），然后 detach 到锁定 commit（不落在任何分支上，就停在那个 commit）。5 个来源：`deepseek-harness`、`codex`、`opencode`、`pi`、`mini-swe-agent`。

不想要整个分析仓库、只想看 dsh 的话：

```bash
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout 47f943859bef60e4160492346772ded9b24f765a
```

正文里所有行号都对应这一个 commit。上游是活的仓库，换个 commit 行号就会漂。

### 2.2 复核一处 `路径:行号`

最直接的办法：

```bash
# 文章 13 说「请求 = 日志重建」的断言在这里
sed -n '19,55p' packages/core/agent-loop/src/invariant.ts

# 只看一行
sed -n '103p' AGENTS.md

# 想看上下文
sed -n '300,322p' packages/core/agent-loop/src/agent.ts
```

三条命令都是 `sed -n`，作用分别是：读出一个区间、只读一行、把上下文一起读出来。`p` 表示打印，`-n` 表示别的行都别打。

行号会随上游演进漂移，所以**别只对行号，要对内容**：读一眼那段代码是不是在讲文章说的那件事。行号只保证「指到了一个真实存在的行」，语义对不对仍然要人看，这正是本仓库 `check:anchors` 的边界（见第四节）。

### 2.3 读 fixture：最省力的证据

想知道模型第一眼看到什么，不用起进程：

```bash
# 24 行，模型收到的完整 system prompt
cat examples/acp-agent/tests/snapshots/text-turn/system-prompt.expected.md

# 模型收到的工具 schema（27 KB）。文件是 {"initial": [...], "changes": [[...]]}，
# initial 就是首次请求里那串工具，数一下有几个、都叫什么：
python -c "import json;d=json.load(open('examples/acp-agent/tests/snapshots/text-turn/tool-schemas.expected.json',encoding='utf-8'));print(len(d['initial']));print([t['name'] for t in d['initial']])"

# 一次完整会话的事件日志（22 行 JSONL）
cat examples/acp-agent/tests/snapshots/text-turn/session.jsonl

# 只看请求头事件
grep -o '"type":"request/header".\{0,300\}' examples/acp-agent/tests/snapshots/text-turn/session.jsonl
```

四条命令在验的是四件事：模型收到的 system prompt 原文长什么样、首次请求里带了哪几个工具、一次完整会话按什么顺序落了哪些事件、以及其中的请求头事件具体是什么内容。第二条那句 Python 只做两件事：打印 `initial` 数组的长度，再打印里面每个工具的 `name`。

三个示例一共 93 个场景目录（`examples/acp-agent` 78、`examples/headless-agent` 11、`examples/jsonrpc-agent` 4）。找一个跟你关心的机制对得上的场景名直接读它的 `session.jsonl`，比读源码快得多。场景名是自解释的，比如 `code-mode-turn`（走 Code Mode 的一轮）、`escalation-approved`（提权被批准）、`bash-spill`（bash 的输出溢出）、`empty-response-retry`（空回复后重试）。

### 2.4 复算统计数字

正文里的每个数字都给了命令。几个常用的：

```bash
ls -d packages/*/*/ | wc -l                                   # 219 个包
find packages -name invariant.ts -path '*/src/*' | wc -l      # 219
grep -l "^#### KV Cache effect" packages/*/*/README.md | wc -l   # 215

# 源码行数与测试行数（注意 -print0，避免 xargs 分批只报最后一批）
find packages \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -print0 \
  | grep -zv -E '/tests?/|__tests__' | xargs -0 cat | wc -l    # 228300
find packages \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -print0 \
  | grep -z  -E '/tests?/|__tests__' | xargs -0 cat | wc -l    # 268040

# 同一口径下的测试文件个数（把 cat|wc -l 换成数文件）
find packages \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -print0 \
  | grep -z  -E '/tests?/|__tests__' | tr '\0' '\n' | wc -l    # 854

find .agents/notes -name '*.md' ! -name '*.zh.md' \
  ! -name 'AGENTS.md' ! -name 'README.md' ! -name 'CLAUDE.md' | wc -l   # 683
find docs -name '*.md' ! -name '*.zh.md' | wc -l               # 110
```

这几条从上到下在数：包的个数、带 `invariant.ts` 的包个数、README 里写了 KV Cache 小节的包个数、非测试代码的总行数、测试代码的总行数、测试文件个数、Agent Note 篇数、上游英文文档篇数。`-print0` 和 `grep -z` 那一对是为了让文件名以 `\0` 分隔，`xargs` 才不会因为参数太长自己分批（分批的话 `wc -l` 会输出好几个数，你只看到最后一批）。

口径必须跟着数字一起给，否则数字没有意义。举个反例：`packages/client` 只数 `src/` 下的 `.ts` 是 43,561 行，加上 `.tsx` 是 71,896 行；把范围放宽到「所有非 `tests/` 的文件」又变成 72,428 行。三个都对，但不说数了哪些后缀、范围是 `src/` 还是全包，就是误导。本仓库统一用「`src/` 下的 `.ts` + `.tsx`」，也就是 71,896。

### 2.5 跑上游的单元测试

上游是 pnpm workspace，`package.json:9` 要求 Node `^22.19.0 || >=24.0.0`，`package.json:7` 固定 `pnpm@11.7.0`。装完依赖后按包跑：

```bash
pnpm install
pnpm vitest run packages/core/system-prompt
pnpm vitest run packages/core/agent-loop
```

`package.json:34` 的 `test` 脚本就是 `vitest run`，测试分层写在 `docs/testing.md:9-13`（unit / coverage / real-API e2e / snapshot / web browser snapshot 五层，也就是单元测试、覆盖率、打真 API 的端到端测试、快照测试、浏览器端快照测试）。**只有 real-API e2e 那一层需要 key**，其余四层都是 keyless 的（不需要凭据就能跑）；`docs/testing.md:11` 说明了每个 with-key 套件在缺 key 时自动 skip。

无 key 跑快照层的命令是 `pnpm run test:snapshot`（`package.json:38`）。它会启动真的 ACP 示例进程、用 `llm-replay` 从录制好的 `session.jsonl` 重放模型流，再 diff 归一化后的输出。

本仓库**没有**把这些运行结果写进正文；上面给的是命令，不是「预期输出」。

## 三、需要凭据的验证：跑过了什么

本仓库跑过带 `DEEPSEEK_API_KEY` 的验证，记录在 [`research/runtime-evidence/2026-08-16-deepseek-cache-probe.md`](../research/runtime-evidence/2026-08-16-deepseek-cache-probe.md)。跑了两类东西，它们的证明力不一样，别混着用。

**第一类：上游自己的 e2e 测试。** 证明力最强，因为它是 dsh 进程真的跑出来的。

```bash
cd sources/checkouts/deepseek-harness
pnpm install --no-frozen-lockfile        # 会改动 pnpm-lock.yaml，跑完记得还原
export DEEPSEEK_API_KEY=your-own-key
node node_modules/vitest/vitest.mjs run --config vitest.e2e.config.ts   packages/core/agent-loop/tests/request-cache.e2e.ts
```

四行命令依次是：进到上游 checkout、装依赖、把 key 放进环境变量、用 e2e 专用配置只跑请求缓存那一个测试文件。

结果：通过，2.03 秒真实 API 调用。同一条命令去掉 key 再跑，结果是 `1 skipped`。这一步很重要，它排除了「门控放行但其实没测」这种假通过。`packages/llm/llm-deepseek/tests/adapter.e2e.ts` 的 6 条也全过（含 thinking 开关切换、tool call 轮次的 reasoning 回传、SSE 顺序）。

两个坑：**Node 必须 22 以上**（上游 `.nvmrc` 写 24；Node 20 缺 `Promise.withResolvers`，加载 agent-loop 就报错），以及 `pnpm install` 会改上游 checkout 的 `pnpm-lock.yaml`，不还原的话本仓库的 `sources:verify` 会报「checkout has local changes」，也就是这份 checkout 被你改过了。

**第二类：本仓库自己写的探针。** 证明力弱一些：它用手写的、模仿 dsh 请求形状的请求直接打 API，测的是 **provider 的行为**，不是 dsh 的实现。

```bash
export DEEPSEEK_API_KEY=your-own-key
node scripts/experiments/cache-probe.mjs --json probe.json
```

两行命令是：把 key 放进环境变量，然后跑探针并把结果写成 JSON。探针（probe）指一段专门为了看清某个行为而写的小程序，它不测 dsh，只测对面的服务怎么反应。

它回答上游 e2e 回答不了的问题：命中率具体是多少、什么情况下会掉。四组结果（完整数字见运行记录）：前缀稳定时 81–96%；只改 system 一句话 → 掉到 0；权限策略写进 system 每次切换只剩 256 token 命中，改成尾部 user 快照则保持 81%；摘要请求复用主对话前缀 93.4%，另起 summarizer system prompt 0%。

**这两类都不能替代第三类**：真实项目里跑一个完整任务，看长会话下的压缩、审批、恢复。那个还没做。

自己跑的话，记录模板由 `npm run evidence:local` 生成，需要写清楚的字段是：

- **来源基线**：本仓库 commit、dsh commit（`47f9438`）、生成时间（UTC）；
- **环境**：os/arch、Node 版本、key 是否存在（**只记存在与否，绝不记值**）、网络状况；
- **场景**：scenario 名、目的（success path / missing credential / tool denial / sandbox denial / cancel / repair，即正常走通、缺凭据、工具被拒、沙箱拦截、取消、修复）、profile、provider、model；
- **命令**：脱敏后的完整命令行；
- **结果**：起止时间、退出码、status（success / expected_failure / unexpected_failure / partial，即成功、如预期地失败、意外失败、只跑了一部分）；
- **会话事件摘要**：只记事件名和计数，**不贴私有内容**；
- **已知缺口**：这次跑没能证明什么。

安全边界：key 只能通过环境变量传入，不进任何文件；`npm run check:secrets` 会扫 6 类模式（私钥块、AWS `AKIA…`、GitHub `ghp_…`、Slack `xox…`、URL 内嵌凭据、以及形如 `API_KEY = "<16 位以上>"` 的赋值），文档里写示例只能用 `your-…` / `example…` / `<…>` / `${…}` 开头。

## 四、本仓库自己的门禁

`npm run check` 串联八步，每一步查什么：

| 步骤 | 检查什么 | 关键细节 |
| --- | --- | --- |
| `sources:verify` | sources.yml ↔ lock ↔ `.gitmodules` ↔ git index gitlink（索引里记着子模块该停在哪个 commit 的那条记录）↔ 实际 checkout HEAD 五方一致 | 本地没 `npm run bootstrap` 过就会在这一步失败 |
| `check:analysis` | 每篇 frontmatter：`title` / `sources` / `last_verified` / `status` 齐全，commit 是 40 位小写 SHA 且**等于 lock**，path 用 `git cat-file -e` 实证存在 | 解析器是行式正则，**列表必须写在一行且是合法 JSON**；`status` ∈ `draft` / `reviewed` / `stale`（草稿 / 已复核 / 已过期） |
| `check:anchors` | **正文里的 `路径:行号` 真的指向那一行** | 见下 |
| `check:portability` | 无 CRLF；不含形如「斜杠 Users 斜杠 用户名」「斜杠 home 斜杠 用户名」的家目录路径，也不含「盘符 + 冒号 + 反斜杠 + Users」式 Windows 路径；不含 `file` 协议 URL；`package.json` 零依赖 | 在 Windows 上写文件务必存成 LF。写文档举例时避开真实家目录写法，否则会被这条拦下 |
| `check:licenses` | 5 个许可证文件存在、根 LICENSE 划清代码/文档/第三方边界、每个来源的 redistribution policy 合法、checkout 内许可证文件 sha256 与 lock 一致 | |
| `check:links` | 所有 Markdown 相对链接的目标真实存在（含代码块里的，写示例时要当心） | `sources/checkouts/` 下的目标不存在时放行（未 bootstrap 的情况） |
| `check:secrets` | 6 条密钥模式 | 见第三节 |
| `test` | `scripts/tests/` 下三个脚本自测 | frontmatter 解析、gitlink 解析、证据模板不泄露 key |

### `check:anchors` 到底怎么校验行号

这是本仓库跟一般源码分析最不一样的地方，值得讲清楚，因为它决定了你能相信正文到什么程度。

`scripts/verify-anchors.mjs` 做五件事：

1. 扫 `docs/` 下每篇正文，用正则找形如「仓库相对路径 + 冒号 + 行号」的引用（也支持 `起-止` 区间）。**路径必须含至少一个斜杠、且后缀在白名单里**（`.ts` / `.tsx` / `.mjs` / `.js` / `.rs` / `.py` / `.md` / `.yml` / `.yaml` / `.json`）。所以根目录的 `AGENTS.md:103` 这种引用**不会**被自动校验，只能靠人。
2. **代码块里的行号不算引用**，因为那多半是 `sed -n '19,55p'` 这样的命令参数。
3. 在锁定的 checkout 里读出那一行（区间取首行）。行号越界直接失败；路径不存在也失败，但**前提是那些 checkout 已经拉下来**；没 bootstrap 过的话这一步整体跳过，由 `sources:verify` 去报。
4. 如果那一行是空行，往下找 3 行内的第一行非空内容（多行声明和注释块常见这种偏移），仍找不到才算失败。

5. **如果引用后面跟着「原文片段」，还会做一次子串匹配。** 写成 `` `路径:行号`「export function renderPrompt」 `` 时，门禁会把被引区间的空白折叠后找这段文字，找不到就失败。直角引号里必须是源码原文（这个例子里就是一句导出函数的声明），不能塞中文说明，否则一定挂。

repo 前缀可以显式写（`codex!codex-rs/core/src/lib.rs:10`），不写就取 frontmatter 里唯一绑定的那个源，还不唯一就默认 `deepseek-harness`。

不带引文时，它保证的是「指到了一个真实存在的行」，**不保证那一行讲的是文章说的那件事**：「行号对、但指到了相邻的另一个声明」这类错要靠人读，或者靠上面第 5 条把它变成机器可查的。但这一条已经把「行号写错也能过 CI」这个漏洞堵上了；旧版校验只确认文件存在，于是「每句话都能追到证据」是句空话。

想自己跑单步：

```bash
npm run check:anchors      # 只校验行号
npm run check              # 全部八步
```

## 五、上游变了怎么办

上游是活仓库，本仓库锁在一个 commit 上，两者必然会分叉。规则是：

- **`sources/sources.lock.yml` 是唯一的真源。** 每篇文章 frontmatter 里的 `sources[].commit` 必须等于 lock 里的值，`check:analysis` 会拦。
- 想升级到新 commit，就得**重新人工核对**绑定该源的每一篇结论。行号几乎一定会漂，语义可能也变了。
- 还没来得及核的文章，把 frontmatter 的 `status` 改成 `stale`。`stale` 状态下 `check:analysis` 放行 commit 不一致，`check:anchors` 会**整篇跳过**（`scripts/verify-anchors.mjs` 里对 `metadata.status === 'stale'` 的那个 `continue`）。这是一个明确的信号：这篇的行号现在不可信。
- **不要让机器改写语义结论。** 脚本可以帮你发现漂移，但「新版本里这个机制变了没有」只能人判断。

对读者的实际影响：如果你读到一篇 `status: stale` 的文章，正文的机制叙述大概率还成立（架构不会一周变一次），但每一个行号都要自己重新找。

## 六、一份最小核对清单

想用二十分钟判断这个仓库靠不靠谱，按顺序做这六件事：

```bash
# 1. 确认 checkout 真的在锁定 commit 上
git -C sources/checkouts/deepseek-harness rev-parse HEAD

# 2. 全部门禁跑一遍
npm run check

# 3. 随机抽一个行号引用，自己 sed 一下
sed -n '19,55p' sources/checkouts/deepseek-harness/packages/core/agent-loop/src/invariant.ts

# 4. 读一份 fixture，对照文章 01 讲的 prompt 组成
cat sources/checkouts/deepseek-harness/examples/acp-agent/tests/snapshots/text-turn/system-prompt.expected.md

# 5. 复算一个统计数字
ls -d sources/checkouts/deepseek-harness/packages/*/*/ | wc -l

# 6. 找一篇正文引用的 Agent Note，读它的 Alternatives considered
sed -n '1,60p' sources/checkouts/deepseek-harness/.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md
```

第 3、4、6 步是关键：它们分别验证「行号真」「模型看到的东西真」「设计意图真」。这三样都对得上，剩下的推断就有了地基。

六条命令按顺序在验：checkout 停在不停在锁定 commit、八步门禁过不过、随便挑一处行号指得对不对、模型收到的 prompt 跟文章说的一不一样、一个统计数字复算得出来吗、一篇 Agent Note 的备选方案是不是真写了。

## 自检

**1. `check:anchors` 已经保证每个行号都指向真实存在的一行，为什么这一篇还要反复说「别只对行号，要对内容」？**

答：因为机器只查得了「这一行存在」，查不了「这一行讲的是文章说的那件事」。上游一改代码，行号整体下移，原来指向某个函数的引用就可能落到相邻的另一个声明上，文件还在、行号没越界，CI 照样绿。只有第 5 条那种带原文片段的引用才把语义变成机器可查的，其余的仍然要人读一眼。这也是 `status: stale` 存在的理由：它明说这篇的行号现在不可信。

**2. `npm run check` 八步全绿，为什么不能拿它当「结论都对」的证据？**

答：这八步验的全部是**仓库自身一致**：文件存在、行号不越界、链接不断、许可证哈希没变、脚本单测过。它们一条都不需要连网，也一条都不碰真实模型。一篇通篇胡说但每个行号都指得准的文章，照样能全绿。真正能推翻结论的证据只有两类：读源码上下文（人做），和带凭据跑一次真实请求（`research/runtime-evidence/` 里那一份）。把门禁全绿说成「已验证」，是这个仓库明确要避开的那类话。

**3. 上游的 e2e 测试跑通了，和我们自己写的探针脚本跑出数字，这两类证据强弱一样吗？**

答：不一样，而且方向相反。上游 e2e 跑的是 dsh 自己构造出来的请求，它能回答「dsh 的实现有没有按设计工作」，但只断言「命中 > 0」，不告诉你命中多少。探针脚本是手写的、模仿 dsh 请求形状的请求，它能量出具体数字和失效条件，但回答不了「dsh 的实现有没有 bug」——因为跑的根本不是 dsh 的代码。所以这两类要分开写、分开引，谁也替代不了谁。混着说会得到一个两头都不成立的结论。
