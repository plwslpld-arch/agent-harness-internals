---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 核心运行时源码研究：boot、loop、tools 与 session

基线：Harness `47f943859bef…`。

## Boot 与配置

**路径/符号。** `apps/cli/src/bin.ts` 只解析 launcher 参数并延迟导入目标模式；`profile-boot.ts` 将 profile 交给 `packages/boot/app-boot/src/{profile,index}.ts`。profile 由 bundle patch、profile/home patch 与命令行 overlay 合成，Cordis Loader 再挂载 entry tree。

**关键性质。** 配置不是普通 YAML 拼接：vendored Include 提供统一 patch algorithm；lazy `!!js` 只在 entry config 和明确的 `disabled` metadata 位置解析；candidate import/apply、依赖 settlement、旧 fiber dispose、新配置持久化形成 transactional reconciliation。失败应回滚而不是留下半棵树。

**测试。** `app-boot/tests/{profile,user-patches,config-reload,hmr-config,config-dump}.spec.ts`；CLI 的 `built-bin.e2e.ts`、`source-launch.compat.spec.ts`、`web-agent-presets.e2e.ts` 覆盖真实入口/构建面。

**产品意义。** “everything is a plugin” 的产品价值来自可组合/可回退 profile，不是 YAML 中条目多。包存在、entry 写在 base、provider ready、用户获权是四层不同事实。

## Agent loop 与 tool calls

**路径/符号。** `packages/core/agent-loop/src/agent.ts` 驱动 turn/step；`tool-calls.ts` 管理调度和有序结算；`runtime-context.ts` 保存本步上下文。抽象工作入口在 `packages/core/agent/src/{inbox,dispatch,consumed-work,model-selection}.ts`。

**主路径。** inbox claim → `turn/start` → pre-step → `step/start` → durable `request/header` → model stream/events → assistant message → bounded tool scheduling → ordered tool results → 下一 step 或 `turn/end`。工具 body 只有在声明并发安全时重叠，policy 和 durable result commit 保持模型顺序。

**错误/取消。** request error 经 `agent/request-error` 决定 retry；取消会 drain 已开始工具，对未开始的模型调用生成可解释结算；空/拒绝的首个 claim 仍关闭 durable turn。最大 token 状态保留，不应被后续普通停止覆盖。

**测试。** `agent-loop/tests/{loop,tool-calls,tool-order,cancel,request-error,resume,request-reconstruction,contract-regressions}.spec.ts` 与 `request-cache.e2e.ts`。

**产品意义。** “回答完成”不是最后一个文本 chunk；必须看到工具、注入工作与 turn 的 durable closure。并行工具提升延迟，但不能牺牲模型可见顺序和审计。

## 工具流水线

**路径/符号。** `packages/core/tools/src/` 与 `docs/tool-execution-pipeline.zh.md` 定义注册、`tools/pre-execute` waterfall、执行 wrapper、post-execute、输出验证/物化与 durable `tool/result`。

**不变量。** denial 也必须产生唯一 model-visible result；policy/tool/output thrown errors 统一成结构化 `isError`；Code Mode 的 nested call 重入同一流水线。展示卡与规范 program value 分离，presentation 应纯且可回放。

**产品意义。** 权限、安全、超时与结果并不是每个 tool 自己随意实现；统一流水线是平台治理面。绕过它的 plugin 即使“功能可用”也破坏审计与安全模型。

## Session 与事件

**路径/符号。** `packages/core/session/src/{types,index,known-event-types,request-header,surface,repair,preparation}.ts` 定义 append-only 真源、request reconstruction、模型可见 surface 与 repair。持久化在 `packages/session/session-persistence*`；JSONL `format.ts`、SQLite `schema.ts` 拥有后端格式。

**关键性质。** projection/UI/telemetry/恢复从同一事件词汇派生；不是再造一套业务状态。冷日志的开放 turn 可追加 synthetic interrupted/tool/step/turn closure；活跃不平衡会话拒绝静默 repair。JSONL 默认 checksummed concatenated Zstd frames、单 session active writer；SQLite 使用同步 `node:sqlite` 且无 busy retry。

**测试。** core session 的 `session/fork/repair/request-header/surface/properties`；JSONL/SQLite specs；`session-checkpoint-policy/tests/crash-recovery.e2e.ts`。

**Agent Notes/复盘关联。** ACP Loader 复盘说明真实 export/service topology 会让 100% unit coverage 失效；TUI 删除 note 说明历史 projection consumer 不等于当前产品面。

**产品意义。** session log 同时是恢复、追责和 benchmark trajectory，因而也属于敏感数据资产。格式/事件变更必须按协议迁移，而不是只改 UI reducer。
