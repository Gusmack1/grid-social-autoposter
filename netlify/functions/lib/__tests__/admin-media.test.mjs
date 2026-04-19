// admin-media.test.mjs — smoke tests for lib/admin/media.mjs.
// Run via: node --test .../admin-media.test.mjs

// r2.mjs's uploadMedia reads R2 env at call time; we stub the module export
// directly below so no real env is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleUploadImage } from '../admin/media.mjs';

const ctx = () => ({
  user: { email: 'admin@grid.social', role: 'admin' },
  url: new URL('https://e.test/'),
  clientId: null,
  userId: 'u',
});

// Note: r2.uploadMedia is a static ES import inside media.mjs, and ESM module
// bindings are read-only — we can't monkey-patch. Instead we exercise paths
// that do NOT reach uploadMedia (413 oversize, 400 validation, bad JSON) plus
// one boundary-crossing test that lets the real uploadMedia run with no
// R2/GitHub env and asserts the 500 pass-through (i.e. size-gate did pass).

test('handleUploadImage rejects invalid JSON body with 413', async () => {
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: 'not-json-at-all',
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUploadImage(req, ctx());
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.match(body.error, /smaller image|too large|invalid JSON/i);
});

test('handleUploadImage 400 on missing filename', async () => {
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ content: 'abc' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUploadImage(req, ctx());
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /filename and content required/);
});

test('handleUploadImage 400 on missing content', async () => {
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ filename: 'x.png' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUploadImage(req, ctx());
  assert.equal(res.status, 400);
});

test('handleUploadImage rejects oversize base64 content (>6MB) with 413', async () => {
  const big = 'a'.repeat(6 * 1024 * 1024 + 1);
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ filename: 'big.png', content: big }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUploadImage(req, ctx());
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.match(body.error, /Image too large/);
  // estSize formatting: length * 0.75 / 1024, rounded
  assert.match(body.error, /\d+KB/);
});

test('handleUploadImage size estimate math matches length*0.75/1024 rounded', async () => {
  // Exactly 6MB + 1 → estSize = round((6*1024*1024+1) * 0.75 / 1024) ≈ 4608KB
  const big = 'x'.repeat(6 * 1024 * 1024 + 1);
  const expected = Math.round(big.length * 0.75 / 1024);
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ filename: 'big.png', content: big }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUploadImage(req, ctx());
  const body = await res.json();
  assert.ok(body.error.includes(`${expected}KB`), `expected ${expected}KB in error, got: ${body.error}`);
});

test('handleUploadImage accepts exactly-at-limit content (6MB) without oversize rejection', async () => {
  // length === 6*1024*1024 is not > 6*1024*1024, so size check passes.
  // With no R2/GitHub env set, uploadMedia throws → serverError(500).
  // Contract we care about here: size-gate does NOT fire → status !== 413.
  const savedGh = process.env.GITHUB_TOKEN;
  const savedR2 = process.env.R2_ACCESS_KEY_ID;
  delete process.env.GITHUB_TOKEN;
  delete process.env.R2_ACCESS_KEY_ID;
  try {
    const atLimit = 'y'.repeat(6 * 1024 * 1024);
    const req = new Request('https://e.test/', {
      method: 'POST',
      body: JSON.stringify({ filename: 'ok.png', content: atLimit }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await handleUploadImage(req, ctx());
    assert.notEqual(res.status, 413, 'size-gate should not fire at exactly 6MB');
    // Accept either 500 (real uploadMedia threw) or 200 (unlikely in test env).
    assert.ok([200, 500].includes(res.status), `got unexpected status ${res.status}`);
  } finally {
    if (savedGh) process.env.GITHUB_TOKEN = savedGh;
    if (savedR2) process.env.R2_ACCESS_KEY_ID = savedR2;
  }
});
