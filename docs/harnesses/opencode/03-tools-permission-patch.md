# Tools、Permission、Question 与 Patch 的边界

[返回 OpenCode 课程地图](README.md)

OpenCode 先从内建、Plugin 和 MCP 来源建立 Tool Registry，再按模型和功能开关投影本轮工具；真正执行时，工具调用 `Permission.ask()` 计算规则并可能向客户端发出 Question。Patch/Snapshot 能帮助撤销工作区修改，但不是外部副作用事务。

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

可见性降低误调用概率，但不是权限决定。一个工具从模型面隐藏，不代表 Plugin 代码不能直接产生副作用；模型看见它也不代表执行时会获准。

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

审计不能只搜索有没有 `deny`。后面的宽通配 Allow 可能覆盖前面的具体 Deny，必须按真实合并顺序计算。

### 「最后匹配」带来的可组合性与风险

最后匹配允许全局默认、项目例外和管理员收口逐层组合，规则表达力很强；同时也让文件顺序成为安全语义。配置合并若改变数组顺序，就可能改变最终动作。测试应覆盖完整有效 Ruleset，而不是单独测试某一条规则存在。

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

`always` 是应用实例内规则，不是 OS ACL。工具若绕过 `ask()`，应用层 Permission 无法约束它。

## Question 与 Permission 不完全相同

Question Tool 也能向用户询问业务选择，但它不一定授权副作用。Permission Question 必须与 Tool Call 和 Pattern 关联；普通问题的答案只回到模型 Context。表面应显示两者不同风险。

## Patch 与 Revert 能覆盖什么

文件工具可以生成 Snapshot/Patch，为 Session Revert 提供工作树逆向修改。它无法撤销网络请求、数据库写入、项目外删除、包发布或后台进程。高风险操作仍需最小权限和外部幂等设计。

## 回到运费任务

`read` 可以按规则直接允许，`edit` 可能匹配 Ask，`bash` 的测试命令还要按命令 Pattern 判断。用户选择 Once 只授权这次 Call；选择 Always 才在当前实例增加匹配模式。写入完成后的 Patch 支持回退文件，但若 Bash 同时启动了后台服务，Revert 不会替你关闭进程。

## 练习：计算最终规则

Ruleset 依次包含：`edit:* → ask`、`edit:tests/** → deny`、`edit:** → allow`。对 `tests/shipping.test.ts` 的最终动作是什么？

<details>
<summary>查看核对要点</summary>

若三个 Pattern 都匹配，最后一条宽泛 Allow 会覆盖前面的 Deny。这个结果通常违背维护者直觉，因此管理员收口规则必须位于真实合并顺序的后部，检查器也应报告被后续规则遮蔽的敏感 Deny。

</details>

下一篇：[Storage、Compaction 与 Revert](04-storage-compaction-revert.md)。
