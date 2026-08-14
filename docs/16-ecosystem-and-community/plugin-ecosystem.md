---
sources: [{"repo":"deepseek-harness","path":"packages","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"cordis","path":".","commit":"8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4"},{"repo":"mcp-typescript-sdk","path":".","commit":"cc4b41617ce3601b1290d67216ea0b194a3cd9ac"},{"repo":"acp-typescript-sdk","path":".","commit":"01010146a731212fbbb677d6055e0b7bf183b288"},{"repo":"e2b","path":".","commit":"f5d702a520de52ac0e5d4dda3ca0d5fca01d7993"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 第三方插件生态与兼容矩阵

## 插件分类

| 类别 | 例子/职责 | 主要兼容风险 |
| --- | --- | --- |
| 模型/provider | LLM route、retry、catalog | reasoning/tool/usage wire、secret、API 漂移 |
| 工具/数据 | native tool、MCP bridge、search/memory | schema、审批、prompt injection、数据出境 |
| 执行/runtime | FS/shell/sandbox/E2B/LSP | OS、enforcement、cwd、取消/孤儿进程 |
| 状态/观测 | storage、projection、telemetry | event vocabulary、format、隐私/保留 |
| 编排 | subagent/workflow/job/schedule | 继承、预算、所有权、取消 |
| 协议 | ACP/JSON-RPC/API/host bridge | method/version、连接/session 生命周期 |
| Host UI | commands、settings、API、client manifest | service ready、auth、HMR generation |
| Client UI | slots、renderers、composer/settings | host/client 版本配对、chunk/HMR、XSS |

## 兼容矩阵模板

```yaml
plugin: org/name@version
source_commit: ...
distribution_integrity: ...
harness: {min: ..., max_tested: ..., commit: ...}
cordis_vendor: {version: ..., upstream_commit: ..., local_patch_set: ...}
surface: host | client | both
requires_services: []
produces_services_events_tools: []
profiles_tested: [web, headless, acp, jsonrpc]
node_os_arch: []
config_and_hmr: {reload: ..., rollback: ..., cleanup: ...}
permissions_sandbox_data_egress: ...
persistence_protocol_versions: ...
license_notice_provenance: ...
tests: {unit: ..., real_loader: ..., assembled: ..., e2e: ...}
```

“最新 Harness 可安装”不是兼容结论。最少要证明 clean install、真实 Loader、目标 profile 组装、HMR/teardown 和一次真实任务。

## 供应链威胁

- 安装脚本/prepare 可执行任意宿主代码；git dependency 可变引用会破坏复现。
- plugin 与宿主同进程时可绕过模型工具审批，直接读文件/环境/网络。
- host/client 版本错配可把旧 UI 接到新权限语义；HMR 残留 handler 会重复执行。
- MCP/plugin 工具 schema 更新可把“只读名称”换成写副作用。
- transitive 与 optional platform payload、typosquat、账户接管、恶意更新、缺失 SBOM/provenance 都需追踪。

建议 allowlist + exact version/integrity + 源码/maintainer review + clean-room install + 最小 secret + egress policy + rollback。高风险插件放独立进程/容器，不依赖 Cordis plugin 本身隔离。

## 市场成熟度

成熟生态至少要有独立第三方 owner、稳定 discovery/distribution、版本/兼容元数据、安全披露和撤回、质量门禁、可持续维护者、真实重复使用与升级经验。目前首发热度和第一方 package 数不能满足这些条件。

采用看漏斗：发布插件 → 首次 clean install → 完成真实任务 → 跨版本继续可用 → 多团队生产依赖 → 独立贡献/安全响应。每层记录主体数与时间，不以 star 替代。
