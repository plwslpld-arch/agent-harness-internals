---
sources: [{"repo":"deepseek-harness","path":".","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-14
status: reviewed
depth: L2
evidence: [code, official-doc, inference]
---

# 01｜项目定位：Harness 到底是什么

## 先讲人话

DeepSeek Harness 不是 DeepSeek 模型本身，也不是一个普通聊天页面。它是模型外面的“任务执行系统”。

模型负责生成文本、reasoning 和 tool call；Harness 负责把用户任务组织成可执行过程：

- 拼上下文；
- 选择模型；
- 暴露工具；
- 控制权限；
- 执行工具；
- 记录轨迹；
- 恢复会话；
- 把运行状态展示给 Web、headless 或 SDK。

如果把模型比作一个员工，Harness 就是工作台、权限系统、工具间、任务记录和主管流程。

## 它不是什么

| 容易误解 | 正确理解 |
| --- | --- |
| Harness 是模型 API 包装 | 它是 Agent runtime，API adapter 只是其中一层 |
| Harness 是评测框架 | 它可以被评测，但本体不是 SWE-bench/Terminal-Bench 这种评分系统 |
| Harness 是 Web UI | Web 只是产品表面，底层还有 headless、SDK、协议入口 |
| 有源码就代表功能可用 | 还要看 profile 是否挂载、运行是否 ready、权限是否允许 |
| 测试通过就代表生产可用 | 测试只证明特定契约，不等于真实业务闭环 |

## 系统位置

```mermaid
flowchart LR
  User["用户任务"] --> Harness["Agent Harness"]
  Harness --> Prompt["Prompt / Context"]
  Harness --> Model["DeepSeek / other LLM"]
  Harness --> Tools["Tools / Approval / Sandbox"]
  Harness --> Session["Session event log"]
  Harness --> UI["Web / Headless / SDK"]
```

## 关键判断

读这个项目时要一直分清四层：

1. 源码存在：仓库里有代码。
2. 配置启用：profile/bundle 把它挂上了。
3. 运行激活：服务真的 ready。
4. 产品闭环：用户任务真的从输入到结果可复核完成。

很多错误判断来自把这四层混成一层。

## 检查题

- Harness 和模型的职责边界是什么？
- 为什么 Web 可访问不等于 Agent 任务完成？
- 为什么一个 package 存在不代表它是成熟社区插件？

## 延伸阅读

- [../01-product/README.md](../01-product/README.md)
- [../01-product/product-maturity.md](../01-product/product-maturity.md)
- [../00-start-here/paths/non-engineer.md](../00-start-here/paths/non-engineer.md)
