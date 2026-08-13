---
sources: [{"repo":"deepseek-harness","path":"vendor/cordis","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"cordis","path":".","commit":"8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 插件系统全景：从理论到生态治理

插件系统是理解 Harness 的第一主线。它不是“支持安装几个扩展”的附加功能，而是产品组装、运行时替换、Web 扩展与策略治理共同使用的基础机制。`evidence: official-doc`

## 1. 理论：时空可组合性

Cordis 的出发点是让行为不仅能被组合，还能在生命周期变化时撤销和重建。Context 提供作用域，依赖决定何时可用，Effect 把行为和清理绑定，Fiber 承载插件实例。`evidence: official-doc` 本 Atlas 只做原创释义，不复制许可不明确的论文全文；阅读路径见论文专题。`evidence: inference`

## 2. 运行时对象

| 对象 | 核心问题 | Harness 中的产品含义 |
| --- | --- | --- |
| Context | 当前作用域能看见哪些服务与事件 | 同一进程中的能力边界与组合面 |
| Service | 哪项能力可被 provider 提供、consumer 使用 | 模型、文件、存储等可替换 seam |
| Event | 行为在哪个时点被观察、改写或拒绝 | 策略、遥测、UI 与生命周期连接点 |
| Fiber | 哪个插件实例拥有依赖和副作用 | 装载、失败、重启与卸载单位 |
| Effect | 注册行为如何随所有者撤销 | 防止 listener、timer、进程残留 |

这些对象在 vendored Cordis 中有直接实现。`evidence: code`

## 3. 从 Loader 到产品组合

Loader 读取 entry 并建立 fiber；profile 列出 bundle，bundle 分发 Cordis 配置，profile/home/CLI patch 再逐层覆盖。依赖满足后插件激活，配置重整或 HMR 可触发重建。`evidence: official-doc`

因此，产品能力有四个状态：代码存在、配置 entry 存在、fiber 已激活、用户路径已验证。`evidence: inference` 只检查其中一个都会高估真实可用性。

## 4. Host 与 Client 插件

Host 插件运行在 Node 侧，可以注册服务、工具、路由和资源，拥有宿主权限。`evidence: code` Web client package 可用 `dsh.client` 声明浏览器 bundle 与注入边；服务端扫描当前 Loader entries，生成带内容 hash 的 boot graph，浏览器再按图加载。`evidence: official-doc`

Client HMR 通过重建 bundle、更新 revision 并向浏览器广播变化工作；生产图不包含 HMR 行。`evidence: official-doc` Host 与 client 两半必须用明确 wire contract 连接，不能共享任意内存对象。`evidence: inference`

## 5. 能力为什么都能插件化

- 模型 provider 注册到 LLM service，Agent Loop 只消费统一 stream 词汇。
- 工具插件注册 schema、execute 与 renderer；策略插件在 pre/execute/post/result 事件接入。
- 权限、沙箱、文件系统和进程以 provider 或事件策略组合。
- Session persistence、projection、telemetry 和 title 是同一事件事实源的不同 consumer。
- Subagent、MCP、ACP、Web client module 也沿各自 service seam 接入。

这些能力在包与服务目录中可逐项定位。`evidence: code` “一切皆插件”因此是架构事实，但并不表示每类插件拥有同等稳定的公共 API。`evidence: inference`

## 6. 第三方插件最小开发路径

1. 选择已有 seam，不要先修改 agent loop。
2. 定义配置 schema 和最小 injection，声明提供/消费的 service。
3. 用 `ctx.effect` 或注册 API 返回的 disposer 管理全部副作用。
4. 为工具声明输入、规范输出与展示；把通用权限逻辑放在策略层。
5. 如需 Web UI，在 package metadata 声明 client bundle，并定义稳定 host/client wire。
6. 在复制的 profile 中挂载，验证 PENDING、ACTIVE、FAILED、HMR 与 dispose。
7. 补充 deny、取消、失败恢复、跨平台与权限披露测试。

官方 Cordis 教程与 extension cookbook 支持这条路径。`evidence: official-doc` 示例只证明开发模式，不代表社区已有可维护发布物。`evidence: inference`

## 7. 供应链治理

第三方插件等价于向宿主进程引入代码。安装前应锁定包版本与来源，检查许可证、维护者、install scripts、依赖树、host/client 权限和网络/凭据访问；升级时审查 diff，并保留可回滚 profile。`evidence: inference`

动态插件或让 Agent 自行生成/运行插件的能力风险更高：审批不能替代隔离，未来版本授权也不应默认继承。`evidence: inference` 相关威胁与治理见[安全与信任](../12-security-and-trust/README.md)。

## 8. 生态成熟度：内部规模不是外部采用

当前官方 monorepo 有 219 个 workspace packages。`evidence: code` 这些包括核心、provider、UI、测试、示例和内部拆包，不能称为“219 个社区插件”。`evidence: inference`

官方鼓励插件仓库使用 `dsh-plugin` topic。`evidence: official-doc` 但外部插件数量、活跃维护、兼容范围和真实用户仍需单独建立社区证据账本。`evidence: community` turtle-ui 曾作为外部 TUI 方向被提及，目前地址返回 repository not found。`evidence: runtime` 这不是整个生态失败的证明，却说明“有历史引用”不能当作“当前可安装”。`evidence: inference`

## 9. 验证与源码入口

- [插件生命周期](plugin-lifecycle.md)
- [配置组合](../04-boot-and-configuration/config-composition.md)
- [工具策略](../07-tools-permissions-sandbox/tool-policy-pipeline.md)
- [Web 数据流](../10-web-client/web-dataflow.md)
- [人工源码研究](../13-source-studies/README.md)
- [自动文件参考](../14-file-reference/README.md)
