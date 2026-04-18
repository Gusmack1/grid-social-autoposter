// voice-gate.mjs — fail-closed pre-publish voice rubric enforcement (task #48)
//
// Re-checks every caption against the Grid Social voice spec BEFORE any
// Meta Graph publish call. Regardless of source (generator / hand-written /
// import), if the caption trips any banned phrase or structural rule the
// publisher sets post.status = 'voice_rejected' and skips the network call.
//
// Deterministic: pure regex + counts. No LLM. Target < 5 ms per check.
// Fail-closed: unknown / ambiguous → pass=false.
//
// Spec source of truth:
//   /sessions/brave-eloquent-dijkstra/mnt/Claude Improved/grid-social-post-voice.md
//   §1 (25 banned phrases/structures) + §4 (length) + §8 (5-point rubric).

// ── BANNED PHRASES (§1 items 1–20) ──
// Built as an array of { id, pattern } so failure reasons name the rule that tripped.
const BANNED_PHRASES = [
  { id: 'lets-dive-in', pattern: /let'?s dive in|let'?s get into it/i },
  { id: 'elevate-your', pattern: /elevate your\b/i },
  { id: 'unlock', pattern: /\bunlock(ing)?\b(?! a (?:door|phone|bike|car))/i },
  { id: 'fast-paced-world', pattern: /in today'?s fast[- ]paced world/i },
  { id: 'game-changer', pattern: /game[- ]chang(er|ing)/i },
  { id: 'seamless', pattern: /\bseamless(ly)?\b/i },
  { id: 'end-of-the-day', pattern: /at the end of the day/i },
  { id: 'its-no-secret', pattern: /it'?s no secret/i },
  { id: 'look-no-further', pattern: /look no further/i },
  { id: 'check-it-out', pattern: /check it out!?/i },
  { id: 'excited-to-announce', pattern: /we'?re excited to announce/i },
  { id: 'dont-miss-out', pattern: /don'?t miss out/i },
  { id: 'next-level', pattern: /(take (?:your|it|things) .{0,40} to the next level|to the next level\b)/i },
  { id: 'passionate-about', pattern: /passionate about/i },
  { id: 'committed-to-excellence', pattern: /committed to (excellence|quality)/i },
  { id: 'transforming-the-way', pattern: /transform(ing)? the way/i },
  { id: 'one-stop-shop', pattern: /(your )?one[- ]stop shop/i },
  { id: 'got-you-covered', pattern: /we'?ve got you covered/i },
  { id: 'stay-tuned', pattern: /stay tuned\b/i },
  { id: 'proud-to-serve', pattern: /proud to serve\b/i },
];

// ── STRUCTURAL RULES (§1 items 21–25) ──

// Em-dash chain: 2+ em-dashes in one sentence (indicates "quality — convenience — value — you").
// Only flag if the em-dashes appear in a short span (≤ 80 chars) — avoids false positives on
// long legitimate parentheticals.
function hasEmDashChain(text) {
  // Match any window containing 2+ em-dashes with short word-groups between them.
  return /\w+\s*[—–]\s*\w+\s*[—–]\s*\w+/.test(text);
}

// Tri-colon rhythm: 3+ consecutive short full-stop-terminated fragments, e.g. "Fast. Reliable. Affordable."
// Fragment = 1–3 words, capitalised, terminated by `. `.
function hasTriColonRhythm(text) {
  // Find any three consecutive short fragments separated by ". "
  return /(?:^|[.!?]\s+)(?:[A-Z][a-z']{2,14}\.\s+){2,}[A-Z][a-z']{2,14}\./.test(text);
}

// Emoji detector — covers pictographic Unicode ranges.
// Using explicit property-escape to stay portable on Node 20.
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
function countEmojis(text) {
  const m = text.match(EMOJI_RE);
  return m ? m.length : 0;
}

// Hashtag detector — # followed by 1+ word chars.
const HASHTAG_RE = /#[A-Za-z0-9_]+/g;
function countHashtags(text) {
  const m = text.match(HASHTAG_RE);
  return m ? m.length : 0;
}

// Strip hashtags for word-counting (§4 — word count excludes hashtags).
function wordCountExcludingHashtags(text) {
  const stripped = text.replace(HASHTAG_RE, ' ').replace(/\s+/g, ' ').trim();
  if (!stripped) return 0;
  return stripped.split(/\s+/).length;
}

// First sentence of the caption — split on first `. `, `! `, `? ` or newline.
function firstSentence(text) {
  const t = text.trim();
  const m = t.match(/^[^.!?\n]+[.!?]?/);
  return (m ? m[0] : t).trim();
}

// §8 rubric item 5 — abstraction opener.
// Rationale: a strict reading of §8 ("first sentence does not contain 'we', 'your', …") would
// reject the spec's own §7 After-example ("…and we've already run out twice"). We therefore
// enforce the §5 universal rules ("Never open with We", "Never open with a question") on the
// OPENING of the first sentence (first 3 tokens after optional emoji/whitespace), plus a
// check for "our team"/"journey"/"solution"/"excellence" anywhere in the first sentence —
// those phrases are true abstractions the spec actually calls out.
const ABSTRACTION_PHRASES = /\b(our team|journey|solution|excellence)\b/i;
function opensWithAbstraction(firstSent) {
  const trimmed = firstSent.replace(/^[\s\p{Extended_Pictographic}]+/u, '');
  // "Never open with a question" (§5).
  if (trimmed.startsWith('?') || /^[^.!?]{0,80}\?/.test(trimmed) && /^(who|what|when|where|why|how|is|are|do|does|did|can|will|would|should|could|have|has)\b/i.test(trimmed)) {
    return { fail: true, why: 'opens-with-question' };
  }
  // First-3-tokens rule: "Never open with We" (§5).
  const firstTokens = trimmed.split(/\s+/).slice(0, 3).join(' ');
  if (/^we\b/i.test(firstTokens)) {
    return { fail: true, why: 'opens-with-we' };
  }
  if (ABSTRACTION_PHRASES.test(firstSent)) {
    const m = firstSent.match(ABSTRACTION_PHRASES);
    return { fail: true, why: `abstraction-phrase:${m[1].toLowerCase().replace(/\s+/g, '-')}` };
  }
  return { fail: false };
}

// ── PLATFORM LIMITS (§4) ──
const LIMITS = {
  facebook: { min: 40, sweetMax: 80, hardMax: 120, maxHashtags: 2, maxEmojis: 1 },
  instagram: { min: 20, sweetMax: 50, hardMax: 80, maxHashtags: 5, maxEmojis: 1 },
};

/**
 * checkVoice — run the full rubric against a caption.
 *
 * @param {string} caption   — raw caption string as it will be POSTed to Meta.
 * @param {string} platform  — 'facebook' | 'instagram'. Unknown → defaults to FB limits, BUT flags it.
 * @returns {{ pass: boolean, failures: string[], score: number }}
 *          failures: human-readable rule IDs that tripped; empty iff pass.
 *          score: 0–5 (one point per §8 rubric item passed).
 */
export function checkVoice(caption, platform) {
  const failures = [];

  // Fail-closed: empty / non-string → reject immediately.
  if (typeof caption !== 'string' || caption.trim().length === 0) {
    return { pass: false, failures: ['empty-caption'], score: 0 };
  }

  const plat = (platform || '').toLowerCase();
  const limits = LIMITS[plat];
  if (!limits) {
    // Unknown platform — fail-closed per task spec.
    failures.push(`unknown-platform:${platform}`);
  }
  const L = limits || LIMITS.facebook;

  // ── §8 #1 — banned phrases ──
  let phrasesPass = true;
  for (const { id, pattern } of BANNED_PHRASES) {
    if (pattern.test(caption)) {
      failures.push(`banned-phrase:${id}`);
      phrasesPass = false;
    }
  }
  // ── §1 #21 em-dash chain ──
  if (hasEmDashChain(caption)) {
    failures.push('em-dash-chain');
    phrasesPass = false;
  }
  // ── §1 #22 tri-colon rhythm ──
  if (hasTriColonRhythm(caption)) {
    failures.push('tri-colon-rhythm');
    phrasesPass = false;
  }

  // ── Emoji stuffing (§1 #24 — 3+ emojis; we lower bar to >1 per platform limit) ──
  const emojis = countEmojis(caption);
  if (emojis > L.maxEmojis) {
    failures.push(`emoji-count:${emojis}>${L.maxEmojis}`);
    phrasesPass = false;
  }

  // ── §8 #4 — hashtag count ──
  const hashtags = countHashtags(caption);
  let hashtagsPass = true;
  if (hashtags > L.maxHashtags) {
    failures.push(`hashtag-count:${hashtags}>${L.maxHashtags}`);
    hashtagsPass = false;
  }

  // ── §8 #3 — length (excluding hashtags) ──
  const words = wordCountExcludingHashtags(caption);
  let lengthPass = true;
  if (words > L.hardMax) {
    failures.push(`length:${words}>${L.hardMax}`);
    lengthPass = false;
  } else if (words < L.min) {
    // Under sweet-spot floor is treated as a rubric miss (hard fail per task spec wording:
    // "Warn if under, fail if over" — but §8 #3 is binary pass/fail, so we side with
    // the rubric: anything outside the platform target fails rubric item 3).
    failures.push(`length:${words}<${L.min}`);
    lengthPass = false;
  }

  // ── §8 #5 — abstraction opener ──
  const opener = opensWithAbstraction(firstSentence(caption));
  let openerPass = !opener.fail;
  if (opener.fail) {
    failures.push(`opener:${opener.why}`);
  }

  // ── §8 #2 — specificity (at least one concrete detail: digit, day, place, proper noun) ──
  // Signals of specificity:
  //   • any digit (number / price / year / time)
  //   • any day/month token
  //   • any £ or $ sign (price)
  //   • a proper noun AFTER the first two words (business name itself allowed once)
  // Fail-closed: if none of these signals appears, fail item 2.
  const specificityPatterns = [
    /\d/,
    /\b(mon|tues|wednes|thurs|fri|satur|sun)day\b/i,
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\b/i,
    /[£$€]/,
    /\b(today|tomorrow|yesterday|tonight|morning|afternoon|evening|weekend)\b/i,
  ];
  const hasSpecificSignal = specificityPatterns.some(r => r.test(caption))
    // Or: ≥2 capitalised word tokens that aren't at sentence starts (proper nouns beyond business name).
    || ((caption.match(/(?:[.!?]\s+|\s)([A-Z][a-z]{2,})/g) || []).length >= 2);
  let specificityPass = true;
  if (!hasSpecificSignal) {
    failures.push('no-specificity');
    specificityPass = false;
  }

  // Score = items passed in the 5-point rubric.
  const score = [phrasesPass, specificityPass, lengthPass, hashtagsPass, openerPass]
    .reduce((n, p) => n + (p ? 1 : 0), 0);

  return {
    pass: failures.length === 0,
    failures,
    score,
  };
}

// Also export internal helpers for targeted testing.
export const _internals = {
  BANNED_PHRASES,
  LIMITS,
  countEmojis,
  countHashtags,
  wordCountExcludingHashtags,
  firstSentence,
  hasEmDashChain,
  hasTriColonRhythm,
  opensWithAbstraction,
};
