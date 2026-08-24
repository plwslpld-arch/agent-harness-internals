import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contentContractDisposition,
  contentContractFailures,
} from '../check-content-contract.mjs';

const paragraph = '这一段用于解释机制、适用条件、数据流和证据边界，读者可以据此复核结论，而不是只看到没有上下文的术语列表。';
const deepProse = Array.from({ length: 26 }, (_, index) => `${paragraph}第 ${index + 1} 段还会说明该步骤与前后状态之间的关系，以及出现偏差时应当观察什么。`).join('\n\n');

function harnessContent() {
  return `# Codex 工具系统

## 读者会得到什么

读完后可以解释一次工具调用如何进入策略判断、执行环境和结果回传。

## 真实输入与输出

### 输入

\`\`\`json
{"command":"git status"}
\`\`\`

### 输出

\`\`\`json
{"exitCode":0,"stdout":"clean"}
\`\`\`

## 调用链

1. 请求先转换为工具调用。
2. 策略层检查命令和权限。
3. 执行层运行命令并回传结构化结果。

## 源码证据

\`\`\`rust
fn decide(command: &str) -> bool { !command.is_empty() }
\`\`\`

${deepProse}

## 失败与限制

这里只证明锁定版本和指定表面，不能外推所有平台。

## 验证方法

使用固定输入运行最小实验，并把 Trace 与源码路径逐项对照。

## 自检

### 问题 1

工具调用先进入哪里？

**答案：** 先进入策略判断。

### 问题 2

为什么要记录真实输出？

**答案：** 为了区分实现事实与推断。

### 问题 3

结论能否外推全部平台？

**答案：** 不能，必须保留平台限定。
`;
}

function learningHarnessContent() {
  const learningSections = `
## 核心概念

先把容易混淆的对象拆开。概念定义不仅说明名词是什么，还要解释它在调用链里的位置、由谁拥有，以及为什么不能与相邻层混为一谈。

| 概念 | 含义 | 为什么重要 |
| --- | --- | --- |
| 工具请求 | 模型提出的结构化行动意图 | 它还不是已经发生的副作用 |
| 策略决定 | Harness 对请求作出的允许、拒绝或询问 | 它回答是否应该继续，不回答系统是否有能力执行 |
| 执行环境 | 真正运行命令或访问资源的位置 | 它决定实际权限、网络和文件边界 |
| 结果回传 | 工具输出转换后的模型观察 | 它会改变下一轮上下文和终止判断 |

读者需要始终沿着“意图、决定、执行、观察”四个对象追踪数据。只保存最终退出码，会丢失请求是否被改写、策略为何批准以及副作用发生在哪里。

这些概念共同构成心智模型：模型只能提出请求，Harness 负责控制流程，环境承担副作用，评测则在运行结束后解释产物。四者不能互相代替。

“工具请求”尤其不能被理解为普通函数调用。普通函数调用通常意味着调用者已经拥有执行权，而模型产生的工具请求只是一个待审查的候选动作。请求里至少要保留稳定的调用标识、工具名称、原始参数和产生它的轮次；如果 Harness 在审批后改写了工作目录、超时时间或参数，还要同时保存原始值与最终值，才能解释实际行为为何不同于模型文本。

“策略决定”也不等于操作系统权限。策略层可以说某条命令符合产品规则，但执行进程仍可能因为文件权限、沙箱、网络隔离或资源限额而失败；反过来，系统有能力执行也不代表产品应该批准。把这两个层面混成一个 \`allowed\` 字段，会让拒绝、执行失败和环境故障在日志里看起来完全一样。

“结果回传”不是把标准输出原封不动地拼回提示词。Harness 还要处理截断、二进制内容、敏感字段、超时、退出码以及可供界面展示的摘要，并把这些派生内容关联到原请求。只有这样，模型观察、用户界面和离线评测才能围绕同一事实对象工作，而不必各自猜测一次工具调用发生了什么。

## 为什么这样设计

第一，模型输出具有不确定性，不能直接等同于可信命令。把请求和执行分开，才能在中间插入参数校验、权限判断、审计和用户确认。

第二，策略与隔离解决不同问题。策略可以表达组织意图，隔离则在策略失误时限制损失半径；两者分层后才能分别测试，也能看清是哪一层阻止了调用。

第三，结果必须回到统一事件流。否则 CLI、日志、会话恢复和独立评测会各自解释一份状态，失败时无法重建真实顺序。

这种分层首先服务于最小权限原则。模型可见的工具集合可以很大，但单次请求仍需要按会话模式、仓库边界、参数内容和用户意图重新判断。把所有限制都塞进系统提示词，既无法保证模型遵守，也无法在副作用发生前给出强制控制；因此提示词只能提供行为引导，不能承担最终授权。

分层还让失败具有可诊断性。解析失败说明模型输出不符合协议，策略拒绝说明请求违反规则，确认取消说明用户没有授权，执行失败说明环境无法完成动作，结果转换失败则属于 Harness 自身问题。每一种失败都应产生不同的事件类型和可恢复建议，而不是都折叠成一句“工具调用失败”。

最后，它为独立评测留下了稳定接缝。评测器不应通过终端文字猜测某个危险请求是否真正运行，而应读取请求、决定和执行记录。这样既能评价任务结果，也能检查过程约束；即使以后更换模型、界面或执行容器，评测输入仍能保持兼容。

## 实现思路

实现时先定义稳定的数据结构，再把策略判断和副作用执行放进不同组件。每一步都接收显式输入并产出可记录的决定，避免用共享布尔变量隐藏中间状态。

1. 把模型输出解析为带调用 ID、工具名和参数的请求对象。
2. 依次执行参数验证、策略匹配与必要的交互确认，并记录每层理由。
3. 只把最终批准且参数冻结的请求交给执行器。
4. 将退出状态、标准输出、错误和副作用摘要转换为统一工具结果。

\`\`\`text
请求 = 解析(模型输出)
决定 = 策略链.评估(请求)
如果 决定.允许:
    结果 = 执行器.运行(决定.最终参数)
否则:
    结果 = 拒绝结果(决定.理由)
事件流.追加(请求, 决定, 结果)
\`\`\`

实现中的关键不是这段伪代码有多少分支，而是每个对象都能被序列化、关联和重放。这样才能为恢复、诊断和评测保留同一条事实链。

数据结构应先于控制流落地。请求对象需要区分模型提供的原始参数和规范化参数，决定对象要包含匹配到的规则、决定来源、是否需要人工确认及最终冻结参数，结果对象则要明确“未执行”“执行成功”“执行失败”和“结果不可用”四种状态。若只用可空字段表达这些状态，消费者很容易把空输出误判成没有执行。

策略链适合实现为有顺序的纯判断器：先验证工具是否存在，再检查参数模式和资源范围，然后合并会话模式与用户规则，最后才进入交互确认。每个判断器只返回决定与理由，不直接执行工具。合并器必须定义清楚拒绝、询问和允许的优先级，并在多个规则命中时保留全部证据，而不只保存最后一个布尔值。

执行器接收的必须是审批后冻结的不可变请求。执行前生成开始事件，执行中收集资源限制和取消信号，执行后无论成功、失败还是超时都生成结束事件。结果转换器再把原始输出变成适合模型、界面和审计的多个投影；投影可以截断或脱敏，但原始结果的保存策略和哈希关系必须明确。

恢复与幂等同样要在第一版考虑。会话恢复时，已经生成结束事件的调用不能再次执行；只有开始事件而没有结束事件的调用应标记为状态未知，由宿主决定查询、补偿或要求人工处理。调用 ID、事件序号和持久化提交点共同避免一次恢复把有副作用的动作重复执行。

## 贯穿案例

设定一个具体场景：用户要求查看仓库状态，模型先请求执行只读命令。随后模型误把清理命令作为下一步，策略层必须在副作用发生前拒绝，并把原因作为观察返回。

1. 第一轮生成只读请求，策略批准并在受控工作目录执行。
2. 工具结果返回当前分支和变更摘要，模型据此决定下一步。
3. 第二轮生成危险请求，策略匹配拒绝规则，不进入执行器。
4. 拒绝结果进入同一事件流，模型改用无副作用的检查方案。

\`\`\`json
{"callId":"c1","tool":"shell","input":{"command":"git status --short"}}
\`\`\`

\`\`\`json
{"callId":"c2","decision":"deny","reason":"命中破坏性命令规则","executed":false}
\`\`\`

这个案例把“模型提出了什么”“Harness 为什么阻止”“环境是否实际执行”分开。学习者可以沿调用 ID 检查每次状态变化，而不是只看到最后一句成功或失败。

第一步的只读请求经过参数规范化后，Harness 会补上受控工作目录和超时限制，但不会改变命令本身。审批记录应同时说明命中了“仓库内只读检查”规则，并把最终参数写入决定对象。执行成功后，模型看到的是经过长度限制的状态摘要，界面则可以展示完整输出入口；两者仍引用同一个调用 ID。

第二个危险请求即使在操作系统层面可以运行，也会被产品策略拒绝。拒绝结果必须明确 \`executed: false\`，并携带命中的规则与可替代动作，例如先列出候选文件。若日志只有非零退出码，学习者就无法判断命令是被 Harness 阻止，还是已经运行并在中途失败，这会直接破坏安全审计。

模型收到拒绝观察后提出新的只读检查，形成第四个可核对状态。此时成功标准不是“最终命令返回零”这么简单，而是危险动作从未进入执行器、替代动作确实产生了可用观察、所有事件按序写入会话记录。离线评测可以据此同时判断任务进展和过程合规性。

为了验证实现，学习者可以故意制造三类变化：把只读命令换成越界路径，确认策略拒绝；让执行器模拟超时，确认记录为执行失败而非策略拒绝；在开始事件后模拟进程崩溃，确认恢复流程不会静默重跑。三次实验分别验证资源边界、状态分类和幂等恢复，而不是只重复一次正常路径。

### 从案例回到源码

阅读真实实现时，应先寻找请求对象的定义和工具注册入口，而不是从界面按钮开始猜。接着沿调用 ID 找到策略判断、执行器和结果事件，记录每次字段形状变化。若项目没有统一事件类型，就分别标出日志、会话消息和执行状态的连接点，并说明这种连接是直接源码事实还是读者根据调用关系得到的推断。

第二轮阅读专门追踪错误路径：未知工具在哪里被拒绝，参数错误由谁格式化，用户取消是否进入执行器，超时后是否保留部分输出，恢复时怎样识别未完成调用。正常路径只能证明示例可以运行，错误路径才揭示 Harness 的责任边界。每个结论都要回到可定位的符号或正式文档，而不是只引用文件名。

第三轮阅读检查宿主与扩展点。工具实现、权限策略、隔离环境、界面提示和评测导出可能属于不同包，也可能由同一循环串接。文章必须明确默认宿主负责什么、插件能改变什么、哪些行为需要外部部署配置。这样读者在迁移设计时不会误以为复制一个工具函数就复制了完整安全模型。

### 判断是否真正学会

学习者首先应能不看原文画出一次调用的状态图，并解释“允许但执行失败”“拒绝且从未执行”“执行成功但结果转换失败”三条路径为何不同。若只能背出模块名称，却无法指出状态在何处改变，说明文章仍停留在名词罗列。

其次，应能为一个新工具补齐最小接口：定义输入模式、注册可见性、接入策略链、选择执行环境、产生统一结果并添加失败测试。实现不要求复刻某个项目的内部代码，但必须保持对象边界和证据边界，并清楚标出哪些是教学蓝图、哪些是目标项目已经验证的事实。

最后，应能设计一组不会被重试掩盖的验证。正常调用、策略拒绝、环境失败和恢复中断要作为独立试验记录，分别保存输入、决定、输出和可观察副作用。评测结论只能覆盖这些试验实际证明的范围，不能因为一条演示路径成功就宣称整个 Harness 已经安全或适合生产部署。

文章本身也需要通过反向检查：删除产品名称后，概念和方法是否仍然成立；换回目标项目名称后，每个关键结论是否又能落到该项目的真实符号、配置或文档。前一项防止正文退化成文件清单，后一项防止通用架构想象冒充源码事实。二者缺一，读者要么学不到可迁移的方法，要么会对具体产品形成错误认识。

课程完成标准因此包含三层证据：读者能解释状态和责任边界，能按接口蓝图实现一个最小原型，还能用失败注入证明原型没有把拒绝、失败与未知状态混为一谈。仓库只能声明这些材料和试验已经过核对；它不能替读者声明生产经验，也不能把教学原型的通过结果扩大为目标产品的安全认证。

当实现存在多个前端或运行模式时，还要完整重复上述检查，确认它们共享的是同一协议还是仅仅长得相似。若命令行、编辑器和无头模式拥有不同的确认通道，文章必须分别说明默认行为与缺失能力，不能用一个界面的观察覆盖全部宿主。只有把差异写进状态和测试，读者才能知道哪些结论可迁移，哪些结论只在特定入口成立。
`;
  return harnessContent().replace('## 真实输入与输出', `${learningSections}\n## 真实输入与输出`);
}

const foundationDeepProse = Array.from({ length: 34 }, (_, index) =>
  `${paragraph}第 ${index + 1} 段会继续区分直接事实、项目示例和跨实现推断，避免把一个实现的命名扩大成共同标准。`).join('\n\n');

function foundationContent() {
  return `# Agent Harness 的职责与边界

## 读者会得到什么

读完后可以区分模型、Harness、环境和评测的责任边界。

## 核心概念

![四层职责边界图](../../assets/diagrams/foundations/01-boundaries.svg)

Claim: foundation.boundaries.four-layers

${foundationDeepProse}

## 最小例子

同一个输入只改变工具权限，用来观察 Harness 层带来的差异。

## 常见误区

不能把一次结果变化全部归因于模型。

## 验证方法

固定另外三层，只改变一个变量并记录运行产物。

## 自检

### 问题 1

为什么要分层？

**答案：** 为了避免错误归因。

### 问题 2

环境与 Harness 是否相同？

**答案：** 不同，环境提供外部状态与资源。

### 问题 3

评测是否负责执行工具？

**答案：** 通常不负责，评测固定任务并解释产物。
`;
}

function article(content = learningHarnessContent(), status = 'reviewed') {
  return {
    relativePath: 'docs/harnesses/codex/03-tools.md',
    content,
    metadata: { status },
  };
}

test('结构完整且具有解释深度的 Harness 文章通过', () => {
  assert.deepEqual(contentContractFailures(article()), []);
});

test('研究摘要不能冒充可学习的 Harness 课程', () => {
  const failures = contentContractFailures(article(harnessContent())).join('\n');

  for (const required of ['核心概念', '为什么这样设计', '实现思路', '贯穿案例']) {
    assert.match(failures, new RegExp(required, 'u'));
  }
});

test('缺少真实数据、调用链、失败条件、验证或完整答案时分别失败', () => {
  assert.match(contentContractFailures(article(harnessContent().replace('## 真实输入与输出', '## 示例'))).join('\n'), /真实输入与输出/u);
  assert.match(contentContractFailures(article(harnessContent().replace('3. 执行层运行命令并回传结构化结果。', '执行层随后运行。'))).join('\n'), /至少 3 步/u);
  assert.match(contentContractFailures(article(harnessContent().replace('## 失败与限制', '## 备注'))).join('\n'), /失败与限制/u);
  assert.match(contentContractFailures(article(harnessContent().replace('## 验证方法', '## 后续'))).join('\n'), /验证方法/u);
  assert.match(contentContractFailures(article(harnessContent().replace('**答案：** 不能，必须保留平台限定。', '尚未回答。'))).join('\n'), /自检/u);
});

test('长文缺少调用链仍失败，结构齐全但解释正文太短也失败', () => {
  const noChain = harnessContent().replace(/1\. 请求先转换[\s\S]*?3\. 执行层运行命令并回传结构化结果。/u, deepProse);
  assert.match(contentContractFailures(article(noChain)).join('\n'), /至少 3 步/u);

  const tooShort = harnessContent().replace(deepProse, '只有一句简短说明。');
  assert.match(contentContractFailures(article(tooShort)).join('\n'), /解释性正文不足/u);
});

test('大段源码不能冒充解释性正文', () => {
  const sourceDump = `\`\`\`text\n${paragraph.repeat(80)}\n\`\`\``;
  const content = harnessContent().replace(deepProse, sourceDump);

  assert.match(contentContractFailures(article(content)).join('\n'), /解释性正文不足/u);
});

test('draft 报告缺失项但不作为阻断错误', () => {
  const disposition = contentContractDisposition(article('# 草稿\n', 'draft'));

  assert.deepEqual(disposition.errors, []);
  assert.ok(disposition.warnings.length > 0);
});

test('缺失或非法状态不能绕过内容门禁', () => {
  const disposition = contentContractDisposition(article('# 空壳\n', 'complete'));

  assert.ok(disposition.errors.length > 0);
  assert.deepEqual(disposition.warnings, []);
});

test('基础、比较、角色和实验文章使用各自结构', () => {
  const cases = [
    ['docs/00-start-here.md', 'start', '概念地图'],
    ['docs/foundations/01-one-turn.md', 'foundation', '核心概念'],
    ['docs/comparisons/01-agent-loop.md', 'comparison', '控制变量'],
    ['docs/roles/researcher.md', 'role', '决策问题'],
    ['docs/labs/01-trace.md', 'lab', '实验目标'],
    ['docs/samples/mini-swe-agent.md', 'sample', '独特机制'],
  ];
  for (const [relativePath, kind, expected] of cases) {
    const failures = contentContractFailures({ relativePath, content: '# 空壳\n', metadata: { status: 'reviewed' } });
    assert.match(failures.join('\n'), new RegExp(expected, 'u'), `${kind} 应检查 ${expected}`);
  }
});

test('扩展样本必须解释独特机制并绑定中文图与两条 Claim', () => {
  const content = `# mini-swe-agent 独特机制

## 样本定位

这是用于解释最小循环边界的扩展样本，不升级为一级主线。

## 独特机制

${deepProse}

![最小循环中文机制图](../../assets/diagrams/samples/mini-swe-agent.svg)

Claim: mini-swe-agent.loop.observation-closes-step

Claim: mini-swe-agent.environment.boundary-is-explicit

## 源码入口

入口从锁定版本的真实运行函数和环境接口开始，不从目录名推断行为。

## 运行链

1. 读取固定任务与环境。
2. 请求下一步行动并执行。
3. 把观察结果写回轨迹并判断终止。

## 与一级主线的关系

样本只补充最小实现如何暴露边界，不替代六条主线的完整课程。

## 失败与限制

最小实现不等于默认沙箱、生产恢复或独立发布评测。

## 验证方法

以固定输入核对源码入口、轨迹、执行结果和终止条件。

## 自检

### 问题 1

样本是否为一级主线？

**答案：** 不是，只补充独特机制。

### 问题 2

目录存在能否证明能力默认启用？

**答案：** 不能，必须沿真实调用链核对。

### 问题 3

上游测试是否等于生产证明？

**答案：** 不等于，部署环境需要另行验证。
`;
  const article = { relativePath: 'docs/samples/mini-swe-agent.md', content, metadata: { status: 'reviewed' } };
  assert.deepEqual(contentContractFailures(article), []);
  assert.match(contentContractFailures({ ...article, content: content.replace('![最小循环中文机制图](../../assets/diagrams/samples/mini-swe-agent.svg)', '') }).join('\n'), /中文 SVG/u);
  assert.match(contentContractFailures({ ...article, content: content.replace('Claim: mini-swe-agent.environment.boundary-is-explicit', '') }).join('\n'), /两条正式 Claim/u);
});

test('共同基础必须达到深度并引用正式中文图与 Claim', () => {
  const article = {
    relativePath: 'docs/foundations/01-boundaries.md',
    content: foundationContent(),
    metadata: { status: 'reviewed' },
  };
  assert.deepEqual(contentContractFailures(article), []);
  assert.match(contentContractFailures({
    ...article,
    content: foundationContent().replace('![四层职责边界图](../../assets/diagrams/foundations/01-boundaries.svg)', ''),
  }).join('\n'), /正式中文 SVG/u);
  assert.match(contentContractFailures({
    ...article,
    content: foundationContent().replace('Claim: foundation.boundaries.four-layers', ''),
  }).join('\n'), /Claim/u);
  assert.match(contentContractFailures({
    ...article,
    content: foundationContent().replace(foundationDeepProse, paragraph.repeat(8)),
  }).join('\n'), /至少 2600/u);
});

test('一级主线入口必须同时具备两张核心图、课程状态表与 Claim', () => {
  const entryAdditions = `
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | reviewed |

![系统架构图](../../../assets/diagrams/deepseek-harness/system-architecture.svg)

![端到端任务流程图](../../../assets/diagrams/deepseek-harness/end-to-end-task.svg)

Claim: deepseek-harness.architecture.layered-runtime
`;
  const entry = {
    relativePath: 'docs/harnesses/deepseek-harness/README.md',
    content: `${learningHarnessContent()}${entryAdditions}`,
    metadata: { status: 'reviewed' },
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('![系统架构图](../../../assets/diagrams/deepseek-harness/system-architecture.svg)', ''),
  }).join('\n'), /系统架构图/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('![端到端任务流程图](../../../assets/diagrams/deepseek-harness/end-to-end-task.svg)', ''),
  }).join('\n'), /端到端任务流程图/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('## 课程状态与顺序', '## 课程'),
  }).join('\n'), /课程状态与顺序/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claim: deepseek-harness.architecture.layered-runtime', ''),
  }).join('\n'), /Claim/u);
});

test('Gemini CLI 一级入口沿用同一核心图与 Claim 发布契约', () => {
  const entry = {
    relativePath: 'docs/harnesses/gemini-cli/README.md',
    metadata: { status: 'reviewed' },
    content: `${learningHarnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![Gemini CLI 中文系统架构图](../../../assets/diagrams/gemini-cli/system-architecture.svg)

![Gemini CLI 中文端到端任务流程图](../../../assets/diagrams/gemini-cli/end-to-end-task.svg)

Claim: gemini-cli.architecture.session-turn-scheduler
`,
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('gemini-cli/end-to-end-task.svg', 'gemini-cli/task.svg'),
  }).join('\n'), /端到端任务流程图/u);
});

test('Claude 一级入口必须声明闭源产品与双 SDK 的不对称证据边界', () => {
  const entry = {
    relativePath: 'docs/harnesses/claude/README.md',
    metadata: { status: 'reviewed' },
    content: `${learningHarnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![Claude 中文系统架构图](../../../assets/diagrams/claude/system-architecture.svg)

![Claude 中文端到端任务流程图](../../../assets/diagrams/claude/end-to-end-task.svg)

Claude Code 是闭源产品，本课程只引用官方公开契约，不从 SDK 反推内部实现。Python Agent SDK 提供可核对的主体源码与测试；TypeScript Agent SDK 的锁定仓库没有 SDK 主体源码，只能核对公开 API、README、CHANGELOG 与 Session Store 示例。

Claim: claude.architecture.product-sdk-boundaries

Claim: claude.task.transport-control-loop
`,
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claude Code 是闭源产品，本课程只引用官方公开契约，不从 SDK 反推内部实现。', ''),
  }).join('\n'), /闭源产品/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Python Agent SDK 提供可核对的主体源码与测试；', ''),
  }).join('\n'), /Python Agent SDK/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('TypeScript Agent SDK 的锁定仓库没有 SDK 主体源码，只能核对公开 API、README、CHANGELOG 与 Session Store 示例。', ''),
  }).join('\n'), /TypeScript Agent SDK/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claim: claude.task.transport-control-loop', ''),
  }).join('\n'), /至少两个正式 Claim/u);
});

test('pi 一级入口必须声明模块分层、设计边界与默认宿主权限', () => {
  const entry = {
    relativePath: 'docs/harnesses/pi/README.md',
    metadata: { status: 'reviewed' },
    content: `${learningHarnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![pi 中文系统架构图](../../../assets/diagrams/pi/system-architecture.svg)

![pi 中文端到端任务流程图](../../../assets/diagrams/pi/end-to-end-task.svg)

pi 沿着 ai、agent 与 coding-agent 三层组合任务，并由 Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 提供横切表面。

现行运行时源码、未来设计文档、扩展示例与外部项目必须分开核对；设计目标和示例存在不等于默认运行能力。

pi 默认继承启动它的宿主进程权限，不内建文件系统、进程、网络或凭据隔离；需要使用外部容器或沙箱建立边界。

Claim: pi.architecture.layers-are-composed

Claim: pi.task.coding-agent-composes-core
`,
  };

  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('pi 沿着 ai、agent 与 coding-agent 三层组合任务，并由 Session、Protocol、Client/Server、TUI、Telemetry 与 Evals 提供横切表面。', ''),
  }).join('\n'), /ai、agent 与 coding-agent/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('现行运行时源码、未来设计文档、扩展示例与外部项目必须分开核对；设计目标和示例存在不等于默认运行能力。', ''),
  }).join('\n'), /设计文档/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('pi 默认继承启动它的宿主进程权限，不内建文件系统、进程、网络或凭据隔离；需要使用外部容器或沙箱建立边界。', ''),
  }).join('\n'), /默认宿主权限/u);
  assert.match(contentContractFailures({
    ...entry,
    content: entry.content.replace('Claim: pi.task.coding-agent-composes-core', ''),
  }).join('\n'), /至少两个正式 Claim/u);
});

test('OpenCode 一级入口必须声明服务化主链、权限边界与独立评测出口', () => {
  const entry = {
    relativePath: 'docs/harnesses/opencode/README.md',
    metadata: { status: 'reviewed' },
    content: `${learningHarnessContent()}
## 课程状态与顺序

| 序号 | 课程 | 状态 |
| --- | --- | --- |
| 00 | 总览 | 已复核 |

![OpenCode 中文系统架构图](../../../assets/diagrams/opencode/system-architecture.svg)

![OpenCode 中文端到端任务流程图](../../../assets/diagrams/opencode/end-to-end-task.svg)

OpenCode 的服务化任务主链从 Project/Config 进入 Provider，再由 Session Prompt 和 Processor 驱动模型、工具与消息状态。

权限规则和用户询问不等于操作系统沙箱；真实副作用仍发生在宿主或另行部署的隔离边界内。

测试、Telemetry 与 Share 能留下运行证据，但不能替代独立评测、Scorer 和发布门禁。

Claim: opencode.architecture.service-core-multiple-surfaces

Claim: opencode.task.session-processor-closes-loop
`,
  };
  assert.deepEqual(contentContractFailures(entry), []);
  assert.match(contentContractFailures({...entry, content: entry.content.replace('OpenCode 的服务化任务主链从 Project/Config 进入 Provider，再由 Session Prompt 和 Processor 驱动模型、工具与消息状态。', '')}).join('\n'), /Project\/Config/u);
  assert.match(contentContractFailures({...entry, content: entry.content.replace('权限规则和用户询问不等于操作系统沙箱；真实副作用仍发生在宿主或另行部署的隔离边界内。', '')}).join('\n'), /操作系统沙箱/u);
  assert.match(contentContractFailures({...entry, content: entry.content.replace('测试、Telemetry 与 Share 能留下运行证据，但不能替代独立评测、Scorer 和发布门禁。', '')}).join('\n'), /独立评测/u);
  assert.match(contentContractFailures({...entry, content: entry.content.replace('Claim: opencode.task.session-processor-closes-loop', '')}).join('\n'), /至少两个正式 Claim/u);
});
