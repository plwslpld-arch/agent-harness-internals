# Tools、Permission、Question 与 Patch 的边界

[返回 OpenCode 课程地图](README.md)

OpenCode 会先汇集内建、Plugin 和 MCP 提供的工具，再按照模型能力与功能开关投影出本轮 Tool Registry。只有模型发出 Tool Call 后，执行路径才会进入 `Permission.ask()` 计算规则，并在需要用户确认时向客户端发出 Question。Patch/Snapshot 能帮你撤销工作区修改，却管不到已经发生的外部副作用——文件能回退，外部世界不能。

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

把工具从模型面隐藏，确实能降低误调用概率，但这一步并没有作出权限决定。Plugin 代码仍可能绕过模型直接产生副作用，而模型即使看见某个工具，也要等执行阶段的规则判定通过后才能调用。隐藏不是授权。

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

审计权限配置时，如果只搜索有没有 `deny`，就会漏掉规则顺序带来的覆盖，因为排在后面的宽通配 Allow 仍可能压过前面的具体 Deny。必须按真实合并顺序计算。顺序就是语义。

### 「最后匹配」带来的可组合性与风险

因为最后匹配允许全局默认、项目例外和管理员收口逐层叠加，所以它能表达相当灵活的权限策略，但代价是文件顺序也成了安全语义。一旦配置合并改变数组顺序，最终动作就可能跟着改变，因此测试必须覆盖合并后的完整有效 Ruleset，而不能只确认某一条规则存在。顺序一变，权限就变。

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

`always` 写入的是当前应用实例里的批准规则，并不会变成 OS ACL，所以工具一旦绕过 `ask()`，应用层 Permission 就无从约束它。边界不能混淆。

## Question 与 Permission 不完全相同

Question Tool 也能向用户询问业务选择，但这种回答并不天然授权副作用，因为 Permission Question 必须与具体的 Tool Call 和 Pattern 关联，而普通问题的答案只会回到模型 Context。客户端需要把两者的风险差异明确显示出来。

## Patch 与 Revert 能覆盖什么

文件工具生成 Snapshot/Patch 后，Session Revert 才有材料对工作树做逆向修改，但这套机制无法撤销网络请求、数据库写入、项目外删除、包发布或后台进程。只要操作可能越过工作树边界，就仍要依靠最小权限和外部幂等设计。Patch 不是事务。

## 回到运费任务

在运费任务里，`read` 可以按规则直接放行，`edit` 可能落到 Ask，而 `bash` 的测试命令还要继续按命令 Pattern 判断。用户选择 Once 时只授权当前 Call，只有选择 Always 才会把匹配模式加入当前实例。写入完成后虽然能靠 Patch 回退文件，但如果 Bash 同时启动了后台服务，Revert 并不会替你关闭进程。

## 练习：计算最终规则

Ruleset 依次包含：`edit:* → ask`、`edit:tests/** → deny`、`edit:** → allow`。对 `tests/shipping.test.ts` 的最终动作是什么？

<details>
<summary>查看核对要点</summary>

如果三个 Pattern 全部匹配，最后一条宽泛 Allow 就会覆盖前面的 Deny。因为这个结果往往违背维护者直觉，所以管理员收口规则必须放在真实合并顺序的后部，检查器也应报告那些被后续规则遮蔽的敏感 Deny。

</details>

下一篇：[Storage、Compaction 与 Revert](04-storage-compaction-revert.md)。
