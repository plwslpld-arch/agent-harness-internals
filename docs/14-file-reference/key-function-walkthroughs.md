---
sources: [{"repo":"deepseek-harness","path":"apps/cli/src/profile-boot.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/boot/app-boot/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"vendor/loader/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"vendor/cordis/src/context.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"vendor/cordis/src/service.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/agent-loop/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/llm/llm-deepseek/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/core/tools/src/index.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"packages/session/session-persistence/src/coordinator.ts","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, test, inference]
---

# 关键函数代码块解析

这篇不追求精确到行号，而是解释关键代码块在做什么。读法是：先看“像人话一样的解释”，再看“伪代码结构”，最后回到真实源码。

## 1. `runProfile()`：把一个命令变成一棵插件树

位置：[apps/cli/src/profile-boot.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/apps/cli/src/profile-boot.ts)

它解决的问题：用户输入的是 `dsh web` 或 `dsh --profile headless` 这类命令，但程序真正需要的是一棵 Cordis 插件树。`runProfile()` 就是把“命令参数 + 环境变量 + profile + patch”变成运行时系统。

简化结构：

```ts
composeProfile(profile, patchFiles)
createProcessShutdown(disposeRootContext)
boot(rootConfig, allPatches)
provideLaunchEnvironment()
provideCmdlineArgs()
watchUserPatches()
return ctx
```

正常路径：

1. 读取 profile。
2. 合并 bundle patch、用户 patch、home patch、CLI overlay。
3. 创建 shutdown 控制器。
4. 调用 app-boot 的 `boot()`。
5. 把命令行参数和环境快照注入 context。
6. 监听用户 patch 变化，让配置可以更新。

失败路径：

- profile 解析失败：启动失败。
- patch 文件非法：启动失败。
- boot 中某个插件激活失败：fail-loud 报错。
- shutdown 正在发生时 watcher 报错：如果树已经退出，不把它当成新错误。

非研发理解：这一步像“打开一个工作台模板”。模板里决定了这次是 Web 工作台、headless 一次性任务，还是别的模式。

## 2. `loadLayeredEnv()`：为什么 API key 可以每个人自己配

位置：[packages/boot/app-boot/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/boot/app-boot/src/index.ts)

它解决的问题：程序需要环境变量，但不同来源的环境变量可信度不同。项目 `.env`、用户 home `.env`、进程环境不能混成一团。

简化结构：

```ts
home = resolveDshHome()
inherited = process.env
project = read .env from current directory
user = read .env from DSH_HOME
reject bootstrap-only names
apply values without overriding inherited variables
return launchEnvironmentSnapshot
```

重点：

- `DEEPSEEK_API_KEY` 可以作为普通凭据引用，每个人本地用自己的值。
- 某些变量不能放进 `.env`，例如会改变进程启动、模块加载、网络代理或证书信任的变量。
- 最终返回的是 snapshot，后面模型适配器能知道 key 或 base URL 来自哪个环境层。

非研发理解：这相当于“员工可以带自己的门禁卡，但不能随便改大楼安检系统”。

## 3. `boot()`：真正启动 Cordis 应用

位置：[packages/boot/app-boot/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/boot/app-boot/src/index.ts)

它解决的问题：配置文件只是文本，必须变成运行中的插件实例。

简化结构：

```ts
create Context
install fail-loud
mount Loader / Include / Group
mount root config
await loader tasks
assert entries loaded
assert entries activated
return ctx
```

正常路径：

1. 创建 Cordis `Context`。
2. 注册 Loader、Include、Group 等基础插件。
3. 用 root config 和 patch 生成 entry tree。
4. 等所有 entry 加载和激活。
5. 返回可运行的 context。

失败路径：

- entry 加载失败：不能假装启动成功。
- 插件激活失败：需要 fail-loud 暴露。
- 后台 promise rejection：不能静默丢掉。

非研发理解：这一步像“把公司组织架构图变成真实入职的员工和岗位”。图纸存在不等于人已经到岗。

## 4. `Context.extend()` / `isolate()` / `intercept()`：插件系统的三个基础动作

位置：[vendor/cordis/src/context.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/vendor/cordis/src/context.ts)

它们解决的问题：同一个进程里有很多插件，既要共享能力，又要允许局部覆盖。

简化理解：

```ts
extend(meta)    // 创建一个带额外信息的子上下文
isolate(name)   // 某个服务在子树里单独隔离
intercept(name) // 给下游使用某个服务时追加配置
```

例子：

- 一个 Agent 有自己的 scope。
- 某个子 Agent 可以看到不同工具。
- 某个插件使用同一个 service，但拿到的配置被 intercept 改过。

非研发理解：这像同一家公司里不同项目组。大家共享公司系统，但某个项目组可以有自己的权限、预算和流程。

## 5. `Service` 构造函数：为什么服务会自动挂载和清理

位置：[vendor/cordis/src/service.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/vendor/cordis/src/service.ts)

它解决的问题：插件提供的能力必须能注册，也必须能在插件卸载时清理。

简化结构：

```ts
constructor(ctx, name) {
  attach ctx and name
  maybe make service callable
  ctx.reflect.provide(name, service, check)
}
```

重点：

- service 被注册到 `ctx`。
- owning fiber 负责生命周期。
- 如果插件卸载，service 也应该随之撤销。

非研发理解：服务不是永久焊死在系统里的。它像一个岗位：插件上岗时岗位出现，插件离岗时岗位撤销。

## 6. `Loader.constructor`：把配置 entry 变成插件实例

位置：[vendor/loader/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/vendor/loader/src/index.ts)

它解决的问题：profile 和 patch 最终会形成很多 entry，Loader 要负责导入、激活、更新和卸载。

简化结构：

```ts
provide loader service
on internal/config: interpolate config
on internal/update: write updated config
on internal/plugin: bind fiber to entry
handle self-dispose and disabled write-back
mount isolate helper
```

正常路径：

- 读取 entry。
- 解析模块。
- 启动插件 fiber。
- 插件提供 service 或监听 event。

失败路径：

- 模块导入失败。
- inject 依赖不满足。
- 插件主动 dispose。
- HMR 或配置更新导致 reload。

非研发理解：Loader 像“人事系统 + 排班系统”。配置说要哪些岗位，它负责把人安排上岗；配置变了，它负责换班和撤岗。

## 7. `AgentLoop.createAgent()`：创建一个能工作的 Agent

位置：[packages/core/agent-loop/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/agent-loop/src/index.ts)

它解决的问题：Agent 不是一个函数调用，而是一组生命周期资源：session、inbox、loop machine、scope、registry、teardown。

简化结构：

```ts
prepare session
prepare agent lifecycle
run setup(agentCtx)
publish session and agent
return { agent, dispose }
```

正常路径：

1. 准备 Session。
2. 创建 ReactLoopAgent。
3. 运行 setup，让调用者安装模型选择、工具限制等。
4. 发布到 session registry 和 agent registry。
5. 监听后续 followup/steer/cancel。

失败路径：

- setup 抛错：dispose 已创建资源。
- owner context 被卸载：取消创建。
- caller signal abort：创建过程停止。
- 同一个 session id 已存在：拒绝冲突。

非研发理解：创建 Agent 像“开一个新任务办公室”。它不只是派一个人，还要开房间、配权限、开日志、设置退出流程。

## 8. `resolveAdapterOptions()`：DeepSeek 请求前的配置结算

位置：[packages/llm/llm-deepseek/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/llm/llm-deepseek/src/index.ts)

它解决的问题：模型请求需要 endpoint、key、模型列表、thinking 策略、token 上限、retry 策略。这些不能随便混用。

简化结构：

```ts
validate thinking and reasoningEffort
validate contextWindow and maxTokens
resolve baseURL from config or environment
resolve apiKeyEnv, default DEEPSEEK_API_KEY
resolve model catalog
resolve retry policy
return connection options
```

重点：

- 没 key 不会让插件加载失败，而是在请求时返回 `MISSING_CREDENTIAL`。
- 配置变化影响下一次请求，不强行影响正在进行的 stream。
- 非法 settings 会保留 last-good 配置。

非研发理解：这像“每次打电话给供应商前确认电话号码、合同、预算和身份凭证”。不能拿旧号码配新钥匙，也不能把错误配置悄悄用上。

## 9. `ToolRuntime.execute()`：工具为什么必须走统一管道

位置：[packages/core/tools/src/index.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/core/tools/src/index.ts)

它解决的问题：模型想调用工具，但工具可能读文件、跑命令、访问网络、影响外部状态。必须统一审查、执行和记录。

简化结构：

```ts
create execution snapshot
run pre-execute policy
maybe ask approval
run guards
dispatch tool body
validate output
run post-execute policy
notify tools/result observers
return final result
```

正常路径：

- 工具参数先做 JSON snapshot。
- pre-execute 可以 allow、deny 或 ask。
- approval 通过后才执行。
- tool body 返回值必须符合 output schema。
- render 把结果变成模型可读内容。
- post-execute 可以接受或阻断结果。
- tools/result 事件通知审计、UI 或其他观察者。

失败路径：

- 工具不存在。
- Code Mode 下直接调用了非 `run_code` 工具。
- 参数或输出无法 JSON materialize。
- approval 不可用，ask 降级 deny。
- 工具执行中取消，区分“未开始”和“已开始”。

非研发理解：ToolRuntime 像“公司采购/审批/执行/报销系统”。不能让员工绕过审批直接花钱，也不能执行完不留记录。

## 10. `PersistenceCoordinator.append()`：Session 为什么能恢复和审计

位置：[packages/session/session-persistence/src/coordinator.ts](https://github.com/deepseek-ai/deepseek-harness/blob/47f943859bef60e4160492346772ded9b24f765a/packages/session/session-persistence/src/coordinator.ts)

它解决的问题：Agent 运行过程必须被可靠写入。否则任务中断后不能恢复，也无法审计工具和模型发生了什么。

简化结构：

```ts
snapshot events
serialize operations by session id
assert supported event shapes
check seq continuity
backend.appendBatch(meta, events, materialized)
advance cursor
invalidate prepared cache
```

正常路径：

1. 每批 event 先变成稳定 JSON 快照。
2. 同一个 session id 的操作排队串行。
3. 检查事件类型和 seq 是否连续。
4. 调 backend 写入。
5. 写成功后 cursor 前进。

失败路径：

- event 不能安全 JSON 化。
- seq 不连续。
- session id 冲突。
- 存储里已有不同 cwd 或不同 seed 的 session。
- 读取到新版本 required event，当前版本不认识时拒绝解释。

非研发理解：这像“财务流水账”。每笔流水必须编号连续，不能中间断号，也不能把两个不同项目的流水写到同一个账本。

## 代码块阅读方法

读这些函数时，不要从第一行逐字翻译。按四个问题读：

1. 这个函数在主链路里接过了什么责任？
2. 它把责任交给了谁？
3. 它在哪些地方拒绝继续？
4. 它留下了什么可验证证据？

只要能回答这四个问题，就已经比“看懂语法”更接近真正理解系统。
