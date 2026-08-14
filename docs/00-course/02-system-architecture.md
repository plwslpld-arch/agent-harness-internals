---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 02｜系统架构：四个平面

## 先讲人话

Harness 不是一条直线程序。它更像一个运行中的组织，里面有负责决策的、负责执行的、负责记录证据的、负责给用户看的。

可以分成四个平面：

| 平面 | 解决什么问题 |
| --- | --- |
| 控制平面 | profile、plugin、service、event，决定系统怎么装配 |
| 执行平面 | Agent Loop、模型请求、工具执行，真正推进任务 |
| 证据平面 | Session event、request header、tool result，记录发生过什么 |
| 产品表面 | Web、headless、SDK、ACP，把能力暴露给用户或外部系统 |

## 主链路

```mermaid
sequenceDiagram
  participant User as User
  participant Entry as Web/Headless/SDK
  participant Boot as Boot/Profile
  participant Cordis as Cordis Runtime
  participant Loop as Agent Loop
  participant Model as Model Adapter
  participant Tool as Tool Runtime
  participant Session as Session

  User->>Entry: 提交任务
  Entry->>Boot: 选择 profile
  Boot->>Cordis: 装配插件和服务
  Cordis->>Loop: 创建 Agent
  Loop->>Model: 发送模型请求
  Model-->>Loop: 返回文本或 tool call
  Loop->>Tool: 执行受控工具
  Tool-->>Loop: 返回 tool result
  Loop->>Session: 追加事件
  Session-->>Entry: 投影为 UI/输出
```

## 关键代码形状

课程后面会逐层展开。这里先记住这条伪代码：

```ts
profile = composeProfile(bundle, userPatch, cliOverlay)
ctx = boot(profile)
agent = ctx.agents.create({ sessionId, model })
agent.followup(userMessage)
while (agent.hasWork()) {
  request = buildRequest(prompt, sessionSurface, tools)
  result = model.stream(request)
  if (result.toolCalls) runToolsThroughPolicy(result.toolCalls)
  session.append(events)
}
```

这不是源码原文，是帮助理解的结构。真正源码入口见后续章节。

## 不变量

- Web、headless、SDK 应共享同一套 runtime，不应各自复制一套 Agent Loop。
- Session 是事实源；UI 是投影，不应反过来成为事实源。
- 工具调用必须走统一策略管道，不应由某个插件私自执行副作用。
- 配置是 profile/patch 合成结果，不应只看一个 YAML 文件下结论。

## 本讲源码证据卡

| 架构问题 | 证据入口 | 看什么 |
| --- | --- | --- |
| 控制平面怎么装配 | `apps/cli/src/profile-boot.ts`、`packages/boot/app-boot/src/index.ts` | profile、patch、boot 如何生成 Cordis tree |
| 执行平面在哪里 | `packages/core/agent-loop/src/` | turn、step、model request、tool scheduling |
| 证据平面在哪里 | `packages/core/session/src/`、`packages/session/session-persistence*/` | event 类型、surface 派生、持久化 |
| 产品表面在哪里 | `packages/bundle/web-app/`、`packages/bundle/headless/` | Web/headless 如何复用底层服务 |

## 最小实验

```text
任务：画一次任务的四平面图。
步骤：
1. 从 docs/00-course/02-system-architecture.md 画主链路。
2. 给每个节点标上源码入口。
3. 标出哪些节点是运行状态，哪些节点是持久事实。
过关：能解释为什么 UI state 不能替代 Session event。
```

## 检查题

- 控制平面和执行平面分别有什么？
- 为什么 Session 属于证据平面？
- 如果一个功能 Web 看不到，是否说明底层不存在？

## 延伸阅读

- [../02-system-architecture/README.md](../02-system-architecture/README.md)
- [../02-system-architecture/runtime-topology.md](../02-system-architecture/runtime-topology.md)
- [../13-source-studies/core-runtime-study.md](../13-source-studies/core-runtime-study.md)
