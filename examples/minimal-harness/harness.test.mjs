import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createShippingWorkspace,
  createScriptedModel,
  evaluateShippingTask,
  recoverPendingEdit,
  runHarness,
} from './harness.mjs';

test('最小 Harness 完成读取、编辑、测试和最终回复闭环', async () => {
  const workspace = createShippingWorkspace();
  const result = await runHarness({
    goal: '修复订单金额为 100 元时仍收取运费的问题，并运行测试确认。',
    model: createScriptedModel(),
    workspace,
    approve: async () => 'allow',
  });

  assert.equal(result.status, 'completed');
  assert.match(workspace.read('src/shipping.ts'), />=/u);
  assert.deepEqual(
    result.trace.filter((event) => event.type === 'tool_completed').map((event) => event.name),
    ['read', 'edit', 'test'],
  );
  assert.equal(result.messages.at(-1).role, 'assistant');
  assert.match(result.messages.at(-1).content, /目标测试已通过/u);
});

test('工具结果与原 Call ID 一一对应', async () => {
  const result = await runHarness({
    goal: '修复并测试。',
    model: createScriptedModel(),
    workspace: createShippingWorkspace(),
    approve: async () => 'allow',
  });

  const calls = result.trace.filter((event) => event.type === 'tool_requested');
  const completed = result.trace.filter((event) => event.type === 'tool_completed');
  assert.deepEqual(completed.map((event) => event.callId), calls.map((event) => event.callId));
});

test('权限拒绝不会产生编辑副作用', async () => {
  const workspace = createShippingWorkspace();
  const before = workspace.read('src/shipping.ts');
  const result = await runHarness({
    goal: '修复并测试。',
    model: createScriptedModel(),
    workspace,
    approve: async ({ name }) => (name === 'edit' ? 'deny' : 'allow'),
  });

  assert.equal(workspace.read('src/shipping.ts'), before);
  assert.ok(result.trace.some((event) => event.type === 'tool_denied' && event.name === 'edit'));
});

test('独立判定不相信模型最终文本', async () => {
  const workspace = createShippingWorkspace();
  const evaluation = evaluateShippingTask({
    workspace,
    trace: [],
    finalText: '已经修复，所有测试都通过了。',
  });

  assert.deepEqual(evaluation, {
    status: 'failed',
    reasons: ['金额 100 的目标测试未通过', '运行记录中没有成功的测试工具结果'],
  });
});

test('恢复未结算编辑时先观察环境，不盲目重放', () => {
  const unchanged = createShippingWorkspace();
  assert.equal(recoverPendingEdit({ workspace: unchanged }).action, 'apply_edit');

  const changed = createShippingWorkspace();
  changed.write('src/shipping.ts', changed.read('src/shipping.ts').replace('> 100', '>= 100'));
  assert.equal(recoverPendingEdit({ workspace: changed }).action, 'continue_to_test');
});
