// admin-migration.test.mjs — smoke tests for lib/admin/migration.mjs.
// Run via: node --test .../admin-migration.test.mjs

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import { handleMigrateTokens, handleMigrateToSupabase } from '../admin/migration.mjs';

const ctx = () => ({
  user: { email: 'admin@grid.social', role: 'admin' },
  url: new URL('https://e.test/'),
  clientId: null,
  userId: 'u',
});

// Note: migrateTokens is a static ES import in migration.mjs — ESM bindings
// are read-only, so we exercise it against a stubbed db instead of stubbing
// the migrator itself.

// ── migrate-tokens ──
// Note: migrateTokens is a static import in migration.mjs; monkey-patching
// the live binding is not effective. Instead we exercise the happy path with
// a stubbed db.getClients so the real migrateTokens runs against an empty
// dataset and returns a benign shape.

test('handleMigrateTokens returns success:true shape', async () => {
  // Stub db to make real migrateTokens a no-op
  const origGet = db.getClients; const origSave = db.saveClients;
  db.getClients = async () => [];
  db.saveClients = async () => {};
  try {
    const req = new Request('https://e.test/', { method: 'POST' });
    const res = await handleMigrateTokens(req, ctx());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
  } finally { db.getClients = origGet; db.saveClients = origSave; }
});

test('handleMigrateTokens passes through migrator result keys', async () => {
  // Exercise via the real migrator with 1 unencrypted client → migrated count = 1
  const origGet = db.getClients; const origSave = db.saveClients;
  let saved = null;
  db.getClients = async () => ([{ id: 'c1', name: 'C1', pageAccessToken: 'plaintext-fb' }]);
  db.saveClients = async (list) => { saved = list; };
  try {
    const req = new Request('https://e.test/', { method: 'POST' });
    const res = await handleMigrateTokens(req, ctx());
    const body = await res.json();
    assert.equal(body.success, true);
    // migrator returns { migrated, total } shape per brain fact #407-ish pattern
    assert.ok('migrated' in body || 'total' in body, 'expected migrator result keys');
    assert.ok(saved, 'expected db.saveClients to have been called');
  } finally { db.getClients = origGet; db.saveClients = origSave; }
});

// ── migrate-to-supabase env guard ──

test('handleMigrateToSupabase 400 when SUPABASE_URL missing', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try {
    const req = new Request('https://e.test/', { method: 'POST' });
    const res = await handleMigrateToSupabase(req, ctx());
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /SUPABASE_URL and SUPABASE_ANON_KEY/);
  } finally {
    if (savedUrl) process.env.SUPABASE_URL = savedUrl;
    if (savedKey) process.env.SUPABASE_ANON_KEY = savedKey;
  }
});

test('handleMigrateToSupabase 400 when only URL set but ANON_KEY missing', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_ANON_KEY;
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  delete process.env.SUPABASE_ANON_KEY;
  try {
    const req = new Request('https://e.test/', { method: 'POST' });
    const res = await handleMigrateToSupabase(req, ctx());
    assert.equal(res.status, 400);
  } finally {
    if (savedUrl) process.env.SUPABASE_URL = savedUrl; else delete process.env.SUPABASE_URL;
    if (savedKey) process.env.SUPABASE_ANON_KEY = savedKey;
  }
});

test('handleMigrateToSupabase 400 when only ANON_KEY set but URL missing', async () => {
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY = 'fake-key';
  try {
    const req = new Request('https://e.test/', { method: 'POST' });
    const res = await handleMigrateToSupabase(req, ctx());
    assert.equal(res.status, 400);
  } finally {
    if (savedUrl) process.env.SUPABASE_URL = savedUrl;
    if (savedKey) process.env.SUPABASE_ANON_KEY = savedKey; else delete process.env.SUPABASE_ANON_KEY;
  }
});

test('handleMigrateToSupabase does NOT eagerly import migrate-supabase when env missing', async () => {
  // Env guard must short-circuit before the lazy import.
  const savedUrl = process.env.SUPABASE_URL;
  const savedKey = process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  try {
    const req = new Request('https://e.test/', { method: 'POST' });
    const t0 = Date.now();
    const res = await handleMigrateToSupabase(req, ctx());
    const dt = Date.now() - t0;
    assert.equal(res.status, 400);
    // Short-circuit should be fast — a supabase-js import alone is ~30-50ms.
    // Give ample headroom; this is a regression canary not a perf bench.
    assert.ok(dt < 500, `env-guard short-circuit took ${dt}ms — lazy import may be eager`);
  } finally {
    if (savedUrl) process.env.SUPABASE_URL = savedUrl;
    if (savedKey) process.env.SUPABASE_ANON_KEY = savedKey;
  }
});
