// admin-approvals.test.mjs — smoke tests for lib/admin/approvals.mjs.
// Run via: node --test .../admin-approvals.test.mjs

// generateApprovalLink signs a JWT — needs a secret. Set one before import.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-approvals';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import {
  handleSetApprovalMode,
  handleSetApprovalStatus,
  handleGenerateApprovalLink,
} from '../admin/approvals.mjs';

const ctx = (clientId = 'c1', email = 'admin@grid.social') => ({
  user: { email },
  url: new URL('https://grid.example/'),
  clientId,
  userId: 'u',
});

function fakeClientsDb(initial = []) {
  let store = JSON.parse(JSON.stringify(initial));
  db.getClients = async () => JSON.parse(JSON.stringify(store));
  db.saveClients = async (list) => { store = list; };
  return { get: () => store };
}

function fakePostsDb(initial = {}) {
  const store = JSON.parse(JSON.stringify(initial));
  db.getPosts = async (cid) => store[cid] ? JSON.parse(JSON.stringify(store[cid])) : [];
  db.savePosts = async (cid, list) => { store[cid] = list; };
  return store;
}

// ── set-approval-mode ──

test('handleSetApprovalMode accepts auto/manual/passive', async () => {
  for (const mode of ['auto', 'manual', 'passive']) {
    const fake = fakeClientsDb([{ id: 'c1', name: 'C' }]);
    const req = new Request('https://e.test/', {
      method: 'PUT',
      body: JSON.stringify({ clientId: 'c1', approvalMode: mode }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await handleSetApprovalMode(req, ctx());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.approvalMode, mode);
    assert.equal(fake.get()[0].approvalMode, mode);
  }
});

test('handleSetApprovalMode defaults passiveApprovalHours to 72', async () => {
  const fake = fakeClientsDb([{ id: 'c1', name: 'C' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ clientId: 'c1', approvalMode: 'passive' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalMode(req, ctx());
  assert.equal(res.status, 200);
  assert.equal(fake.get()[0].passiveApprovalHours, 72);
});

test('handleSetApprovalMode honours explicit passiveApprovalHours', async () => {
  const fake = fakeClientsDb([{ id: 'c1', name: 'C' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ clientId: 'c1', approvalMode: 'passive', passiveApprovalHours: 24 }),
    headers: { 'content-type': 'application/json' },
  });
  await handleSetApprovalMode(req, ctx());
  assert.equal(fake.get()[0].passiveApprovalHours, 24);
});

test('handleSetApprovalMode rejects invalid mode', async () => {
  fakeClientsDb([{ id: 'c1' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ clientId: 'c1', approvalMode: 'yolo' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalMode(req, ctx());
  assert.equal(res.status, 400);
});

test('handleSetApprovalMode 400 on missing args', async () => {
  fakeClientsDb([]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalMode(req, ctx());
  assert.equal(res.status, 400);
});

test('handleSetApprovalMode 404 on unknown client', async () => {
  fakeClientsDb([{ id: 'other' }]);
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ clientId: 'c1', approvalMode: 'auto' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalMode(req, ctx());
  assert.equal(res.status, 404);
});

// ── set-approval-status ──

test('handleSetApprovalStatus stamps approvedBy + approvedAt on "approved"', async () => {
  const store = fakePostsDb({ c1: [{ id: 'p1', approvalStatus: 'pending' }] });
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ postId: 'p1', approvalStatus: 'approved' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalStatus(req, ctx('c1', 'reviewer@grid.social'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.post.approvalStatus, 'approved');
  assert.equal(body.post.approvedBy, 'reviewer@grid.social');
  assert.ok(body.post.approvedAt);
  assert.equal(store.c1[0].approvedBy, 'reviewer@grid.social');
});

test('handleSetApprovalStatus does NOT stamp approvedBy on "pending" / "changes_requested"', async () => {
  fakePostsDb({ c1: [{ id: 'p1', approvalStatus: 'approved', approvedBy: 'old', approvedAt: 'old' }] });
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ postId: 'p1', approvalStatus: 'changes_requested' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalStatus(req, ctx('c1'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.post.approvalStatus, 'changes_requested');
  // approvedBy/approvedAt were left alone — side-effect only on 'approved'
  assert.equal(body.post.approvedBy, 'old');
});

test('handleSetApprovalStatus rejects invalid enum', async () => {
  fakePostsDb({ c1: [{ id: 'p1' }] });
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ postId: 'p1', approvalStatus: 'maybe' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalStatus(req, ctx('c1'));
  assert.equal(res.status, 400);
});

test('handleSetApprovalStatus 400 on missing clientId', async () => {
  fakePostsDb({ c1: [] });
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ postId: 'p1', approvalStatus: 'approved' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalStatus(req, ctx(null));
  assert.equal(res.status, 400);
});

test('handleSetApprovalStatus 404 on unknown post', async () => {
  fakePostsDb({ c1: [] });
  const req = new Request('https://e.test/', {
    method: 'PUT',
    body: JSON.stringify({ postId: 'nope', approvalStatus: 'approved' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSetApprovalStatus(req, ctx('c1'));
  assert.equal(res.status, 404);
});

// ── generate-approval-link ──

test('handleGenerateApprovalLink returns token + url shape', async () => {
  fakeClientsDb([{ id: 'c1', name: 'Acme Ltd' }]);
  const req = new Request('https://grid.example/admin?action=generate-approval-link', {
    method: 'POST',
    body: JSON.stringify({ clientId: 'c1' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleGenerateApprovalLink(req, ctx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.token, 'expected token');
  assert.ok(body.url.includes('/approve?token='), 'expected /approve?token= url');
  assert.ok(body.expiresIn);
});

test('handleGenerateApprovalLink 400 on missing clientId', async () => {
  fakeClientsDb([]);
  const req = new Request('https://grid.example/', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleGenerateApprovalLink(req, ctx());
  assert.equal(res.status, 400);
});

test('handleGenerateApprovalLink 404 on unknown client', async () => {
  fakeClientsDb([{ id: 'other' }]);
  const req = new Request('https://grid.example/', {
    method: 'POST',
    body: JSON.stringify({ clientId: 'missing' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleGenerateApprovalLink(req, ctx());
  assert.equal(res.status, 404);
});
