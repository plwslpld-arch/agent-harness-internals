---
sources: [{"repo":"cordis-paper","path":".","commit":"948a07b369c62adb3b12e102458be5c18dfb69b9"},{"repo":"deepseek-harness","path":"vendor/cordis","commit":"47f943859bef60e4160492346772ded9b24f765a"},{"repo":"deepseek-v4-flash-0731","path":".","commit":"7872f01b1d1fe23eabc4c98b48bffcef5a386062"},{"repo":"claude-agent-sdk-typescript","path":".","commit":"b5321a4b65ec1b034fea19f684e2d8db728875da"}]
last_verified: 2026-08-13
status: stale
depth: L2
evidence: [code, official-doc, inference]
---

# 论文注释方法

论文解释设计并提出可检验假设，源码与实测确认当前实现。三者不能互换。

## Claim card

```text
Claim ID:
论文/版本/页码:
作者主张（自己的话摘要）:
证据类型（理论/实验/消融/案例）:
实验对象、基线与假设:
限制与外推边界:
对应源码路径/SHA:
当前实现（实现/部分/未找到/相反）:
可复现实验:
置信度与待办:
```

“未找到”只说明限定路径/SHA 中未发现证据，不等于不存在。

## Cordis 论文

关注依赖注入、context、effect 生命周期和插件组合，再到 Harness `vendor/README.md`、vendored code 与具体 consumer 验证。不能把 upstream 论文当 fork 的逐行说明：Harness 记录了 reentrant disposal、transactional config reconciliation、HMR watcher、配置耐久化、lazy resolution、scope 重命名和发布闭包等本地修改。

本仓库只保留自己的摘要、短引文页码和链接，不再分发论文全文。

## V4 技术报告/模型卡

拆成模型结构、编码/推理协议、benchmark 设置、Harness/tools 配置四层。模型卡中的代码 Agent 结果注明 minimal Harness、`max` reasoning effort 与指定 sampling；内部 DSBench 不能当公开复现证据。

## 对照步骤

1. 将 claim 变成可观察变量。
2. 从 package entry/service seam 追真实 provider 与 profile，而非只搜索同名词。
3. 区分 unit、真实 Loader、e2e、snapshot 各自覆盖。
4. 运行最小实验，保存 manifest/trajectory/scorer。
5. 用“论文主张 / 源码事实 / 实测 / 推断”四标签写结论与反例。

Claude Agent SDK 只研究公开 API、README 与条款，不复制源码或平台 payload。任何论文、图表、代码、模型权重和 SDK 都按各自许可证单独判断。
