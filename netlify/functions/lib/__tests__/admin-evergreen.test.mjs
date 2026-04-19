// admin-evergreen.test.mjs — smoke tests for lib/admin/evergreen.mjs.
// Run via: node --test .../admin-evergreen.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import {
  handleMarkEvergreen,
  handleUnmarkEvergreen,
  handleGetEvergreen,
  handleRecyclePost,
} from '../admin/evergreen.mjs';

const ctx = (clientId = 'c1') => ({
  user: { email: 'me@grid.social' },
  url: new URL('https://e.test/'),
  clientId,
  userId: 'u',
});

function fakePostsDb(initial) {
  const store = { ...initial };
  db.getPosts = async (cid) => store[cid] ? JSON.parse(JSON.stringify(store[cid])) : [];
  db.savePosts = async (cid, list) => { store[cid] = list; };
  return store;
}

test('handleMarkEvergreen flips flag', async () => {
  const store = fakePostsDb({ c1: [{ id: 'p1', caption: 'x' }] });
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ postId: 'p1' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleMarkEvergreen(req, ctx('c1'));
  assert.equal(res.status, 200);
  assert.equal(store.c1[0].evergreen, true);
});

test('handleMarkEvergreen 404 on unknown post', async () => {
  fakePostsDb({ c1: [] });
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ postId: 'nope' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleMarkEvergreen(req, ctx('c1'));
  assert.equal(res.status, 404);
});

test('handleUnmarkEvergreen flips flag off', async () => {
  const store = fakePostsDb({ c1: [{ id: 'p1', evergreen: true }] });
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ postId: 'p1' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleUnmarkEvergreen(req, ctx('c1'));
  assert.equal(res.status, 200);
  assert.equal(store.c1[0].evergreen, false);
});

test('handleGetEvergreen returns only flagged posts', async () => {
  fakePostsDb({ c1: [
    { id: 'p1', evergreen: true },
    { id: 'p2', evergreen: false },
    { id: 'p3' },
  ] });
  const res = await handleGetEvergreen(new Request('https://e.test/'), ctx('c1'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].id, 'p1');
});

test('handleRecyclePost preserves caption/media/platforms and resets to scheduled', async () => {
  const store = fakePostsDb({ c1: [
    { id: 'p1', caption: 'hello', imageUrl: 'img', imageUrls: ['img2'], videoUrl: null,
      platforms: ['facebook', 'instagram'], postType: 'feed', approvalStatus: 'approved',
      approvalMode: 'auto', evergreen: true, status: 'published' },
  ] });
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ postId: 'p1', scheduledFor: '2026-05-01T10:00:00Z' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleRecyclePost(req, ctx('c1'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.post.caption, 'hello');
  assert.equal(body.post.imageUrl, 'img');
  assert.deepEqual(body.post.platforms, ['facebook', 'instagram']);
  assert.equal(body.post.status, 'scheduled');
  assert.equal(body.post.scheduledFor, '2026-05-01T10:00:00Z');
  assert.notEqual(body.post.id, 'p1');
  assert.equal(store.c1.length, 2);
});

test('handleRecyclePost rejects missing args', async () => {
  fakePostsDb({ c1: [] });
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleRecyclePost(req, ctx('c1'));
  assert.equal(res.status, 400);
});
