# 执行策略、用户审批与 Sandbox 为什么必须分开

[返回 Codex 课程地图](README.md)

上一讲已经把模型流、工具调用和结果回填串起来了。工具一走到 Shell，这次命令能用什么权限执行，就成了绕不开的问题，权限问题也从这里开始。

这里最容易混淆的说法是「命令已经放行，所以它肯定在沙箱里安全地跑完了」。Codex 会分三步处理这件事：Exec Policy（执行策略）先判断请求该放行、询问还是禁止，Approval Policy（审批策略）再决定能不能向用户申请额外权限。最后才轮到 Sandbox 一层的 Manager，它会按当前平台和权限要求准备隔离环境。

```text
模型提出命令
     ↓
Exec Policy：Allow / Prompt / Forbidden
     ↓
必要时请求用户一次性审批
     ↓
计算 Effective Permission Profile
     ↓
选择并准备平台 Sandbox
     ↓
启动进程并收集输出
```

`Allow` 只说明策略层不再拦这条请求，`Prompt` 则说明还得等一次决定，就算用户点了允许，授权也只管这一次尝试。命令最后有没有进隔离环境，还得看后面具体怎样生成执行请求。

## 第 1 站：Exec Policy 输出三值决定

源码：[查看 `Decision`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/execpolicy/src/decision.rs#L7-L15)

```rust
pub enum Decision {
    Allow,
    Prompt,
    Forbidden,
}
```

- **调用者**：执行工具在准备命令时查询策略。
- **输入**：命令、工作目录、规则集与请求的权限。
- **状态变化**：不启动进程，只生成策略结论。
- **返回**：允许继续、要求审批或立即拒绝。
- **下一站**：Approval 流或 Sandbox 请求构造。

这里必须保留三个结果，因为「目前没拿到授权，但可以问用户」和「问了也不能放行」会把流程带向不同分支。如果两种情况都折成 `false`，UI 就不知道该显示审批入口，还是直接告诉用户这条命令不能执行。

这两种情况不能混。

## 第 2 站：需要 Sandbox 与平台能否提供 Sandbox 是两个问题

源码：[查看平台选择与需求判断](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/sandboxing/src/manager.rs#L62-L75)

```rust
pub fn get_platform_sandbox(...) -> Option<SandboxType> {
    // 根据平台与配置选择后端
}
```

源码：[查看 `should_sandbox()`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/sandboxing/src/manager.rs#L293-L325)

```rust
pub fn should_sandbox(...) -> bool {
    // 请求是否需要隔离，与主机能否提供后端分开判断
}
```

- **调用者**：执行请求构造器。
- **输入**：Sandbox Policy、Permission Profile、平台能力和用户配置。
- **状态变化**：选择 Seatbelt、Landlock、Windows 后端或无后端；另行判断请求是否要求隔离。
- **返回**：可选 Sandbox Type 与需求判断。
- **下一站**：若需要且有后端，转换命令；不满足时按策略失败或走明确的无 Sandbox 路径。

这两个函数各管一件事，系统才能说清「请求要求禁用网络，但当前平台没有可用后端」究竟卡在哪里。如果后端缺失，安全层就该明确报出缺失，不能顺手把它解释成「无需隔离」。

## 第 3 站：有效权限先合并，再生成平台命令

源码：[查看 Sandbox 命令转换](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/sandboxing/src/manager.rs#L331-L359)

```rust
let base_effective_permission_profile =
    effective_permission_profile(permissions, additional_permissions.as_ref());

let (argv, arg0_override, pending_sandboxed_request) = match sandbox {
    // 各平台后端分支
};
```

- **调用者**：Shell/Exec Handler 准备子进程。
- **输入**：原命令、基础权限、这次批准的附加权限、平台 Sandbox。
- **状态变化**：合成 Effective Profile；生成包装后的 argv、环境或待处理 Sandbox 请求。
- **返回**：可以交给 Process Host 的执行规格。
- **下一站**：实际创建进程，并把 stdout、stderr、退出状态送回 Tool Result。

看到这里，Approval（审批）管什么已经很清楚了。它只决定「这次请求可以多拿哪些权限」，不会替你提供平台后端，也保证不了后端一定能初始化成功。

## Require Escalated 也受 Approval Policy 约束

模型不能想当然地把每条命令都提到宿主权限，这件事同样受 Approval Policy 约束。上游测试专门覆盖了一种情况：细粒度 Sandbox 审批关闭以后，`RequireEscalated` 请求会直接失败。

源码：[查看提升权限拒绝测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/approvals.rs#L1077-L1124)

```rust
sandbox_approval: false,
sandbox_permissions: SandboxPermissions::RequireEscalated,
output_contains: "you cannot ask for escalated permissions",
```

这里拒绝命令的还不是 Sandbox。请求在走到 Sandbox 之前就违反了当前审批约定，因此流程提前停下，命令根本没有进入隔离环境。

拒绝发生得更早。

## Fail Closed 的具体含义

如果 Windows 受限令牌这条路径落实不了 Deny-Read 约束，测试就要求它直接报错，绝不能悄悄撤掉限制，再让命令裸跑。

源码：[查看 Windows 拒绝读取测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/windows_sandbox.rs#L176-L210)

```rust
.expect_err("restricted-token sandbox should reject deny-read restrictions");
```

Fail Closed 要求的是：策略既然承诺了某项限制，当前执行路径又落实不了，系统就必须拒绝这次执行。它没有要求所有命令一律进入 Sandbox，也不允许系统偷偷降低约束。

## 排查一次「为什么弹出审批」

按这条顺序查：

1. Tool Call 请求了什么命令和权限；
2. Exec Policy 为什么返回 Prompt；
3. 当前 Approval Policy 是否允许询问与提升；
4. 用户决定是否只对本次 Call 有效；
5. Effective Permission Profile 最终是什么；
6. 选择了哪个平台后端；
7. 子进程是否真的以该规格启动。

如果你只盯着最后的命令输出，就看不到前面为什么作出每个安全决定，也查不清这些决定究竟在哪一层生效。

进程跑完，还不能收工。安全决定和执行结果会分别写进 Rollout（运行轨迹）、模型历史、Compaction（上下文压缩）和 Memory。下一篇顺着这些记录往下看。

下一篇：[Rollout、历史、压缩与恢复](05-rollout-history-memory.md)。
