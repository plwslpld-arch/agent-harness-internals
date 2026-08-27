# 启动、Profile、Bundle 与 Agent Preset

[返回 DeepSeek Harness 课程地图](README.md)

DeepSeek Harness 并不是从一个写死的 Agent 类启动全部能力，而是先让 Profile 决定加载哪些 Bundle，再把各层 Patch 合成为 Host 配置。当会话选择 Agent Preset 后，Preset 才会继续贡献 Persona、Prompt、Tools、Compaction 和委派能力，而理解这两级组合，才能解释「某个工具为什么出现在这个 Agent 中」。两层，不能混看。

## 四个词先分清

| 名称 | 作用 | 典型内容 |
| --- | --- | --- |
| Profile | 一次应用启动选择的组合入口 | 有序 Bundle 列表和用户 Patch |
| Bundle | 可安装的一层 Host 配置 | Session、模型、Sandbox、持久化、产品表面 |
| Patch | 对 Cordis Entry 列表的插入、替换或修改 | 增加插件、覆盖整段 config |
| Agent Preset | 某类 Agent 的能力组合 | Persona、Tools、Skills、Compaction、Delegation |

Profile 解决的是「这个进程装哪些系统能力」，而 Preset 决定「这个 Agent 看见并使用哪些能力」，因此 Sandbox Registry 可以属于 Host，Bash Tool 是否暴露给特定 Agent 则仍由 Preset 决定。

```text
启动参数选择 Profile
  → 依次解析 Bundle Patch
  → 追加 Profile 自己的 Patch
  → 合成 Host Entry 列表并启动服务
  → 会话选择 Agent Preset
  → 在 Agent Scope 中挂载 Prompt 与 Tools
```

### 第 1 站：Profile 清单保存有序 Bundle 列表

源码：[查看 Profile 类型](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L41-L94)

```typescript
export interface DshProfileManifest {
  bundles?: string[]
}

export interface Profile {
  name: string
  dir: string
  layers: ProfileLayer[]
  patchPath: string
  patches: PatchOptions[]
}
```

- **调用者**：命令行启动器根据 Profile 名称加载配置。
- **输入**：Profile 目录中的 `package.json` 和 `cordis.patch.yml`。
- **状态变化**：这里只描述加载后的数据结构，还未挂载插件。
- **返回**：有序 Bundle Layer 与用户 Patch 的 Profile 对象。
- **下一站**：`loadProfile()` 解析每个 Bundle 包及其 Patch。

因为后层可以覆盖前层，所以 Bundle 顺序本身，就是语义的一部分。课程或复现实验不能只列「安装了哪些包」，还要同时记录 Bundle 顺序和最终合成的配置。顺序会改变结果。

### 第 2 站：内置 Bundle 优先从当前安装解析

源码：[查看双锚点解析](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L333-L355)

```typescript
for (const anchor of [installAnchor, join(profileDir, 'package.json')]) {
  const dir = packageDirFromAnchor(anchor, packageName)
  if (dir !== undefined) return dir
}
```

- **调用者**：`loadProfile()` 为清单中的每个 Bundle 调用 `resolveBundleDir()`。
- **输入**：Bundle 包名、当前应用安装锚点和 Profile 目录。
- **状态变化**：没有写配置，只决定真实包目录。
- **返回**：首先命中的 Bundle 路径；两处都找不到则抛出带安装建议的错误。
- **下一站**：读取 Bundle 的 `package.json`，找到声明的 Patch 文件。

解析时先查安装锚点，是为了保证内置 Bundle 与正在运行的应用来自同一安装，而 Profile 本地依赖要等到第二顺位才提供扩展，这样 Profile 中的同名包也不能悄悄遮蔽内置核心层。

### 第 3 站：加载失败要尽早暴露

源码：[查看 `loadProfile()`](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L371-L402)

```typescript
const bundles = manifest.dsh?.profile?.bundles ?? []
const layers = bundles.map((packageName): ProfileLayer => {
  const packageDir = resolveBundleDir(...)
  const bundleManifest = JSON.parse(...)
  const declared = bundleManifest.dsh?.bundle?.patch
  if (declared === undefined) throw new Error(...)
  return { packageName, packageDir, patchPath, patches: loadOverlayPatches(...) }
})
```

- **调用者**：应用 Boot 逻辑。
- **输入**：Profile 名称、应用安装锚点、Harness Home 和是否读取用户层。
- **状态变化**：缺省模板可能首次初始化；每层 Patch 被解析。
- **返回**：完整 Profile；缺包、坏清单或伪装成 Bundle 的普通包会直接失败。
- **下一站**：`composeEntries()` 按顺序应用所有 Patch。

恢复诊断时可以用 `userLayer:false` 跳过损坏的用户 Patch，只查看 Bundle 默认组合，但这是专门留给故障恢复的入口，不能据此认为正常启动也会自动忽略用户配置。

### 第 4 站：最终 Entry 从空列表按层合成

源码：[查看 Entry 合成](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/packages/boot/app-boot/src/profile.ts#L405-L419)

```typescript
return applyEntryPatches(
  [],
  structuredClone(layers.flat()),
  warn,
)
```

- **调用者**：Boot include 和配置诊断使用同一合成函数。
- **输入**：已按 Bundle 顺序排列、最后再加用户层的 Patch 数组。
- **状态变化**：Patch 被应用到空 Entry 列表；使用 clone 避免修改原配置对象。
- **返回**：真正要挂载的 Cordis Entry 列表。
- **下一站**：Cordis 加载这些插件并按服务依赖激活。

Patch 遇到某一行的 `config` 时会整体替换，并不会做深度合并，因此即使用户只想改一个字段，也需要重复该层的完整 config，否则其他设置可能在无意间被删掉。课程讲「最终运行配置」时必须以合成结果为准，不能只看某个 Bundle 原文件。

## Host Plane 与 Agent Plane

标准 Agent Preset 一开头就划清了责任：Host 组合拥有 Registry、Sandbox、Approval、Persistence 和 Model Route，而 Preset 只在 Agent Scope 中贡献模型可见能力。

源码：[查看标准 Preset 的边界说明](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/apps/cli/config/agent-presets/standard/agent.cordis.yml#L1-L18)

```yaml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: >-
      You are a coding agent powered by the {{model}} model.

- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
```

源码：[查看 Persona 与平台工具](https://github.com/deepseek-ai/deepseek-harness/blob/b150a551b8d465e31e418e1b2eaf5e79bbb7d28e/apps/cli/config/agent-presets/standard/agent.cordis.yml#L20-L62)

Preset 负责选择 Bash 或 PowerShell 这一层工具表面，而底下的执行器和 Sandbox 仍然可以由 Host 提供。由于平台条件会在组合时生效，所以「源码里存在 Bash 插件」并不代表 Windows Agent 实际获得了 Bash。

## 为什么需要 Scope 与 Realm

一个进程可能同时挂载多个 Preset，并且服务多个 Session，一旦 Agent 私有服务被发布到 Root Realm，另一个 Preset 的同名服务就会与它冲突，Host Reader 也可能拿到错误实例。为此，Preset 用隔离 Realm 约束 Agent 私有状态，而跨 Session Registry 留在 Host，再按 Agent/Session ID 分区。

判断一个服务放哪一层，可以问：

1. 它是否在 Session 创建前就要解析？
2. 多个 Preset 是否必须共享同一个 Registry？
3. 状态是否天然按 Agent 或 Session Key 分区？
4. 是否有 Host 表面直接读取它？
5. 多次挂载是否会发生重复注册？

并不是所有「Agent 用到的服务」都该放进 Agent Realm，因为服务的所有权需要由生命周期和消费者共同决定。

## 用失败测试任务走一遍装配

1. CLI 选择一个 Profile，Profile 加载 Base、模式和产品表面 Bundle。
2. 用户 Patch 覆盖工作区、模型路由或遥测等部署设置。
3. Host 挂载 Session、LLM、Approval、Sandbox、Persistence 等共享服务。
4. 新会话选择 standard Preset，挂载 Persona、文件和 Shell Tool、Skills、Compaction 与委派工具。
5. Agent Loop 从 Scope 获取这些服务，开始第一 Turn。

排查也要按装配顺序。如果工具缺失，先确认 Profile 是否包含对应 Bundle，再看 Patch 是否禁用或覆盖、Host Registry 是否已挂载、Preset 是否暴露工具。最后还要检查平台条件是否关闭，以及 Agent Scope 是否解析到了正确实例。

下一篇进入模型请求内容：[Prompt、运行时 Context 与请求 Cache](02-prompt-context-cache.md)。
