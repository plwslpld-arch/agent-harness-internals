---
title: Cordis、启动、bundle 与 preset：默认到底装了什么
sources: [{"repo":"deepseek-harness","path":"packages/bundle/base/cordis.patch.yml","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: draft
---

# Cordis、启动、bundle 与 preset：默认到底装了什么

大多数 coding harness 的「装了什么」写死在源码里：一个 `buildTools()` 函数返回一个数组，一个 `SYSTEM_PROMPT` 常量，配置文件里再开关几个 boolean。dsh 不是。dsh 跑起来的那棵能力树，是若干个 YAML 补丁文件按顺序叠出来的结果，**每一行 YAML 对应一个 npm 包**。想知道「默认开启了什么」，不需要读 TypeScript，读那几个 YAML 就够了。

这篇文章把那几个 YAML 摊开，逐行说明每一行装了什么能力；然后回头讲支撑它的 Cordis 原语、启动链的叠加顺序，以及 Web 面上「按会话挂载」的 agent preset。

---

## 一、先看见：headless bundle 的全文

最短的那个是 `packages/bundle/headless/cordis.patch.yml`，一共 35 行，是「一次性跑一个任务然后退出」这种形态的**全部**声明：

```yaml
# The dsh-headless bundle patch: one-shot task mode directly over dsh-base.
# It mounts no Host, HTTP server, Web runtime, or browser plugin. ...

- id: system-prompt
  config:
    persona: >-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.

- id: hmr
  disabled: true

- id: tools
  config:
    mode: !!js process.env.DSH_TOOLS_MODE

- insert:
    - id: code-runtime
      name: '@deepseek-ai/dsh-code-runtime-worker-thread'

    - id: headless-startup
      name: '@deepseek-ai/dsh-headless/startup'

    - id: headless-runner
      name: '@deepseek-ai/dsh-headless'
      inject: [headlessStartup]
      config:
        task: !!js ctx.headlessStartup.task
```

（原文 `packages/bundle/headless/cordis.patch.yml:1-35`，注释已略去部分。）逐条读：

- `:7-10`：把 `system-prompt` 这一行的 `persona` 配置换掉。`{{model}}` 和 `{{cwd}}` 不是 YAML 模板，是 prompt 变量，由 agent-loop 在装配时代入（`packages/core/agent-loop/src/index.ts:351-353` 注册了 `provider`/`model`/`cwd` 三个变量）。
- `:14-15`：`hmr` 这一行 `disabled: true`。**注意 `disabled` 和「删掉这一行」不是一回事**：行还在树里，只是不激活。web-app 那一层也这么干，理由写在 `packages/bundle/web-app/cordis.patch.yml:283-285`——base 是共享的，一个「在某个面上被删掉」的行，等哪天有人重排组合顺序时会悄悄复活，而 `disabled` 是显式的。
- `:17-20`：`tools` 注册表的呈现模式由环境变量 `DSH_TOOLS_MODE` 决定。`!!js` 是这套 YAML 方言的自定义标签，值是一段在挂载时求值的 JavaScript 表达式（不是字符串）。
- `:22-35`：`insert` 追加三行新的。`code-runtime` 是 Code Mode 的执行后端（跑在 worker thread 里）；`headless-startup` 解析命令行位置参数；`headless-runner` 声明 `inject: [headlessStartup]`，所以它的 `task: !!js ctx.headlessStartup.task` 这个表达式，**要等到 `headlessStartup` 这个服务真的存在之后才求值**。这是 vendored Cordis 的一项本地修改（惰性配置解析，后面第八节会讲）。

反过来说，35 行里**没有**的东西同样重要：没有 HTTP server，没有 host 平面，没有一个浏览器插件。headless 不是「无 UI 的 Web」，是绕开整个 host 层直接驱动 core。它的所有工具、模型路由、持久化，全部来自下面一层的 `dsh-base`。

## 二、先看见：web-app bundle 干了三件事

`packages/bundle/web-app/cordis.patch.yml` 有 424 行，结构上是三段。

**第一段，改 base 留白的值**（`:14-41`）：同一句 persona，关掉 `hmr`，把 `session-query-sqlite` 钉在内存索引且 `openAt: never`（`:30-33`，全文搜索是 opt-in 的，默认不开 SQLite），`tools.mode` 同样读 `DSH_TOOLS_MODE`。

**第二段，插入 host 半边与浏览器插件名册**（`:47-274`）。挑几行说：

```yaml
    - id: storage-json
      name: '@deepseek-ai/dsh-storage-json'
      config:
        root: !!js dshHomePath('storages')
```

（`:54-57`）`dshHomePath` 是 boot 阶段注入根 context 的一个函数（`packages/boot/app-boot/src/index.ts:770`），所以 YAML 里可以直接写 `dshHomePath('storages')` 而不用硬编码用户主目录。

```yaml
    - id: webserver
      name: '@deepseek-ai/dsh-host-webserver'
      inject: [webStartup]
      config:
        host: !!js ctx.webStartup.host ?? '127.0.0.1'
        port: !!js ctx.webStartup.port ?? 3080
```

（`:115-120`）监听地址来自命令行解析出来的 `webStartup` 服务，`??` 后面是部署兜底值。这一行也解释了 `dsh --profile web --help` 为什么不会真的开端口：文件头的注释（`:12`）写得很直白——`--help` 那条路径不提供 `webStartup` 服务，所以这一行永远 pending，服务器不 bind。

```yaml
    - id: connection
      name: '@deepseek-ai/dsh-client-connection'
      inject: [webRuntime]
      config:
        trustedHosts: !!js ctx.webRuntime.trustedHosts
```

（`:156-163`）LAN 信任名单不是配置里写死的，是服务器真的 bind 完之后由 `web-runtime` 采样一次再提供出来的（`:126-127` 的注释）。

再往后是约 30 行 `ui-*`（`:174-274`），每一行就是浏览器里的一块界面：`ui-trajectory`（轨迹视图）、`ui-model-selection`（模型选择）、`ui-agent-preset`（preset 选择器）、`ui-deliverables`（产出文件链接）……这些在 [11 Web 客户端与 host](11-web-client-and-host.md) 里展开。

**第三段，把 base 里「每个 agent 一份」的行全部 `disabled: true`**（`:276-408`）。这是 web-app 最有信息量的一段。tool-bash、tool-pwsh、tool-jobs、tool-fs、tool-fs-search、tool-str-replace-editor、skill-filesystem、tool-skill、tool-goal、plan-mode、compaction-basic、command-compact、tool-result-pruner、四个 tool-subagent 行、workflow、tool-ralph、agent-instructions、tool-todo、tool-web——全部关掉。

关掉不是因为 Web 不要这些能力，而是因为在 Web 上**这些能力属于「某一个会话」而不是「整个进程」**。每一段禁用上面都有一段注释解释判据，写得很清楚。举 `tool-jobs` 那段（`:299-307`）：后台任务的**注册表**留在 host 平面，只有模型能看见的 `job_*` 控制工具搬走；理由是注册表的生产者（`tool-bash` 等）在 preset 的 realm 之外，用 `ctx.get` 取它——如果注册表被关进 preset 的 realm，那些兄弟行看不见它，`run_in_background` 会回答「background jobs unavailable」而控制工具却好端端挂在目录里。

判据被反复陈述成两句互补的话：**一个被 preset 之外的行 inject 的服务，属于 host 平面**（`shell-env` 那段，`:287-291`）；**一个被 preset 之外的行 read 的服务，也属于 host 平面**（`goals` 那段，`:336-343`）。上游把这条判据的唯一出处写在 `.agents/notes/implemented/architecture/2026-08-10-host-plane-ownership-after-presets.md`（在 `:356` 被引用）。

最后一段 `insert` 只有一行（`:420-424`）：

```yaml
- insert:
    - id: agent-presets
      name: '@deepseek-ai/dsh-agent-presets'
      config:
        default: standard
```

被关掉的那些能力，从这里按会话重新挂回来。

---

## 三、Cordis：这套 YAML 背后的五个原语

Cordis 是 dsh vendored 进来的插件框架（`vendor/cordis/`，2,693 行 TypeScript）。理解上面的 YAML，只需要五个概念。

### Context 是一个 Proxy

```ts
constructor() {
    this[symbols.isolate] = Object.create(null)
    this[symbols.intercept] = Object.create(null)
    const self = new Proxy<this>(this, ReflectService.handler)
```

（`vendor/cordis/src/context.ts:71-74`）根 context 的构造函数返回的不是 `this`，是一个 Proxy。所以 `ctx.systemPrompt` 这种读取不是普通属性访问，而是走 `ReflectService` 的服务解析——按当前 context 的**隔离标签**去查表。这一点是后面所有 realm 语义的地基。

三个派生方法都不改父 context，只造子 context：

- `extend(meta)`（`:99-107`）：原型继承一个子 context，`meta` 的自有属性遮蔽继承来的。
- `isolate(name, label?)`（`:121-125`）：给某个服务名换一个作用域标签。「在这个子树下面，`terminals` 这个服务名解析到另一个实例」——`minimal` preset 里的 `isolate: { terminals: true }` 就是这个。`label` 省略时是一个新的 unique symbol，即「entry-local realm」；传相同 label 则两个 isolate 汇合成同一个 realm。
- `intercept(name, config)`（`:141-145`）：给子树下加载的插件注入某个服务的额外配置。

### FiberState 六态

每个挂载的插件是一个 fiber，状态定义在 `vendor/cordis/src/fiber.ts:147-153`，注释在 `:140-146`：

> `PENDING` — waiting for required services; `LOADING` — the plugin callback is running; `ACTIVE` — loaded and providing; `FAILED` — the callback or its config threw; `UNLOADING` — disposers are running; `DISPOSED` — the fiber was removed and cannot restart.

`PENDING` 是最容易被误读的一个：它**不是错误**。一行插件声明 `inject: [webStartup]`，而 `webStartup` 服务不存在，它就一直 PENDING，安静地待着。`dsh --profile web --help` 之所以不开端口，就是 webserver 那一行停在 PENDING。而 `FAILED` 是真的抛了。

### effect：带清理的副作用

```ts
  effect(execute: () => Effect, label = 'anonymous'): any {
    this.assertActive()
    if (this.state === FiberState.UNLOADING) {
      throw new CordisError('INACTIVE_EFFECT')
    }
```

（`vendor/cordis/src/fiber.ts:418-422`）`ctx.effect(fn)` 立即执行 `fn`，收集它返回的清理函数；这些清理要么在返回的 disposer 被调用时跑，要么在 fiber 卸载时跑，**以先到者为准，逆序执行**（契约写在 `:401-414` 的 JSDoc）。这是「插件卸载后不留残留」的机制保证：注册一个 prompt section、注册一个工具、开一个 watcher，全都是 effect。

### 五种 DispatchMode

```ts
export type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall'
```

（`vendor/cordis/src/events.ts:32`，语义注释在 `:24-31`）其中 `waterfall` 是 dsh 用得最重的一种：

```ts
  waterfall(...args: any[]) {
    const cbs = this.dispatch('waterfall', args)
    const inner = args.pop()
    const next = () => {
      const cb = cbs.shift() ?? inner
      return cb(...args)
    }
    args.push(next)
    return next()
  }
```

（`vendor/cordis/src/events.ts:234-243`）最后一个参数被当成最内层的 `next`，监听器由外向内包裹它——**一个不调用 `next()` 的监听器就否决了整条链，包括内建行为**（`:227-229` 的注释）。熟悉 Koa 中间件的人会觉得眼熟。`system-prompt/assemble`、`tools/execute`、`approval/request` 这些拦截点都是 waterfall；[07 工具、审批与沙箱](07-tools-approval-sandbox.md) 里的审批「无应答者则 fail-closed」，本质就是没人调 `next` 的默认行为。

### Service：provide / inject 怎么形成 seam

```ts
  constructor(protected ctx: Context, name: string) {
    ...
    self.ctx.reflect.provide(name, self, this[symbols.check])
    return self
  }
```

（`vendor/cordis/src/service.ts:42-58`）`Service` 基类的构造函数就把自己注册进当前 context。而 `provide` 的实现本身是一个 effect：

```ts
  provide(name: string, value?: any, check?: () => boolean) {
    return this.ctx.fiber.effect(() => {
      ...
      this.ctx.root[symbols.isolate][name] ??= Symbol(name)
      const key = this.ctx[symbols.isolate][name]
      ...
      if (this.store[key]) {
        throw new Error(`service "${name}" has been registered at <${this.store[key].fiber.name}>`)
      }
```

（`vendor/cordis/src/reflect.ts:277-292`）三件事在这几行里发生：服务注册随 fiber 卸载自动撤销（因为它是 effect）；解析的 key 是**当前 context 的隔离标签**，所以同名服务在不同 realm 里互不干扰；同一 realm 下重复注册**直接抛错**。

消费侧是 `ctx.inject(names, callback)`（`vendor/cordis/src/registry.ts:300-302`），等依赖都在了才跑回调。

**seam 就是这样形成的**：一个包只定义抽象服务与它的类型（Definition），另一个包 `provide` 一个实现（Provider），第三批包 `inject` 它（Consumer）。谁 provide 是组合决定的——base 里 `sandbox` 这一行换成别的包名，整个沙箱后端就换了，消费者一行不改。上游把这条写成了设计记录 `.agents/notes/implemented/architecture/2026-06-13-capability-seams.md`，并明确「Service Definition 是抽象类/registry，绝不是 TS interface」——因为 interface 在运行时不存在，没法被 `provide`。

### 一个真实的最小插件

上面五件事凑在一起是什么样子？`packages/client/ui-deliverables/src/index.ts` 全文 28 行，是仓库里最短的完整插件之一：

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Services required for the model guidance paired with the browser renderer. */
export const inject = ['systemPrompt']

/** Stable final-response guidance owned by the matching renderer. */
const FILE_REFERENCE_PROMPT = 'When you successfully create or modify files, mention the primary outputs in your final response. '
  + 'To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.'

export function apply(ctx: Context): void {
  ctx.systemPrompt.section({
    name: 'ui:deliverable-file-references',
    order: 190,
    text: FILE_REFERENCE_PROMPT,
  })
}
```

（`packages/client/ui-deliverables/src/index.ts:8-27`）一个 dsh 插件就是一个导出 `apply` 的模块，可选导出 `name`、`inject`、`Config`。这里 `inject = ['systemPrompt']` 让它在 prompt 注册表就绪前保持 PENDING；`ctx.systemPrompt.section(...)` 通过 Proxy 解析到注册表，注册一段带 `order` 的 prompt 片段。

`section()` 内部本身就是一个 effect（`packages/core/system-prompt/src/index.ts:385-389`），所以这一行从组合里删掉，那段提示词就从 system prompt 里消失，不需要任何清理代码。想显式持有 disposer 的写法在 `packages/preset/persona/src/index.ts:61-66` 有现成的：

```ts
  ctx.effect(() => ctx.systemPrompt.section({
    name: PERSONA_SECTION,
    order: PERSONA_ORDER,
    text: config.text,
    ...(config.complete ? { complete: true } : {}),
  }), 'persona.section()')
```

Context（`ctx`）、Service（`ctx.systemPrompt`）、Effect（`ctx.effect`）三者在这五行里齐了。

---

## 四、启动链：从 `dsh` 到一棵活着的树

`apps/cli/src/bin.ts` 只有 53 行，是一个 switch：

```ts
const invocation = parseDshArgs(process.argv.slice(2), readVersion())

switch (invocation.mode) {
  case 'profile': {
    const { runProfile } = await import('./profile-boot.ts')
    await runProfile({
      environment: loadLayeredEnv('dsh'),
      profile: invocation.profile,
      patchFiles: invocation.patches,
      args: invocation.args,
    })
```

（`apps/cli/src/bin.ts:27-38`）三种 mode：`profile`、`plugin`、`dump-config`（`:29-49`）。命令行语法在 `apps/cli/src/args.ts`，帮助文本在 `:64-72`。launcher 只解析自己的 flag，**第一个它不认识的 token 开始就是应用自己的参数**（`apps/cli/src/args.ts:1-16` 的模块注释）——所以 `dsh --profile web --help` 打印的是 web 应用的帮助，不是 launcher 的。

### 补丁叠加顺序

`profile-boot.ts` 的核心是「一切都是补丁」。每个 profile 目录下有一个 `cordis.yml`，内容永远是空数组：

```
# dsh profile root — an empty entry list. The tree is composed as patches:
# each bundle in package.json's dsh.profile.bundles, then cordis.patch.yml, then any
# --patch overlays. Edit cordis.patch.yml, not this file.
[]
```

（`apps/cli/src/profile-boot.ts:60-64`）而且它**每次启动都被重写**（`:101`），注释解释了原因（`:88-93`）：Loader 有一个「插件自我卸载时把当前树写回配置文件」的行为，如果让它把合成后的行写进这个文件，下次启动每个 bundle 的 insert 就会重复一遍。

叠加顺序在 `:122-129`：

```ts
function allPatches(composed: ComposedProfile): PatchOptions[] {
  return [
    ...composed.bundlePatches,
    ...composed.profile.patches,
    ...composed.homePatches,
    ...composed.overlays,
  ]
}
```

即：**bundle 层（按 `dsh.profile.bundles` 顺序）→ profile 自己的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 叠加层 →（追加的）shipped preset 根与遥测开关**。home 层排在 profile 层之后，理由写在 `:134-137`：机器级偏好适用于每个 profile，所以它压过 per-profile 层。

`--patch` 之后还会追加两个由 launcher 合成的补丁：`agent-presets` 的 `roots`（`:159-167`，把随发行版安装的 preset 目录以 `system` 信任等级钉进去），以及遥测开关（`:168-169`）。遥测开关的语义写在 `resolveTelemetryPatch`（`:80-83`）：`DSH_TELEMETRY_DISABLED` **任何非空值**（包括 `'0'`、`'false'`）都关闭——「一个隐私开关宁可误关也不要误开」（`:71-73`）。

关键在于：`--dump-config` 用的是同一个 `composeEntries` 与同一份 `applyEntryPatches` 算法（`:151`），所以 dump 出来的树和真正挂载的树不可能漂移。

### loadLayeredEnv 三层

```ts
export function loadLayeredEnv(
  binName: string, cwd: string = process.cwd(),
  warn: (line: string) => void = line => void process.stderr.write(line),
): LaunchEnvironmentSnapshot {
  const home = resolveDshHome()
  const inherited = { ...process.env } as Record<string, string>
  // Parse both layers first: a rejection must not leave one file applied.
  const project = readEnvLayer(binName, cwd, warn)
  const user = home === resolve(cwd) ? undefined : readEnvLayer(binName, home, warn)
```

（`packages/boot/app-boot/src/index.ts:177-186`）三层是**继承环境 > 调用目录的 `.env` > Harness home 的 `.env`**，应用时不覆盖已有名字（`:187-193`）。

真正值得注意的是 `readEnvLayer` 的拒绝逻辑：

```ts
  for (const name of Object.keys(values)) {
    if (!isBootstrapOnly(name)) continue
    throw new Error(
      `${binName}: ${path} sets "${name}", which only the launching environment may set`
```

（`:153-157`）被拒的名单在 `:93-114`，包含 `NODE_OPTIONS`、`LD_PRELOAD`、`BASH_ENV`、`PYTHONSTARTUP`、`PERL5OPT`、`GIT_SSH_COMMAND`、`SSL_CERT_FILE`、`HTTPS_PROXY`、`NODE_TLS_REJECT_UNAUTHORIZED` 等，外加前缀 `DSH_`、`XDG_`、`DYLD_`、`BASH_FUNC_`（`:117`）。这是一条实打实的安全边界：一个仓库里的 `.env` 不能决定这个进程怎么启动、从哪里加载代码、怎么访问网络。而且两个文件**先全部解析再全部应用**（`:184` 的注释），一个拒绝不会留下半应用的状态。

### boot 与 Loader

```ts
    ctx.baseUrl = pathToFileURL(dirname(absoluteConfigPath)).href + '/'
    ctx.provide('dshHomePath', dshHomePath)
    await ctx.plugin(Loader)
    await prepare?.(ctx)
    stage = 'plugin tree failed to load'
    await mountRootInclude(ctx, absoluteConfigPath, patches, bareModuleBaseUrl)
    ...
    await ctx.get('loader')?.await()
    if (ctx.get('loader') === undefined) return ctx
    await assertEntriesActivated(ctx, binName)
```

（`packages/boot/app-boot/src/index.ts:769-784`）顺序是：造根 context → 提供 `dshHomePath`（这就是 YAML 里 `!!js dshHomePath('sessions')` 能求值的原因）→ 装 Loader → 跑宿主 prepare（`apps/cli/src/profile-boot.ts:250-258` 在这里提供环境快照与 `ctx.cmdlineArgs`）→ 挂载 include 树 → 等 Loader 静默 → **fail-loud 审计**。

`assertEntriesActivated` 是 dsh 加的：一行永远不激活（比如包名拼错、依赖服务永不出现）不会被默默忽略，会在启动时报错并带上原始堆栈（`packages/boot/app-boot/src/index.ts:735-741` 的 JSDoc）。两个失败标签也分得很清：`prepare` 抛的叫 `host preparation failed`，之后抛的叫 `plugin tree failed to load`（`packages/boot/app-boot/src/index.ts:766-768`、`:796`）。

启动完成后，profile-boot 还会给两个用户补丁层装 watcher（`:285-294`）。如果组合里没有 HMR 服务（web/headless 都把 `hmr` 关了），它会临时挂一个「只看配置文件、不看模块」的 HMR 实例（`:279-284`），这样 `cordis.patch.yml` 的编辑在任何长命面上都仍然是热生效的。

---

## 五、三层 bundle 各装什么

一个 bundle 就是一个声明了 `dsh.bundle.patch` 的 npm 包，本体是一份 `cordis.patch.yml`（`packages/bundle/base/package.json` 的 `dsh.bundle.patch` 字段）。shipped 的模板只有两个：

```ts
export const PROFILE_TEMPLATES: Record<string, readonly string[]> = {
  web: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'],
  headless: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'],
}
```

（`packages/boot/app-boot/src/profile.ts:114-117`）自己新建的 profile 默认只有 base（`:125`）。

### base（451 行）：一次 insert，约 75 行 row

`packages/bundle/base/cordis.patch.yml:15` 一个 `- insert:`，下面是整个 harness 的骨架。按功能分组看：

| 组 | 行 | 装了什么 |
|---|---|---|
| 框架 | `:16-22` | `timer`、`hmr` |
| 模型与会话 | `:24-68` | `llm`、`session`、`agent`、session-title（含 LLM 起标题）、`agent-default-model`（默认 `deepseek-official` / `deepseek-v4-flash`） |
| 类型与网关 | `:30-37` | `typert` 注册表 + loader + api-gateway |
| 配置与凭据 | `:75-96` | `settings-file`、`credentials-local`、`llm-pi-ai`（默认「休眠」挂载，无 provider 配置时零路由） |
| 持久化 | `:98-128` | JSONL 会话日志（落在 `dshHomePath('sessions')`）、附件内容寻址存储、session-query（`openAt: never`）、projection 注册表 |
| 遥测 | `:129-161` | OTLP，默认 `DISABLED`，且有一整段注释解释 shutdown drain 的时间预算 |
| 沙箱与审批 | `:163-205` | subprocess、sandbox-local、sandbox-policy（默认 `workspace-write`）、按平台互斥的 bash/pwsh 沙箱、user-approval、三档 permission-preset |
| 工具 | `:207-249` | bash/pwsh（按 `process.platform` 互斥）、jobs、fs、fs-search、agent-instructions、skill 三件套 |
| 命令与目标 | `:250-263` | commands、feedback、goal 三件套 |
| plan mode | `:265-279` | 整段 plan-mode 提示词内联在这里 |
| 上下文预算 | `:281-290` | token-meter、compaction-basic、`/compact` |
| 委派 | `:292-341` | subagent 注册表 + spawn/fork 两个 in-process backend + 四个委派工具 + workflow |
| 护栏 | `:343-394` | 超时策略、spill（>50,000 字节落盘）、会话检查点、tool-result-pruner（8192/4096/1024）、todo、goal 工具、ralph（`maxRounds: 64`）、str_replace_editor（16,000 字符）、重复调用提醒（阈值 3/5/8） |
| 网页 | `:396-418` | web seam + DeepSeek 搜索 provider + `tool-web`（**`fetch: false`**，因为 fetch provider 的 SSRF 防护是 deferred 的，而目标 URL 由模型决定） |
| 留白行 | `:420-451` | `tools`、`system-prompt`（`persona: ''`）、`agent-loop`（`agents: []`）、`fs-sandbox`、`llm-deepseek` |

最后那组「留白行」是 base 的一个刻意设计。文件头（`:6-10`）写明：补丁**整块替换**目标行的 `config` 而不是深合并，所以一个「按模式取不同值」的行不能把值写在 base 里，否则上层要重述全部键。base 只放共享的插件身份和中性默认，具体值由每个模式的 bundle 补齐。这也是 `persona: ''` 和 `agents: []` 看起来像占位符的原因——它们就是占位符。

### web-app（424 行）与 headless（35 行）

已经在第一、二节讲完。一句话对比：headless 在 base 上**加三行**，web-app 在 base 上**加约 60 行、关约 22 行**。

`disabled: true` 的意义再强调一次：它保留行的存在与 id，只是不激活。因此 (a) `--dump-config` 里能看到这一行确实被某一层关掉了，(b) 用户在自己的 `cordis.patch.yml` 里写一句 `- id: tool-bash` / `disabled: false` 就能把它开回来，(c) 组合顺序变化时它不会因为「不在名单里」而悄悄复活。

---

## 六、四个 agent preset

Web 上被关掉的那些「每 agent 一份」的行，由 `packages/preset/agent-presets` 按会话挂回来。preset 是一个目录，里面一个 `agent.cordis.yml` 加一个 `preset.yml`（显示名与排序）。发行版自带四个，在 `apps/cli/config/agent-presets/`。

一个关键约束写在 `apps/cli/config/agent-presets/standard/agent.cordis.yml:11-18`：**preset 里一个 provide 服务的行，必须待在带 `isolate` realm 的 group 里**。否则它发布到根 realm，就是进程级的——另一个 preset 发布同名服务会碰撞，host 侧的读者会替所有会话解析到某一个 preset 的实例。`dsh-agent-presets` 在挂载时就拒绝这种组合。

| preset | 显示名 | 组成 | compaction |
|---|---|---|---|
| `standard` | 标准模式 | persona + agent-instructions + bash/pwsh + fs + fs-search + jobs + skill 两件套 + goal 工具 + plan-mode（isolate realm）+ compaction 组（isolate realm）+ delegation 组（isolate realm，含默认 `disabled` 的 codex / claude-code 两个 provider 行）+ ask-user + todo + web | 有 |
| `code` | PTC 模式 | 与 standard 逐行相同，末尾多一行 `tool-presentation` / `mode: code` | 有 |
| `minimal` | 极简模式 | persona（`complete: true`）+ 持久 bash + str_replace_editor，共 62 行 | **无** |
| `cordis` | 创造模式 | standard 去掉 skill 两件套，加 `tool-cordis` 与两个自带 skill，persona 换成一段讲「两个平面」的长文 | 有 |

`standard` 里三个 group 各自的 realm 边界值得看一眼，因为它们是「什么该隔离、什么不该」的现成教材：

```yaml
- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
```

（`apps/cli/config/agent-presets/standard/agent.cordis.yml:137-142`）compaction 后端和 pruner 共一个 realm，因为 `compaction-basic` 用 `ctx.get` 取 `toolResultPrune`，pruner 必须在同一 realm 里（`:128-129`）。但 `tokenMeter` **刻意不在这个 realm**（`:131-136`）：计量表留在 host 平面，它按 Session 折叠，还拥有浏览器要读的 context-meter 投影单元——放进 realm 的话，那些单元会随着「当前挂了哪些 preset」而来来去去。

### minimal：Claude SWE 兼容的 RL 组合

`apps/cli/config/agent-presets/minimal/agent.cordis.yml` 全文 62 行，文件头（`:1-6`）说得很直接：

> The persona is the complete system prompt, so global identity, Web orientation, tool guidance, and later assembly listeners cannot add prompt text. Runtime context snapshots are suppressed for this preset, and the model composes only persistent `bash` and `str_replace_editor`. Context compaction is absent.

三行配置实现这句话（`:8-13`）：

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: You are a helpful software engineer assistant.
    complete: true
    includeRuntimeContext: false
```

`complete: true` 的实现在 `packages/preset/persona/src/index.ts:61-66`：它给 section 加上 `complete: true` 标记，system-prompt 装配在所有监听器跑完之后把这一段**恢复为唯一 section**。`includeRuntimeContext: false` 调 `ctx.systemPrompt.suppressRuntimeContext()`（`:67`），丢弃动态上下文快照。合起来的效果是：模型收到的 system prompt 逐字就是 `You are a helpful software engineer assistant.`，一个字不多。

工具只有两个。持久 bash 在一个 `isolate: { terminals: true }` 的 group 里（`:18-44`），超时 300,000 毫秒，工具描述是七条 SWE-bench 风格的 bullet（`:36-44`）：

```
Run commands in a bash shell
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* You don't have access to the internet via this tool.
* You do have access to a mirror of common linux and python packages via apt and pip.
* State is persistent across command calls and discussions with the user.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background.
```

文件系统那一段（`:46-62`）用 `isolate: { fs: true }` 把 host 的沙箱化 provider 换成裸的 `fs-local`（`cwd` 取 `DSH_CWD` 或 `process.cwd()`），`str_replace_editor` 与它共享 realm，`maxOutputChars: 16000`。

**没有 compaction 组、没有 fs-sandbox、没有 skill、没有 plan mode、没有 subagent。** 这个组合就是 `BENCHMARK.md` 指向的那一个——同样的配方以 `examples/jsonrpc-agent/minimal.cordis.yml` 的形式交给 Python SDK 使用，细节见 [12 产品表面与协议](12-surfaces-and-protocols.md)。它同时也说明了一件事：dsh 的「全部功能」和「跑分用的组合」是两个可以差得很远的东西，而它们的差别是一个 62 行 vs 251 行的 YAML 文件，不是编译开关。

### cordis：让 agent 写 agent

`cordis` preset 的 persona 里嵌了一段编排规则（`apps/cli/config/agent-presets/cordis/agent.cordis.yml:20-29`），教模型判断一个改动属于 host 平面还是 agent preset：

> A row that publishes a service belongs in the host composition, or inside an `isolate` realm if the preset genuinely owns that service and nothing outside one agent reads it.

以及一条硬约束：自己写的 preset 放在 `$DSH_HOME/.agent-presets/<id>/`，**绝不许改发行版自带的那份**。文件头（`:9-12`）把信任等级挑明了：`cordis_mount` 对活着的运行时求值模型写的 JavaScript，「把这个 preset 上的会话当成 shell 访问看待」。

---

## 七、启动里那些不显眼但必要的包

上面 YAML 里出现过、但很容易被当成噪音的几行，实际承担了这套组合能工作的前提。

**`packages/typert`（8,430 行源码，全仓第三大）** 分三个包：`registry`（`ctx.typert`，运行时的包反射与 schema 存储）、`loader`（扫描 Loader entry，把生成的 host 契约注册进去）、`generator`（构建期从源码类型生成产物）（`packages/typert/README.md:5-11`）。它在 base 里是三行（`packages/bundle/base/cordis.patch.yml:30-37`），加上 `api-gateway`。它解决的问题是：浏览器要调 host 上某个服务的方法，谁来保证两端签名一致？答案是从 TypeScript 源码类型生成 Remote 契约，而不是手写 DTO。详见 [11 Web 客户端与 host](11-web-client-and-host.md)。

**`settings`**：`ctx.settings` 是「命名空间 + schema」的注册表，解析分三层——schema 默认值 → 注册者所在组合的 `base`（它自己的 cordis.yml entry config 子集）→ 用户文档里的那一段（`packages/settings/settings/README.md:5`）。所以 base 里 `llm-deepseek` 那一行不内联 key 和 endpoint（`packages/bundle/base/cordis.patch.yml:446-449` 的注释），它们每次请求从 `llm-deepseek:` 设置段解析。**没挂 provider 时消费者退回只读 entry config**，组合照常工作。

**`credentials`**：一句话原则——**配置里只放引用，不放密钥**（`packages/credentials/credentials/README.md:5-7`）。`apiKeyEnv: DEEPSEEK_API_KEY` 是配置，值在 credential provider 那边；`resolve(ref)` 每次操作调一次、不跨操作缓存，所以改了密钥下一次请求就生效，不用重启插件；空字符串一律视为「未配置」。

**`identity/anonymous-user-id`**：一个随机 UUID v4，存成 `$DSH_HOME/.anonymous-user-id` 的一行（`packages/identity/anonymous-user-id/README.md:5`）。遥测的 Resource `user.id`、`/feedback` 的回执、DeepSeek 请求的 `x-deepseek-harness-user-id` 都用它。README 明确它**不从主机名、网络地址、git remote 或任何可识别来源派生**，删掉文件即重置。

**`workspace`**：`ctx.workspaceRegistry`，目录的稳定 id、标题、会话成员顺序（`packages/workspace/workspace/README.md:5`）。只有 web-app 层挂（`packages/bundle/web-app/cordis.patch.yml:73-74`），因为 headless 没有「多个工作区」这个概念。

**`storage`**：`ctx.storage` 是非会话数据的中枢——命名后端注册表 + 数据形态挂载，**中枢自己不做 IO**（`packages/storage/storage/README.md:5`）。web-app 挂了 `storage` + `storage-json`（根在 `dshHomePath('storages')`）+ `storage-domain`（路由到 `json`）三行（`packages/bundle/web-app/cordis.patch.yml:51-62`）。会话日志不走这里，它有自己的 append-only 通道，见 [05 Session](05-session.md)。

---

## 八、为什么要 fork Cordis：18 项本地修改

`vendor/README.md:29-50` 列了 18 条本地修改，要求「每一处与上游的分歧都必须列出」。按「dsh 为什么需要」归类，是四类：

### 生命周期加固（第 6、7 项）

第 6 项（`vendor/README.md:38`）是最长的一条，全是重入式卸载的坑：effect 的 owner-list wrapper 在 setup 体运行**之前**注册，所以从 setup 内部发起的卸载会等 setup 和它收集的每个 cleanup；同步 setup 失败会移除 wrapper 并回滚已收集的 cleanup；`UNLOADING` 状态下拒绝创建新 effect（`PENDING` 和 `LOADING` 仍合法）——防止 cleanup 期间注册的东西逃出卸载快照；子 fiber 在 `internal/plugin` 发布**之前**就拿到父持有的 disposer；teardown 通知的失败按观察者隔离，一个回调不能饿死同僚。

为什么 dsh 需要：dsh 的树是活的。用户改一行 `cordis.patch.yml`，HMR 会卸载一批 fiber 再挂一批；一个 agent preset 随会话挂载与卸载；`tool-cordis` 让模型自己 mount/retract 插件。上游 Cordis 的卸载路径没被这样折腾过。

### 事务性重组（第 8、12、14 项）

第 8 项（`:40`）把 Loader/Include 的配置调和改成事务性的：Loader 在卸载前先 import 新的 entry 名字，等生命周期落定，候选应用失败就恢复旧插件或旧配置；group 更新并发启动候选、等待每个结果、失败时撤销新增与修改；Include 读取并校验**分离的**候选内容，对克隆应用补丁，调和树，成功之后才提交缓存。

第 12 项（`:44`）是一个真实死锁的修复：Include 的每一次子树变更走同一个队列（group 的事务 `update` 不可重入），HMR 主 watcher 加 `ignoreInitial: true`（初次扫描会重播 boot 刚消费过的文件，其中一个配置文件的 `add` 会在 initial apply 中途触发 refresh）——串行化之后，一次失败的 initial apply 的回滚会 dispose HMR，而 HMR 的 teardown drain 又在等排在同一个 apply 后面的 refresh，**退出码 13 且无任何诊断**。

第 14 项（`:46`）是 Windows 特有的：Loader 子进程 dispose 后系统可能短暂保留目标句柄，上游那个 fire-and-forget 的 rename 会变成 unhandled rejection 并丢掉持久化的 `disabled` 状态；改成串行化 + 有界退避重试 `EACCES`/`EBUSY`/`EPERM`。

为什么 dsh 需要：一次热重载失败之后，树必须还是可用的。

### 惰性配置（第 15、18 项）

第 15 项（`:47`）移植了上游的 PR #41：fiber 保留**原始**配置，只在声明的注入激活之后才通过 `internal/config` 解析。这就是 `task: !!js ctx.headlessStartup.task`、`port: !!js ctx.webStartup.port ?? 3080`、`trustedHosts: !!js ctx.webRuntime.trustedHosts` 这些表达式能写出来的原因——没有它，这些表达式会在服务还不存在时求值成 undefined。而且解析只作用于 entry 根，子插件保持调用者拥有的配置身份。

第 18 项（`:50`）补上最后一块：`disabled: !!js` 表达式在**每次挂载判定时**求值，原始节点留在选项里所以写回时仍是 `!!js` 形式。`disabled` 是唯一被插值的元数据字段。base 里 `disabled: !!js process.platform === 'win32'` 这类按平台互斥的行靠它工作。

### 补丁算法导出（第 11 项）

第 11 项（`:43`）把 Include 私有的 `applyPatches` 抽成导出的纯函数 `applyEntryPatches(data, patches, warn)`，并导出 `!!js` YAML 方言 `entryListSchema`。目的写得很明确：`dsh --dump-config` 要在不启动树的情况下打印出「include 会挂载的一模一样的东西」，而**配置工具绝不能重新实现（并因此漂移出）补丁算法**。

同一条还修了上游的一个真 bug：`applyEntryPatches` 在每个 entry 被 insert 时就为它建索引，因此同一个列表里靠后的补丁可以配置或禁用靠前补丁插入的行；上游只在补丁循环之前建一次 id 索引，被插入的行永远打不上补丁。这对 dsh 是致命的——dsh 把空 profile 根、每个 bundle 的补丁层、profile 和 home 的 `cordis.patch.yml`、`--patch` 叠加层全部当作**同一个 include 层级上的兄弟补丁列表**，而补丁不跨 include 边界。没有这个修复，「用户在自己的 patch 里关掉 web-app 插入的某一行」根本做不到。

其余几项是工程性的：包名 rescope 到 `@deepseek-ai`（第 17 项，避免占用上游 npm 名字）、package.json/tsconfig 重生成（第 2、3 项）、显式 `.ts` 说明符（第 4 项）、Node 原生 TypeScript 转换所需的 type-only import 标注（第 10 项）、JSDoc 补全（第 7 项，纯注释，为了 API 文档生成器）、hmr 去 i18n（第 1 项）、精确配置文件监听（第 9 项）、两处类型与发布清单修正（第 13、16 项）。

---

## 九、代价与失效点

**读一个 YAML 行需要知道包名映射。** `- id: tool-fs-search` / `name: '@deepseek-ai/dsh-tool-fs-search'`——id 是补丁的寻址键，name 是 npm 包。改 id 会让上层补丁找不到目标，而且不会报错，只是「那条补丁没生效」。上游的应对是 `assertEntriesActivated` 的 fail-loud 与 `--dump-config`，但补丁没命中任何 id 本身不是错误。

**`config` 整块替换而非深合并。** 这是 base 文件头（`:6-8`）反复强调的。一个上层补丁想改某一行的一个键，必须重述这一行的**全部**键。web-app 里 `session-query-sqlite` 那段（`:26-29`）就是在解释自己为什么要重述 `path` 和 `openAt` 两个键。这个规则很容易出静默错误：漏写一个键，那个键就退回 schema 默认值。

**PENDING 不报错是双刃剑。** 一行因为依赖服务缺失而永远 PENDING，在 `--dump-config` 里和一行正常的 row 看不出区别。要判断一行到底有没有激活，得看 host 平面的 plugin-inventory 投影（Web 的设置页里有），或者等一个功能不工作再回头查。

**preset 的 realm 规则是运行时约束，不是类型约束。** 「provide 服务的行必须在 isolate group 里」由 `dsh-agent-presets` 在挂载时检查并拒绝，写错了在启动那一刻才知道。而「哪些服务该留在 host 平面」这条判据没有任何机器检查——它只存在于 YAML 注释和一篇 Agent Note 里。web-app 那 130 行注释就是这条经验的沉淀，其中至少两处（`tool-jobs`、`tool-goal`）明确写着「曾经放错，症状是……」。

**vendored 意味着安全更新要自己跟。** 9 个包、18 项本地修改，上游发新版时同步流程是手工的五步（`vendor/README.md:52-60`）。收益是完全掌控框架层，代价是这一层的 CVE 没人替你推。

---

## 十、别人怎么做

| harness | 「装了什么」由谁决定 | 能不能按会话换一套 | 第三方能插进来吗 |
|---|---|---|---|
| dsh | 若干层 `cordis.patch.yml` 补丁，每行一个 npm 包 | 能：agent preset 是一个目录一个 YAML，`$DSH_HOME/.agent-presets/` 下用户自己写 | 能：`dsh plugin --profile <name> add <package>` 装进 profile 的 node_modules，再在 patch 里加一行 |
| Claude Code | 内置工具集固定，配置项 + MCP + hooks + subagents 定义文件 | 部分：subagent 定义可换模型与工具子集 | MCP server、hooks、skills、plugins |
| Codex | Rust 内建工具集，`config.toml` 配置项 + agent role 的 toml | 部分：agent role 可带模型、reasoning effort 与 developer instructions | MCP、hooks（11 个事件）、Extension API 的 `context_contributors()` |
| OpenCode | TypeScript 内建工具 + `agent/agent.ts` 里的 agent 定义 | 能：agent 配置可定制工具与权限 | npm/本地插件，14 个钩子；MCP |
| pi | 内建 7 个工具 | 部分：扩展可在 `before_agent_start` 里换 systemPrompt | Extension API（30+ 事件、`registerTool`/`registerCommand`/`registerProvider`）、Packages；无 MCP |
| mini-swe-agent | `mini.yaml` 151 行 + `DefaultAgent` 190 行，只有一个 bash 工具 | 换 yaml 就是换一切 | 不适用 |

差别不在「能不能扩展」——每一家都有扩展点。差别在于**核心自己是不是用同一套扩展机制拼出来的**。Codex 的 `ToolRouter` 是 Rust 里的一个结构体，扩展通过 Extension API 往里加东西；dsh 的 `tools` 注册表本身就是补丁里的一行（`packages/bundle/base/cordis.patch.yml:424-425`），和一个第三方工具包在机制上没有区别。代价也从这里来：dsh 的 219 个包大部分是这个决定的直接后果，而 mini-swe-agent 用 341 行做到了一个能跑 SWE-bench 的 agent。

另一个可对照的点是「一次跑分用的组合」怎么表达。mini-swe-agent 的答案是「就是那个 yaml」；dsh 的答案是 `minimal` preset 那 62 行——两者形态惊人地接近，区别只在 dsh 的 62 行是从 451 行的 base 上**减**出来的，而 mini 的 151 行是全部。

---

## 十一、怎么自己核

在 dsh 仓库根目录（`47f94385`）：

```bash
# 三个 bundle 的补丁文件行数
wc -l packages/bundle/*/cordis.patch.yml

# web-app 里被关掉的行有哪些
grep -n -B1 'disabled: true' packages/bundle/web-app/cordis.patch.yml

# 四个 preset 的规模与它们各自挂了哪些行
wc -l apps/cli/config/agent-presets/*/agent.cordis.yml
grep -n '^\s*- id:' apps/cli/config/agent-presets/minimal/agent.cordis.yml

# code / cordis 两个 preset 相对 standard 到底改了什么
diff apps/cli/config/agent-presets/standard/agent.cordis.yml \
     apps/cli/config/agent-presets/code/agent.cordis.yml

# 补丁叠加顺序的定义处
sed -n '122,129p' apps/cli/src/profile-boot.ts

# .env 拒绝名单
sed -n '93,117p' packages/boot/app-boot/src/index.ts

# vendored Cordis 的 18 项本地修改（数一下条目）
grep -c '^[0-9]\+\. \*\*' vendor/README.md
```

装好 dsh 之后，不启动树也能看到合成结果：

```bash
dsh --profile web --dump-default-config    # 只有 bundle 层
dsh --profile web --dump-config            # 加上用户层与 --patch 叠加层
```

这两条走的是与真实挂载完全相同的 `applyEntryPatches`（`vendor/README.md:43`），所以 dump 出来的就是会挂载的。

---

相关：[00 总览](00-overview.md) 给出整体地图；[01 System Prompt](01-system-prompt.md) 讲 persona 与 section 如何装配成最终字符串；[03 Agent Loop](03-agent-loop.md) 讲这棵树跑起来之后一个 turn 怎么走；[09 扩展与 Code Mode](09-extensions-and-code-mode.md) 讲 `tool-cordis` 与 `code` preset 背后的机制；[14 横向对比](14-comparison.md) 有更完整的六家对照。术语见[附录 A 术语表](appendix-a-glossary.md)。
