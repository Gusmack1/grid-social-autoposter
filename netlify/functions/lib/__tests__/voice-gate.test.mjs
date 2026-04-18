// voice-gate.test.mjs — unit tests for the pre-publish voice gate (task #48).
// Run via: node --test netlify/functions/lib/__tests__/voice-gate.test.mjs
//
// Fixtures:
//   KNOWN-BAD — lifted from the generator live-pass audit + grid-social-post-voice.md §7 Before examples.
//   KNOWN-GOOD — grid-social-post-voice.md §7 After examples.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkVoice } from '../voice-gate.mjs';

// ── KNOWN-BAD fixtures (must fail) ───────────────────────────────────────────

const BAD_FIXTURES = [
  {
    name: 'café FB — passionate / got-you-covered / elevate / check-it-out',
    platform: 'facebook',
    caption:
      "At Cosy Corner Café, we're passionate about crafting the perfect coffee experience for our community. Whether you're looking for a morning pick-me-up or a cosy afternoon treat, we've got you covered. Pop in and elevate your day with our seasonal specials. Check it out! #Coffee #CafeLife #CommunityFirst",
    expectedFailureSubstrings: ['banned-phrase:passionate-about', 'banned-phrase:got-you-covered'],
  },
  {
    name: 'plumber IG — tri-colon / game-changer / lets-dive-in / hashtag salad',
    platform: 'instagram',
    caption:
      "Fast. Reliable. Affordable. That's what we stand for — a game-changing approach to your plumbing needs. Let's dive in to a better home experience. #Plumbing #Tradesman #Manchester #SmallBusiness #UKPlumber #LocalHero",
    expectedFailureSubstrings: ['banned-phrase:game-changer', 'banned-phrase:lets-dive-in'],
  },
  {
    name: 'boutique FB — excited-to-announce / transforming / dont-miss-out / proud-to-serve / elevate',
    platform: 'facebook',
    caption:
      "Elevate your wardrobe with our stunning new autumn/winter collection, now in store! We're excited to announce that this season's looks are here to transform the way you dress. Don't miss out — come in and treat yourself today. We're proud to serve the Manchester community! #Fashion #BoutiqueLife #NewCollection",
    expectedFailureSubstrings: [
      'banned-phrase:elevate-your',
      'banned-phrase:excited-to-announce',
      'banned-phrase:dont-miss-out',
      'banned-phrase:proud-to-serve',
    ],
  },
];

// ── KNOWN-GOOD fixtures (must pass) ──────────────────────────────────────────

const GOOD_FIXTURES = [
  {
    // §7 After — Café / Facebook (59 words, specific, no banned phrases).
    name: 'café FB — pumpkin spice specific',
    platform: 'facebook',
    caption:
      "The new pumpkin spice latte went on the board this morning and we've already run out twice. Back on tomorrow from 8am. Worth setting an alarm for? The first batch flies out — regulars say it beats last year's recipe. Drop in early if you fancy grabbing one before the school run, and bring a flask for the walk home.",
  },
  {
    // §7 After — Plumber / Facebook (55 words). Tweaked to add no abstraction words.
    name: 'plumber FB — Didsbury drain specific',
    platform: 'facebook',
    caption:
      "A customer in Didsbury had the same slow drain for two years before calling us out. Fixed in 40 minutes, part cost £6. Sometimes it really is that simple. Worth booking a check before winter — the pipes get brittle when the first frost hits, and a blocked run over Christmas is nobody's idea of festive fun.",
  },
];

// ── TESTS ───────────────────────────────────────────────────────────────────

for (const fx of BAD_FIXTURES) {
  test(`KNOWN-BAD rejects: ${fx.name}`, () => {
    const result = checkVoice(fx.caption, fx.platform);
    assert.equal(result.pass, false, `expected pass=false, got ${JSON.stringify(result)}`);
    assert.ok(result.failures.length > 0, 'failures array must be non-empty');
    for (const needle of fx.expectedFailureSubstrings) {
      assert.ok(
        result.failures.some(f => f.includes(needle)),
        `expected failures to contain "${needle}", got: ${result.failures.join(', ')}`,
      );
    }
  });
}

for (const fx of GOOD_FIXTURES) {
  test(`KNOWN-GOOD accepts: ${fx.name}`, () => {
    const result = checkVoice(fx.caption, fx.platform);
    assert.equal(
      result.pass,
      true,
      `expected pass=true, got failures=${result.failures.join(', ')}`,
    );
    assert.equal(result.score, 5, `expected score=5, got ${result.score}`);
  });
}

test('fail-closed on empty caption', () => {
  const r = checkVoice('', 'facebook');
  assert.equal(r.pass, false);
  assert.deepEqual(r.failures, ['empty-caption']);
});

test('fail-closed on unknown platform', () => {
  const r = checkVoice('Some 40-word caption here that has enough words to satisfy the length rule and avoids abstraction openers by mentioning Tuesday the 14th at 9am specifically, with enough concrete detail.', 'tiktok');
  assert.equal(r.pass, false);
  assert.ok(r.failures.some(f => f.startsWith('unknown-platform')));
});

test('hashtag overflow on instagram', () => {
  const cap =
    "The new cord trousers just landed at the shop on Tuesday — tobacco brown, wide leg, proper quality, three left in a size 12, grab one today.\n\n#cord #trousers #autumn #style #shop #manchester";
  const r = checkVoice(cap, 'instagram');
  assert.equal(r.pass, false);
  assert.ok(r.failures.some(f => f.startsWith('hashtag-count:')));
});
