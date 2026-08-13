# 03｜Cordis 底座：可组合、可替换、可撤销

Cordis 提供共享 Context、Service、事件分发、Fiber 生命周期和可逆 Effect。Harness 的模型适配器、工具注册表、会话日志乃至 agent loop 都以插件参与组合。`evidence: official-doc`

## 产品轨：组合而非分叉

插件化的价值不是目录更整齐，而是能用 profile 组合能力、用 provider 替换实现、用 consumer 复用接口。新模型或新存储后端原则上不必修改循环。`evidence: inference`

代价也很真实：插件运行在宿主环境，可能拥有高权限；激活由依赖满足关系决定，不由 YAML 视觉顺序决定；卸载不完整会留下监听器、定时器或进程。`evidence: code`

## 工程轨：四个核心对象

| 对象 | 作用 |
| --- | --- |
| `Context` | 暴露服务、事件与插件安装入口 |
| `Service` | 定义可注入、可替换的能力 |
| `Fiber` | 表示插件实例、依赖和生命周期 |
| `Effect` | 把注册或资源与清理动作绑定 |

Harness vendored 的 Cordis 包含本地维护增强，不能假设它与上游 checkout 字节一致。`evidence: code` 升级时应逐项审查分叉，而不是机械覆盖。`evidence: inference`

继续阅读：[插件系统全景](plugin-system-mainline.md)、[插件生命周期](plugin-lifecycle.md)、[启动配置](../04-boot-and-configuration/README.md)。

证据入口：[人工源码研究](../13-source-studies/README.md) · [自动文件参考](../14-file-reference/README.md)
