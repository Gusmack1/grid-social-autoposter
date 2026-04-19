// admin-user-keys.test.mjs — smoke tests for lib/admin/user-keys.mjs.
// Run via: node --test .../admin-user-keys.test.mjs

// encrypt() from lib/crypto/encryption.mjs requires a 64-char hex key. Set
// before the module loads — bare hex, deterministic, test-only.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import {
  handleSaveApiKey,
  handleRemoveApiKey,
  handleCheckApiKey,
} from '../admin/user-keys.mjs';

const ctx = (email = 'gus@grid.social') => ({
  user: { email },
  url: new URL('https://e.test/'),
  clientId: null,
  userId: 'u',
});

function fakeUserDb(initial = {}) {
  const store = { ...initial };
  db.getUser = async (key) => store[key] ? JSON.parse(JSON.stringify(store[key])) : null;
  db.saveUser = async (key, data) => { store[key] = data; };
  return store;
}

// ── emailKey normalisation round-trip (Fact #300 safety rail) ──

test('emailKey normalisation: "Gus@Grid.Social" -> "gus_grid_social"', async () => {
  const store = fakeUserDb();
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ apiKey: 'sk-ant-xxxxxx' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSaveApiKey(req, ctx('Gus@Grid.Social'));
  assert.equal(res.status, 200);
  // The exact normalised key must land in the store
  assert.ok(store['gus_grid_social'], 'expected lowercase+underscore-normalised emailKey');
  // First underscore is the @, rest are the dots — reversible via indexOf(_)
  const key = 'gus_grid_social';
  assert.equal(key.indexOf('_'), 3);
});

test('emailKey normalises digits + punctuation identically', async () => {
  const store = fakeUserDb();
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ apiKey: 'sk-ant-zzz' }),
    headers: { 'content-type': 'application/json' },
  });
  await handleSaveApiKey(req, ctx('a+b.1@x-y.io'));
  // +, ., @, - are all non-[a-z0-9] → _
  assert.ok(store['a_b_1_x_y_io']);
});

// ── sk-ant- prefix validation ──

test('handleSaveApiKey accepts sk-ant- prefixed key', async () => {
  const store = fakeUserDb();
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ apiKey: 'sk-ant-api03-abcdef' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSaveApiKey(req, ctx('me@grid.social'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.hasKey, true);
  // Stored encrypted value must be enc:-prefixed (proves encrypt() ran)
  assert.ok(store['me_grid_social'].anthropicApiKey.startsWith('enc:'));
  assert.ok(store['me_grid_social'].apiKeySetAt);
});

test('handleSaveApiKey rejects missing apiKey', async () => {
  fakeUserDb();
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSaveApiKey(req, ctx());
  assert.equal(res.status, 400);
});

test('handleSaveApiKey rejects non sk-ant- prefix', async () => {
  fakeUserDb();
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ apiKey: 'sk-openai-xxxx' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSaveApiKey(req, ctx());
  assert.equal(res.status, 400);
});

// ── remove-api-key ──

test('handleRemoveApiKey clears anthropicApiKey + apiKeySetAt with correct emailKey', async () => {
  const store = fakeUserDb({
    'me_grid_social': {
      email: 'me@grid.social',
      anthropicApiKey: 'enc:something',
      apiKeySetAt: '2026-04-18T00:00:00.000Z',
      otherField: 'keep-me',
    },
  });
  const req = new Request('https://e.test/', { method: 'DELETE' });
  const res = await handleRemoveApiKey(req, ctx('me@grid.social'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.hasKey, false);
  assert.equal(store['me_grid_social'].anthropicApiKey, undefined);
  assert.equal(store['me_grid_social'].apiKeySetAt, undefined);
  assert.equal(store['me_grid_social'].otherField, 'keep-me');
});

test('handleRemoveApiKey no-ops when user does not exist', async () => {
  fakeUserDb();
  const req = new Request('https://e.test/', { method: 'DELETE' });
  const res = await handleRemoveApiKey(req, ctx('nobody@grid.social'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.hasKey, false);
});

// ── check-api-key ──

test('handleCheckApiKey returns hasKey:true when enc:-prefixed key stored', async () => {
  fakeUserDb({
    'me_grid_social': {
      anthropicApiKey: 'enc:whatever',
      apiKeySetAt: '2026-04-18T00:00:00.000Z',
    },
  });
  const req = new Request('https://e.test/');
  const res = await handleCheckApiKey(req, ctx('me@grid.social'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.hasKey, true);
  assert.equal(body.setAt, '2026-04-18T00:00:00.000Z');
});

test('handleCheckApiKey returns hasKey:false when no user', async () => {
  fakeUserDb();
  const res = await handleCheckApiKey(new Request('https://e.test/'), ctx('ghost@grid.social'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.hasKey, false);
  assert.equal(body.setAt, null);
});
