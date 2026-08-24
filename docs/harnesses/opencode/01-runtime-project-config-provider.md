---
title: OpenCode 入口、项目、配置与模型服务
article_type: harness
harness: opencode
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"opencode","path":"packages/opencode/src/index.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/project/instance-context.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/project/instance-runtime.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/config/config.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/src/provider/provider.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"},{"repo":"opencode","path":"packages/opencode/test/provider/provider.test.ts","commit":"3a31c4ea801915c0b050df4b3842997ea62b6e93"}]
---

# OpenCode 入口、项目、配置与模型服务

## 读者会得到什么

本篇从进程入口追到可以创建模型请求之前，解释 OpenCode 怎样确定「在哪个项目、用哪份配置、以哪个 Agent、调用哪个 Provider/Model」。这几步共同构成运行实例，却不能缩写成一条模型名。

CLI 解析命令后会把目录交给 Project/Instance 层。Instance Context 至少保存 `directory`、`worktree` 和 Project 信息；兼容 Promise/异步局部存储的桥接入口最终仍委托 Instance Store。外部目录判断也依赖这个 Context：文件在当前目录或有效 Worktree 内时不触发外部目录权限，非 Git 项目的 `/` Worktree 不能被误用为「所有绝对路径都在项目内」。

Config 是按实例加载的合并结果。锁定源码先读全局配置和显式配置文件，再沿项目到 Worktree 查找本地配置与 `.opencode` 资源，合并 Command、Agent、Plugin 等内容，最后还会处理托管配置、环境权限覆盖和旧 Tool 布尔设置。数组字段与普通字段使用不同合并策略；来源先后会影响最终值，所以文章或 Bug 报告必须保存有效配置及来源，而不能只贴某一个文件。

Provider 层又有三种不同事实：模型可能存在于目录，Provider 可能因认证、环境变量、Plugin 或配置进入当前实例，Language Model 运行对象还要在真正使用时解析 SDK 与 Provider Options。`enabled_providers` 和 `disabled_providers` 会筛选当前实例；`getModel()` 会拒绝未加载 Provider 或不存在模型；`getLanguage()` 才解析 SDK 和具体模型运行对象。目录命中只是请求链第一步。

## 真实输入与输出

### 输入

```json
{
  "directory":"示例仓库",
  "config_sources":["全局配置","显式配置","项目配置","托管配置","环境覆盖"],
  "agent":"build",
  "requested_model":"anthropic/claude-sonnet-4-6"
}
```

### 输出

```json
{
  "instance":{"directory":"示例仓库","worktree":"仓库根","project":"已识别"},
  "effective_config":{"model":"anthropic/claude-sonnet-4-6","permission":"合并后规则"},
  "provider_state":{"catalog":"可能存在","loaded":"需满足筛选和认证","language":"延迟解析"}
}
```

## 调用链

![OpenCode 从命令入口、项目实例、分层配置、模型目录、服务筛选和认证到运行模型对象的中文数据流图](../../../assets/diagrams/opencode/01-runtime-project-config-provider.svg)

Claim: opencode.config.layers-build-instance

Claim: opencode.provider.catalog-is-not-runtime-availability

1. CLI 解析命令和目录，创建或复用 Project Instance。
2. Instance Context 固定 Directory、Worktree 和 Project，并为配置、数据库、文件边界提供作用域。
3. Config 依次合并全局、认证远端、显式文件、项目层级、资源目录、Console/托管配置和环境权限覆盖。
4. Agent 与 Command Markdown 被装入最终配置；Plugin 来源还需保留全局或本地 Provenance。
5. Provider 初始化从模型目录、内建加载器、Plugin、Auth、环境变量和配置构建当前实例的 Provider Map。
6. 启用/禁用筛选先移除不允许的 Provider，模型自身的 `disabled` 标记还会再过滤目录。
7. `getModel()` 验证当前 Provider 与模型；`getLanguage()` 解析 SDK、Base URL、Header、Key 和模型选项。
8. 真正 Stream 时仍可能遇到认证、网络、区域、Header Timeout、SSE Timeout、配额或 Provider Response Error。

## 源码证据

配置加载以 `merge()` 把来源合并进实例结果，并分别处理全局和本地范围：

```source
packages/opencode/src/config/config.ts:351-429
const merge = (source: string, next: Info, kind?: ConfigPlugin.Scope) => {
  result = mergeConfigConcatArrays(result, next)
}
```

托管目录和系统管理偏好在项目资源之后继续合并，环境权限覆盖还会改写最终 Permission。这意味着「项目配置中写了什么」不能单独代表有效配置。

Provider 先应用白名单和黑名单：

```source
packages/opencode/src/provider/provider.ts:1420-1427
if (enabled && !enabled.has(providerID)) return false
if (disabled.has(providerID)) return false
```

`getModel()` 只在当前实例 Provider Map 中查找；目录里存在但 Provider 未加载时仍返回 ModelNotFoundError。`getLanguage()` 随后解析 SDK，并可能因底层 `NoSuchModelError` 再次失败。

```source
packages/opencode/src/provider/provider.ts:1843-1900
const provider = s.providers[providerID]
if (!provider) return yield* new ModelNotFoundError(...)
const sdk = await resolveSDK(model, s, envs)
```

## 失败与限制

第一，配置合并不是简单的「最近文件覆盖一切」。Instructions 等数组会去重拼接，Agent、Command、Permission 和 Plugin 来源有专门逻辑；调试时必须输出字段 Provenance。

第二，远端 Well-known 或 Console 配置可能依赖认证并可能返回错误内容。源码会处理部分重新认证和解析错误，但不能因此宣称远端配置永久可达。

第三，模型目录是元数据，不是健康检查。Release Date、Tool Call 能力或 Context Limit 字段也不证明服务当前开放、账户有权使用或请求语义完全一致。

第四，Provider 已加载仍不等于某个模型可以 Stream。SDK 包导入、配置选项、认证、区域端点、网络和服务端状态均可能失败。

第五，测试使用假配置、临时目录或测试 Key；它们证明合并和错误分支，不证明生产凭据与真实 Provider。

第六，Instance 复用可以减少重复装配，也会让缓存和来源漂移更难观察。配置或认证变化后必须验证 Reload/Dispose 语义，不能假定所有服务自动刷新。

## 验证方法

在临时 Git 仓库建立全局、显式、项目、父目录、`.opencode`、托管和环境覆盖七层配置，为同一字段设置不同标记。读取有效配置与目录清单，验证标量优先级、Instructions 拼接、Permission 顺序和 Plugin Provenance。

Provider 实验准备四类模型：目录存在但 Provider 未加载、Provider 加载但 Model 被禁用、模型可取但认证缺失、完全可用的本地测试 Provider。分别调用 List、GetModel、GetLanguage 和 Stream，记录失败发生在哪一层。

目录边界实验覆盖正常仓库、子目录、Worktree、非 Git 目录和外部路径。确认外部目录权限不会因非 Git 的 `/` Worktree 被绕过。

生产前还需冻结有效配置、Provider/Model ID、SDK 版本、Base URL、Region、认证来源和无密钥的 Header 摘要；真实请求结果与测试 Provider 结果分开保存。

## 自检

### 问题 1

为什么只贴项目里的 `opencode.json` 不能复现有效配置？

**答案：** 全局、显式、目录层级、资源、托管与环境覆盖都会参与合并，数组和权限还有专门语义。

### 问题 2

模型在目录中存在是否意味着能立即调用？

**答案：** 不意味着。还要 Provider 进入当前实例、未被筛除、模型有效、SDK 可解析、认证和网络成功。

### 问题 3

`getModel()` 成功是否等于 Stream 成功？

**答案：** 不等于。它只取得模型信息；`getLanguage()` 与真实 Stream 仍可能在 SDK、认证、端点或服务端失败。

### 问题 4

怎样证明配置变更真正生效？

**答案：** 记录 Instance Reload/Dispose 前后的有效配置与来源，并用本地测试 Provider 发起可观察请求，而不是只检查文件时间。

