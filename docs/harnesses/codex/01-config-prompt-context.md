# 配置、项目指令与模型实际看到的输入

[返回 Codex 课程地图](README.md)

第一次读源码，可以先做三件事：观察 Agent 怎样处理一个 Task，找到核心入口，再跟完一条调用链。这一篇顺着输入往下看，目标是弄清模型到底收到了什么。先别急着看请求。磁盘和命令行先给出候选配置，Thread 启动 Session 时，再把它们合成当前有效的 Config。到了每一个 Turn（回合），Codex 才把指令、历史、Tool 及其 Tool Schema 和用户输入装进模型请求。很多人会把「配置文件里的内容」直接当成发给模型的 Prompt，问题就出在这里。

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

假设仓库根目录有 `AGENTS.md`，子目录也有一份。用户起初在根目录工作，后来切进子目录，磁盘上的文件虽然没变，模型能看到的项目指令却多了一份。再比如，Thread 已经启动，此时修改默认 Model 只会影响后续请求，未必会改写 Rollout（运行轨迹）里已经保存的 Turn Context。旧记录还在。

因此，排查「模型为什么没遵守某条指令」时，你要按实际动作来查：Codex 有没有找到文件，合并字段时该值有没有胜出，这一轮发出的请求里到底有没有它。

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

Rust 的 `Option::or` 会取左边第一个 `Some`。所以「命令行优先」只适用于按这种办法合并的字段，要确认某个具体选项以谁为准，仍得回到它自己的解析代码。别凭印象猜。

## AGENTS.md 是项目上下文，不是无限长系统提示

Codex 会顺着工作目录逐层寻找项目指令，同时检查最大字节数和后备文件名。你进入更深的目录后，它会把新找到的指令放进后续 Turn 的 Context。历史里的旧消息已经写定，不会因为当前目录变了就跟着重写。

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

文件明明存在，却仍可能进不了模型输入。常见原因有四种：文件太大，文件名不在候选表里，文件不在工作目录这条链上，或者 Codex 读取失败。查 Prompt 时，只看文件树不够。这一步很关键。

## Context Fragment 是带契约的输入片段

Codex 不会把所有 Context 都当成普通聊天消息，有些内容会实现 `ContextualUserFragment`，由实现代码说清角色、内容种类、是否单独占一条 Message，还要给出边界标记和正文。

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

Marker 绝不是装饰。不同片段如果直接拼在一起，又没有稳定边界，模型就很难分清哪段是「项目规则」、哪段是「环境信息」、哪段才是「用户任务」。无关文本只要换个顺序，Prompt Cache 也更容易失效。边界必须稳定。

## 历史不能原样塞进下一次请求

Session 保存的记录里，可能混有当前模型不支持的模态、内部 Event，也可能有必须成对出现的工具条目。发请求前，Context Manager（管理器）会先整理这段历史，去掉不能发送的内容，并把结构修正好。

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

用户说「修复解析器测试」以后，这句话不会原封不动地直达模型。它大致要经过下面这些环节，Sandbox 等运行限制也会跟着有效配置进入后续路径：

1. 启动参数和配置文件决定模型、审批策略与 Sandbox 策略。
2. 根 `AGENTS.md` 告诉 Agent 运行哪些检查；进入 `parser/` 后，子目录规则作为新增 Context 进入。
3. 过去消息经正规化，不能发送的内部项被过滤。
4. 当前用户输入与可见 Tool Schemas 加到请求尾部。
5. 模型返回 Tool Call，进入后续工具循环。

如果模型违反了子目录规则，你该检查切换目录以后发出的那次请求体。Thread 启动时打印的 Config，只能说明启动那一刻发生了什么。

走到这里，Codex 已经把配置和 Context 整理成一次模型请求，但只看「一个请求」还画不出完整的运行边界。下一篇会分清 Thread、Session、Task 和 Turn，你也就能判断模型返回的 Tool Call（工具调用）究竟落在哪一层。

下一篇：[Thread、Task 与 Turn](02-thread-task-turn.md)。
