# 12｜安全与信任入口

Harness 的安全结论必须从能力边界出发，而不是从“有 permissions/sandbox”出发。

- Cordis plugin 与动态 extension 在宿主进程内运行，属于高信任代码；插件系统不是隔离层。
- workflow worker/vm 约束不是恶意代码安全边界。
- 本地 sandbox 主要约束文件系统效果；网络、进程可见性和平台差异必须另行建模。
- MCP stdio server 是第三方子进程，HTTP server 是外部信任域；都可能接触参数、结果、环境或凭据。
- prompt 里的“不要做”不能替代 provider 层拒绝、审批、sandbox 和审计。

完整分析见 [威胁模型](threat-model.md)。上线最低要求：插件/协议依赖固定版本、secret 最小权限、危险动作默认拒绝、每个平台真实验证 enforcement、会话/工具审计、外部内容 prompt-injection 处置和明确的数据出境政策。
