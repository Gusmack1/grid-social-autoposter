// audit-core.mjs — Facebook/Instagram public-page audit helpers
//
// Public Page harvest uses Meta Graph app-access-token ({APP_ID}|{APP_SECRET}).
// App tokens can read public Page metadata + public posts without a user token.
// Voice-rubric heuristics are lifted from netlify/functions/lib/voice-gate.mjs
// and applied to the buyer's harvested captions to produce a quantitative
// voice-pass rate for the audit.

const GRAPH = 'https://graph.facebook.com/v21.0';

const BANNED_PHRASES = [
  'lets dive in', "let's dive in", 'elevate your', 'unlock',
  'fast-paced world', 'fast paced world', 'game-changer', 'game changer',
  'seamless', 'end of the day', 'at the end of the day',
  "it's no secret", 'its no secret', 'look no further',
  'check it out', 'excited to announce', "don't miss out", 'dont miss out',
  'next-level', 'next level', 'passionate about',
  'committed to excellence', 'transforming the way', 'one-stop shop',
  'one stop shop', 'got you covered', 'stay tuned', 'proud to serve',
];

export function resolvePageIdFromUrl(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    if (!/facebook\.com$/.test(u.hostname.replace(/^www\./, ''))) {
      return null;
    }
    // /profile.php?id=123456789012345
    const idParam = u.searchParams.get('id');
    if (idParam && /^\d{6,}$/.test(idParam)) return idParam;
    // /{pagename} or /pages/Name/123456
    const parts = u.pathname.split('/').filter(Boolean);
    if (!parts.length) return null;
    if (parts[0].toLowerCase() === 'pages' && parts.length >= 3 && /^\d+$/.test(parts[2])) {
      return parts[2];
    }
    // Single-segment slug — Graph API accepts it directly (/{slug})
    return parts[0];
  } catch {
    return null;
  }
}

export async function fetchPublicPage({ pageRef, appToken }) {
  const metaUrl = `${GRAPH}/${encodeURIComponent(pageRef)}?fields=id,name,username,link,fan_count,followers_count,category,about,verification_status&access_token=${encodeURIComponent(appToken)}`;
  const res = await fetch(metaUrl);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    return { ok: false, status: res.status, error: body?.error?.message || `http_${res.status}` };
  }
  return { ok: true, page: body };
}

export async function fetchPublicPosts({ pageId, appToken, limit = 25 }) {
  const fields = [
    'id', 'message', 'created_time',
    'full_picture',
    'reactions.summary(total_count)',
    'comments.summary(total_count)',
    'shares',
  ].join(',');
  const url = `${GRAPH}/${encodeURIComponent(pageId)}/posts?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(appToken)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    return { ok: false, status: res.status, error: body?.error?.message || `http_${res.status}`, posts: [] };
  }
  return { ok: true, posts: Array.isArray(body.data) ? body.data : [] };
}

// ── Heuristic voice checks ──
// Simplified mirror of voice-gate.mjs. We grade each post and return
// per-post failures + aggregate pass rate.
function wordCount(s) {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

export function gradePost(caption, platform = 'fb') {
  const text = (caption || '').toLowerCase();
  const failures = [];
  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase)) {
      failures.push(`banned_phrase:${phrase}`);
      break; // one banned phrase is enough to flag voice
    }
  }
  // em-dash triple chain
  if ((caption || '').match(/—.*—.*—/)) failures.push('em_dash_chain');
  // emoji cap: >3 emoji
  const emoji = (caption || '').match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || [];
  if (emoji.length > 3) failures.push(`too_many_emoji:${emoji.length}`);
  // hashtag cap: FB max 2, IG max 8
  const tags = (caption || '').match(/#[A-Za-z0-9_]+/g) || [];
  const tagCap = platform === 'ig' ? 8 : 2;
  if (tags.length > tagCap) failures.push(`too_many_hashtags:${tags.length}>${tagCap}`);
  // length
  const wc = wordCount(caption);
  const minW = platform === 'ig' ? 20 : 40;
  const maxW = platform === 'ig' ? 80 : 120;
  if (wc && (wc < minW || wc > maxW)) failures.push(`length:${wc}_outside_${minW}-${maxW}`);
  // opens with "we"
  if (/^\s*we\b/i.test(caption || '')) failures.push('opens_with_we');
  return { pass: failures.length === 0, failures, wordCount: wc, hashtagCount: tags.length, emojiCount: emoji.length };
}

export function computeCadence(posts) {
  // Returns posts per week over observed window + day-of-week/hour distribution.
  if (!posts.length) return { perWeek: 0, daySpread: {}, hourSpread: {} };
  const times = posts
    .map(p => new Date(p.created_time).getTime())
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b);
  if (!times.length) return { perWeek: 0, daySpread: {}, hourSpread: {} };
  const spanDays = Math.max(1, (times[times.length - 1] - times[0]) / 86400000);
  const perWeek = +(times.length / (spanDays / 7)).toFixed(2);
  const daySpread = {};
  const hourSpread = {};
  for (const t of times) {
    const d = new Date(t);
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    daySpread[dow] = (daySpread[dow] || 0) + 1;
    const h = d.getUTCHours();
    hourSpread[h] = (hourSpread[h] || 0) + 1;
  }
  return { perWeek, daySpread, hourSpread };
}

export function summarisePosts(posts) {
  const graded = posts.map(p => ({
    id: p.id,
    created_time: p.created_time,
    message: p.message || '',
    reactions: p.reactions?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
    shares: p.shares?.count ?? 0,
    has_image: Boolean(p.full_picture),
    ...gradePost(p.message || '', 'fb'),
  }));
  const passCount = graded.filter(g => g.pass).length;
  const passRate = graded.length ? +(passCount / graded.length * 100).toFixed(1) : 0;
  const failureModes = {};
  for (const g of graded) {
    for (const f of g.failures) {
      const k = f.split(':')[0];
      failureModes[k] = (failureModes[k] || 0) + 1;
    }
  }
  const topFailures = Object.entries(failureModes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => ({ mode: k, count: v }));

  // engagement stats
  const engagements = graded.map(g => g.reactions + g.comments + g.shares);
  const mean = engagements.length ? engagements.reduce((a, b) => a + b, 0) / engagements.length : 0;
  const max = engagements.length ? Math.max(...engagements) : 0;
  const min = engagements.length ? Math.min(...engagements) : 0;

  // hashtag waste: posts where hashtagCount > cap already flagged
  const hashtagWaste = graded.filter(g => g.failures.some(f => f.startsWith('too_many_hashtags'))).length;

  return {
    sampleSize: graded.length,
    passRate,
    passCount,
    topFailures,
    engagement: { mean: +mean.toFixed(1), max, min },
    hashtagWaste,
    graded,
  };
}

export async function generateFindingsWithHaiku({ pageInfo, summary, cadence, apiKey }) {
  const systemPrompt = [
    'You are a senior social-media auditor for Grid Social, a UK local-business agency.',
    'Produce exactly 10 short, concrete findings about the buyer\'s Facebook Page.',
    'Each finding: one sentence diagnosis, then one sentence concrete next-30-days action.',
    'Ground every claim in the numeric evidence provided. Never invent numbers.',
    'No fluff, no hashtags, no emoji, no banned phrases (unlock, elevate, game-changer, etc).',
    'Return JSON only: { "findings": [ { "title": string, "diagnosis": string, "action": string } ] }.',
  ].join(' ');

  const userPayload = {
    page: { name: pageInfo.name, followers: pageInfo.followers_count || pageInfo.fan_count || null, category: pageInfo.category },
    voice_pass_rate: summary.passRate,
    sample_size: summary.sampleSize,
    top_voice_failures: summary.topFailures,
    engagement: summary.engagement,
    cadence_per_week: cadence.perWeek,
    cadence_day_spread: cadence.daySpread,
    cadence_hour_spread: cadence.hourSpread,
    hashtag_waste_count: summary.hashtagWaste,
  };

  const body = {
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      { role: 'user', content: `EVIDENCE:\n${JSON.stringify(userPayload, null, 2)}\n\nReturn the 10-finding JSON now.` },
    ],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, error: j?.error?.message || 'haiku_error' };
  }
  const text = j?.content?.[0]?.text || '';
  // tolerate fenced code
  const stripped = text.replace(/^```json\s*|```\s*$/g, '').trim();
  let parsed;
  try { parsed = JSON.parse(stripped); } catch { parsed = null; }
  if (!parsed || !Array.isArray(parsed.findings)) {
    return { ok: false, error: 'parse_failed', raw: text.slice(0, 500) };
  }
  return { ok: true, findings: parsed.findings.slice(0, 10) };
}
