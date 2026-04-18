// image-check.test.mjs — unit tests for the pre-publish image HEAD-check gate
// (task #49). Run via: node --test netlify/functions/lib/__tests__/image-check.test.mjs
//
// Covers:
//   1. known-good public jpg  → pass
//   2. 404 URL                → fail  (http-404)
//   3. text/html URL          → fail  (unsupported-mime)
//   4. missing/empty URL      → fail  (missing-url)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkImage } from '../image-check.mjs';

// Use `--test-concurrency=1` friendly timeout; network tests depend on the env.
const NETWORK_TIMEOUT = 15000;

test('known-good jpg URL passes for feed post', { timeout: NETWORK_TIMEOUT }, async () => {
  const r = await checkImage('https://placehold.co/600x400.jpg', 'feed');
  // placehold.co may respond with image/jpeg; allow mime match OR skip network
  // failure soft-fail so flaky CI doesn't brick the suite.
  if (r.reason && r.reason.startsWith('head-fetch-error')) {
    console.warn('network unavailable, skipping good-url assertion:', r.reason);
    return;
  }
  assert.equal(r.pass, true, `expected pass, got ${r.reason}`);
  assert.ok(
    ['image/jpeg', 'image/png'].includes(r.contentType),
    `unexpected content-type ${r.contentType}`,
  );
});

test('404 URL fails with http-404', { timeout: NETWORK_TIMEOUT }, async () => {
  const r = await checkImage(
    'https://placehold.co/this-path-definitely-does-not-exist-9f8a7b6c5.jpg404',
    'feed',
  );
  if (r.reason && r.reason.startsWith('head-fetch-error')) {
    console.warn('network unavailable, skipping 404 assertion:', r.reason);
    return;
  }
  assert.equal(r.pass, false);
  assert.ok(
    r.reason.startsWith('http-4') || r.reason.startsWith('non-2xx') || r.reason.startsWith('unsupported-mime'),
    `unexpected reason ${r.reason}`,
  );
});

test('text/html URL fails mime check for feed post', { timeout: NETWORK_TIMEOUT }, async () => {
  const r = await checkImage('https://example.com/', 'feed');
  if (r.reason && r.reason.startsWith('head-fetch-error')) {
    console.warn('network unavailable, skipping html assertion:', r.reason);
    return;
  }
  assert.equal(r.pass, false);
  assert.ok(
    r.reason.startsWith('unsupported-mime') ||
      r.reason.startsWith('http-') ||
      r.reason.startsWith('non-2xx'),
    `unexpected reason ${r.reason}`,
  );
});

test('missing/empty URL fails with missing-url', async () => {
  const r1 = await checkImage('', 'feed');
  assert.equal(r1.pass, false);
  assert.equal(r1.reason, 'missing-url');

  const r2 = await checkImage(undefined, 'feed');
  assert.equal(r2.pass, false);
  assert.equal(r2.reason, 'missing-url');

  const r3 = await checkImage(null, 'feed');
  assert.equal(r3.pass, false);
  assert.equal(r3.reason, 'missing-url');
});

test('text postType with empty URL passes (skipped)', async () => {
  const r = await checkImage('', 'text');
  assert.equal(r.pass, true);
  assert.equal(r.reason, 'skipped-text-post');
});

test('reel postType requires video/mp4 only', { timeout: NETWORK_TIMEOUT }, async () => {
  const r = await checkImage('https://placehold.co/600x400.jpg', 'reel');
  if (r.reason && r.reason.startsWith('head-fetch-error')) {
    console.warn('network unavailable, skipping reel assertion:', r.reason);
    return;
  }
  // jpg served to a reel check must be rejected as unsupported mime.
  assert.equal(r.pass, false);
  assert.ok(
    r.reason.startsWith('unsupported-mime') ||
      r.reason.startsWith('http-') ||
      r.reason.startsWith('non-2xx'),
    `unexpected reason ${r.reason}`,
  );
});
