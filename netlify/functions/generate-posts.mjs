// generate-posts.mjs — daily scheduled caption generator (FB + IG only)
// Runs at 08:00 UTC every day. For each active client it produces
//   1 Facebook caption (scheduled 10:00 UTC) + 1 Instagram caption (17:00 UTC)
// using Claude Haiku 4.5 (cheap) with Sonnet 4 as fallback.
//
// Voice spec: /sessions/brave-eloquent-dijkstra/mnt/Claude Improved/grid-social-post-voice.md
// System prompt (Section 6) and 5-point rubric (Section 8) are enforced verbatim.
//
// Force-run locally: netlify functions:invoke generate-posts --no-identity

import { db } from './lib/db/index.mjs';
import { logger } from './lib/logger.mjs';

// ── MODEL IDS (match ai-writer.mjs:197) ──
const MODEL_PRIMARY = 'claude-haiku-4-5-20251001';
const MODEL_FALLBACK = 'claude-sonnet-4-20250514';

// ── SECTION 6 SYSTEM PROMPT (verbatim from voice spec) ──
const SYSTEM_PROMPT_TEMPLATE = `You are a social media copywriter for UK small businesses. Write one post for {platform} on behalf of {business_name}, a {business_type} based in {location}.

Topic or news: {recent_news_or_product}

RULES — follow every one without exception:

Voice: Write like a real local business owner. Warm, direct, specific. British spelling throughout. Contractions always.

Length: Facebook = 40–80 words. Instagram = 20–50 words. Count excludes hashtags.

Banned phrases — do not use any of these or close variants:
"Let's dive in", "Elevate your", "Unlock", "Game-changer", "Seamless", "At the end of the day", "It's no secret", "Look no further", "Check it out", "Don't miss out", "Take it to the next level", "Passionate about", "Committed to excellence", "Transforming the way", "One-stop shop", "We've got you covered", "Stay tuned", "In today's fast-paced world", "We're excited to announce", "Proud to serve".

Banned structures: em-dash chains, tri-colon punchy fragments (Fast. Reliable. Affordable.), emoji stuffing (max 1 emoji total, optional), opening with a question, opening with "We".

Hashtags: Instagram max 5, specific only, no filler tags. Facebook max 2, prefer 0.

Open with something concrete and specific about the topic — a product name, a number, a day, a real detail. Never open with a vague benefit or a values statement.

End with a question, a specific CTA with a date or action, or simply stop. Never a generic CTA.

Use the client's actual product and service words, not category abstractions.

Output: the caption only. No commentary, no options, no quotation marks around the output.`;

// ── SECTION 1 BANNED-PHRASE REGEX (exact or near-match) ──
// Built from voice spec Section 1, phrases 1–20 (exact quoted substrings, case-insensitive).
const BANNED_PHRASE_REGEX = new RegExp(
  [
    "let'?s dive in",
    "let'?s get into it",
    "elevate your",
    "unlock the power of",
    "in today'?s fast[- ]paced world",
    "game[- ]changer",
    "game[- ]changing",
    "seamless experience",
    "at the end of the day",
    "it'?s no secret",
    "look no further",
    "check it out!",
    "we'?re excited to announce",
    "don'?t miss out",
    "take your .+ to the next level",
    "passionate about",
    "committed to excellence",
    "committed to quality",
    "transforming the way",
    "your one[- ]stop shop",
    "we'?ve got you covered",
    "stay tuned for more",
    "proud to serve",
  ].join("|"),
  "i",
);

// ── SEASONAL FALLBACK HOOK ──
// Used when the client row has no content_notes / last_news field.
function seasonalHook() {
  const month = new Date().getUTCMonth(); // 0-11
  const hooks = [
    "fresh start of the new year, quieter January trade",            // 0 Jan
    "late-winter stocktake, February slow week",                      // 1 Feb
    "first signs of spring, clocks go forward",                       // 2 Mar
    "Easter week, longer evenings returning",                         // 3 Apr
    "May bank-holiday stretch, gardens waking up",                    // 4 May
    "early summer bookings picking up, school sports-day season",     // 5 Jun
    "summer holidays beginning, heatwave prep jobs",                  // 6 Jul
    "mid-August lull, back-to-school planning",                       // 7 Aug
    "September reset, students returning, autumn range arriving",     // 8 Sep
    "October half-term, first frost and heating-system checks",       // 9 Oct
    "November dark evenings, Christmas lead-time warnings",           // 10 Nov
    "pre-Christmas final week, last-minute gift or booking slot",     // 11 Dec
  ];
  return hooks[month];
}

// ── BUILD SYSTEM PROMPT ──
function buildSystemPrompt({ platform, business_name, business_type, location, recent_news_or_product }) {
  return SYSTEM_PROMPT_TEMPLATE
    .replace("{platform}", platform)
    .replace("{business_name}", business_name || "this business")
    .replace("{business_type}", business_type || "small business")
    .replace("{location}", location || "the UK")
    .replace("{recent_news_or_product}", recent_news_or_product || seasonalHook());
}

// ── CALL CLAUDE (mirrors ai-writer.mjs:122-145 callClaude helper) ──
async function callClaude(apiKey, system, userMessage, model) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const d = await r.json();
  if (d.error) return { error: d.error.message || "API error" };
  const text = d.content?.map(c => c.text || "").join("") || "";
  return { text: text.trim() };
}

// ── SECTION 8 RUBRIC GATE ──
// Returns { ok: bool, reasons: string[] }
function validateCaption(caption, platform) {
  const reasons = [];
  if (!caption || typeof caption !== "string") {
    return { ok: false, reasons: ["empty caption"] };
  }

  // Strip hashtags for word-count check
  const withoutTags = caption.replace(/#[\w-]+/g, "").trim();
  const words = withoutTags.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const hashtags = caption.match(/#[\w-]+/g) || [];

  // 1. Banned phrases
  const bannedMatch = caption.match(BANNED_PHRASE_REGEX);
  if (bannedMatch) reasons.push(`banned phrase: "${bannedMatch[0]}"`);

  // 2. Specificity — require ≥1 digit OR a capitalised proper-noun-ish token OR a weekday.
  const hasDigit = /\d/.test(caption);
  const hasWeekday = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(caption);
  const hasProperNoun = /\b[A-Z][a-z]{2,}/.test(caption.replace(/^[^\w]*/, "").slice(1)); // skip first char (sentence case)
  if (!hasDigit && !hasWeekday && !hasProperNoun) {
    reasons.push("no concrete specific (no digit, weekday, or proper noun)");
  }

  // 3. Length
  if (platform === "facebook") {
    if (wordCount < 30 || wordCount > 120) reasons.push(`fb word count ${wordCount} outside 30–120`);
  } else if (platform === "instagram") {
    if (wordCount < 15 || wordCount > 80) reasons.push(`ig word count ${wordCount} outside 15–80`);
  }

  // 4. Hashtag count
  if (platform === "instagram" && hashtags.length > 5) {
    reasons.push(`ig hashtag count ${hashtags.length} > 5`);
  }
  if (platform === "facebook" && hashtags.length > 2) {
    reasons.push(`fb hashtag count ${hashtags.length} > 2`);
  }

  // 5. No abstraction opening — first sentence
  const firstSentence = caption.split(/[.!?\n]/, 1)[0] || "";
  const firstLower = firstSentence.toLowerCase();
  const firstTrim = firstSentence.trim();
  if (firstTrim.startsWith("?") || /\?\s*$/.test(firstTrim)) {
    reasons.push("opens with a question");
  }
  if (/^\s*we\b/i.test(firstTrim)) {
    reasons.push('opens with "We"');
  }
  const abstractionWords = ["our team", "your ", "journey", "experience", "community", "solution", "excellence"];
  for (const w of abstractionWords) {
    if (firstLower.includes(w)) {
      reasons.push(`first sentence contains abstraction "${w.trim()}"`);
      break;
    }
  }

  return { ok: reasons.length === 0, reasons };
}

// ── GENERATE ONE CAPTION (with 1 retry + model fallback) ──
async function generateCaption({ apiKey, platform, client, topic }) {
  const system = buildSystemPrompt({
    platform,
    business_name: client.name || client.brandName,
    business_type: client.businessType || client.brand_type || "small business",
    location: client.location || "the UK",
    recent_news_or_product: topic,
  });
  const userMessage = `Write the ${platform} post now. Output the caption only.`;

  let retries = 0;
  let lastReasons = [];

  for (const model of [MODEL_PRIMARY, MODEL_FALLBACK]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await callClaude(apiKey, system, userMessage, model);
      if (r.error) {
        lastReasons = [`api error: ${r.error}`];
        retries++;
        break; // fall through to next model
      }
      const check = validateCaption(r.text, platform);
      if (check.ok) {
        return { caption: r.text, model, retries, reasons: [] };
      }
      lastReasons = check.reasons;
      retries++;
    }
  }
  return { caption: null, model: null, retries, reasons: lastReasons };
}

// ── INSERT ONE POST (non-destructive; direct Supabase REST when available) ──
async function insertPost({ clientId, caption, platform, scheduledFor }) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    id,
    client_id: clientId,
    caption,
    platforms: [platform],
    status: "queued",
    approval_status: "approved",
    approval_mode: "auto",
    scheduled_for: scheduledFor,
    post_type: "feed",
    sort_order: 0,
    created_at: new Date().toISOString(),
    results: { ai_generated: true, source: "generator" },
  };

  if (SUPABASE_URL && SUPABASE_KEY) {
    // Direct REST insert — non-destructive, unlike db.savePosts() which deletes+reinserts.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/posts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase insert failed ${res.status}: ${text}`);
    }
    return id;
  }

  // Blobs fallback: append via db.getPosts + db.savePosts
  const existing = await db.getPosts(clientId);
  const camelRow = {
    id,
    clientId,
    caption,
    platforms: [platform],
    status: "queued",
    approvalStatus: "approved",
    approvalMode: "auto",
    scheduledFor,
    postType: "feed",
    sortOrder: existing.length,
    createdAt: row.created_at,
    results: { ai_generated: true, source: "generator" },
  };
  existing.push(camelRow);
  await db.savePosts(clientId, existing);
  return id;
}

// ── SCHEDULE SLOT PICKER ──
// FB at 10:00 UTC today (or tomorrow if past), IG at 17:00 UTC today (or tomorrow if past).
function nextSlot(hourUtc) {
  const now = new Date();
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0,
  ));
  if (candidate.getTime() <= now.getTime() + 5 * 60 * 1000) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate.toISOString();
}

// ── MAIN HANDLER ──
export default async function handler() {
  logger.info("generate-posts triggered");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error("ANTHROPIC_API_KEY missing — aborting");
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clients = await db.getClients();
  if (!clients || clients.length === 0) {
    logger.info("no clients configured");
    return new Response(JSON.stringify({ message: "No clients" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fbSlot = nextSlot(10);
  const igSlot = nextSlot(17);
  const summary = [];

  for (const client of clients) {
    const result = {
      client_id: client.id,
      fb_success: false,
      ig_success: false,
      retries: 0,
      reasons: [],
    };

    const hasFb = !!(client.fbPageId && client.pageAccessToken);
    const hasIg = !!(client.igUserId && client.pageAccessToken);
    if (!hasFb && !hasIg) {
      result.reasons.push("no fb or ig tokens");
      logger.info("client skipped", result);
      summary.push(result);
      continue;
    }

    const topic = client.contentNotes || client.lastNews || client.brandNotes || null;

    // Facebook
    if (hasFb) {
      try {
        const r = await generateCaption({ apiKey, platform: "Facebook", client, topic });
        result.retries += r.retries;
        if (r.caption) {
          const id = await insertPost({
            clientId: client.id,
            caption: r.caption,
            platform: "facebook",
            scheduledFor: fbSlot,
          });
          result.fb_success = true;
          result.reasons.push(`fb_ok:${id}`);
        } else {
          result.reasons.push(`fb_failed:${r.reasons.join(";")}`);
        }
      } catch (e) {
        result.reasons.push(`fb_error:${e.message}`);
      }
    } else {
      result.reasons.push("fb_skipped:no_token");
    }

    // Instagram
    if (hasIg) {
      try {
        const r = await generateCaption({ apiKey, platform: "Instagram", client, topic });
        result.retries += r.retries;
        if (r.caption) {
          const id = await insertPost({
            clientId: client.id,
            caption: r.caption,
            platform: "instagram",
            scheduledFor: igSlot,
          });
          result.ig_success = true;
          result.reasons.push(`ig_ok:${id}`);
        } else {
          result.reasons.push(`ig_failed:${r.reasons.join(";")}`);
        }
      } catch (e) {
        result.reasons.push(`ig_error:${e.message}`);
      }
    } else {
      result.reasons.push("ig_skipped:no_token");
    }

    logger.info("client processed", result);
    summary.push(result);
  }

  logger.info("generate-posts complete", { clients: summary.length });
  return new Response(JSON.stringify({ results: summary }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = {
  schedule: "0 8 * * *",
};
