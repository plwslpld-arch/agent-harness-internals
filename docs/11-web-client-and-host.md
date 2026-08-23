---
title: Web 客户端与 host：39 个 UI 包如何把事件日志变成界面
sources: [{"repo":"deepseek-harness","path":"packages/client","commit":"47f943859bef60e4160492346772ded9b24f765a"}]
last_verified: 2026-08-16
status: stale
---

# Web 客户端与 host：39 个 UI 包如何把事件日志变成界面

*写给想改 dsh 界面、但不知道该动哪个目录的人。读完你能回答：一条后端事件怎么走到屏幕上、一个包凭什么能往别人的界面里插东西、为什么热重载默认是空转的。*

你改了一个界面组件，重新构建，刷新页面，界面纹丝不动。你会先怀疑缓存，其实是热重载在空转。这个坑坑过人，坑到最后被写进了模型看到的 system prompt 里。
再问一个：这 7 万行界面代码里，有多少会影响模型看到的内容？答案是两句话，多一个字都没有。
两个问题的答案在同一处设计里。

`packages/client`（client＝浏览器里跑的那一半代码）是 dsh 全仓最大的一组代码：39 个包，各包 `src/` 下 501 个 `.ts`/`.tsx` 文件，71,896 行源码（不含 CSS 与 `tests/`）。加上 `packages/host`（host＝跑在 Node 上、给浏览器提供一切能力的那半个进程）的 8 个包和 `packages/api` 的 2 个包，构成 dsh 唯一的交互界面。

这组代码和 harness 的核心机制关系不大：它不决定模型看到什么、不决定 token 怎么花。但它决定了**你在浏览器里看到的每一样东西**，而且它对「一条 session 事件」的处理方式，恰好是理解 dsh 事件溯源设计的一个好切口：后端的 append-only 事件日志，是怎么变成屏幕上一条会滚动的消息的。

---

## 一、先看见：一条 session 事件的九跳

后端追加一条 `assistant/message` 事件之后，到它出现在浏览器里，中间有九跳。每一跳都能指到源码。

**跳 1，host 上有人在监听。** apiproxy 订阅 `session/event`：

```ts
          ctx.on('session/event', (session: Session, event: SessionEvent) => {
```

（`packages/host/apiproxy/src/api-proxy.ts:3475`）然后把它包成一个帧压进队列：

```ts
            queue.push(frame({ type: 'session/event', sessionId: session.id, event, ...view === undefined ? {} : { view } }))
```

（`:3493`）帧的类型定义在 `packages/host/apiproxy/src/api/events.ts:70`：

```ts
  | { type: 'session/event'; sessionId: SessionId; event: SessionEvent; view?: ToolEventView }
```

注意 `event` 字段是**原封不动的 SessionEvent 信封**。浏览器收到的和落盘的是同一个结构。

**跳 1b，投影走另一条支路。** 有些东西（token 用量、todo 列表、goal、plan、权限档位）不适合让浏览器自己从事件流折叠，那样每个客户端都要重算一遍，还容易算错。这些由 host 算好整值再广播：

```ts
      broadcast({ type: 'session/projection', sessionId: session.id, key, value, seq })
```

（`packages/host/apiproxy/src/api-proxy.ts:1285`）投影本身在 `packages/session/session-projection/src/index.ts:181` 订阅同一个事件计算。

**跳 2，传输是 WebSocket 下行，不是 HTTP。** 上行（浏览器调 host 方法）走 HTTP POST，下行（事件推送）走两条 WebSocket：

```ts
export const API_PATH = '/api'
export const MUX_EVENTS_PATH = `${API_PATH}/events.mux`
export const HOST_EVENTS_PATH = `${API_PATH}/events.host`
```

（`packages/client/connection/src/api-path.ts:8`、`:11`、`:14`）承载类是 `WebSocketDownlinks`（`packages/client/connection/src/websocket-downlink.ts:51`），注册在 `packages/client/connection/src/index.ts:193-194`。两条流的分工：`events.mux` 是「按 session 复用的会话流」，`events.host` 是「进程级的 host 事件流」。

**跳 3，浏览器接收。**

```ts
  private async *readWebSocket<F extends MuxFrame | HostFrame>(
```

（`packages/client/connection/src/client/web-api-client.ts:34`）这是一个 async generator，内部 `const socket = new WebSocket(url)`（`:42`），解析后 yield 出帧。外层是 `ConnectionController`（`packages/client/connection/src/client/connection.ts:61`）负责重连与 generation 管理。

**跳 4，runtime 挂 sink。**

```ts
  const loop = connection.start({
    onMuxEnvelope: (envelope) => {
      sessions.handleMuxEnvelope(envelope)
```

（`packages/client/runtime/src/client/index.ts:204-206`）同一段里还有一行处理 host 流的 Remote 事件转发：

```ts
      if (frame.type === 'host/remote-event') ctx.remote.$dispatch(frame.event, frame.args)
```

（`:216`）

**跳 5-6，路由到 Session 对象。** manager 按 sessionId 分发（`packages/client/runtime/src/client/sessions/manager.ts:683`、`:788`），Session 对象吸收：

```ts
  handleMuxEnvelope(rpcId: RpcId, frame: MuxFrame): void {
```

（`packages/client/runtime/src/client/sessions/session.ts:467`）走 `acceptLiveEvent`（`:684`）→ `appendLive`（`:668`）。

**跳 7，变成可订阅状态。** Session 是一个**裸的 observable**，不是 React 状态：

```ts
  subscribe(listener: () => void): () => void {
  getSnapshot(): ConversationSnapshot {
```

（`packages/client/runtime/src/client/sessions/session.ts:447`、`:455`）到这一跳为止，整条链路里没有一行 React。

**跳 8，唯一的 hook 构造器。**

```ts
export function bindSnapshotSelector<T>(w: HostObservable<T>): SnapshotSelectorHook<T> {
```

（`packages/client/web-react/src/bind.ts:18`）内部是 `useSyncExternalStoreWithSelector`（`:22`）。这是整个 client 唯一的 **hook 构造器**——唯一一处把「host / engine 交出来的裸 observable 源」变成带 selector 的 React hook 的地方，README 写得很直白（`packages/client/web-react/README.md:5`）：「hosts and engines traffic in bare observable sources; every hook binds here, cached per source」。

（这句英文的意思是：host 和 engine 对外只给裸的可订阅源，所有 hook 都在这里绑定，每个源缓存一份。翻译成人话就是：数据层不认识 React，React 想用数据只能从这一个门进来，而且同一个源多处订阅只会造出一个 hook。）

（注意别把这句读成「client 里只有一处 `useSyncExternalStore`」：`ui-primitives`、`ui-commands`、`ui-model-selection`、`web/AppRoot.tsx` 等处也直接调 React 的 `useSyncExternalStore`，但它们订阅的是组件自己的局部 store（语法高亮的懒加载计数、popup 的选中态、启动状态机），不是 Session/Workspace 这类业务数据源。业务数据只从 `bindSnapshotSelector` 进来。）

**跳 9，组件渲染。**

```tsx
  const order = useSession(s => s.chat.order)
  const nodeStore = useSession(s => s.chat.nodes)
  const timeline = useSession(s => s.chat.timeline)
```

（`packages/client/ui-conversation/src/client/chat/ChatView.tsx:150-152`）ChatView 注册进 `'conversation.view'` 这个 **slot**——slot 是界面上一个具名的「洞」，由某个包声明出来，别的包往里注册组件（第三节讲机制，`packages/client/ui-conversation/src/client/apply.ts:377`）。`ui-trajectory` 在同一个 slot 里注册第二个 tab（`packages/client/ui-trajectory/src/client/index.ts:43-44`）。

**九跳总结**：`ctx.on('session/event')` → mux 队列 → `/api/events.mux` WebSocket → `readWebSocket` → `ConnectionController` → `SessionRuntime` → `Session.acceptLiveEvent` → `subscribe`/`getSnapshot` → `bindSnapshotSelector` → `useSession` → `ChatView`。

这条链路有一个明确的分层意图：**React 只出现在最后一跳**。数据层（connection、runtime、Session 对象）完全是普通 TypeScript，这也是为什么 `packages/client/runtime` 有 8,989 行却一个 `.tsx` 都没有。

### 同一份事件，两种视图

上面最后一跳落在 ChatView，但同一份事件其实同时喂着两个视图。Session 对象持有的是一个**共享的事件窗口**加上历史分页，注册进来的每个「会话视图目标」各自从它派生自己的表示（`packages/client/runtime/README.md:5`）。

Chat 视图把事件折叠成对话：分组的步骤摘要流、流式尾部隔离、turn 状态（`packages/client/ui-conversation/README.md:5`）。Trajectory 视图把同一批事件摊成一本**账本**：User / Assistant / Tool / 嵌套 Subtool 每条一行，粗分隔线标记 turn 边界，紧凑的行内标记标出 step；选中一行会打开局部检查器，显示 token 用量、耗时，以及「Input」（喂进去的东西）、「Output」（吐出来的东西）、「Timing」（时间分解）三块。账本上方还有一条时间轴「Overview」（总览），把真实的起止时刻从左到右投影出来，Assistant 的跨度里区分了 TTFT（time to first token，从发出请求到第一个 token 落地的等待）与解码两段，拖选一个区间就把账本收窄到该区间内活跃过的所有记录（`packages/client/ui-trajectory/README.md:5`）。

关键的一句在同一段末尾：

> Trajectory-owned Definitions assemble business records, including cancellation-frozen Assistant and Tool records, from the shared Session window, so Trajectory neither reads nor changes the Chat conversation snapshot.

（Trajectory 自己的那套 Definition 从共享的 Session 事件窗口里拼出业务记录，包括被取消后冻结下来的 Assistant 记录和 Tool 记录；所以 Trajectory 既不读也不改 Chat 的会话快照。）

两个视图**互不读取对方的快照**。它们共享的是原始事件窗口，不是彼此的派生状态。这正是事件溯源的直接红利：加一个新视图不需要改任何已有视图，只要注册一套自己的 Event Definition 和一个 `'conversation.view'` tab。`ui-trajectory` 那 7,900 行里没有一个 Service，也没有任何 Context 合并，它纯粹是一个消费者。

代价是长账本的性能得自己扛：虚拟滚动只挂可见行加少量 overscan，向上滚到已加载范围顶端时加载一页更早的，选中/时间轴/折叠/搜索/Request 合计**都只覆盖当前已加载的窗口**。

---

## 二、39 个包的分工

下面这张表按「离界面多远」分组。要看的是两件事：一是**行数集中在哪**（`ui-conversation` / `runtime` / `ui-trajectory` / `ui-primitives` 四个包占了将近一半），二是**哪些包刻意不依赖 React 或 cordis**（`ui-slots`、`ui-primitives`、`schema-form`），这决定了它们能被谁复用。行数为各包 `src/` 下 `.ts`/`.tsx` 的行数，不含 `tests/`。

| 分组 | 包 | 行数 | 职责 |
|---|---|---|---|
| 外壳 | `web` | 642 | shell kernel，两阶段启动 |
| | `web-react` | 1,224 | 唯一的 React 胶水层 |
| | `modules` | 972 | 客户端模块系统（双面） |
| 线缆 | `connection` | 4,693 | HTTP 上行 + 两条 WebSocket 下行 + 信任围栏 |
| 状态 | `runtime` | 8,989 | Session/Workspace 对象、slot 注册表、投影存储 |
| 扩展点 | `ui-slots` | 1,563 | slot 内核（零 React、零 cordis） |
| 基础设施 | `ui-primitives` | 6,727 | 纯 React 原子（零 cordis） |
| | `ui-theme` | 693 | 主题偏好与 token |
| | `locale` | 674 | i18n |
| | `schema-form` | 195 | 设置表单的 schema 层 |
| | `hmr` | 447 | 客户端插件热重载 |
| 会话域 | `ui-conversation` | 11,310 | 骨架、chat 视图、composer、审批面板 |
| | `ui-trajectory` | 7,900 | 轨迹视图 |
| | `ui-tool` | 2,300 | 工具调用呈现 |
| | `ui-attachment` / `ui-deliverables` / `ui-message-feedback` | 514 / 493 / 769 | 附件、产出文件、逐条反馈 |
| 输入 | `ui-input-trigger` / `ui-commands` / `ui-skill` / `ui-subagent` | 1,356 / 1,329 / 434 / 898 | `/` 与 `@` 触发管线及其候选源 |
| 会话控制 | `ui-model-selection` / `ui-agent-preset` / `ui-permission-presets` / `ui-plan` / `ui-goal` / `ui-jobs` / `ui-workflow-run` / `ui-user-questions` | 940 / 2,067 / 611 / 202 / 501 / 324 / 582 / 727 | composer 与会话头上的各个座位 |
| 导航 | `ui-layout` / `ui-sidebar` / `ui-workspace` | 678 / 399 / 2,973 | 三栏框架、侧栏、工作区 |
| 设置 | `ui-settings` / `-general` / `-models` / `-plugins` / `-plugin-inventory` | 482 / 714 / 3,341 / 1,541 / 322 | 设置域 |
| 目录选择 | `ui-directory-picker-native` / `-browse` | 146 / 1,224 | 与 host 的两种 picker 后端配对 |

表里这 39 个包就是 `packages/client/` 的全部内容（有几行合并了同类包，`ls -d packages/client/*/` 数出来正好 39）。另有一个 `ui-cordis` 也是浏览器插件，但它住在 `packages/extensions/ui-cordis`：它是 `tool-cordis` 的浏览器半，属于「agent 修改自身运行时」那一组，见 [09 扩展与 Code Mode](09-extensions-and-code-mode.md)。

39 个包**全部**有 README。绝大多数是**双面包**：`src/index.ts` 是运行在 Node 上的 host 半，`src/client/index.ts` 是浏览器半，由 package.json 里的 `dsh.client` 字段声明。这个设计让「一个功能」始终是一个包，而不是拆成前后端两个包再靠命名约定对齐。

有几个包的 host 半是**故意为空**的。`ui-user-questions` 的 README 解释了为什么（`packages/client/ui-user-questions/README.md:5`）：

> Its host half is empty on purpose — mounting `dsh-tool-ask-user` there put the tool in the registry's GLOBAL layer, which merges into every agent regardless of the preset that composed it, so a two-tool benchmark preset really presented three.

（它的 host 半是故意留空的。以前在这里挂 `dsh-tool-ask-user`，会把这个工具塞进注册表的 GLOBAL 层，而 GLOBAL 层是无差别合并进每一个 agent 的，不管这个 agent 是哪个 preset 组出来的；结果一个说好「只有两个工具」的 benchmark preset，实际给模型看到了三个。）

也就是说：**渲染一个提问是 host 的 UI 能力，拥有那个工具是 agent 的能力**。前者归这个包，后者归 preset。这条边界如果划错，`minimal` preset 那个「只有两个工具」的承诺就不成立了。

---

## 三、slot：插件怎么往界面里插东西

39 个包能拼成一个界面而不互相 import，靠的是 slot。核心在 `ui-slots`，一个**零 React、零 cordis** 的纯类型包。

### 声明即授权

slot 契约表是一个可被声明合并（declaration merging）的空接口：

```ts
export interface SlotMap {}
```

（`packages/client/ui-slots/src/index.ts:24`）每个包在自己的类型文件里往里加条目。四种基数：

```ts
export type SlotKind = 'single' | 'list' | 'keyed' | 'chain'
```

（`:88`）四个值分别是：`single` 单人座（只能有一个占位者）、`list` 排队（多个按 order 排开）、`keyed` 点名（调用方报一个 key，谁的 key 对上谁出场）、`chain` 自荐（下一小节讲）。

三种数据作用域：`'root' | 'session-maybe' | 'session'`（`:90-91`），意思是这个洞里的组件能拿到什么上下文：`root` 是全局的（没有 session），`session` 必须在某个 session 里，`session-maybe` 两种情况都要能活。

注册只有一个 API：

```ts
  register(options: ErasedOptions, component: unknown): () => void {
```

（`:787`）而且**未声明的 slot 直接抛错**：

```ts
      throw new Error(`slot "${options.name}" is not declared (a parent entry's children table must declare it)`)
```

（`:790`）这句报错的意思是：名为 `xxx` 的 slot 没有被声明过，得由某个父条目的 children 表来声明它。

意思是：一个包想在界面某处插东西，得先有另一个包在它的 children 表里**声明**了这个洞。`ui-conversation` 声明了 `conversation.view`、`conversation.composer`、`conversation.input.dock`、`conversation.chat.node` 等等，别的包才能往里注册。这把「谁能改哪块界面」变成了编译期可检查的事。

### chain：让候选者自荐

`chain` 是四种基数里最特别的一种。README 的原文（`packages/client/ui-slots/README.md:16`）：

> Chain-kind slots invert keyed routing — entries self-nominate instead of the dispatch site picking an `entryKey`: each registration carries a pure `ChainSelect` selector (plus optional ascending `priority`, ties in registration order), the first non-null return elects its entry and becomes the component's `matched` prop, and all-null falls to the owner's `renderSlotChain` fallback.

（chain 这种 slot 把 keyed 的路由方向反过来：不是调用方挑一个 `entryKey` 点名，而是各个条目自己举手。每次注册都带一个纯函数选择器 `ChainSelect`，可以再带一个 `priority`，升序，同分按注册顺序。谁第一个返回非空，谁就当选，返回值直接变成组件的 `matched` prop；全部返回 null 就落到洞的主人写的 `renderSlotChain` 兜底。）

翻译成人话就是：keyed 是「主人喊名字」，chain 是「谁觉得该自己上谁就上，主人不用认识候选者」。

选择器的类型是：

```ts
export type ChainSelect<O extends object, M> = (owner: O) => M | null
```

（`packages/client/ui-slots/src/index.ts:257`）

**审批弹窗就是 chain 的用法。** 它不是弹窗，是把 composer 整个换掉：

```ts
  slots.register({ name: 'conversation.composer', select: selectApproval, priority: 1, locale: NS }, ApprovalPanel)
```

（`packages/client/ui-conversation/src/client/apply.ts:371`）当有一个待审批的工具调用时，`selectApproval` 返回非空，`ApprovalPanel` 就占住 composer 的位置（琥珀色条、理由标题、从调用参数拼出的命令行、一次性的拒绝/允许）；没有时它返回 null，普通输入框继续占位。`ui-user-questions`（`packages/client/ui-user-questions/src/client/index.ts:56-57`）和 `ui-subagent`（`packages/client/ui-subagent/src/client/index.ts:121-123`）用完全一样的模式注册各自的条目。

`priority` 是**升序**的，数字小的先跑（`packages/client/ui-slots/src/index.ts:248`、`:862-868`）。审批面板写了 `priority: 1`，提问面板用默认的 0，所以两者同时挂起时提问先被选中，注册处的注释解释了理由（`packages/client/ui-conversation/src/client/apply.ts:367-370`）：提问是模型在等的一次对话，审批只卡住一次工具调用，先答提问不会把审批饿死（提问一结束审批立刻重新当选）。

这带来一个可观察的产品行为：**待审批和待回答不会在消息流里留下一张占位卡片**（`packages/client/ui-conversation/README.md:17` 明说了这一点）。它们只接管输入区，答完就还回去。

---

## 四、hmr：热重载的真实条件

`packages/client/hmr` 让客户端插件在不刷新页面的情况下重新加载。机制是：Node 半用一个定时器 stat 轮询每个 client bundle（`packages/client/hmr/src/index.ts:139` 的 `setInterval`，默认 500ms，`:37`；轮询而非 inotify 是刻意的，模块注释 `:2-4` 写了理由：网络挂载不发文件事件），变化时通过 `/plugins/events` 这条 SSE 通道通知浏览器（`packages/client/hmr/src/events.ts:16`）。浏览器半收到之后换 fiber——fiber 是 cordis 里「一行 entry 的活实例」，见 [10 Cordis、启动、bundle 与 preset](10-cordis-boot-preset.md)：

```ts
    modLoader.invalidate(id)
    await modLoader.prefetch(id)
```

（`packages/client/hmr/src/client/index.ts:115-116`）然后删旧 runtime（`:124`）、移除该插件拥有的样式（`:132`）、`await entry.refresh()`（`:137`）。

**但默认情况下它什么也不做。** README 第一句（`packages/client/hmr/README.md:5`）：

> The web bundle mounts the row unconditionally; without a rebuild watcher (`pnpm run dev:web`) rewriting client bundles, the poll observes no changes and the chain stays idle.

（web bundle 无条件挂这一行，但如果没有一个重建 watcher（`pnpm run dev:web`）在不停重写 client bundle，轮询就看不到任何变化，整条链路一直空转。）

翻译成人话就是：HMR 是常开的，但它只会「发现文件变了」，不会「让文件变」。没人重新构建，它就永远闲着。

这条限制重要到被写进了**模型看到的 system prompt**。`app:web-surface` section 的文本（`packages/bundle/web-app/src/index.ts:96-98`，注册在 `:143-147`，order `-98`）。这里的 surface（产品表面）指用户实际接触 dsh 的那个入口，Web GUI 是其中一个，CLI、SDK 是另外几个：

> The client-plugin HMR receiver is active, but client-plugin changes reload without a refresh only while `pnpm run dev:web` is also running from this same checkout to rebuild their bundles; verify that watcher before promising automatic updates. Every other change — the apps/web shell and plain packages — requires rebuilding the affected Web artifacts and verifying this existing URL after a page refresh.

（客户端插件的 HMR 接收端是开着的，但客户端插件的改动想不刷新页面就生效，前提是同一个 checkout 里还跑着 `pnpm run dev:web` 在重建它们的 bundle；在向用户承诺「自动更新了」之前，先确认那个 watcher 真的在跑。其他任何改动，包括 apps/web 这层外壳和普通的包，都得重新构建受影响的 Web 产物，然后刷新页面、在这个已有的 URL 上验证。）

这段 prompt 是一次事故的产物（上游 `docs/postmortem/0003-web-agent-gui-feedback-loop.md`）：让 agent 改 Web 界面时，它会以为自己改完就生效了，然后向用户宣布「已更新，刷新看看」，而实际上什么都没变。同一段 prompt 里还有两句同样来自事故的话：「Starting another server does not update this GUI」（另起一个 server 不会更新这个 GUI）和「The apps/web Vite entry builds the shell but is not a standalone application because only `dsh web` injects `window.__DSH_BOOT__`」（apps/web 这个 Vite 入口只构建外壳，它不是一个能独立跑的应用，因为只有 `dsh web` 会注入 `window.__DSH_BOOT__`）（`:103-104`）。

HMR 自己的三条已知限制（`packages/client/hmr/README.md:19-21`）：重载是**粗粒度**的（新 fiber、新组件，插件内的 React 状态丢失，但数据层不动）；**失败不回滚**（entry 停在 FAILED，旧 bundle 不会自动恢复）；graph 的 `rev` 不被 rebuilt 帧刷新（无害，因为 bundle 端点是 no-cache）。

---

## 五、apps/web 与 `window.__DSH_BOOT__`

`apps/web` 只有两个 TypeScript 文件。`apps/web/src/main.ts` 一共 10 行，去掉 5 行文件头注释就剩这些：

```ts
import { AppWebEntry } from '@deepseek-ai/dsh-client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
```

这几行做的事：找 `#root` 这个 DOM 节点，找不到就抛错（报错文案 `'web app: missing #root'`，即「缺少 #root」），找到就把它交给 `AppWebEntry` 跑起来。整个入口没有任何组合逻辑。

另一个（`apps/web/src/node-module-stub.ts`，12 行）是 `node:module` 的浏览器替身，`createRequire` 被实现成直接抛错。

**为什么 Vite 入口不是独立应用？** 因为组合不在这里。整个浏览器插件名册由 host 在运行时注入：

```ts
  const script = `<script>window.__DSH_BOOT__ = ${json}</script>`
```

（`packages/client/modules/src/index.ts:170`）注入的内容是一张 boot graph：`{ rev, entries: [{ id, url, rev, inject?, immediately? }] }`。字段的意思是：`rev` 是这张图的版本号，`entries` 是插件名册，每条里 `id` 是插件标识、`url` 是去哪拿它的 bundle、`rev` 是这个 bundle 自己的版本号（HMR 靠它判断变没变）、`inject` 是要注入的样式等附加物、`immediately` 标记这条要在第一阶段就预取。每个 entry 对应 web-app bundle 补丁里的一行 `ui-*`。shell 启动时读它：

```ts
    this.manifest = parseBootManifest((globalThis as DshWindow).__DSH_BOOT__)
```

（`packages/client/web/src/boot.tsx:98`）缺失就抛错（`packages/client/modules/src/client/manifest.ts:110`）。

所以 `vite dev` 单独跑 `apps/web` 得到的是一个**没有任何插件的空壳**。Vite 配置里直接把这件事做成了显式错误：

```ts
const STANDALONE_ERROR = 'apps/web is not a standalone application: bare Vite cannot inject window.__DSH_BOOT__. '
```

（`apps/web/vite.config.ts:7`）这条错误信息说的是：apps/web 不是一个能独立跑的应用，光靠 Vite 注入不了 `window.__DSH_BOOT__`。也就是说，谁想绕开 host 单独起前端，得到的报错会直接告诉他原因，而不是一个白屏。

shell 的启动是两阶段的（`packages/client/web/README.md:5`）：阶段一建模块系统并并行预取 `immediately` 那一档——**执行 bundle 只注册工厂函数，不执行模块体**；阶段二挂 vendored cordis Loader，把模块系统通过它的 `internal` 契约注入，每行 graph 建一个 loader entry，然后**等 Loader 静默且每个 entry fiber 都 ACTIVE，才一次性把整个 UI 切出来**。没有半成品界面。

这里有一个漂亮的复用：浏览器里跑的是**同一个 vendored Cordis Loader**（见 [10 Cordis、启动、bundle 与 preset](10-cordis-boot-preset.md)）。它对「插件代码怎么到达」这件事是可替换的：Node 上是 ESM import，浏览器上是 `packages/client/modules` 提供的惰性 CJS 表。替换点只有一个：`EntryTree.import`（`packages/client/modules/README.md:5`）。

---

## 六、host 与 api：Node 半边

浏览器那一半讲完了，下面是它对面的 Node 半边。看这张表时注意「ctx key」这一列，它就是这个包往 cordis context 上挂的服务名，别的包靠它找到这个能力；空着的表示这个包只消费别人、不提供服务。

| 包 | ctx key | 职责 |
|---|---|---|
| `host/webserver` | `ctx.webServer` | HTTP 路由载体，325 行，不用任何 HTTP 框架，直接 `node:http` |
| `host/apiproxy` | `ctx.apiProxy` | 共享 host API 网关与 wire 契约，8,571 行 |
| `host/frontend-static` | 消费 `ctx.webServer` | SPA dist 服务，占 fallback 座 |
| `host/directory-picker` | `ctx.directoryPicker` | 目录选择 seam（seam＝一个只定契约、由别人填实现的接缝） |
| `host/directory-picker-native` / `-browse` / `-auto` | 注册/挂载 | 三种后端与一个自适应选择器 |
| `host/plugin-inventory` | Remote `pluginInventory/list` | Loader entry 的只读投影 |
| `api/gateway` | `ctx.typertGateway` / 浏览器 `ctx.remote` | Typert（上游自研的、从 TS 源码类型生成 RPC 契约的工具）一元 Remote RPC 分发 |
| `api/remotes` | — | BFF（Backend For Frontend，专为这一个前端拼装的后端门面）装配：挂 contribution + 事件白名单 |

（表出自 `packages/host/README.md:7-16` 与各包 package.json；行数为各包 `src/` 下 `.ts` 的行数。）

**webserver 什么都不知道。** 它提供四个注册方法：`register`（`packages/host/webserver/src/index.ts:94`）、`registerUpgrade`（`:109`）、`registerFallback`（`:125`）、`tapIndex`（`:139`），外加一个最长前缀匹配的 `match`（`:242`）。它不认识任何 harness 概念，不服务任何文件，`/api` 和 WebSocket 都是别的插件注册的路由。重复注册直接抛错（`:97`、`:111`、`:127-128`）。

**frontend-static 占 fallback 座**（`packages/host/frontend-static/src/index.ts:98`），语义锁死：非 GET/HEAD 返回 405，越界返回 403，未命中的路径回落到 index.html 且状态码 200（`:83` 的注释：`// Miss (ENOENT/EISDIR) falls back to index.html with 200 (SPA routing).`，意思是文件找不到或者指向的是目录时，回落到 index.html 并返回 200，因为路由在前端）。dist 路径不是它自己找的，是 web-app bundle 用 `require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html')` 解析后传进来的（`packages/bundle/web-app/src/index.ts:119`、`:139`）。

**directory-picker-auto 是一个纯决策函数**，整段贴出来：

```ts
export function resolveDirectoryPickerBackend(facts: DirectoryPickerHostFacts): DirectoryPickerBackendKind {
  if (facts.bindHost !== '127.0.0.1') return 'browse'
  if (present(facts.env.SSH_CONNECTION) || present(facts.env.SSH_TTY)) return 'browse'
  if (facts.platform === 'darwin' || facts.platform === 'win32') return 'native'
  if (facts.platform !== 'linux' || !facts.linuxChooser) return 'browse'
  return present(facts.env.DISPLAY) || present(facts.env.WAYLAND_DISPLAY) ? 'native' : 'browse'
}
```

（`packages/host/directory-picker-auto/src/resolve.ts:47-53`）这五行判断依次是：绑定地址不是 `127.0.0.1` 就用 `browse`；环境变量里有 SSH 痕迹（`SSH_CONNECTION` 或 `SSH_TTY`）就用 `browse`；macOS 和 Windows 用 `native`；不是 Linux 或者 Linux 上没有可用的选择器程序就用 `browse`；剩下的 Linux 看有没有 `DISPLAY` 或 `WAYLAND_DISPLAY`，有图形会话才用 `native`。

逻辑很实在：非回环绑定或 SSH 会话说明「浏览器和 host 不在一台机器上」，弹一个 host 侧的原生对话框毫无意义，只能用应用内浏览器。判定完之后它在 Loader 根树里依次创建后端和对应的浏览器插件两行（`packages/host/directory-picker-auto/src/index.ts:86-88`）。

### 网关：为什么有两个

`api/gateway` 是新的：`@Remote` 装饰器标记的方法从 TypeScript 源码类型生成契约，浏览器端拿到的是**具体函数对象，不是 Proxy**（`docs/api-gateway.md:58`）。调用形状：

```ts
      const result = await connection.rpc.call('/api', endpoint, { args }, signal)
```

（`packages/api/gateway/src/client/index.ts:406`）endpoint 是 `<namespace>/<method>`，HTTP 层映射成 `POST /api/<namespace>/<method>`，payload 里**有且只有一个 `args` 纯对象**，这条约束是硬校验的（`packages/api/gateway/src/index.ts:201-208`）。取消协议也很干净：host 签名最后一个参数必须是 `signal: AbortSignal`，它进 descriptor 而不进 `args`（`docs/api-gateway.md:56`）。

`host/apiproxy` 是旧的，作为尚未迁移方法的兜底（`packages/api/README.md:17`）。运行时的分工在 connection 里三行说清楚：

```ts
      const apiProxy = ctx.get('apiProxy')
      if (apiProxy === undefined) return new Response('not found', { status: 404 })
      return toFetchHandler(apiProxy).fetch(request)
```

（`packages/client/connection/src/index.ts:156-158`）Gateway 先认领它有 descriptor 的两段式 endpoint，认不下的落到 apiProxy。这是一次**正在进行中**的迁移（上游有一篇 `.agents/notes/proposed/architecture/2026-08-10-unary-apiproxy-remote-migration.md`），所以现在两套网关并存。

### 信任围栏

`/api` 这一条路由上有一道信任检查（`packages/client/connection/src/index.ts:165`），WebSocket upgrade 上也有一道（`:184`）。而且有一组方法被**钉死在回环地址**，名单是硬编码的 15 条（`packages/client/connection/src/index.ts:104-118`）：agent-preset 的创作面 `agentPreset.read`/`copy`/`openDocument`/`remove`，`host.pickDirectory`、`host.openPath`，整个配置面 `settings.describe`/`openDocument`/`update`/`replace`/`mutate` 与 `credentials.describe`/`set`/`unset`，再加一个 `llm.discoverModels`。connection 的 README 逐条解释了理由（`packages/client/connection/README.md:5`）：读一份 composition 是侦察，因为它写明了一个 session 会跑哪些插件；copy/remove/openDocument 管理名册并驱动 host 桌面。而 `agentPreset.list` 和 `agentPreset.select` 不在名单里：名册只带 id 和信任等级，选一个 preset 也不会给出 `session.create` 的 `agentPreset` 参数没给的东西。

顺带：`--host 0.0.0.0` 是被显式禁掉的：

```ts
      program.error('error: --host 0.0.0.0 is intentionally not supported yet for safety: it would expose remote code execution to the network; use 127.0.0.1 instead')
```

（`packages/bundle/web-app/src/startup.ts:70`）这句报错的意思是：`--host 0.0.0.0` 出于安全考虑暂时故意不支持，它会把远程代码执行能力暴露到网络上，请改用 `127.0.0.1`。

---

## 七、设置界面与 i18n

**设置表单由 schema 生成，但不是通用渲染器。** `settings.describe` 这个 RPC 把每个命名空间的 schemastery schema 序列化过来（`schema.toJSON()` 的 ref 信封），浏览器把它复水成一个活的 validator：

```ts
export function rehydrateSchema(serialized: unknown): SchemaNode {
  return new Schema(serialized as Schema)
```

（`packages/client/schema-form/src/model.ts:19-20`）目的写在 README（`packages/client/schema-form/README.md:5`）：**在 host 上校验一个配置段的，和在浏览器里校验草稿的，是同一个 schema 对象**，所以客户端校验不可能与服务定义漂移。

这个包只有 195 行，且**不含任何 React**。`hasPath` 的语义是「这个字段被用户覆写过」，`deletePath` 就是「重置这一个字段」。真正的表单控件由各个设置页自己写，Models 页手写了自己的卡片。代价写在 README `:21`：`rehydrateSchema` 会通过 `new Function` 复活序列化的回调，所以这个信封是可执行内容，只对同源可信 host 安全。

**i18n 只有 `zh`/`en` 两种语言，中文是兜底不是默认。** `LocaleRuntime`（`packages/client/locale/src/client/index.ts:114`）管这两种；初始语言取**浏览器自己的语言**（按主语言标签匹配，`zh-Hans-CN` → zh、`en-GB` → en，`:332-343`），匹配不上才落到 `FALLBACK_LOCALE`，也就是 `zh`（`:319-320`、`:90`）。用户显式选的偏好存在 `$DSH_HOME/settings.yaml` 的 `locale.preference`（`packages/client/locale/src/locale-settings.ts:6`、`:9`），插件激活后覆盖这个临时值。

查一个 key 是两层嵌套的回退，先在自己的命名空间里试当前语言再试 `zh`，还没有才去 `common` 里把同样两步再走一遍：

```ts
    return locales?.get(this.snapshot.active)?.[key] ?? locales?.get(FALLBACK_LOCALE)?.[key]
```

（`:286`，这是「一个命名空间内」的两步；外面那层在 `:276-278`：`lookup(ns)` → `lookup('common')` → 最后直接把 key 本身当文案吐出去）字典按 (namespace × locale) 注册，命名空间表和 SlotMap 用同一套声明合并手法（`packages/client/ui-slots/src/index.ts:34`）。切换语言时渲染器按 (namespace, revision) 重新派生 `t` 函数，给出**新的函数引用**，所以 memo 组件会自然重渲。

已知的一个缺口（`packages/client/locale/README.md:18`）：注册期捕获的文案（比如 `/model` 命令的描述）会保持注册时的语言，直到重新注册。

---

## 八、界面上的东西对应哪个包

这张表是给「我想改屏幕上那个东西，该去哪个目录」用的。第三列同时告诉你**它是怎么进去的**：是抢一个单人座、排进一个 list、按 key 被点名、自荐进 chain，还是干脆不走 slot 而由某个组件直接渲染（最后一种表里有一行，看列名就知道 slot 不是唯一途径）。

| 你看到的 | 包 | 怎么进到界面里 |
|---|---|---|
| 聊天视图 | `ui-conversation` | `conversation.view`（id `chat`） |
| 轨迹视图 | `ui-trajectory` | `conversation.view` 的第二个 tab |
| 工具调用卡片 | `ui-tool` | `conversation.chat.node` → `tool.call.toolview`（keyed） |
| 审批面板 | `ui-conversation`（`ApprovalPanel`） | `conversation.composer`（chain，priority 1） |
| 提问面板 | `ui-user-questions` | `conversation.composer`（chain） |
| 模型选择 | `ui-model-selection` | `/model` popupSelect + `conversation.input.model` |
| agent preset 选择器 | `ui-agent-preset` | 四个 slot：`settings.general.item`（`packages/client/ui-agent-preset/src/client/index.ts:207`）、`settings.section`（`:216`）、新会话页的 `conversation.hero.agentPreset`（`:165`）、会话头只读标签 `conversation.session.header.actions`（`:170`，order −10） |
| 权限档位 chip | `ui-conversation`（`PermissionSelect`） | **不走 slot**：由 composer 的 `InputBar` 直接渲染（`packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:562`），读 `permissions` 投影 |
| goal 条 | `ui-goal` | `conversation.input.dock` order 10 |
| todo 条 | `ui-conversation`（`TodoDock`，**不是独立包**） | `conversation.input.dock` order 0，读 `todos` 投影 |
| plan chip | `ui-plan` | `conversation.input.plan` 单座 |
| workflow 面板 | `ui-workflow-run` | `conversation.chat.node`（keyed） |
| 后台 job 列表 | `ui-jobs` | `conversation.session.header.actions` |
| 产出文件行 | `ui-deliverables` | `conversation.chat.turnTail` |

### `ui-deliverables`：唯一一个既改界面又改 prompt 的例子

大部分 `ui-*` 包只管渲染。`ui-deliverables` 不一样，它的 host 半往 system prompt 里加了一段（`packages/client/ui-deliverables/src/index.ts:15-16`）：

> When you successfully create or modify files, mention the primary outputs in your final response. To make those and any other changed-file references clickable in Web, format them as Markdown inline code using the exact file-tool path, or a basename when unique among the files changed in that turn.

（你成功新建或改动文件之后，在最后一条回复里点名主要的产出。想让这些以及其他被改动的文件引用在 Web 里可点击，就用 Markdown 行内代码写它们，路径要和文件工具用的那个路径一模一样；如果这个文件名在本轮改动的文件里是唯一的，也可以只写文件名。）

注册在 `:23-27`，`name: 'ui:deliverable-file-references'`，`order: 190`。浏览器半则在收尾 assistant 消息下面渲染一行产出文件，并把匹配的行内代码变成可点击链接。

这是一个很干净的因果链：**因为界面要把文件路径变成链接，所以要教模型用行内代码写路径**。而且这两件事被绑在同一个包、同一行 `cordis.patch.yml` 上，README 明说（`packages/client/ui-deliverables/README.md:5`）：删掉那一行 entry，提示词、那一行界面、以及散文里的链接一起消失。

KV cache 的影响也写清了（`:29`）：这个 section 在包挂载期间是静态的、order 190，所以它留在可复用的 prompt 前缀里，不随 turn 变化。这条纪律见 [02 KV Cache](02-kv-cache.md)。

---

## 九、代价与失效点

**39 个包的界面，改一处要动几个地方。** 加一个新的界面元素，最少要：在某个包的 children 表里声明 slot（否则 `register` 抛错）、写浏览器半、在 `web-app/cordis.patch.yml` 加一行、如果需要 host 数据还要加 Remote 方法或投影。`docs/cookbook/adding-a-conversation-node.md` 就是为这条路径写的。

**投影是 host 算的，所以 host 版本决定浏览器能显示什么。** todo、goal、plan、权限档位、token 用量全是 `session/projection` 帧。浏览器不从事件流自己折叠这些：好处是一致性，坏处是新增一种投影必须改 host。

**信任围栏是「回环 vs 非回环」的二分，没有认证层。** connection 的 README 自己写了：这些方法「stay loopback-local until a real authentication layer exists」（在真正的认证层出现之前，先钉死在回环地址上）。局域网上的浏览器能看会话、能发消息，但改不了设置、读不了 preset 组合。这不是权限系统，是一道临时围栏。

**两套网关并存。** Remote 和 apiProxy 共用 `/api`，靠 endpoint 形状分流。迁移期间「某个方法走哪条路」是要查代码才知道的。

**文档会落后于源码。** 一个具体例子：`packages/api/remotes/README.md:9` 说 Client 装配只挂 Goal 与 pluginInventory 两个 contribution，而源码 `packages/api/remotes/src/client/index.ts:108-110` 实际挂了 5 个（commands / goals / cordis-host-runner / pluginInventory / messageFeedback）。上游的文档纪律很严（每个包必须有 README、必须有 Model Experience 段），但一致性靠人。

**HMR 默认是空转的**，见第四节。这一点连模型都被专门告知过，因为它误导过人。

---

## 十、别人怎么做

最后一列是重点：别人有没有「让第三方往界面里塞东西」这件事，以及那个扩展点的粒度有多粗。

| harness | 交互面 | 前后端边界 | 扩展 UI |
|---|---|---|---|
| dsh | 唯一一个 Web GUI（TUI 已删除） | host 算投影，浏览器只渲染；WebSocket 下行 + HTTP 上行 | 39 个插件包 + slot 声明表 |
| Claude Code | CLI 为主，另有桌面端、Web、IDE 扩展 | 不开源 | 不适用（有 hooks/skills/plugins 但不是 UI 插件） |
| Codex | Rust CLI，可选 UI 与 app server | rollout 记录 + 客户端全量重放历史 | Extension API 有 12 类 contributor（`context_contributors()` 等，`codex!codex-rs/ext/extension-api/src/registry.rs:145-156`），**一个都不是 UI** |
| OpenCode | TUI + server；`Session.Event.*` 经 EventV2 总线推给 TUI/Web | 从 DB 消息重建，中断可续 | 两套：server 侧 `Hooks` 21 个键（`opencode!packages/plugin/src/index.ts:222`，无一个是 UI），另有独立的 `TuiPluginApi`，含 12 个具名 host slot + 对话框/toast/路由/keymap |
| pi | 自定义 TUI（`packages/tui` 1.7 万行 + `modes/interactive` 1.8 万行） | 扩展可 `registerTool` 并自定义 `renderCall`/`renderResult` | Extension API 里 `ctx.ui.*`：`setHeader`/`setFooter`/`setWidget`/`setEditorComponent`/`custom`/`select`/`confirm` 等 |
| mini-swe-agent | 交互式 CLI，另有一个 Textual 写的轨迹检查器（`mini-swe-agent!src/minisweagent/run/utilities/inspector.py:16`） | 不适用 | 不适用 |

差别不在「谁能画东西」，pi 和 OpenCode 的扩展都能画，而且画的不止是工具卡片：pi 的 `ctx.ui.setHeader`/`setFooter`/`setWidget`（换掉顶栏、换掉底栏、塞一个小挂件）直接换掉框架的边条，OpenCode 的 `TuiHostSlotMap` 是一张实打实的具名洞表（`app`、`session_prompt`、`sidebar_content`、`home_footer` 等 12 个，分别是整个应用外壳、会话输入区、侧栏内容、首页底栏，`opencode!packages/plugin/src/tui.ts:455-486`），跟 dsh 的 `SlotMap` 是同一个思路。

真正的差别是**规模和强制力**。dsh 的 slot 声明表覆盖到 composer 底排的每一个座位、会话头的每一个动作、聊天流里的每一种节点；未声明的 slot 注册直接抛错，所以「谁能改哪块界面」是编译期加运行期双重可查的；连内建的 chat 视图自己都只是注册进 `conversation.view` 的一个 tab，没有特权。OpenCode 的 12 个 host slot 是宿主开好的固定几个口子，插件可以自带私有 slot，但宿主界面的其余部分不通过这套机制。

代价也很明显。pi 的终端界面（框架包 + 交互模式）合计约 3.4 万行；dsh 为了「整个界面都可替换」，付了 71,896 行。这 7 万行里没有一行影响模型看到什么——除了 `ui-deliverables` 那 2 句话。

---

## 十一、怎么自己核

```bash
# 39 个 client 包与总行数
# 注意用 `cat | wc -l` 而不是 `xargs wc -l | tail -1`：文件多到 xargs 分批时，
# 最后那个 total 只是最后一批的合计。
ls -d packages/client/*/ | wc -l
find packages/client -path '*/src/*' \( -name '*.ts' -o -name '*.tsx' \) \
  | grep -v '/tests/' | xargs cat | wc -l

# 单个包的行数（表里那一列就是这么来的）
find packages/client/ui-conversation -path '*/src/*' \( -name '*.ts' -o -name '*.tsx' \) \
  | grep -v '/tests/' | xargs cat | wc -l

# 事件链路的每一跳
grep -n "session/event" packages/host/apiproxy/src/api-proxy.ts
sed -n '204,220p' packages/client/runtime/src/client/index.ts
sed -n '447,470p' packages/client/runtime/src/client/sessions/session.ts

# 唯一的 hook 构造器：确认 bindSnapshotSelector 只定义一次
grep -rn "export function bindSnapshotSelector" packages/client --include=*.ts
# 对照：直接用 useSyncExternalStore 的地方有十几处，但订阅的都是组件局部 store
grep -rn "useSyncExternalStore" packages/client --include=*.ts --include=*.tsx | grep -v '/tests/'

# slot 声明与注册
grep -rn "slots.register({" packages/client --include=*.ts --include=*.tsx | grep -v '/tests/' | wc -l

# __DSH_BOOT__ 的注入与读取
grep -rn "__DSH_BOOT__" packages/client apps/web --include=*.ts --include=*.tsx

# web surface prompt 的实际文本
sed -n '95,106p' packages/bundle/web-app/src/index.ts
```

启动之后，浏览器控制台里 `window.__DSH_BOOT__` 就是那张 boot graph；设置页里的 Plugin list tab（`ui-settings-plugin-inventory`）调 `pluginInventory/list`，能看到每一行 Loader entry 当前的 fiber 状态，这是判断「某一行到底激活没有」最直接的办法。

---

## 自检

**1. token 用量、todo、goal、权限档位这些，为什么由 host 算好整值广播，而不让每个浏览器自己从事件流折叠？**

答：折叠规则要是放在浏览器，每个连着的客户端都得各算一遍，算法有一点出入就会看到不一样的数，而且同一份事件被重复计算。放在 host 只算一次，所有客户端拿到同一个值。代价是新增一种投影必须改 host：浏览器版本再新，也变不出 host 没算的东西。

**2. `ui-trajectory` 有 7,900 行，却不注册任何 Service。如果把它改成直接读 Chat 视图的会话快照来渲染账本，会坏在哪？**

答：现在两个视图各自从共享的 Session 事件窗口派生自己的表示，谁也不看谁的快照，所以加一个新视图不用改任何已有视图。改成读 Chat 快照之后，Chat 的折叠规则一变（比如分组方式换了）Trajectory 就跟着坏；更要命的是 Trajectory 只能看到 Chat 决定保留的东西，被 Chat 折叠掉的原始信息再也拿不回来，账本就不再是账本了。事件溯源那点红利刚好被抵消掉。

**3. 审批面板注册时写了 `priority: 1`，提问面板用默认的 0。把这两个数对调，用户会看到什么变化？**

答：chain 的 priority 是升序，数字小的先跑。对调之后，审批和提问同时挂起时，composer 位置上先出现的是审批面板。这不会死锁（审批答完提问立刻当选），但对模型不划算：提问是模型正在等着继续的一次对话，审批只卡住一次工具调用，先让用户去处理审批，模型那一步就白等一轮。

---

相关：[10 Cordis、启动、bundle 与 preset](10-cordis-boot-preset.md) 讲这些 `ui-*` 行从哪来；[05 Session](05-session.md) 讲事件日志与投影本身；[12 产品表面与协议](12-surfaces-and-protocols.md) 讲不经浏览器的那些入口；[14 横向对比](14-comparison.md) 有完整对照。术语见[附录 A 术语表](appendix-a-glossary.md)。
