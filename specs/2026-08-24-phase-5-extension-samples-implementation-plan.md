# 阶段 5：六个扩展样本实施计划

**目标：** 锁定并复核 mini-swe-agent、OpenHands、Cline、goose、Aider 与 Qwen Code，只提炼它们相对六条一级主线新增的机制。扩展样本不升级为第七至第十二条一级主线，也不进入正式课程导航。

**发布对象：** 六篇独特机制专题、六张中文机制图、每方至少两条 Claim、来源锁与许可证记录、扩展样本入口、阶段对抗复核。

## 内容契约

每篇样本文章必须具备：

- `## 样本定位`
- `## 独特机制`
- `## 源码入口`
- `## 运行链`
- `## 与一级主线的关系`
- `## 失败与限制`
- `## 验证方法`
- `## 自检`

正文至少 1,800 个非空白字符、10 个有效段落，引用至少两条正式 Claim 与一张中文 SVG。文章只能总结锁定源码真实覆盖的机制，不能从仓库名、README 功能表或目录存在推导默认运行能力。

## Task 1：来源、许可与扩展样本门禁

- [x] 测试先行：`samples` 配置必须恰好包含六个目标来源，缺失或多出均失败。
- [x] 锁定五个新增上游的主分支 Commit、许可证文件与文本 SHA-256，登记 Git submodule、Manifest 和 Lock。
- [x] 测试先行：新增 `sample` 文章类型与深度契约，状态、来源、中文图和 Claim 不完整时失败。
- [x] 提交：`chore(sources): 锁定六个扩展样本来源`。

## Task 2：mini-swe-agent

- [x] 核对最小 Agent Loop、环境接口、轨迹与终止边界，新增至少两条 Claim。
- [x] 完成中文机制图和专题文章，不把最小实现解释成默认安全或生产完整性。
- [x] 提交：`docs(samples): 发布 mini-swe-agent 独特机制`。

## Task 3：OpenHands Agent Canvas

- [x] 以锁定仓库当前自述为准，核对 Canvas、Agent Server 后端、ACP 适配、自动化与本地/远端部署边界，新增至少两条 Claim；不把当前控制中心源码冒充独立 OpenHands Agent 的内部实现。
- [x] 完成中文多后端控制图和专题文章，不把 Docker、VM 或远端 Backend 名称解释成实际部署隔离证明。
- [x] 提交：`docs(samples): 发布 OpenHands 独特机制`。

## Task 4：Cline

- [x] 核对编辑器宿主、Provider、工具批准、Checkpoint/任务状态与扩展表面，新增至少两条 Claim。
- [x] 完成中文人机控制链图和专题文章，不从 UI 成功状态推断任务正确。
- [x] 提交：`docs(samples): 发布 Cline 独特机制`。

## Task 5：goose

- [x] 核对 Recipe、Extension/MCP、Provider 与 Rust Agent 主链，新增至少两条 Claim。
- [x] 完成中文配方与扩展装配图和专题文章，区分配置发现、连接、模型可见与真实调用。
- [x] 提交：`docs(samples): 发布 goose 独特机制`。

## Task 6：Aider

- [x] 核对 Repository Map、编辑格式、Architect/Editor 分工与 Git 产物链，新增至少两条 Claim。
- [x] 完成中文代码编辑证据链图和专题文章，不把 Git 提交或测试通过单独解释成任务完成。
- [x] 提交：`docs(samples): 发布 Aider 独特机制`。

## Task 7：Qwen Code

- [x] 核对配置、Agent Loop、工具策略、会话和扩展协议，明确与 Gemini CLI 共同结构及独立演进边界，新增至少两条 Claim。
- [x] 完成中文机制边界图和专题文章，不因相似目录或继承关系假设行为等价。
- [x] 提交：`docs(samples): 发布 Qwen Code 独特机制`。

## Task 8：扩展样本入口与阶段复核

- [x] README 和总入口增加正式导航标记之外的“扩展样本”区域，明确它们是机制补充，不是一级主线或综合排名。
- [x] 全量验证 `samples` 与 `all` 来源、Claim、源码锚点、中文图、链接、许可证、敏感信息和 Node 24 聚合门禁。
- [x] 集中渲染六张图，主动寻找目录即能力、示例即默认、测试即生产、客户端成功即任务正确和同源即等价。
- [x] 修复全部高优先级发现，记录阶段复核，勾选总路线阶段 5 并提交：`chore(review): 完成阶段 5 扩展样本复核`。

## 完成定义

1. 六个来源均由 Gitlink、Lock、许可证散列和本地 Checkout 四者共同锁定。
2. 六篇文章均达到 `reviewed`，每篇只讲可核对的独特机制并保留失败边界。
3. 六张中文图经渲染目检，Manifest 与 Claim 绑定完整。
4. 扩展样本可以从入口发现，但不进入正式课程导航，不参与总分或赢家比较。
5. 阶段复核为 `pass`，全部来源和 Node 24 聚合门禁通过。
