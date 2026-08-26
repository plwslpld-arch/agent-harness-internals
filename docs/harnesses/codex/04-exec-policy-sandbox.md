# 执行策略、用户审批与 Sandbox 为什么必须分开

[返回 Codex 课程地图](README.md)

上一讲已经把模型流、工具调用与结果回填串成闭环，而一旦工具走到 Shell，问题便向前推进——这次命令究竟能以什么权限执行。权限问题就从这里开始。

安全链最常见的误读是：「命令被允许，所以它在沙箱里安全执行了。」但 Codex 会把至少三件事依次分开处理，Exec Policy 先判断一条请求应当允许、询问还是禁止，Approval Policy 再决定能否向用户请求额外权限，最后才由 Sandbox Manager 根据平台和权限描述准备实际隔离。

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

`Allow` 只表示策略层不再拦截，`Prompt` 只表示还需要一次决策，即使用户点了允许，也只是授权这次尝试。命令最终是否进入隔离环境，仍要看后面生成的执行请求。

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

这里使用三值而不是布尔值，是为了保留「目前没有授权，但可以询问用户」与「即使询问也不允许」之间的区别，因为一旦把两者都折成 false，UI 就无法给出与当前决策相符的操作。

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

只有把这两个函数分开，系统才能准确表达「请求要求拒绝网络，但当前平台后端不可用」这种状态。安全实现不能把后端缺失误写成「无需隔离」。

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

从这里就能看清 Approval 的作用点，它只影响「这次请求允许增加哪些权限」，既不会替代平台后端，也不能保证后端一定初始化成功。

## Require Escalated 也受 Approval Policy 约束

模型不能任意把每条命令升级到宿主权限，而上游测试专门覆盖了关闭细粒度 Sandbox 审批后，`RequireEscalated` 请求直接失败的场景。

源码：[查看提升权限拒绝测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/approvals.rs#L1077-L1124)

```rust
sandbox_approval: false,
sandbox_permissions: SandboxPermissions::RequireEscalated,
output_contains: "you cannot ask for escalated permissions",
```

这不是 Sandbox 拒绝了命令，因为请求在进入 Sandbox 之前就已经违反允许的审批契约。拒绝发生得更早，命令尚未进入 Sandbox。

## Fail Closed 的具体含义

如果 Windows 受限令牌路径无法兑现 Deny-Read 约束，测试就要求直接返回错误，而不是让命令悄悄脱离限制裸跑。

源码：[查看 Windows 拒绝读取测试](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/tests/suite/windows_sandbox.rs#L176-L210)

```rust
.expect_err("restricted-token sandbox should reject deny-read restrictions");
```

Fail Closed 并不是说所有命令都必须进入 Sandbox，而是说一旦策略承诺了某个限制，当前路径却无法兑现，系统就应拒绝这次执行，不能把约束静默降级。

## 排查一次「为什么弹出审批」

按这条顺序查：

1. Tool Call 请求了什么命令和权限；
2. Exec Policy 为什么返回 Prompt；
3. 当前 Approval Policy 是否允许询问与提升；
4. 用户决定是否只对本次 Call 有效；
5. Effective Permission Profile 最终是什么；
6. 选择了哪个平台后端；
7. 子进程是否真的以该规格启动。

如果只看最终的命令输出，前面每个安全决策为何产生、又在哪一层生效，就都会从排查证据里消失。

进程执行结束以后，证据链还没有结束，因为这些安全决策与执行结果还会分别进入四种去向——Rollout、模型历史、Compaction 与 Memory，下一篇就沿着这条记录链继续追踪。

下一篇：[Rollout、历史、压缩与恢复](05-rollout-history-memory.md)。
