---
title: pi Coding Agent、Prompt 与 Extension 装配
article_type: harness
harness: pi
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"pi","path":"packages/coding-agent/src/core/sdk.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/core/system-prompt.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/core/resource-loader.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/core/extensions/loader.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/src/core/extensions/runner.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/test/system-prompt.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/test/agent-session-dynamic-tools.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"},{"repo":"pi","path":"packages/coding-agent/test/agent-session-dynamic-provider.test.ts","commit":"c1279a65b3ef6b0b19950ed1771d5933241c240f"}]
---

# pi Coding Agent、Prompt 与 Extension 装配

## 读者会得到什么

本篇从 `createAgentSession()` 出发，解释 pi-coding-agent 怎样把模型运行时、Settings、Session、资源、内建工具、Extension 和 Agent Core 装成可工作的编码 Harness。重点不在某段固定 System Prompt，而在 Prompt 与运行时表面如何一起生成。

Resource Loader 先解析用户级、项目级、Package 与临时 CLI 资源，得到 Extension、Skill、Prompt Template、Theme、项目上下文文件和 System Prompt Override。每个来源保留 scope、origin 与 path 元数据，冲突被诊断；发现资源不等于已经安全审查。

System Prompt Builder 接收当前启用工具、工具摘要、工具指南、项目上下文、Skill 元数据、附加 Prompt 和工作目录。自定义 Prompt 会替换默认主体，但项目上下文、允许显示的 Skill 和目录仍可附加。没有 Read 工具时，不把 Skill 清单写进 Prompt，因为模型无法按路径读取正文。

工具表面也不是常量。默认激活 read、bash、edit、write；Settings、SDK Options、排除列表和 Extension 注册可以改变最终集合。工具只有提供 `promptSnippet` 才出现在 Available Tools 文本中，但这不决定它能否实际执行；真实能力以 Agent State 中注册并激活的 Tool 为准。

Extension 是进程内代码。它能注册 Tool、Command、Shortcut、Flag、Provider 和 Renderer，也能监听 Context、Provider Request、Tool Call、Tool Result 与 Agent 生命周期事件。Hook 可以阻断 Tool Call、改写 Context 和结果，动态 Provider 还能改变当前模型的 Base URL。它不是只读插件清单。

因此，分析 pi Coding Agent 必须同时核对「Prompt 说了什么」和「Runtime 实际装了什么」。只截取 Prompt 会漏掉动态 Tool 与 Hook；只列工具对象又会漏掉模型可见说明与项目指令。

## 真实输入与输出

### 输入

上游 Dynamic Tool 测试在 `session_start` 注册一个带 Prompt 摘要和指南的工具：

```json
{"event":"session_start","tool":{"name":"dynamic_tool","promptSnippet":"运行动态测试行为","promptGuidelines":["需要动态行为时使用该工具"]}}
```

### 输出

绑定 Extension 前工具不在会话表面；绑定后 Tool Registry 与 System Prompt 一起刷新：

```json
{"before":{"active":false},"after":{"active":true,"promptMentionsTool":true}}
```

Dynamic Provider 测试还表明，Extension 在加载时、`session_start` 或 Command 执行时覆盖 Provider，都能改变当前模型请求使用的 Base URL。这是进程内行为测试，并未向示例地址发送真实请求。

## 调用链

![pi Coding Agent 从资源发现、模型会话设置进入工具与提示词装配，再由扩展运行时动态改变模型可见信息和真实执行表面的中文架构图](../../../assets/diagrams/pi/04-coding-agent-prompt-extensions.svg)

Claim: pi.coding.prompt-is-resource-assembly

Claim: pi.extensions.can-change-runtime-surfaces

1. SDK 解析工作目录和 Agent 目录，构造 Model Runtime、Settings Manager 与 Session Manager。
2. 默认 Resource Loader 执行 reload，先处理项目 Trust，再解析已启用的 Extension、Skill、Prompt Template 与 Theme。
3. Loader 发现项目上下文文件、System Prompt Override 和 Append Prompt，并为资源保存来源与诊断。
4. SDK 尝试从 Session 恢复模型和推理等级；失败时按设置与 Provider 默认值选取初始模型。
5. SDK 根据默认工具、Settings、`tools`、`noTools` 与 `excludeTools` 计算初始激活集合。
6. Agent Core 先以空 Prompt 和空 Tool 创建，Coding Agent Session 随后组合内建工具、自定义工具与 Extension Tool。
7. System Prompt Builder 根据最终激活工具生成摘要与指南，附加项目上下文、Skill 清单和工作目录。
8. Extension Runner 绑定会话动作与模型注册表；预绑定 Provider 注册被排队，绑定后立即刷新。
9. 运行中 Hook 可以变换送模 Context、Provider Header/Payload、Tool Call 和 Tool Result；动态工具与 Provider 可刷新表面。
10. Agent Core 执行组合后的状态。Prompt、工具列表和 Provider 必须作为同一 Snapshot 留证。

## 源码证据

SDK 的装配顺序清楚区分 Resource、Model、Tool 与 Session：

```source
packages/coding-agent/src/core/sdk.ts:171-186
const modelRuntime = options.modelRuntime ?? (await ModelRuntime.create(...));
const settingsManager = options.settingsManager ?? SettingsManager.create(...);
const sessionManager = options.sessionManager ?? SessionManager.create(...);
resourceLoader = new DefaultResourceLoader(...); await resourceLoader.reload();
```

Prompt Builder 并非读取一份不可变字符串。它先按启用工具筛选可见摘要和指南，再追加项目上下文、Skill 与工作目录：

```source
packages/coding-agent/src/core/system-prompt.ts:79-119
const tools = selectedTools || ["read", "bash", "edit", "write"];
const visibleTools = tools.filter((name) => !!toolSnippets?.[name]);
for (const guideline of promptGuidelines ?? []) { ... }
```

对应测试确认空工具显示 `(none)`，自定义工具只有提供摘要才进入 Prompt，重复指南会 Trim 和去重。这些断言锁定模型可见文本的生成规则，没有证明模型会遵守指南。

Resource Loader 的 reload 把 Package 解析、项目 Trust、扩展加载、Skill、Prompt、Theme、上下文文件和 Prompt Override 放在同一次资源快照中。`noExtensions` 仍可保留临时 CLI Extension，`noSkills` 与 `noPromptTemplates` 也各有独立合并规则；分析配置时不能把一个总开关臆造成全部资源关闭。

Extension API 在加载阶段把 Handler、Tool 与 Command 写入 Extension 对象。Provider 注册在 Core 尚未绑定时进入 Pending Queue，绑定后切换为直接调用 Model Registry。Dynamic Provider 测试分别覆盖加载期、Session Start 和 Command 期覆盖，确认活动模型的 Base URL 随之变化。

Runner 对 Tool Call 依次执行 Handler，出现 `block` 时立即返回；Tool Result Handler 能改写 Content、Details、Error 和 Usage；Context Handler 使用 Clone 后的消息并将每个扩展的输出传给下一个。扩展加载顺序会影响最终投影。

## 失败与限制

第一，System Prompt 是能力描述的一部分，不是权限边界。即使 Prompt 要求谨慎，Bash、Write 或自定义 Provider 仍按宿主进程权限运行。

第二，Prompt 中没有某个 Tool 名称，不证明 Tool 不存在。缺少 `promptSnippet` 的自定义工具可能仍在 Registry；应核对 All Tools、Active Tools 与 Agent State。

第三，发现 Skill 或项目上下文文件不证明它可信。项目 Trust 控制资源装载决策，但 Extension 一旦运行就是进程内代码，仍需来源审查、固定版本和最小权限宿主。

第四，多个 Extension 可以注册同名工具、Command 或 Flag。Loader 记录冲突诊断并按加载顺序处理优先级；没有诊断不代表组合语义一定正确。

第五，Context 与 Tool Result Hook 可以改变后续模型看到的事实。Trace 应同时保存 Hook 前后摘要、Extension 身份和错误；否则难以重放。

第六，动态 Provider 可改写 Base URL、Header、认证与模型目录。它提供企业代理和测试接入能力，也扩大了凭据路由与数据外发风险。

## 验证方法

先创建一个无网络的内存 Session，记录 Resource Loader 的扩展、Skill、Prompt、Theme、Context File 与诊断列表。用相同 CWD 分别切换 Trust、noExtensions、noSkills、noPromptTemplates 和临时 CLI 路径，比较差异。

随后对 Prompt 生成做 Snapshot：固定工具集合、摘要、指南、上下文文件与 Skill，保存完整 Prompt 哈希和关键片段。再改变一个输入，确认只有预期区段变化。Prompt Snapshot 必须与 Active Tool Name 列表同批保存。

Extension 测试使用本地假 Provider 与无副作用工具。验证加载期、Session Start、Command 期注册，检查 Tool Registry、Prompt、Model Base URL、Hook 前后 Context 和 Tool Result；不要连接真实代理地址。

安全复核列出每个 Extension 来源、版本、Scope、注册表面、文件与网络权限、Provider 覆盖和持久化动作。独立 Eval 评估目标产物，不把 Prompt 哈希稳定或 Extension 成功加载当成任务正确。

## 自检

### 问题 1

为什么不能把 System Prompt 当成一份静态文件？

**答案：** 它由当前工具摘要、指南、项目上下文、Skill、Override、Append Prompt 和工作目录装配；Extension 还可能在运行时刷新工具表面。

### 问题 2

Tool 没出现在 Available Tools 文本中，是否必然无法执行？

**答案：** 否。自定义 Tool 没有 `promptSnippet` 时不会进入该文本，但仍可能在 Registry 和 Active Tools 中；真实能力要检查运行时状态。

### 问题 3

Extension 为什么属于安全边界的一部分？

**答案：** 它是进程内代码，能注册工具与 Provider、改写 Context 和 Tool Result、阻断调用，并访问宿主提供的会话动作。

### 问题 4

怎样形成可重放的 Coding Agent 装配证据？

**答案：** 同时保存来源锁、资源诊断、完整 Prompt 哈希、Active Tool、Extension 顺序、Provider 配置摘要和 Session 设置；缺少任何一类都可能无法解释行为差异。

