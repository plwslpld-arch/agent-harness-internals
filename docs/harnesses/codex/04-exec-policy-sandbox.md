---
title: Codex 执行策略、审批与多平台沙箱
article_type: harness
harness: codex
status: reviewed
last_verified: 2026-08-24
sources: [{"repo":"codex","path":"codex-rs/execpolicy/src/decision.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/sandboxing/src/manager.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/approvals.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/exec_policy.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"},{"repo":"codex","path":"codex-rs/core/tests/suite/windows_sandbox.rs","commit":"c9b19deb09c1841ce7acc33ddb96276030936a29"}]
---

# Codex 执行策略、审批与多平台沙箱

## 读者会得到什么

本篇拆开一个最容易误判的安全链：命令被策略允许，只说明无需由该策略继续拦截；用户批准一次升级，只说明 Harness 可以继续尝试；权限描述表达期望约束；最后能否隔离，仍取决于当前平台后端、网络代理和实际进程创建。四者不是同义词。

允许不是隔离。批准也不是隔离。

这就是边界。它们不能互换。

读完后，你应能从模型的 `exec_command` 参数一路追到命令解析、执行策略、审批请求、附加权限、有效权限描述、平台命令变换和子进程结果，并能识别失效关闭、显式无沙箱和平台能力不足。本文讨论的是锁定源码与上游测试夹具，不声称这些平台路径已在本仓库本地执行。

## 核心概念

安全链不是一道门，而是一组回答不同问题的判定。模型先提出行动，工具层验证结构，Exec Policy 决定规则结果，审批策略决定能否向用户询问，PermissionProfile 描述允许范围，Sandbox 后端尝试强制范围，进程结果和副作用最后说明实际发生了什么。任一层的「允许」都不能替代后续层。

| 概念 | 它回答的问题 | 可能结果 | 不能证明 |
|---|---|---|---|
| 参数解析 | 请求是否是合法工具输入 | 接受 / 参数错误 | 命令安全 |
| Exec Policy | 规则对命令怎样分类 | Allow / Prompt / Forbidden | 已隔离或已执行 |
| 审批策略 | 当前是否允许向人询问 | 询问 / 拒绝 / 无需问 | 操作系统能强制权限 |
| 审批决定 | 人是否批准这次请求 | 允许一次 / 拒绝 | 后续请求也获准 |
| PermissionProfile | 目标文件与网络范围是什么 | 只读、工作区写、附加权限 | 主机兑现了全部限制 |
| Sandbox 选择 | 当前平台采用哪个后端 | Seatbelt、Linux、Windows、None | 各平台强度等价 |
| 命令变换 | 原命令如何进入受限环境 | 包装 argv、代理、环境 | 子进程业务成功 |
| 副作用检查 | 实际改变是否在允许集合内 | 合规 / 越界 / 不确定 | 用户任务整体通过 |

Exec Policy 的三值语义只属于规则层。`Allow` 表示不需因这条规则继续询问，`Prompt` 表示需要走控制面，`Forbidden` 在执行前终止。规则合并必须保守：同一复合命令中存在禁止片段时，不能因另一个安全片段被允许就整体放行。

审批由请求、理由、目标权限和调用身份组成。一次批准应绑定精确命令或能力范围，不能变成后续所有命令的全局令牌；拒绝则生成可回送模型的结果。无人值守表面没有人可询问时，Prompt 应失败关闭或采用预先定义的范围规则，不能悄悄升级为允许。

PermissionProfile 是声明性目标。文件读取、工作区写入、额外路径和网络访问可能分别受约束，附加权限只有在审批通过后才能合并。平台后端的强制原语不同：能表达某个权限不表示所有主机都能兑现，无法兑现关键拒绝时应显式失败，而非裸跑。

Sandbox `None` 也有多种原因：配置明确无沙箱、请求不需要隔离、平台后端关闭或主机不支持。观察记录必须保存原因。只有「需要沙箱、成功选择后端、变换成功、子进程确实经该后端启动」的完整链，才能声明本次执行获得了对应平台隔离。

批准还存在时间与对象边界。用户看到的命令、工作目录和请求权限若在批准后被改写，原决定应失效；审批标识必须关联规范化请求而非一段可变显示文本。长时间运行中用户撤销授权，能否终止已启动进程与能否阻止下一次调用也要分开记录。

网络限制不能只看环境变量。代理、DNS、继承的文件描述符、已建立连接和子进程转发都可能形成出站路径；某个平台后端只覆盖其中一部分时，应明确能力矩阵。本文只依据锁定源码描述网络准备接缝，不宣称已经完成所有绕过测试。

## 为什么这样设计

第一，策略与强制分层让规则可跨平台复用，同时承认平台能力不同。相同命令可以得到同一 Prompt 决定，但 macOS、Linux 与 Windows 由各自后端兑现文件和网络限制。若策略直接等同于隔离，无法解释主机缺少后端时该怎么办。

第二，审批位于执行之前且与调用身份绑定，使人类决定可以被审计、拒绝和撤销。模型提供理由只是审批输入，不能自行批准；审批服务故障也不能被解释为同意。这个控制面边界尤其适用于提升权限和额外路径。

第三，有效权限由默认配置与经批准的附加权限合成，避免临时升级覆盖整个 Session。每次执行都能回溯基础范围、请求范围和批准范围，下一次调用重新判断。最小权限由此可以按请求演进，而不是在启动时一次性开到最大。

第四，平台命令变换独立于业务工具，使 shell、补丁或其他进程型工具共享 Sandbox 准备、代理和证书逻辑。准备失败在进程创建前暴露，避免子进程已经运行后才发现限制未安装。

第五，副作用与任务评分放在安全链之外，是因为「符合权限」和「完成目标」是两种结论。一个命令可以安全地失败，也可以在获准范围内修改错误文件；独立 Scorer 需要同时检查允许集合与目标产物。

这些边界也支持准确归因。策略 Forbidden 属于规则结果，用户拒绝属于控制面，后端缺失属于平台基础设施，命令非零属于执行结果，越界写入属于强制失败。将它们压成统一 error 会让恢复策略错误地重试用户拒绝，或把安全故障当成模型回答错误。

## 实现思路

教学实现采用不可变 `ExecutionDecisionTrace`，让每层追加自己的决定而不能覆盖前一层。它是课程蓝图，不声称 Codex 内部存在同名结构。

1. **解析请求。** 校验工具名、命令、工作目录、超时、提升权限与理由，生成 call_id 和参数哈希；拒绝未声明字段和非法路径。
2. **执行策略判断。** 将命令解析成可检查单元，逐条应用规则并保守合并为 Allow、Prompt 或 Forbidden，保存命中规则。
3. **处理审批。** 根据审批模式决定无需询问、发出请求或失败关闭；批准结果绑定 call_id、权限增量和有效期。
4. **合成权限。** 只有批准的增量进入 PermissionProfile；规范化允许读写根、拒绝规则和网络策略，检测自相矛盾。
5. **选择并准备 Sandbox。** 先判断请求是否需要隔离，再按平台和开关选择后端；准备包装命令、代理、证书和环境，关键能力不可用时拒绝。
6. **创建进程并观察。** 使用变换后的 argv 启动，保存退出码、stdout、stderr、资源终态和平台后端；超时或取消保留独立状态。
7. **检查副作用。** 比较执行前后文件、网络和进程产物，将越界或不可判定结果交给独立安全检查器与任务 Scorer。

```text
trace = parse(tool_call)
trace += exec_policy.evaluate(trace.command)
如果 decision == Forbidden: 返回拒绝结果
approval = approval_service.resolve(trace, requested_permissions)
如果需要批准但未批准: 返回拒绝结果
profile = merge(base_profile, approval.granted_permissions)
sandbox = manager.prepare(profile, platform, command)
如果需要隔离但无法准备: 失效关闭
process_result = spawn(sandbox.transformed_command)
return correlate(call_id, trace, process_result, observed_side_effects)
```

决策 Trace 至少记录策略规则版本、审批模式、审批主体、基础和附加权限、SandboxType、后端准备状态与最终进程身份。敏感命令或路径可脱敏，但 call_id 与规则命中关系不能丢失。旁路遥测失败不应授权执行，权威审批记录失败则必须停止。

测试矩阵把策略、审批和 Sandbox 三个轴独立变化。策略固定 Prompt 时切换人工批准、拒绝与无人值守；审批固定允许时切换平台后端可用、缺失和显式 None；Sandbox 固定时让命令退出零、非零和越界。只有正交测试才能发现某一层的绿色状态掩盖另一层失败。

对于复合 shell 命令，教学解析器默认无法证明安全就 Prompt 或 Forbidden，不能用字符串前缀白名单。真正实现还要处理 shell 方言、重定向、管道、变量展开和间接执行；本文不宣称锁定 Exec Policy 对所有 shell 语法完备。

## 贯穿案例

任务要求先运行 `git status`，再把测试结果写入工作区报告。默认权限只读，审批模式为 `UnlessTrusted`；第二步请求工作区写入。案例故意加入读取 `.env` 的第三个命令，验证拒绝规则和平台后端。

1. **检查只读命令。** `git status` 被策略分类为 Allow，有效权限保持只读；Sandbox 后端准备成功，进程退出零，未观察到文件变化。
2. **请求写报告。** 工具参数声明工作区写权限与理由，策略返回 Prompt；审批事件绑定 call_id，用户只批准报告目录。
3. **合成并执行。** PermissionProfile 加入精确写根，平台后端包装命令；报告文件创建成功，副作用检查确认没有其他写入。
4. **尝试读取秘密。** 第三个命令命中 deny-read 规则。若策略直接 Forbidden，不发审批也不创建进程；若交给 Sandbox，而当前后端无法兑现，变换阶段失效关闭。
5. **处理表面结果。** 模型收到三个可关联结果：成功、成功、拒绝。拒绝不能被重试为完全访问，批准也不继承给秘密读取。
6. **独立评分。** Scorer 检查报告内容、允许路径外无修改和秘密未进入输出；两个退出零不足以自动通过。

```json
{"callId":"write-report","policy":"prompt","approval":"granted","grantedWriteRoots":["报告目录"],"sandbox":"平台后端"}
```

```json
{"callId":"read-secret","policy":"forbidden","processCreated":false,"sideEffect":"none","toolResult":"拒绝"}
```

第一个反例让审批服务超时。系统应返回不可用或拒绝，不能把超时解释为默认批准；模型可以向用户说明阻塞，但 Harness 不创建写进程。若自动化 Target 无人工通道，这属于预期产品结果，Trial 按任务契约判定，不能临时改变审批模式。

第二个反例让平台选择结果为 None。若 PermissionProfile 仍要求拒绝秘密读取，证据中没有强制后端，执行必须失败或明确标为无隔离，不能沿用前一条命令的 Sandbox 成功。每个调用独立记录后端，防止 Session 级标签制造假证明。

第三个变体命令退出零却把报告写错目录。安全检查可能认为写入仍在批准工作区内，但任务 Scorer 判 fail；这说明安全合规与任务正确之间没有替代关系。最终证据包同时保存策略、审批、平台和产物判定。

再模拟一次批准后的参数替换攻击：界面批准的是写入报告目录，执行前命令对象却被换成读取秘密。规范化请求哈希不匹配，审批令牌必须拒绝复用，并重新进入策略判断。若只按 call_id 或按钮状态放行，控制面展示与真实副作用会脱节。

审计报告最后列出「策略允许、审批批准、后端强制、进程成功、安全合规、任务通过」六个独立字段。只有所需字段都有直接证据时，才形成对应范围的结论；缺少平台实测就保留 unavailable，不能用用户批准填空。

## 真实输入与输出

### 输入

第一组上游测试把审批策略设为 `UnlessTrusted`，权限描述设为工作区可写，并让模型请求：

```json
{"cmd":"git status","yield_time_ms":1000}
```

第二组 Windows 上游测试建立允许读取根目录、允许写项目根、但拒绝 `*.env` 的权限描述，再用受限令牌后端尝试读取和写入受拒绝文件：

```text
type secret.env >NUL & echo exact secret >future.env & type public.txt
```

### 输出

第一组不会直接执行：Harness 先发出带原调用标识的审批请求；测试提交拒绝决定后，Turn 才继续收敛。第二组也不会退回裸进程；当非提升的受限令牌无法直接兑现「拒绝读取」时，执行以错误终止：

```text
当前后端不能直接强制拒绝读取，因此拒绝在无沙箱状态下运行
```

两组输出证明不同边界：前者证明审批生命周期，后者证明一个特定 Windows 受限令牌场景的失效关闭。它们都没有证明命令业务结果正确。

## 调用链

策略允许不等于副作用已经安全发生。

![Codex 从命令解析、执行策略、审批与权限描述到多平台沙箱、网络代理和进程结果的中文安全边界图](../../../assets/diagrams/codex/04-exec-policy-sandbox.svg)

Claim: codex.security.approval-policy-sandbox-separation

Claim: codex.security.platform-enforcement-differs

1. 模型提交结构化工具参数。工具层先解析程序、参数、工作目录、超时、沙箱权限请求和理由；解析失败不会进入任意 shell 执行。
2. Exec Policy 根据命令及规则给出 `Allow`、`Prompt` 或 `Forbidden`。多个规则需要保守合并；允许仅表示策略层不再要求审批，禁止则在更靠前的位置终止。
3. `Prompt` 或请求提升权限时，审批策略决定是否可询问用户。用户批准是一次控制面决定；拒绝、`never` 或关闭细粒度沙箱审批都会阻止该请求。批准本身不会创建操作系统隔离。
4. 默认权限与经批准的附加权限合成为有效 `PermissionProfile`。它描述文件系统与网络的目标权限，不等于当前主机一定能逐项强制执行。
5. SandboxManager 独立判断是否需要沙箱，再按平台选择后端：macOS 使用 Seatbelt，Linux 使用 Seccomp 入口及其封装，Windows 仅在启用时使用受限令牌，否则选择 `None`。未知平台也可能没有具体后端。
6. `transform` 把原命令包装成对应平台命令，准备工作目录、网络代理、证书与环境；缺少 Linux 沙箱程序、Seatbelt 不可用、代理准备失败或 Windows 约束无法兑现都会返回显式错误。
7. 只有变换成功后才创建真实进程。退出码、标准输出和文件副作用属于执行事实；它们仍需由独立检查器判断是否满足任务、安全和发布要求。

## 源码证据

执行策略的三值决定只负责策略层：

```source
codex-rs/execpolicy/src/decision.rs:7-15
pub enum Decision {
    Allow,
    Prompt,
    Forbidden,
}
```

平台选择和「是否需要沙箱」被刻意分开；主机不能提供后端时，初始选择可能成为 `None`：

```source
codex-rs/sandboxing/src/manager.rs:62-75,293-325
pub fn get_platform_sandbox(...) -> Option<SandboxType> { ... }
// request needs a sandbox, independently of whether this host can provide one
pub fn should_sandbox(...) -> bool { ... }
```

命令变换先合并附加权限，再进入平台分支；网络代理和后端准备错误会向上传递，不会被这里吞掉：

```source
codex-rs/sandboxing/src/manager.rs:331-359,365-459
let base_effective_permission_profile =
    effective_permission_profile(permissions, additional_permissions.as_ref());
let (argv, arg0_override, pending_sandboxed_request) = match sandbox { ... };
```

审批测试显示「请求提升」仍受审批策略控制；关闭细粒度沙箱审批时，请求直接失败：

```source
codex-rs/core/tests/suite/approvals.rs:1077-1124
sandbox_approval: false,
sandbox_permissions: SandboxPermissions::RequireEscalated,
output_contains: "you cannot ask for escalated permissions",
```

Windows 测试明确锁定失效关闭，而不是把无法兑现的拒绝读取静默降级为裸跑：

```source
codex-rs/core/tests/suite/windows_sandbox.rs:176-210
.expect_err("restricted-token sandbox should reject deny-read restrictions");
// ... cannot enforce deny-read restrictions directly; refusing to run unsandboxed
```

第一条 Claim 使用 B 级：源码分别定义策略、审批与权限变换，上游测试锁定审批请求与拒绝路径。第二条 Claim 使用 D 级：源码明确存在三种平台后端和无后端分支，Windows 上游测试只行为验证其中一个失效关闭场景；Linux 与 macOS 路径未由本仓库运行验证，因此跨平台结论保持为结构性推断。

## 失败与限制

最危险的误读是把 `Allow` 写成「已安全执行」。它只跳过策略审批；若权限描述仍要求隔离，平台后端仍须准备和强制执行。反过来，审批通过也只授权一次请求，不能证明路径、网络或进程边界已经兑现。

存在显式无沙箱路径。用户配置、沙箱偏好、Windows 开关、未知平台或无需沙箱的权限描述都可能让选择结果为 `None`。这不是自动漏洞，也不是沙箱保证；观察者必须记录「为什么无沙箱」，不能把它与「平台沙箱已成功安装」合并成一个成功状态。

无后端，就没有平台隔离证明。

平台实现不等价。Seatbelt、Linux 沙箱封装和 Windows 受限令牌的强制原语、网络处理及失败条件不同。当前证据只在源码层看到所有分支，只在上游测试源码中看到特定 Windows 拒绝读取场景；不能外推为三平台完整等价，也不能称作本地跨平台实测。

网络不是文件权限的附属项。有效权限描述会导出网络策略，受管网络还可能要求代理、环境标识和证书准备；代理准备失败必须单独报告。网络受限也不代表所有外部副作用都消失，例如已授权的本地进程、套接字或凭据仍需独立检查。

进程退出零不是 Eval 通过。命令可能修改错误文件、泄漏信息或只完成中间步骤。Harness 应保留原调用、策略决定、审批决定、有效权限、后端、变换错误、退出状态与副作用；独立 Eval 再以固定 Trial 检查目标产物，不能把审批重试或命令恢复计成新的成功样本。

## 验证方法

先为同一命令构造允许、询问和禁止三条策略，并固定审批策略。捕获是否生成审批事件、调用标识是否稳定、拒绝后是否仍创建进程。不要用最终错误字符串反推中间所有决定。

再建立最小权限矩阵：只读、工作区写、额外路径写、网络受限和请求提升。记录默认权限、附加权限与最终有效权限，确认未经批准的附加权限不会进入平台变换。

随后在每个受支持平台分别验证允许读、拒绝读、允许写、拒绝写、网络代理和缺失后端。每次都记录实际选择的 SandboxType、包装命令和副作用；若主机无法兑现某条拒绝规则，应断言明确失败，而不是只看进程未报错。

最后增加独立结果检查：即使命令退出零，也核对允许路径之外没有写入、受限网络没有绕过、目标文件内容正确。把上游夹具、本地验证和生产观察分栏保存，任何一栏都不能替代另外两栏。

## 自检

### 问题 1

Exec Policy 返回允许，是否证明命令已被操作系统隔离？

**答案：** 不能。允许只结束策略层拦截；权限合成、平台后端变换和真实进程创建仍是后续独立步骤。

### 问题 2

用户批准提升权限后，还可能执行失败吗？

**答案：** 会。批准只授权尝试；工作目录、代理、平台后端或权限原语无法准备时仍应失败。

### 问题 3

为什么 Windows 失效关闭测试不能证明 Linux 与 macOS 同样安全？

**答案：** 它只覆盖受限令牌无法兑现拒绝读取的特定夹具；另外两个平台使用不同后端，需要各自行为测试。

### 问题 4

命令退出零为什么仍不能算 Eval 通过？

**答案：** 退出零只说明进程自报成功，不能证明用户目标、允许副作用集合或发布标准得到满足，仍需独立评分与门禁。
