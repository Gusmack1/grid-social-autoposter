// admin-tokens.test.mjs — smoke tests for lib/admin/tokens.mjs
// `check-token-health`. Run via: node --test .../admin-tokens.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import { handleCheckTokenHealth } from '../admin/tokens.mjs';

test('returns per-client tokenHealth shape', async () => {
  db.getClients = async () => [
    { id: 'c1', name: 'Alpha', tokenHealth: { ok: true } },
    { id: 'c2', name: 'Beta' }, // no tokenHealth → null
  ];
  const res = await handleCheckTokenHealth(new Request('https://e.test/'), {
    user: {}, url: new URL('https://e.test/'), clientId: null, userId: 'u',
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(Array.isArray(body), true);
  assert.equal(body.length, 2);
  assert.deepEqual(body[0], { clientId: 'c1', name: 'Alpha', tokenHealth: { ok: true } });
  assert.deepEqual(body[1], { clientId: 'c2', name: 'Beta', tokenHealth: null });
});
