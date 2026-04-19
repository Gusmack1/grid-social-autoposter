// admin-analytics.test.mjs — smoke tests for lib/admin/analytics.mjs
// `export-analytics` action. Run via: node --test .../admin-analytics.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import { handleExportAnalytics } from '../admin/analytics.mjs';

function fakeDb({ clients, posts }) {
  db.getClients = async () => clients;
  db.getPosts = async (cid) => posts[cid] || [];
}

test('returns 400 when clientId missing', async () => {
  fakeDb({ clients: [], posts: {} });
  const ctx = { user: {}, url: new URL('https://e.test/?action=export-analytics'), clientId: null, userId: 'u' };
  const res = await handleExportAnalytics(new Request('https://e.test/'), ctx);
  assert.equal(res.status, 400);
});

test('computes success rate, platformBreakdown, and postsByDay', async () => {
  const published = new Date().toISOString();
  const posts = {
    c1: [
      { id: 'p1', status: 'published', publishedAt: published, platforms: ['facebook'], results: { facebook: { success: true } }, caption: 'a' },
      { id: 'p2', status: 'published', publishedAt: published, platforms: ['facebook', 'instagram'], results: { facebook: { success: false }, instagram: { success: true } }, caption: 'b' },
      { id: 'p3', status: 'queued' },
      { id: 'p4', status: 'failed' },
    ],
  };
  fakeDb({ clients: [{ id: 'c1', name: 'Alpha' }], posts });
  const ctx = {
    user: {}, url: new URL('https://e.test/?action=export-analytics&range=30'), clientId: 'c1', userId: 'u',
  };
  const res = await handleExportAnalytics(new Request('https://e.test/'), ctx);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.clientName, 'Alpha');
  assert.equal(body.range, 30);
  assert.equal(body.summary.totalPublished, 2);
  assert.equal(body.summary.queued, 1);
  assert.equal(body.summary.failed, 1);
  // p1 fb.success, p2 instagram.success → both published have a success → 100%
  assert.equal(body.summary.successRate, 100);
  assert.equal(body.platformBreakdown.facebook.success, 1);
  assert.equal(body.platformBreakdown.facebook.failed, 1);
  assert.equal(body.platformBreakdown.instagram.success, 1);
  assert.equal(Array.isArray(body.recentPosts), true);
});

test('range defaults to 30 when missing', async () => {
  fakeDb({ clients: [], posts: { c1: [] } });
  const ctx = { user: {}, url: new URL('https://e.test/?action=export-analytics'), clientId: 'c1', userId: 'u' };
  const res = await handleExportAnalytics(new Request('https://e.test/'), ctx);
  const body = await res.json();
  assert.equal(body.range, 30);
});
