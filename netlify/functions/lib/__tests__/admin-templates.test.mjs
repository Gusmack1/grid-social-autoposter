// admin-templates.test.mjs — smoke tests for lib/admin/templates.mjs.
// Run via: node --test .../admin-templates.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../db/index.mjs';
import {
  handleGetTemplates,
  handleSaveTemplate,
  handleDeleteTemplate,
} from '../admin/templates.mjs';

const ctx = (clientId = null) => ({
  user: { email: 'me@grid.social' },
  url: new URL('https://e.test/'),
  clientId,
  userId: 'u',
});

test('handleGetTemplates passes clientId through', async () => {
  let seen;
  db.getTemplates = async (cid) => { seen = cid; return [{ id: 't1', name: 'T1' }]; };
  const res = await handleGetTemplates(new Request('https://e.test/'), ctx('c1'));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(seen, 'c1');
  assert.equal(body[0].id, 't1');
});

test('handleSaveTemplate validates name and stamps createdBy', async () => {
  let saved;
  db.saveTemplate = async (t) => { saved = t; };
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({ name: 'My template', caption: 'hi' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSaveTemplate(req, ctx(null));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(saved.name, 'My template');
  assert.equal(saved.createdBy, 'me@grid.social');
  assert.ok(saved.id.startsWith('tpl_'));
});

test('handleSaveTemplate rejects missing name with 400', async () => {
  db.saveTemplate = async () => { throw new Error('should not reach db'); };
  const req = new Request('https://e.test/', {
    method: 'POST',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleSaveTemplate(req, ctx(null));
  assert.equal(res.status, 400);
});

test('handleDeleteTemplate honours 2-arg deleteTemplate arity', async () => {
  const calls = [];
  const twoArg = async (id, cid) => { calls.push([id, cid]); };
  db.deleteTemplate = twoArg;
  assert.equal(db.deleteTemplate.length, 2);
  const req = new Request('https://e.test/', {
    method: 'DELETE',
    body: JSON.stringify({ templateId: 't1' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleDeleteTemplate(req, ctx('c1'));
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [['t1', 'c1']]);
});

test('handleDeleteTemplate falls back to 1-arg deleteTemplate', async () => {
  const calls = [];
  const oneArg = async (id) => { calls.push([id]); };
  db.deleteTemplate = oneArg;
  assert.equal(db.deleteTemplate.length, 1);
  const req = new Request('https://e.test/', {
    method: 'DELETE',
    body: JSON.stringify({ templateId: 't1' }),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleDeleteTemplate(req, ctx('c1'));
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [['t1']]);
});

test('handleDeleteTemplate rejects missing templateId', async () => {
  db.deleteTemplate = async () => { throw new Error('should not reach db'); };
  const req = new Request('https://e.test/', {
    method: 'DELETE',
    body: JSON.stringify({}),
    headers: { 'content-type': 'application/json' },
  });
  const res = await handleDeleteTemplate(req, ctx(null));
  assert.equal(res.status, 400);
});
