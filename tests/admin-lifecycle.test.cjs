const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = import('../supabase/functions/admin-lifecycle/handler.mjs');

function fixture({ admin = true, actionError = null, authError = null, cleanupError = null } = {}) {
  const calls = [];
  const clients = {
    userClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'actor' } }, error: authError }) },
      rpc: async (name, args) => {
        calls.push([name, args]);
        if (name === 'is_platform_admin') return { data: admin };
        if (name === 'admin_pending_retirements') return { data: ['queued'] };
        return { data: { action: args.requested_action, queued_accounts: ['queued'] }, error: actionError };
      },
    }),
    serviceClient: () => ({
      auth: { admin: { deleteUser: async (...args) => { calls.push(['deleteUser', ...args]); return { error: cleanupError }; } } },
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { user_id: 'queued', completed_at: null } }) }) }),
        update: () => ({ eq: async () => ({}) }),
      }),
    }),
  };
  async function run(body = { action: 'delete_business', business_id: 'business', user_id: null, version: 'v', confirmation: 'Name', queued_accounts: ['attacker'] }) {
    const { handleLifecycle } = await handler;
    const response = await handleLifecycle(new Request('https://example.com', {
      method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }), clients);
    return { status: response.status, body: await response.json() };
  }
  return { calls, run };
}

test('Owner/Staff cannot perform lifecycle operations or call privileged Auth', async () => {
  const f = fixture({ admin: false });
  assert.equal((await f.run()).status, 403);
  assert.deepEqual(f.calls.map(c => c[0]), ['is_platform_admin']);
});
test('Expired identity is rejected before checking privileges', async () => {
  const f = fixture({ authError: new Error('expired') });
  assert.equal((await f.run()).status, 401);
  assert.equal(f.calls.length, 0);
});
test('SQL denial or stale preview never triggers account deletion', async () => {
  const f = fixture({ actionError: { message: 'Los datos cambiaron' } });
  assert.equal((await f.run()).status, 400);
  assert.ok(!f.calls.some(c => c[0] === 'deleteUser'));
});
test('Only server-queued account IDs are soft-deleted, preserving history', async () => {
  const f = fixture();
  assert.equal((await f.run()).body.cleanup_pending, false);
  assert.deepEqual(f.calls.find(c => c[0] === 'deleteUser'), ['deleteUser', 'queued', true]);
});
test('Auth failure reports committed database action and retryable cleanup separately', async () => {
  const f = fixture({ cleanupError: new Error('timeout') });
  const r = await f.run();
  assert.equal(r.status, 200);
  assert.equal(r.body.action, 'delete_business');
  assert.equal(r.body.cleanup_pending, true);
  assert.equal(r.body.accounts[0].completed, false);
});
test('Retry processes queue without repeating business deletion', async () => {
  const f = fixture();
  await f.run({ action: 'retry' });
  assert.ok(f.calls.some(c => c[0] === 'admin_pending_retirements'));
  assert.ok(!f.calls.some(c => c[0] === 'admin_lifecycle_action'));
});
