# Runtime、Project、Config 与 Provider 的启动顺序

[返回 OpenCode 课程地图](README.md)

OpenCode 不是每个界面各自创建一套 Agent。它先根据 Directory 建立 Project/Instance，加载全局、项目、托管与系统配置，再按有效配置构造 Provider Map。Session 只引用这套实例服务。

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

所以「项目配置最后写了 deny」不一定是最终规则：系统管理配置可能随后覆盖；Instructions、Plugins 等数组也不等同于普通标量覆盖。排查时应输出字段 Provenance。

### 为什么配置来源必须保留身份

合并后的最终值只能告诉你「现在是什么」，不能回答「谁有权覆盖谁」。在个人配置、仓库配置和组织管理配置同时存在时，来源身份也是安全边界：恶意仓库不应覆盖管理员禁止的 Provider 或 Permission。一个可调试的 Loader 应能为关键字段展示来源和合并顺序，而不是只打印最终 JSON。

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

模型目录里有一个名字，不代表该 Provider 已加载。禁用、认证缺失、Plugin 未启动或 SDK 解析失败都可能让它不在实例 Map 中。

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

`ModelNotFound` 与底层 SDK 的 `NoSuchModelError` 处在不同阶段：前者是实例目录没有，后者是具体 Adapter 无法兑现。

## Project Identity 为什么重要

OpenCode 的配置、数据库、事件和 UI 同时按 Server、Directory、Project、Session 多层分区。远程 Attach 时，Directory 是服务端路径；客户端本机出现同名目录不代表同一个工作区。任何 Artifact 都应保存 Server Identity 与 Project/Directory。

## 回到运费任务

用户在客户端选择一个目录，服务端据此建立 Project/Instance，并加载项目里的 Instructions 和权限规则。Session 随后选择 Provider/Model。若远端服务的目录不是用户以为的仓库，即使模型和工具都正常，最终修改也会落到错误环境；因此 Directory 与 Server Identity 必须在任务开始时可见。

## 练习：为什么模型存在却仍然不可用

配置文件声明了一个模型，Provider 目录也包含它，但 Session 抛出 `ModelNotFound`。按顺序应检查哪些位置？

<details>
<summary>查看核对要点</summary>

先确认有效 Config 是否启用并未禁用该 Provider，再检查凭据与 Plugin 是否让 Provider 成功进入实例 Map，然后核对 `providerID/modelID`，最后才进入具体 SDK 解析。目录元数据、实例可用性和 Adapter 能否兑现是三个不同阶段。

</details>

下一篇：[Session Prompt、LLM 与 Processor](02-session-llm-processor.md)。
