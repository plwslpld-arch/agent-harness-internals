# 信任边界：审批不等于隔离

## 四层控制

| 层 | 回答的问题 |
| --- | --- |
| Tool schema | 模型能提出什么形状的意图？ |
| Guard / policy | 当前身份和上下文是否允许？ |
| Approval | 人是否同意这一次操作？ |
| Sandbox / executor | 即使同意，副作用实际能触达哪里？ |

审批是一项交互策略，不是操作系统安全边界。`evidence: inference` 沙箱能力由实际 shell/provider 与平台事实决定；权限 preset 只是对 sandbox mode 和 approval policy 的组合选择。`evidence: code`

## 关键限制

- Cordis 插件在宿主运行时执行，不应把插件机制本身视为沙箱。`evidence: code`
- workflow 的 worker thread 与 `node:vm` 不是运行不可信代码的安全边界。`evidence: official-doc`
- 文件系统约束不自动等于网络、进程可见性和凭据隔离。`evidence: inference`
- 跨平台 provider 的保护强度可能不同，产品文案不能只写一个笼统的“安全模式”。`evidence: inference`

## 审查一次危险调用

记录最终配置、permission preset、effective sandbox mode、approval 决策、执行 provider、OS 身份、cwd 与实际写入目标。只有真实运行且产物可核对时，才标 `evidence: runtime`。

更完整的威胁分析见安全专题；源码所有权与调用链见[人工源码研究](../13-source-studies/README.md)和[自动文件参考](../14-file-reference/README.md)。
