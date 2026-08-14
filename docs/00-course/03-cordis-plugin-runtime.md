---
sources: [{"repo":"deepseek-harness","path":"vendor/cordis","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-harness","path":"vendor/loader","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 03｜Cordis 插件运行时

## 先讲人话

插件系统不是“多写几个扩展点”。在 Harness 里，插件系统负责把模型、工具、权限、Session、Web、协议入口这些能力装配成一个可运行系统。

最接近的类比是 VS Code Extension Host：

- VS Code 是宿主，插件注册命令、语言能力和 UI。
- Harness 是宿主，插件注册模型、工具、服务、事件、profile 和 Web 能力。

React runtime 的类比也有用：Fiber 和 Effect 让插件能挂载、更新、卸载和清理。

## 五个核心概念

| 概念 | 作用 |
| --- | --- |
| Context | 插件运行作用域，决定它能看到哪些服务和配置 |
| Service | 插件提供给其它插件调用的能力 |
| Event | 插件之间的生命周期和业务通知 |
| Fiber | 插件生命周期单元 |
| Effect | 插件产生的副作用清理器 |

## 关键代码片段

真实源码入口：

- `vendor/cordis/src/context.ts`
- `vendor/cordis/src/service.ts`
- `vendor/loader/src/index.ts`

理解形状：

```ts
const ctx = new Context()

ctx.plugin(modelProvider)
ctx.plugin(toolProvider)
ctx.plugin(webSurface)

ctx.provide('someService', service)

ctx.on('ready', () => {
  // 所有需要 ready 后运行的逻辑
})

ctx.effect(() => {
  return () => {
    // 插件卸载时清理副作用
  }
})
```

重点不是 API 名字，而是生命周期：插件上岗时注册服务和事件，插件下岗时清理副作用。

## Loader 做什么

Profile 和 patch 只是配置文本。Loader 把 entry tree 变成真实插件实例：

```ts
readEntryTree()
importPluginModule()
createFiberForEntry()
applyPlugin(ctx, config)
trackEntryStatus()
disposeOrReloadWhenConfigChanges()
```

所以“功能存在”和“功能已挂载”不是一回事。

## 改插件系统时的风险

- 没有 disposer，会造成监听器、进程、计时器或服务残留。
- 绕过 Context 注册能力，会破坏可组合性。
- 把服务做成全局单例，会破坏 profile 和子 Agent 的隔离。
- 忽略 Loader entry 状态，会把未激活能力误判为可用。

## 本讲源码证据卡

| 插件问题 | 证据入口 | 看什么 |
| --- | --- | --- |
| Context 如何隔离作用域 | `vendor/cordis/src/context.ts` | `extend()`、`isolate()`、`intercept()` |
| Service 如何注册和清理 | `vendor/cordis/src/service.ts` | `ctx.reflect.provide()` 与 owning fiber |
| 配置 entry 如何变成插件 | `vendor/loader/src/index.ts` | entry tree、plugin import、fiber ownership |
| Harness 如何使用 Cordis | `packages/boot/app-boot/src/index.ts` | Loader/Include/Group 如何被挂载 |

## 最小实验

```text
任务：解释一个 Harness 能力为什么是插件。
建议对象：DeepSeek provider、headless bundle 或 web-app bundle。
步骤：
1. 找到它的 package 入口。
2. 看它是否导出 apply/name/inject/config。
3. 找它注册了哪些 service、event 或 prompt section。
4. 写出 dispose 时应该清理什么。
过关：能说清“插件注册能力”和“插件生命周期治理”的区别。
```

## 检查题

- 为什么 Harness 更像 VS Code Extension Host，而不只是 Webpack plugin？
- Service 和普通对象有什么区别？
- Effect 为什么重要？

## 延伸阅读

- [../03-cordis-foundation/plugin-system-mainline.md](../03-cordis-foundation/plugin-system-mainline.md)
- [../03-cordis-foundation/plugin-lifecycle.md](../03-cordis-foundation/plugin-lifecycle.md)
- [../13-source-studies/cordis-fork-and-plugin-system.md](../13-source-studies/cordis-fork-and-plugin-system.md)
