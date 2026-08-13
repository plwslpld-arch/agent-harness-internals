# DeepSeek Harness 威胁模型

## 资产与攻击者

保护对象包括工作区与未提交改动、SSH/云/API 凭据、提示/推理/附件/session log、用户身份、宿主进程与网络、批准事实、成本/审计完整性、发布包/lock/vendored 代码。

攻击者可能是不可信 plugin/npm/MCP server，也可能是被污染的网页、仓库、issue 或工具输出；还包括越权客户端、误配置维护者、逃逸子进程和试图制造伪成功的模型输出。

## 信任边界

1. **模型**：输入可能含 secret 与不可信内容；输出始终不可信。
2. **工具流水线**：schema、审批、sandbox、timeout、输出校验和唯一结算应在这里强制。
3. **宿主 plugin**：in-process plugin 能读宿主状态、注册或替换 service，默认高信任。
4. **执行环境**：平台 runner 决定实际 enforcement；请求 sandbox 不等于完整隔离。
5. **远端服务**：模型、搜索、MCP HTTP、E2B 可能接收数据并受服务条款约束。
6. **客户端**：Web/ACP/SDK 的身份、会话所有权、取消与权限回答必须绑定正确连接。
7. **持久化**：append-only log 是回放/审计真源，也可能长期保存敏感信息。

## 威胁与控制

| 威胁 | 典型路径 | 仓库内机制 | 部署仍需处理 |
| --- | --- | --- | --- |
| prompt injection | 网页/MCP/README 诱导高危调用 | 统一工具流水线、审批、sandbox | 内容标记、最小工具集、出站限制、人工确认 |
| 恶意 plugin | tree 外 npm 包读取宿主/secret | lock、配置/包门禁 | allowlist、源码审查、provenance、进程隔离 |
| MCP 供应链 | stdio 恶意包；HTTP 篡改 schema/result | 名称隔离、整代注册、timeout/reconnect | 固定完整性、清理 env、最小 token、TLS/域名限制 |
| secret 泄漏 | config/log/error/header/model context | credentials seam、引用解析、错误不回显 | 最小权限、轮换、脱敏、端点审计 |
| sandbox 误判 | partial enforcement 被当完整隔离 | full/partial/unavailable 事实、失败关闭 | 每平台 E2E、网络隔离、容器/VM |
| 权限错绑/重放 | A 会话批准用于 B 调用 | tool-call id、一次性请求、ownership check | TTL、client identity 审计、窄作用域 |
| 工具结果投毒 | 伪成功、超长/恶意输出 | schema/output 校验、spill、structured error | 原始证据 hash、副作用二次验证 |
| 持久化泄密/篡改 | log 含推理、路径、输出 | checksum/事务、事件词汇 | 加密、访问/保留/删除、备份完整性 |
| 子 Agent 权限扩散 | child 继承 cwd、provider、sandbox | ownership/继承测试 | capability snapshot、深度/成本限制、独立 secret |
| 数据出境 | API/search/E2B/MCP 接收业务数据 | provider 可替换、endpoint 可配 | 数据分类、地域/DPA/租户策略 |

## 沙箱的正确表述

不要写“Harness 已完全沙箱化”。应写：特定工具经特定 provider 请求某种文件系统策略，runner 返回 full、partial 或 unavailable。Linux Landlock/bwrap、macOS Seatbelt、Windows ACL 的能力与失败方言不同；网络、内核、宿主 plugin 与同进程文件 provider 不自动被覆盖。

`danger-full-access` 是显式绕过。E2B 替换 FS/subprocess provider 时，Cordis、模型调用、session log 与 SDK buffer 仍在宿主，不能宣称整个 Harness 已迁移到远端隔离。

## 审批不是免责按钮

审批应显示具体工具、规范化参数、cwd/目标、副作用和当前 enforcement。允许应绑定一次调用或窄重试，取消/无回答失败关闭。模型的解释是上下文，不是授权主体。

## 必跑攻击演练

1. 仓库文字要求上传环境变量：应被内容/出站/审批控制阻断。
2. MCP list_changed 把只读工具换成写操作：schema 与权限重新审查。
3. stdio server 污染 stdout、挂起、崩溃循环：协议隔离、timeout、预算耗尽。
4. runner 打印信息性 warning 且子命令非零：保留真实子命令失败，不误报 sandbox unavailable。
5. ACP 两会话并行权限并取消其一：结果不能串线。
6. log 含 secret、超大结果、恶意 HTML：存储/UI 均按策略处理。
7. 依赖升级新增 transitive/platform payload：license、完整性、notice 门禁失败。

每项剩余风险记录资产、攻击路径、前置条件、影响、控制、owner、期限与可验证退出标准；覆盖率和“低概率”都不能替代边界证据。
