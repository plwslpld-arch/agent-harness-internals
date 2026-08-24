# 配置、项目指令与模型实际看到的输入

[返回 Codex 课程地图](README.md)

第一次读 Codex，最容易把「配置文件里的内容」直接等同于「发给模型的 Prompt」。实际上中间至少经过三层：磁盘与命令行提供候选配置，线程启动时把它们解析成有效配置，每次 Turn 再把指令、历史、工具和用户输入组装成模型请求。

```text
配置文件 / 命令行覆盖 / 启动参数
                 ↓
             有效配置
                 ↓
模型默认指令 + 开发者指令 + AGENTS.md
                 ↓
历史正规化 + 当前输入 + Tool Schemas
                 ↓
             一次模型请求
```

## 为什么必须区分这三层

假设仓库根目录有 `AGENTS.md`，子目录也有一份。用户从根目录进入任务，后来把工作目录切到子目录：磁盘文件没有变化，但模型可见的项目指令会增加。再如线程已经启动后修改默认模型，它影响后续请求，却不一定改写过去 Rollout 中保存的 Turn Context。

所以排查「模型为什么没遵守某条指令」时，应依次问：文件是否被发现、字段是否在合并中胜出、本轮请求是否真的包含它。

## 第 1 站：有效配置按字段合并，不是整个对象覆盖

源码：[查看模型与指令字段的合并](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/config/mod.rs#L3824-L3866)

```rust
let model = model.or(cfg.model);
let base_instructions = base_instructions
    .or(file_base_instructions)
    .or(cfg.instructions.clone());
let developer_instructions =
    developer_instructions.or(cfg.developer_instructions);
```

- **调用者**：线程或 Session 启动时的配置解析流程。
- **输入**：运行时参数、文件加载结果和全局配置。
- **状态变化**：逐字段选择优先值，形成不可再用「来自哪个文件」简单概括的有效配置。
- **返回**：供 Session、Provider 和 Prompt 构造使用的 Config。
- **下一站**：项目文档发现与 Turn Context 构造。

Rust 的 `Option::or` 选择左侧第一个 `Some`。这意味着「命令行优先」只是对使用这一合并方式的字段成立；要判断某个具体选项，仍要看它自己的解析代码。

## AGENTS.md 是项目上下文，不是无限长系统提示

Codex 会沿工作目录层级发现项目指令，并受最大字节数与后备文件名限制。进入更深目录时，新发现的指令需要作为新的上下文进入后续 Turn；旧消息已经存在于历史里，不会因为当前目录改变而被倒写。

### 第 2 站：项目文档限制先进入有效配置

源码：[查看项目文档大小与后备名称](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/config/mod.rs#L4163-L4172)

```rust
project_doc_max_bytes:
    cfg.project_doc_max_bytes.unwrap_or(AGENTS_MD_MAX_BYTES),
project_doc_fallback_filenames: cfg
    .project_doc_fallback_filenames
    .unwrap_or_default()
    .into_iter()
    .filter_map(|name| {
        let trimmed = name.trim();
```

- **调用者**：Config Builder。
- **输入**：用户配置中的字节上限和后备文件名。
- **状态变化**：填入默认上限，去掉无效名称。
- **返回**：项目文档发现器使用的确定参数。
- **下一站**：发现器读取目录链中的指令文件，Turn 将新增内容写入上下文。

文件存在但超限、名字未在候选表、位于工作目录链之外或读取失败，都可能导致它不进入模型输入。检查 Prompt 时不能只截图文件树。

## Context Fragment 是带契约的输入片段

Codex 中某些上下文不是普通聊天消息，而是实现 `ContextualUserFragment` 的片段。实现者要声明角色、内容种类、是否必须独占一条消息、边界标记和正文。

### 第 3 站：片段自己声明怎样渲染

源码：[查看 `ContextualUserFragment`](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/context-fragments/src/fragment.rs#L55-L107)

```rust
pub trait ContextualUserFragment {
    fn role(&self) -> &'static str;
    fn content_kind(&self) -> ContentItemKind;
    fn requires_separate_message(&self) -> bool { false }
    fn markers(&self) -> (&'static str, &'static str);
    fn body(&self) -> String;
}
```

- **调用者**：把扩展上下文插入模型历史的构造器。
- **输入**：一个具体 Fragment 实现。
- **状态变化**：按角色、消息边界和 Marker 投影为模型可读内容。
- **返回**：一个或多个 Response Input Item。
- **下一站**：Context Manager 与普通历史一起做正规化。

Marker 不是装饰。若不同片段直接拼接而没有稳定边界，模型难以区分「项目规则」「环境信息」和「用户任务」，Prompt 缓存也更容易因无关文本顺序变化而失效。

## 历史不能原样塞进下一次请求

Session 记录可能包含当前模型不支持的模态、内部事件或需要配对的工具项。Context Manager 在请求前正规化历史，删除不适合的项并修正结构。

### 第 4 站：模型历史是持久记录的投影

源码：[查看历史正规化入口](https://github.com/openai/codex/blob/c9b19deb09c1841ce7acc33ddb96276030936a29/codex-rs/core/src/context_manager/history.rs#L203-L220)

```rust
pub(crate) fn history_for_prompt(
    &self,
    input_modalities: &[InputModality],
) -> Vec<ResponseItem> {
    let mut input = self.contents.clone();
    self.normalize_history(&mut input, input_modalities);
    input
}
```

- **调用者**：一次模型采样前的 Turn Loop。
- **输入**：Session Context 中的记录与当前模型支持的输入模态。
- **状态变化**：只修改本次投影副本，不把裁剪结果冒充原始 Rollout。
- **返回**：可发送给模型的有序 Response Items。
- **下一站**：模型客户端把它与 Tools、Model 和请求选项一起发送。

## 用一个失败测试任务串起来

用户说「修复解析器测试」，实际请求大致经历：

1. 启动参数和配置文件决定模型、审批策略与 Sandbox 策略。
2. 根 `AGENTS.md` 告诉 Agent 运行哪些检查；进入 `parser/` 后，子目录规则作为新增 Context 进入。
3. 过去消息经正规化，不能发送的内部项被过滤。
4. 当前用户输入与可见 Tool Schemas 加到请求尾部。
5. 模型返回 Tool Call，进入后续工具循环。

如果模型违反子目录规则，应核对切换目录之后那次请求体，而不是只看线程启动时打印的 Config。

下一篇：[Thread、Task 与 Turn](02-thread-task-turn.md)。
