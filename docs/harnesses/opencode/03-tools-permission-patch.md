# Tools、Permission、Question 与 Patch 的边界

[返回 OpenCode 课程地图](README.md)

OpenCode 会先收齐内建工具和 Plugin 提供的工具，也会把通过 MCP 接入的工具放到一起，然后根据模型能力和功能开关，筛出这一轮真正能进入 Tool Registry（工具注册表）的部分。

模型发出 Tool Call（工具调用）以后，`Permission.ask()` 才会逐条计算权限规则，如果还得让用户决定，客户端就会收到 Question。

Patch（补丁）和 Snapshot（快照）可以撤销工作区里的改动，却碰不到已经发生的外部副作用：文件能退回原样，外部世界不会跟着复原。

```text
Tool Registry → 模型可见 Schemas
                    ↓
               Tool Invocation
                    ↓
Permission Rules：allow / deny / ask
                    ↓
Question Event → 用户 once / always / reject
                    ↓
Tool Body → Patch / Snapshot / Result
```

## 第 1 站：工具目录在交给模型前仍会过滤

源码：[查看 Tool Registry 投影](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/tool/registry.ts#L256-L339)

```typescript
const filtered = (yield* all()).filter((tool) => {
  if (tool.id === ApplyPatchTool.id) return usePatch
  // 其他模型与功能过滤
})
```

- **调用者**：Session Prompt 构造本轮 Tools。
- **输入**：所有注册工具、Model、Agent 与 Feature Flags。
- **状态变化**：不删除源定义，只形成当前模型可见集合。
- **返回**：AI SDK Tool Map。
- **下一站**：模型生成 Tool Call，Processor 建 Running Part。

模型看不见某个工具，误调用的机会确实会少一些，不过这里还没有判断它到底有没有权限。Plugin 代码仍可能绕过模型，直接在外部产生副作用。反过来，即使模型看见了某个工具，也得等执行阶段算完规则并放行，工具才会真正运行。隐藏不等于授权。

## 第 2 站：Permission 使用最后匹配规则

源码：[查看规则求值](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/permission/index.ts#L28-L38)

```typescript
ruleset
  .findLast((rule) =>
    Wildcard.match(permission, rule.permission) &&
    Wildcard.match(pattern, rule.pattern),
  ) ?? { action: 'ask' }
```

- **调用者**：Tool Body 在执行具体路径/命令前调用 Permission。
- **输入**：Permission 名称、规范化 Pattern 与有序 Ruleset。
- **状态变化**：无匹配时回退 Ask；最后一条匹配规则覆盖之前规则。
- **返回**：Allow、Deny 或 Ask。
- **下一站**：立即执行/拒绝，或发布 Question Event。

你在审计权限配置时，不能只搜索其中有没有 `deny`，因为后面那条范围更宽的 Allow 仍可能盖过前面的具体 Deny。要看最终会放行还是拒绝，必须按照配置真正合并后的顺序，把所有匹配规则走一遍。顺序就是语义。

### 「最后匹配」带来的可组合性与风险

「最后匹配」让你先写全局默认，再叠加项目例外，最后还能让管理员补一条收口规则，因此同一套机制可以表达很灵活的权限策略。代价也很直接：文件怎么排列，会影响系统是否放行。一旦合并配置时改了数组顺序，最终动作就可能随之改变，所以测试要跑过合并后真正生效的完整 Ruleset，不能只确认某条规则还在。顺序一变，权限就变。

## 第 3 站：Ask 会等待 Deferred，不会隐式允许

源码：[查看 Permission 请求生命周期](https://github.com/anomalyco/opencode/blob/3a31c4ea801915c0b050df4b3842997ea62b6e93/packages/opencode/src/permission/index.ts#L67-L105)

```typescript
if (rule.action === 'deny') {
  return yield* new PermissionV1.DeniedError(...)
}

yield* events.publish(Event.Asked, info)
return yield* Deferred.await(deferred)
```

- **调用者**：Read、Edit、Bash、External Directory 等工具。
- **输入**：Session、Call ID、Permission、Patterns 与元数据。
- **状态变化**：注册待回答 Deferred 并发布事件；`always` 才把选中 Pattern 加入当前实例批准集合。
- **返回**：Once/Always 后继续，Reject/关闭时失败。
- **下一站**：Tool Body 或 Processor Error Part。

用户选择 `always` 后，OpenCode 只是把对应 Pattern（匹配模式）加入当前应用实例的批准规则，并不会因此改写 OS ACL。只要某个工具绕过 `ask()` 直接执行，应用层 Permission 就管不到它。这两层不能混。

## Question 与 Permission 不完全相同

Question Tool 也会请用户作出业务选择，但用户答了普通问题，并不等于同时批准工具产生副作用。Permission Question 必须绑住具体的 Tool Call 和 Pattern，普通答案则只会写回模型 Context，所以客户端要把两类问题的风险清楚地展示给用户。

## Patch 与 Revert 能覆盖什么

文件工具先留下 Snapshot 和 Patch，Session Revert 才能据此把工作树里的改动倒回去。不过它无法收回网络请求、数据库写入、项目外删除或包发布，也不会自动停掉后台进程。只要某个操作可能越过工作树边界，你仍要限制权限，并让外部操作可以安全重试。Patch 不是事务。

## 回到运费任务

回到运费任务，规则可以直接放行 `read`，却可能要求用户确认 `edit`。至于 `bash` 里的测试命令，还得拿命令本身继续匹配 Pattern。用户选择 Once，只会批准当前 Call，选择 Always 才会把匹配模式留在当前实例里。文件写完后虽然可以靠 Patch 回退，但 Bash 如果同时启动了后台服务，Revert 不会替你关掉进程。

## 练习：计算最终规则

Ruleset 依次包含：`edit:* → ask`、`edit:tests/** → deny`、`edit:** → allow`。对 `tests/shipping.test.ts` 的最终动作是什么？

<details>
<summary>查看核对要点</summary>

如果三个 Pattern 全都匹配，最后那条范围很宽的 Allow 就会盖过前面的 Deny。这个结果很容易违背维护者的直觉，因此管理员用来收口的规则必须排在真实合并顺序的后部，检查器也要找出那些被后续规则盖住的敏感 Deny。

</details>

下一篇：[Storage、Compaction 与 Revert](04-storage-compaction-revert.md)。
