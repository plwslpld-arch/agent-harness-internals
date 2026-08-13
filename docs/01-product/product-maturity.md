# 产品成熟度：不要让单一信号代替判断

## 五个维度

| 维度 | 当前可见证据 | 仍要验证的问题 |
| --- | --- | --- |
| 可运行性 | 构建、快照测试、Web smoke 曾通过。`evidence: runtime` | 你的 OS、Node、凭据和网络下是否重现？ |
| 可扩展性 | service/provider/consumer seam 与插件树有完整设计。`evidence: code` | 扩展能否通过 seam，而不 fork 核心循环？ |
| 数据连续性 | append-only log、JSONL/SQLite 与恢复语义存在。`evidence: code` | 预览格式变化时如何迁移、备份和回滚？ |
| 安全性 | 审批、guard、sandbox、permission preset 分层存在。`evidence: code` | 最终副作用在哪个进程、容器和身份下发生？ |
| 生态成熟度 | 官方提供讨论区与插件发现方式。`evidence: official-doc` | 维护节奏和插件质量是否满足组织要求？ |

## 三个采用档位

**学习/研究**：锁定源码 Commit，使用隔离工作区，重点研究事件、seam 和插件生命周期。当前公开信息已足够。`evidence: inference`

**内部试点**：补充真实模型 E2E、凭据管理、权限默认值、会话备份和观测；至少验证一条有业务价值的闭环，而不是停在 HTTP 200。`evidence: inference`

**生产关键路径**：需要额外证明升级、数据格式兼容、灾难恢复、供应链、审计和多租户边界。developer preview 不等于不可用，但这些保证不能从版本名称推定。`evidence: inference`

构建成功不是业务完成，代码量大不是成熟，插件多不是默认可用，社区热度也不是安全证明。社区经验应按样本记录。`evidence: community`

进一步证据：[源码研究](../13-source-studies/README.md) · [安全专题](../12-security-and-trust/README.md) · [实验教程](../15-labs-and-tutorials/README.md)
