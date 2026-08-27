# Runtime、Project、Config 与 Provider 的启动顺序

[返回 OpenCode 课程地图](README.md)

OpenCode 不会让每个界面各自创建一套 Agent。它先按 Directory 确认 Project 和 Instance，依次读取全局、项目、托管与系统来源，把它们合成有效 Config，再据此筛选 Provider（模型提供商）并建立 Map，Session 随后都引用这套实例服务。

```text
Directory → Project / Instance
              ↓
     Config 来源合并与权限覆盖
              ↓
        Provider Map + Models
              ↓
           Session 创建
```

## 第 1 站：Config Merge 还会处理数组和来源范围

源码：[查看 Config 合并](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/config/config.ts#L351-L429)

```typescript
const merge = (source: string, next: Info, kind?: ConfigPlugin.Scope) => {
  result = mergeConfigConcatArrays(result, next)
}
```

- **调用者**：Instance 初始化时的 Config Loader。
- **输入**：全局、项目、Plugin、托管目录和系统管理配置。
- **状态变化**：按来源顺序合并，数组字段使用拼接/去重语义，权限还有专门覆盖。
- **返回**：当前 Project 的有效 Config。
- **下一站**：Agent、Provider、Permission、Plugin 与 Server 初始化。

所以，只看到项目配置最后写了 `deny`，还不能断定它就是最终规则，因为系统管理配置可能随后改写这个值，Instructions、Plugins 等数组也不会像普通标量那样直接覆盖。排查时要把字段的 Provenance 一并输出。

### 为什么配置来源必须保留身份

合并后的值只能告诉你「现在是什么」，却看不出谁写入了它、后来的来源凭什么把它改掉。当个人、仓库和组织管理配置同时出现时，Loader 必须保留每个关键字段来自哪里、按什么顺序合并，才能阻止恶意仓库改掉管理员对 Provider 或 Permission 的禁令。只打印最终 JSON，往往追不到真正动过这个值的来源。

## 第 2 站：Provider 先受白名单和黑名单过滤

源码：[查看 Provider 过滤](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/provider/provider.ts#L1420-L1427)

```typescript
if (enabled && !enabled.has(providerID)) return false
if (disabled.has(providerID)) return false
```

- **调用者**：Provider Loader 构建当前实例 Provider Map。
- **输入**：发现的 Provider、Enabled/Disabled 集合与凭据环境。
- **状态变化**：过滤不允许的 Provider，解析每个 Provider 的 Models 与 SDK 配置。
- **返回**：Session 可使用的 Provider Map。
- **下一站**：Agent/Session 按 `providerID/modelID` 查实际 Model。

模型目录里出现某个名字，并不能证明实例已经加载了对应 Provider，因为禁用规则、缺失的认证、尚未启动的 Plugin，甚至 SDK 解析失败，都可能把它挡在实例 Map 之外。看得到名字，仍可能用不了。

## 第 3 站：查到 Model 后还要解析具体 SDK

源码：[查看 `getModel()` 与 SDK 解析](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/provider/provider.ts#L1843-L1900)

```typescript
const provider = s.providers[providerID]
if (!provider) return yield* new ModelNotFoundError(...)

const sdk = await resolveSDK(model, s, envs)
```

- **调用者**：Session Prompt 在每次运行前解析 Agent 选择的模型。
- **输入**：Provider ID、Model ID、实例状态与环境凭据。
- **状态变化**：解析语言模型适配器及 Provider 选项。
- **返回**：可交给 LLM 层的 Model Language 实现。
- **下一站**：Session LLM 构造 System、Messages 与 Tools。

`ModelNotFound` 与底层 SDK 抛出的 `NoSuchModelError` 不在同一个阶段：前者说明实例目录没有查到这个模型，后者则说明目录虽然查到了，具体 Adapter（适配器）却无法把它交给模型服务。

## Project Identity 为什么重要

OpenCode 会按 Server、Directory、Project 和 Session 分层保存配置、数据库与事件，UI 也沿这些身份找到自己该看的内容。远程 Attach 时，Directory 指向服务端路径，所以客户端出现两个同名目录，并不能证明它们属于同一个工作区。为了让后续操作找回原来的运行边界，每份 Artifact（产物）都应同时保存 Server Identity 和 Project/Directory。

## 回到运费任务

用户在客户端选好目录后，服务端会按这个路径建立 Project 和 Instance，读入项目里的 Instructions 与权限规则，再让 Session 选择 Provider/Model。如果远端服务实际打开的并非用户以为的仓库，即使模型和工具都能正常运行，修改仍会落进错误的环境。因此，任务刚开始就要显示 Directory 和 Server Identity。

## 练习：为什么模型存在却仍然不可用

配置文件声明了一个模型，Provider 目录也包含它，但 Session 抛出 `ModelNotFound`。按顺序应检查哪些位置？

<details>
<summary>查看核对要点</summary>

先看有效 Config 有没有启用该 Provider、是否又有规则将它禁用，再检查凭据与 Plugin 能否让它进入实例 Map，然后核对 `providerID/modelID`，最后才查具体 SDK 如何解析。目录有没有这条元数据、实例能不能使用它、Adapter 能不能接上模型服务，分属三个阶段。

</details>

下一篇：[Session Prompt、LLM 与 Processor](02-session-llm-processor.md)。
