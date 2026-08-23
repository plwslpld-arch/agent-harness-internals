# 关键结论注册表

这里保存会影响公开理解、跨 Harness 比较或使用决策的可核对结论。解释性正文仍由人撰写；注册表负责把重要结论的适用条件、能力状态、证据等级和证据定位固定下来。

以下内容必须登记 Claim：默认行为，安全边界，平台差异，终止与失败语义，成本或性能判断，跨 Harness 比较，评测与发布证据，以及 README 中的公开承诺。一般背景说明和不影响判断的实现细节不必机械登记。

## 能力状态和证据等级不是一回事

`capability` 描述功能处于什么状态：`default`、`optional`、`extension`、`external`、`absent`、`unknown` 或 `not-applicable`。`evidence_level` 描述我们凭什么相信结论：

- `A`：源码、上游测试和本仓库实验相互印证。
- `B`：源码和上游测试相互印证。
- `C`：源码或官方文档直接支持。
- `D`：基于已列证据的明确推断，必须填写 `inference`。
- `U`：当前无法核验；可以不提供证据，不能为了填满字段伪造确定性。

因此，“证据不足”不能写成 `absent`，“代码存在”也不能自动写成 `default`。

## 文件与引用方式

每个正式 Claim 使用一个 JSON 兼容 YAML 文件，文件名应与 Claim ID 对应，例如 `codex.permissions.command-policy.yml`。正文通过稳定 ID 引用：`Claim: codex.permissions.command-policy`，不要复制一套脱离注册表的证据等级。

源码证据必须锁定来源、完整 Commit、仓库相对路径、行号区间和可在该区间找到的短摘录。`upstream-test` 使用同一格式。官方文档证据必须记录标题、HTTPS URL 和访问日期。`experiment` 必须指向 `evidence/experiments/` 中同名的实验记录。

[`schema.example.yml`](schema.example.yml) 是不代表任何真实产品结论的合成示例。执行 `npm run check:claims` 校验全部正式 Claim；示例文件只用于复制结构，不进入公开结论统计。
