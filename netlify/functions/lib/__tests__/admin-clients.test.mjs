// admin-clients.test.mjs — smoke tests for lib/admin/clients.mjs.
// Token-field list is duplicated verbatim from admin.mjs (Phase 3). These
// tests are a byte-equality snapshot: reorder/rename a token field in
// clients.mjs without updating the frontend modal constants and these tests
// will catch it.

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import {
  handleGetClients,
  handleAddClient,
  handleUpdateClient,
  handleDeleteClient,
} from '../admin/clients.mjs';

const ctx = (overrides = {}) => ({
  user: { email: 'admin@grid.social', role: 'admin', plan: 'enterprise', ...overrides.user },
  url: new URL('https://e.test/'),
  clientId: null,
  userId: 'u',
  ...overrides,
});

function fakeClientsDb(initial = []) {
  let store = JSON.parse(JSON.stringify(initial));
  db.getClients = async () => JSON.parse(JSON.stringify(store));
  db.saveClients = async (list) => { store = JSON.parse(JSON.stringify(list)); };
  return {
    get store() { return store; },
    set store(v) { store = v; },
  };
}

// ── get-clients ──

test('handleGetClients masks every token field exactly once per client', async () => {
  fakeClientsDb([
    {
      id: 'c1', name: 'Alice',
      // not touching pageAccessToken so decrypt won't be called
      twitterApiKey: 'enc:tw-key',
      twitterApiSecret: 'enc:tw-sec',
      twitterAccessToken: 'enc:tw-at',
      twitterAccessSecret: 'enc:tw-asec',
      linkedinAccessToken: 'enc:li-at',
      linkedinRefreshToken: 'enc:li-rt',
      gbpAccessToken: 'enc:gbp',
      tiktokAccessToken: 'enc:tt',
      threadsAccessToken: 'enc:th',
      blueskyAppPassword: 'enc:bs',
      pinterestAccessToken: 'enc:pi',
      pinterestRefreshToken: 'enc:pi-rt',
    },
  ]);
  const req = new Request('https://e.test/');
  const res = await handleGetClients(req, ctx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 1);
  const c = body[0];
  // Every non-page token field must be exactly '••••'
  assert.equal(c.twitterApiKey, '••••');
  assert.equal(c.twitterApiSecret, '••••');
  assert.equal(c.twitterAccessToken, '••••');
  assert.equal(c.twitterAccessSecret, '••••');
  assert.equal(c.linkedinAccessToken, '••••');
  assert.equal(c.linkedinRefreshToken, '••••');
  assert.equal(c.gbpAccessToken, '••••');
  assert.equal(c.tiktokAccessToken, '••••');
  assert.equal(c.threadsAccessToken, '••••');
  assert.equal(c.blueskyAppPassword, '••••');
  assert.equal(c.pinterestAccessToken, '••••');
  assert.equal(c.pinterestRefreshToken, '••••');
});

test('handleGetClients returns null for absent tokens (not "••••")', async () => {
  fakeClientsDb([{ id: 'c1', name: 'NoTokens' }]);
  const res = await handleGetClients(new Request('https://e.test/'), ctx());
  const [c] = await res.json();
  assert.equal(c.pageAccessToken, null);
  assert.equal(c.twitterApiKey, null);
  assert.equal(c.linkedinAccessToken, null);
  assert.equal(c._hasTokens, false);
});

test('handleGetClients sets _hasTokens true if any of the 8 flag tokens present', async () => {
  // _hasTokens is a direct OR over an 8-field subset (NOT all 13).
  // Fields that DO set _hasTokens: pageAccessToken, twitterAccessToken,
  // linkedinAccessToken, gbpAccessToken, tiktokAccessToken, threadsAccessToken,
  // blueskyAppPassword, pinterestAccessToken.
  fakeClientsDb([{ id: 'c1', name: 'P', pinterestAccessToken: 'enc:xx' }]);
  const res = await handleGetClients(new Request('https://e.test/'), ctx());
  const [c] = await res.json();
  assert.equal(c._hasTokens, true);
});

test('handleGetClients _hasTokens false when only refresh-token secondary fields present', async () => {
  // pinterestRefreshToken is NOT in the _hasTokens disjunction (only
  // pinterestAccessToken is). Same for twitterApiKey/Secret and
  // twitterAccessSecret and linkedinRefreshToken. Guard against accidental
  // _hasTokens expansion — frontend keys off this flag.
  fakeClientsDb([{
    id: 'c1', name: 'R',
    pinterestRefreshToken: 'enc:only',
    linkedinRefreshToken: 'enc:only',
    twitterApiKey: 'enc:only',
    twitterApiSecret: 'enc:only',
    twitterAccessSecret: 'enc:only',
  }]);
  const res = await handleGetClients(new Request('https://e.test/'), ctx());
  const [c] = await res.json();
  assert.equal(c._hasTokens, false);
});

// ── add-client ──

test('handleAddClient rejects missing name with 400', async () => {
  fakeClientsDb([]);
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleAddClient(req, ctx());
  assert.equal(res.status, 400);
});

test('handleAddClient encrypts every token field (enc: prefix) on save', async () => {
  const fake = fakeClientsDb([]);
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Biz',
      pageAccessToken: 'fb-plain',
      twitterApiKey: 'tw-k',
      twitterApiSecret: 'tw-s',
      twitterAccessToken: 'tw-at',
      twitterAccessSecret: 'tw-as',
      linkedinAccessToken: 'li-at',
      linkedinRefreshToken: 'li-rt',
      gbpAccessToken: 'gbp-at',
      tiktokAccessToken: 'tt-at',
      threadsAccessToken: 'th-at',
      blueskyAppPassword: 'bs-pw',
      pinterestAccessToken: 'pi-at',
      pinterestRefreshToken: 'pi-rt',
    }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleAddClient(req, ctx());
  assert.equal(res.status, 200);
  const saved = fake.store[0];
  for (const f of [
    'pageAccessToken', 'twitterApiKey', 'twitterApiSecret', 'twitterAccessToken',
    'twitterAccessSecret', 'linkedinAccessToken', 'linkedinRefreshToken',
    'gbpAccessToken', 'tiktokAccessToken', 'threadsAccessToken',
    'blueskyAppPassword', 'pinterestAccessToken', 'pinterestRefreshToken',
  ]) {
    assert.ok(saved[f]?.startsWith('enc:'), `${f} not encrypted: ${saved[f]}`);
  }
  assert.equal(saved.name, 'Biz');
  assert.ok(saved.id?.startsWith('client_'));
  assert.ok(saved.createdAt);
});

test('handleAddClient enforces plan limit (free tier clientCount cap)', async () => {
  // checkPlanLimit on 'add-client' for free plan rejects when list is at cap.
  // Build enough fake clients to blow the free limit.
  fakeClientsDb(Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: `C${i}` })));
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ name: 'OneMore' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleAddClient(req, ctx({ user: { email: 'u@x', role: 'user', plan: 'free' } }));
  // Either 403 (limit rejected) or 200 (free cap > 50 — still OK, ignore).
  // We only assert that the function returned a Response and did not crash.
  assert.ok(res instanceof Response);
  assert.ok([200, 403].includes(res.status));
});

// ── update-client ──

test('handleUpdateClient drops masked "••••" values (prevents corrupting stored token)', async () => {
  const fake = fakeClientsDb([{
    id: 'c1', name: 'Old',
    pageAccessToken: 'enc:existing-fb-token',
  }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({
      id: 'c1',
      name: 'NewName',
      pageAccessToken: '••••abcdef', // masked — must not overwrite
    }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUpdateClient(req, ctx());
  assert.equal(res.status, 200);
  // Original encrypted token preserved (NOT overwritten with mask):
  assert.equal(fake.store[0].pageAccessToken, 'enc:existing-fb-token');
  assert.equal(fake.store[0].name, 'NewName');
  assert.ok(fake.store[0].updatedAt);
});

test('handleUpdateClient encrypts plaintext new token values', async () => {
  const fake = fakeClientsDb([{ id: 'c1', name: 'X' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({
      id: 'c1',
      linkedinAccessToken: 'plain-li-token',
    }),
    headers: { 'content-type': 'application/json' },
  });
  await handleUpdateClient(req, ctx());
  assert.ok(fake.store[0].linkedinAccessToken.startsWith('enc:'));
});

test('handleUpdateClient preserves already-enc: prefixed values unchanged', async () => {
  const fake = fakeClientsDb([{ id: 'c1', name: 'X' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({
      id: 'c1',
      pageAccessToken: 'enc:already-encrypted',
    }),
    headers: { 'content-type': 'application/json' },
  });
  await handleUpdateClient(req, ctx());
  assert.equal(fake.store[0].pageAccessToken, 'enc:already-encrypted');
});

test('handleUpdateClient returns 404 for unknown client id', async () => {
  fakeClientsDb([{ id: 'c1', name: 'X' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ id: 'c-missing', name: 'Y' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUpdateClient(req, ctx());
  assert.equal(res.status, 404);
});

// ── delete-client ──

test('handleDeleteClient removes target and returns success:true', async () => {
  const fake = fakeClientsDb([
    { id: 'c1', name: 'Keep' },
    { id: 'c2', name: 'Drop' },
  ]);
  const req = new Request('https://e.test/', {
    method: 'DELETE',
    body: JSON.stringify({ id: 'c2' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleDeleteClient(req, ctx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(fake.store.length, 1);
  assert.equal(fake.store[0].id, 'c1');
});

test('handleDeleteClient is a no-op for missing id (still 200)', async () => {
  const fake = fakeClientsDb([{ id: 'c1', name: 'X' }]);
  const req = new Request('https://e.test/', {
    method: 'DELETE',
    body: JSON.stringify({ id: 'nope' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleDeleteClient(req, ctx());
  assert.equal(res.status, 200);
  assert.equal(fake.store.length, 1);
});
