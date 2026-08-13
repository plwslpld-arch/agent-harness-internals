---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-13
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 从零插件实验路线

目标不是快速做一个“大而全插件”，而是逐层证明 lifecycle、依赖、配置、HMR、客户端与发布边界。

## Lab 1：Host-only 可逆插件

创建一个最小 package，使用 namespace export（`name`、`inject`、`Config`、`apply`），注册一个只读 service 或 event listener。所有 listener/timer/resource 都由 effect/fiber 拥有。验证真实 Loader 启动、service ready、dispose 后零残留；不要只用 `ctx.plugin()` 手挂。

## Lab 2：Provider/consumer seam

把 definition、provider、consumer 的责任写清，可先同包实现。consumer 只依赖抽象 service，不 import provider。测试 provider 缺失时 pending/failed 行为、替换 provider 后重新激活、dispose 顺序与 scoped registration。

## Lab 3：配置、patch 与 HMR

添加 schema 和独立 overlay。验证 entry root lazy config、`disabled` 特殊 interpolation、候选失败 rollback、配置写入 durable drain、连续变更 coalescing、HMR dispose/reload 后 registration 不重复。禁止假定任意 YAML metadata 都执行 `!!js`。

## Lab 4：Host/client 双端

Host 发布浏览器 module manifest，client 注册一个具名 UI slot。验证：host ready 后才能加载、HMR 只替换自己的 generation、旧 slot/handler 清理、client 报错不污染协议/宿主、无 client 的 headless/ACP profile 仍能运行。

## Lab 5：工具与安全

如果插件向模型暴露 tool，必须经 `ctx.tools` 与统一流水线；定义 schema、approval、sandbox、timeout、output validation、model/program 两种投影和 session audit。构造 prompt-injection、取消、超大结果、重复调用与 denial tests。

## Lab 6：树外安装与发布

从 tarball/git 安装到全新 profile，锁版本和 integrity；检查 prepare/build 不依赖 sibling monorepo，NodeNext exports 可用，license/NOTICE/provenance 完整。不要用当前不可获取的 `turtle-ui` URL 作为可运行教程。

## 验收矩阵

| 层 | 必须证明 |
| --- | --- |
| package | plain Node import、exports/types、license |
| Loader | 真实 namespace export、inject、ready/dispose |
| config/HMR | atomic apply、rollback、cleanup、无重复注册 |
| product | 实际 profile 挂载、任务级结果 |
| client | 同一 origin 的可见 UI、refresh/HMR、错误隔离 |
| security | 最小权限、secret/data boundary、负向测试 |
| distribution | clean install、lock/integrity、notice/provenance |
