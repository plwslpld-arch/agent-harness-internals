---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# Web bridge 与产品界面源码研究

## Host/client 分层

**Host。** `packages/bundle/web-app/src/{startup,index}.ts` 组装 Web surface；`packages/host/apiproxy` 提供 sessions/approvals/settings/credentials/jobs/goals/skills 等 RPC schema；`webserver/frontend-static/plugin-inventory` 负责 server、构建物和 client module inventory。

**Bridge。** `packages/client/connection/src/{rpc-host,http-bridge,websocket-downlink,api-request-trust}.ts` 建立 HTTP/RPC/downlink 与信任检查。`packages/api/{gateway,remotes}` 连接 agent lookup 和 remote events。

**Client runtime。** `packages/client/runtime/src/client/sessions/` 从 event/projection 组装 conversation、pending、lineage、tool-call tree、timing 与 request inspection；各 `ui-*` plugin 只向 slots/commands/settings/renderers 注册具体体验。

## 验证路径

`bundle/web-app/tests/{startup,trusted-hosts,web-app}.spec.ts`；connection 的 host/client/downlink tests；API gateway/remotes specs；CLI `web-agent-presets.e2e.ts`。Postmortem 0003 是必要反例：裸 Vite/替代端口 HTTP 200 不能证明用户当前 origin 的 GUI 已刷新，必须对同一 URL 做浏览器可见行为验收。

## Host/client plugin 与 HMR

Host plugin 可注册 service/API 和 client module manifest；client plugin 在浏览器 runtime 注册 UI contribution。更新需保持 generation 配对：host candidate ready、client chunk 可加载、旧 handler/slot dispose、新 generation 生效。HMR 成功日志不是用户界面成功，构建产物/HMR receiver/page refresh 也不是同一事实。

## TUI removal 与产品边界

当前 SHA 的 `2026-08-04-remove-tui-package` 是 implemented simplification：`packages/ui/tui`、TUI profile/entry/tests/patch 已删。Web 是交互界面；ACP/SDK JSON-RPC/headless/一次性 CLI 是非 Web 入口。通用 question/command/approval/PTY/projection seams 仍可复用，但不能据此宣称存在 TUI 产品。

完整三层证据见 [TUI 删除案例](../20-decisions-and-postmortems/tui-removal-evidence-case.md)。外部 `turtle-ui` URL 当前不可获取，不能作为可运行插件教程。

## 产品意义

“Web 是插件化的”意味着交互能力可分层替换和按 profile 挂载，不意味着任意第三方 client code 自动安全。UI 要与 host 权限/session identity 同步；同 origin E2E、XSS/不可信 tool output、断线重放和 approval ownership 都是产品门禁。
