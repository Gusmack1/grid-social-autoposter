// admin-meta.test.mjs — smoke tests for lib/admin/meta.mjs `config` action.
// Run via: node --test netlify/functions/lib/__tests__/admin-meta.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleConfig } from '../admin/meta.mjs';

const stubCtx = () => ({
  user: { email: 'a@b.com', name: 'A', role: 'admin', plan: 'enterprise', assignedClients: [] },
  url: new URL('https://example.test/admin?action=config'),
  clientId: null,
  userId: 'u1',
});

test('handleConfig returns a JSON Response with expected shape', async () => {
  const res = await handleConfig(new Request('https://example.test/admin?action=config'), stubCtx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(typeof body.metaAppId, 'string');
  assert.equal(typeof body.hasSecret, 'boolean');
  assert.equal(typeof body.hasGithubToken, 'boolean');
  assert.equal(typeof body.hasEncryptionKey, 'boolean');
  assert.equal(typeof body.hasQStash, 'boolean');
  assert.equal(typeof body.hasR2, 'boolean');
  assert.equal(typeof body.hasSupabase, 'boolean');
  assert.ok('dbBackend' in body);
  assert.equal(body.user.email, 'a@b.com');
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.plan, 'enterprise');
});

test('handleConfig honours user.plan fallback to free', async () => {
  const ctx = stubCtx();
  delete ctx.user.plan;
  const res = await handleConfig(new Request('https://example.test/'), ctx);
  const body = await res.json();
  assert.equal(body.user.plan, 'free');
});
