---
source_repo: deepseek-harness
source_path: packages/core/cordis
source_commit: 47f943859bef60e4160492346772ded9b24f765a
last_verified: 2026-08-13
status: reviewed
depth: L3
evidence: [code, test, official-doc, inference]
---

# Cordis 分叉与插件系统研究

## Upstream 与 vendored 不是同一个实现

Harness 固定并改名发布 Cordis、Loader、Include、Group、Timer、HMR、Cosmokit、Schemastery 等框架包。`vendor/README.md` 在基线 SHA 下列出 18 类差异：

1. HMR 移除需 YAML runtime hook 的内置本地化；
2. 重生成 package manifests 与发布 files/exports；
3. 重生成 tsconfig/project references；
4. NodeNext-safe 显式 `.ts` 内部 specifiers；
5. Schemastery/logger-console 自有 build-shape 配置；
6. Cordis fiber 的 reentrant disposal/lifecycle hardening；
7. 公共 plugin author API 的 JSDoc/contract 补强；
8. Loader/Include transactional config reconciliation 与 rollback；
9. 精确 config HMR watcher、序列化刷新与失败事件；
10. Node 原生 TS transform 所需 type-only imports/ESM-CJS 修正；
11. 导出统一 patch semantics，并允许同一 patch list 操作新插入项；
12. Include child mutation 串行化与 HMR initial-scan 抑制，避免交错/死锁；
13. `writeTask` 的 exact-optional 类型修正；
14. 配置写入队列、Windows rename retry 与 teardown drain；
15. lazy Loader config resolution，包括依赖激活后的 `!!js`；
16. Cordis 发布 `src` 以满足 exports/release judgement；
17. 全部 vendored 包改到 `@deepseek-ai` scope；
18. entry `disabled` 的唯一 metadata interpolation 规则。

这份列表是升级清单，不是一次性背景。同步 upstream 时必须逐项重放、退役或证明不再需要，不能覆盖目录后只跑编译。

## Plugin 的四个层次

1. **service/provider/consumer**：定义可替换能力，插件经依赖注入和 typed events 解耦。
2. **host plugin**：在 Node/Cordis 宿主注册模型、工具、存储、协议、API 或客户端 module manifest。
3. **client plugin**：浏览器模块在 runtime 注册 UI slots、commands、settings、renderers；必须有 host 提供的加载/身份边界。
4. **profile/plugin tree**：bundle patch、用户 profile 与 overlay 决定“这次实际挂载什么”，包存在不等于默认能力。

HMR 是生命周期问题：候选 import、config resolve、依赖 settlement、旧 fiber dispose、新 fiber activation、client module reload 与失败 rollback 必须形成一条可验证路径。host 更新成功但 client chunk 未刷新，或 client 加载但 host service 尚未 ready，都属于组合失败。

## 219 packages 的正确解释

基线研究统计的 219 个 workspace packages 是 DeepSeek Harness **第一方模块拆分**，说明 seam 粒度与仓库规模；它们不是 219 个独立第三方插件，更不能证明社区生态。第三方生态必须按独立 owner、tree 外分发、可安装版本、真实用户和维护活跃度统计。

## 兼容判断

第三方插件至少声明：支持的 Harness SHA/semver、Cordis vendored version、host/client/both、所需 services/events、配置 schema、profile/entrypoint、Node/OS、权限/sandbox、数据出境、HMR 行为、持久化事件、license/provenance、测试层级。

只要插件 import upstream `cordis`、依赖未 rescope 名称、假定 upstream interpolation，或绕过 Harness tools/session seam，即使 TypeScript 编译通过也可能运行时不兼容。
