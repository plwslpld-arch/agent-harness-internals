# 启动、Profile、Bundle 与 Agent Preset

[返回 DeepSeek Harness 课程地图](README.md)

DeepSeek Harness 启动时不会把所有能力塞进一个写死的 Agent 类。它先由 Profile（配置档）选出要加载的 Bundle，再按顺序应用各层 Patch（补丁），最后合成 Host 配置。

会话选定 Agent Preset（智能体预设）后，Preset 才会把 Persona、Prompt、Tools、Compaction 和委派能力装入当前 Agent。两层不能混看。只有分清这两级组合，你才能解释「某个工具为什么会出现在这个 Agent 中」。

## 四个词先分清

| 名称 | 作用 | 典型内容 |
| --- | --- | --- |
| Profile | 一次应用启动选择的组合入口 | 有序 Bundle 列表和用户 Patch |
| Bundle | 可安装的一层 Host 配置 | Session、模型、Sandbox、持久化、产品表面 |
| Patch | 对 Cordis Entry 列表的插入、替换或修改 | 增加插件、覆盖整段 config |
| Agent Preset | 某类 Agent 的能力组合 | Persona、Tools、Skills、Compaction、Delegation |

Profile 回答「这个进程要装哪些系统能力」，Preset 则回答「这个 Agent 能看见并使用哪些能力」。因此，Sandbox Registry 可以由 Host 持有，但 Bash Tool 要不要暴露给某个 Agent，仍然要由 Preset 决定。

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

后一层可以覆盖前一层，所以 Bundle 的排列顺序会直接改变配置含义。顺序会改变结果。做课程实验或复现问题时，不能只记「安装了哪些包」，还要一并保存 Bundle 顺序和合成后的完整配置。

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

先看安装锚点。解析器从当前应用的安装锚点开始查找，以便让内置 Bundle 与正在运行的应用来自同一份安装。只有第一处找不到时，它才会去查 Profile 的本地依赖，因此同名包无法悄悄遮蔽内置核心层。

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

做恢复诊断时，你可以传入 `userLayer:false` 跳过已损坏的用户 Patch，单独查看 Bundle 的默认组合。这个入口专供故障恢复使用，正常启动时并不会自动忽略用户配置。

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

Patch 处理某一行的 `config` 时，会直接替换整个对象，不会逐层合并字段。因此，哪怕用户只想改一个字段，也要重复写出该层的完整 config，否则其他设置就可能随整体替换一起消失。所以，讲解「最终运行配置」时要查看完整合成结果，不能只读某个 Bundle 的原始文件。

## Host Plane 与 Agent Plane

标准 Agent Preset 在开头就把责任划分清楚：Host 组合持有 Registry、Sandbox、Approval、Persistence 和 Model Route，Preset 只在 Agent Scope 中注册模型能看见的能力。

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

Preset 选择要向模型展示 Bash 还是 PowerShell，底层执行器和 Sandbox 则仍可由 Host 提供。平台条件会在组合配置时生效，所以即使源码里存在 Bash 插件，Windows 上的 Agent 也未必能够使用 Bash。

## 为什么需要 Scope 与 Realm

一个进程可能同时挂载多个 Preset，还要为多个 Session 提供服务。如果 Agent 的私有服务发布到 Root Realm，另一个 Preset 注册的同名服务就会与它冲突，Host Reader 也可能读到错误实例。因此，Preset 用隔离的 Realm 约束 Agent 私有状态，跨 Session 共享的 Registry 则留在 Host，并按 Agent/Session ID 分区。

判断一个服务放哪一层，可以问：

1. 它是否在 Session 创建前就要解析？
2. 多个 Preset 是否必须共享同一个 Registry？
3. 状态是否天然按 Agent 或 Session Key 分区？
4. 是否有 Host 表面直接读取它？
5. 多次挂载是否会发生重复注册？

判断服务应该归属哪一层时，不要只看 Agent 会不会用到它，还要同时核对服务的生命周期和实际消费者。

## 用失败测试任务走一遍装配

1. CLI 选择一个 Profile，Profile 加载 Base、模式和产品表面 Bundle。
2. 用户 Patch 覆盖工作区、模型路由或遥测等部署设置。
3. Host 挂载 Session、LLM、Approval、Sandbox、Persistence 等共享服务。
4. 新会话选择 standard Preset，挂载 Persona、文件和 Shell Tool、Skills、Compaction 与委派工具。
5. Agent Loop 从 Scope 获取这些服务，开始第一 Turn。

排查工具缺失时，也要沿着装配顺序往下查。先确认 Profile 是否包含对应 Bundle，再检查 Patch 有没有禁用或覆盖它，然后核对 Host Registry 是否已挂载、Preset 是否已暴露该工具。最后，再看平台条件是否关闭了它，以及 Agent Scope 是否解析到正确实例。

下一篇进入模型请求内容：[Prompt、运行时 Context 与请求 Cache](02-prompt-context-cache.md)。
