// admin-billing.test.mjs — smoke tests for lib/admin/billing.mjs `plan-usage`.
// Run via: node --test netlify/functions/lib/__tests__/admin-billing.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import { handlePlanUsage } from '../admin/billing.mjs';

// In-memory fake db — overwrite methods on the shared `db` object.
function fakeDb({ clients = [], posts = {}, users = [] } = {}) {
  db.getClients = async () => clients;
  db.getPosts = async (cid) => posts[cid] || [];
  db.listUsers = async () => users;
}

test('admin plan returns limits, clients count, and real user count', async () => {
  fakeDb({
    clients: [{ id: 'c1' }, { id: 'c2' }],
    posts: { c1: [], c2: [] },
    users: [{ email: 'a' }, { email: 'b' }, { email: 'c' }],
  });
  const ctx = {
    user: { email: 'a@b.com', role: 'admin', plan: 'enterprise' },
    url: new URL('https://e.test/'),
    clientId: null,
    userId: 'u',
  };
  const res = await handlePlanUsage(new Request('https://e.test/'), ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.plan, 'enterprise');
  assert.equal(body.usage.clients, 2);
  assert.equal(body.usage.users, 3);
  assert.equal(body.usage.postsThisMonth, 0);
  assert.ok(body.limits && typeof body.limits === 'object');
});

test('non-admin sees user count = 1', async () => {
  fakeDb({ clients: [{ id: 'c1' }], posts: { c1: [] }, users: [] });
  const ctx = {
    user: { email: 'e@f.com', role: 'editor', plan: 'free' },
    url: new URL('https://e.test/'),
    clientId: null,
    userId: 'u',
  };
  const res = await handlePlanUsage(new Request('https://e.test/'), ctx);
  const body = await res.json();
  assert.equal(body.plan, 'free');
  assert.equal(body.usage.users, 1);
});
