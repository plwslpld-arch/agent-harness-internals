function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createShippingWorkspace() {
  const files = new Map([
    ['src/shipping.ts', 'export function shippingFee(total) {\n  return total > 100 ? 0 : 10;\n}\n'],
    ['tests/shipping.test.ts', 'shippingFee(100) === 0\nshippingFee(101) === 0\nshippingFee(99) === 10\n'],
  ]);

  return {
    read(path) {
      if (!files.has(path)) throw new Error(`文件不存在：${path}`);
      return files.get(path);
    },
    write(path, content) {
      if (!files.has(path)) throw new Error(`不允许创建未声明文件：${path}`);
      files.set(path, content);
    },
    runTests() {
      const source = files.get('src/shipping.ts');
      const passed = source.includes('total >= 100');
      return {
        exitCode: passed ? 0 : 1,
        stdout: passed
          ? '通过：shippingFee(100) === 0\n通过：shippingFee(101) === 0\n通过：shippingFee(99) === 10\n'
          : '失败：shippingFee(100) 期望 0，实际 10\n',
      };
    },
    snapshot() {
      return Object.fromEntries(files);
    },
  };
}

export function createScriptedModel() {
  return {
    async next(messages) {
      const toolResults = messages.filter((message) => message.role === 'tool');
      const last = toolResults.at(-1);

      if (!last) {
        return { type: 'tool_call', callId: 'call-read', name: 'read', arguments: { path: 'src/shipping.ts' } };
      }
      if (last.name === 'read' && last.ok) {
        return {
          type: 'tool_call',
          callId: 'call-edit',
          name: 'edit',
          arguments: { path: 'src/shipping.ts', oldText: '> 100', newText: '>= 100' },
        };
      }
      if (last.name === 'edit' && last.ok) {
        return { type: 'tool_call', callId: 'call-test', name: 'test', arguments: {} };
      }
      if (last.name === 'test' && last.ok && last.result.exitCode === 0) {
        return { type: 'final', text: '边界条件已修复，金额 100 的目标测试已通过。' };
      }
      return { type: 'final', text: '当前动作未成功，无法确认任务已经完成。' };
    },
  };
}

function executeTool({ name, arguments: args, workspace }) {
  if (name === 'read') {
    return { content: workspace.read(args.path) };
  }
  if (name === 'edit') {
    const before = workspace.read(args.path);
    if (!before.includes(args.oldText)) throw new Error('待替换文本不存在，拒绝猜测写入位置');
    workspace.write(args.path, before.replace(args.oldText, args.newText));
    return { changed: true, path: args.path };
  }
  if (name === 'test') {
    return workspace.runTests();
  }
  throw new Error(`未知工具：${name}`);
}

export async function runHarness({ goal, model, workspace, approve, maxSteps = 12 }) {
  const messages = [{ role: 'user', content: goal }];
  const trace = [{ type: 'run_started', goal }];

  for (let step = 0; step < maxSteps; step += 1) {
    const decision = await model.next(clone(messages));

    if (decision.type === 'final') {
      messages.push({ role: 'assistant', content: decision.text });
      trace.push({ type: 'run_completed', text: decision.text });
      return { status: 'completed', messages, trace };
    }

    if (decision.type !== 'tool_call') {
      throw new Error(`模型决定类型无效：${decision.type}`);
    }

    const request = {
      type: 'tool_requested',
      callId: decision.callId,
      name: decision.name,
      arguments: clone(decision.arguments),
    };
    trace.push(request);
    messages.push({ role: 'assistant', toolCall: clone(decision) });

    const approval = await approve(request);
    if (approval !== 'allow') {
      const denied = { role: 'tool', callId: decision.callId, name: decision.name, ok: false, error: 'permission_denied' };
      messages.push(denied);
      trace.push({ type: 'tool_denied', callId: decision.callId, name: decision.name });
      continue;
    }

    trace.push({ type: 'tool_started', callId: decision.callId, name: decision.name });
    try {
      const result = executeTool({ ...decision, workspace });
      messages.push({ role: 'tool', callId: decision.callId, name: decision.name, ok: true, result });
      trace.push({ type: 'tool_completed', callId: decision.callId, name: decision.name, result: clone(result) });
    } catch (error) {
      messages.push({ role: 'tool', callId: decision.callId, name: decision.name, ok: false, error: error.message });
      trace.push({ type: 'tool_failed', callId: decision.callId, name: decision.name, error: error.message });
    }
  }

  trace.push({ type: 'run_stopped', reason: 'step_limit' });
  return { status: 'stopped', reason: 'step_limit', messages, trace };
}

export function evaluateShippingTask({ workspace, trace }) {
  const reasons = [];
  const test = workspace.runTests();
  if (test.exitCode !== 0) reasons.push('金额 100 的目标测试未通过');

  const successfulTest = trace.some(
    (event) => event.type === 'tool_completed' && event.name === 'test' && event.result?.exitCode === 0,
  );
  if (!successfulTest) reasons.push('运行记录中没有成功的测试工具结果');

  return reasons.length === 0 ? { status: 'passed', reasons: [] } : { status: 'failed', reasons };
}

export function recoverPendingEdit({ workspace }) {
  const source = workspace.read('src/shipping.ts');
  if (source.includes('total >= 100')) {
    return { action: 'continue_to_test', reason: '观察到编辑副作用已经发生' };
  }
  if (source.includes('total > 100')) {
    return { action: 'apply_edit', reason: '观察到编辑副作用尚未发生' };
  }
  return { action: 'manual_review', reason: '工作区状态无法与已知前后版本对应' };
}
