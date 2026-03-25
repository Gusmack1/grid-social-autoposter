// ai-writer.mjs — AI caption generation with tone presets, hashtag control, image analysis
// Rate-limited per plan tier. Free = 10/day (Haiku), Starter = 50/day, Agency = 200/day, Pro = unlimited
// POST /api/ai-writer { prompt, tone, clientName, clientType, platforms, hashtagMode, imageUrl, action }

import { db } from './lib/db/index.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { logger } from './lib/logger.mjs';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── RATE LIMITS PER PLAN (calls per day) ──
const AI_LIMITS = {
  free:       { daily: 10,  imageAnalysis: 3,   model: 'claude-haiku-4-5-20251001' },
  starter:    { daily: 50,  imageAnalysis: 15,  model: 'claude-haiku-4-5-20251001' },
  agency:     { daily: 200, imageAnalysis: 50,  model: 'claude-sonnet-4-20250514' },
  agency_pro: { daily: -1,  imageAnalysis: -1,  model: 'claude-sonnet-4-20250514' },  // -1 = unlimited
  enterprise: { daily: -1,  imageAnalysis: -1,  model: 'claude-sonnet-4-20250514' },
};

// ── TONE PRESETS ──
const TONE_PRESETS = {
  professional: "Professional and authoritative. Use confident, polished language. No slang. Suitable for LinkedIn and corporate audiences.",
  casual: "Casual and friendly. Like a mate having a chat. Conversational, warm, approachable. Light use of humour.",
  humorous: "Witty and fun. Use clever wordplay, light sarcasm, and personality. Make people smile. Don't try too hard.",
  scottish: "Friendly Scottish voice. Use occasional Scots words (wee, braw, bonnie, aye) naturally — don't overdo it. Warm, community-focused, down-to-earth.",
  inspirational: "Uplifting and motivational. Positive energy, forward-looking. Great for Monday posts and milestone celebrations.",
  sales: "Persuasive and action-oriented. Clear value proposition, urgency, strong call-to-action. Not pushy — helpful.",
  storytelling: "Narrative-driven. Start with a hook, build a mini-story, end with a takeaway. Personal and engaging.",
};

// ── PLATFORM HASHTAG RULES ──
const HASHTAG_RULES = {
  instagram: { min: 5, max: 15 },
  facebook: { min: 1, max: 3 },
  threads: { min: 2, max: 5 },
  twitter: { min: 1, max: 3 },
  linkedin: { min: 3, max: 5 },
  tiktok: { min: 3, max: 8 },
  bluesky: { min: 0, max: 3 },
  pinterest: { min: 2, max: 5 },
  google_business: { min: 0, max: 0 },
};

// ── AUTH ──
async function authenticate(req) {
  const adminKey = process.env.ADMIN_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  if (token === adminKey) return { role: 'admin', email: 'admin', plan: 'enterprise' };
  const payload = await verifyJWT(token, jwtSecret);
  return payload || null;
}

// ── RATE LIMITING ──
async function checkAiRateLimit(email, plan, action) {
  const limits = AI_LIMITS[plan] || AI_LIMITS.free;
  const isImageAction = action === 'analyse-image';
  const dailyLimit = isImageAction ? limits.imageAnalysis : limits.daily;

  // Unlimited
  if (dailyLimit === -1) return { allowed: true, remaining: -1, model: limits.model };

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `ai_${email}_${today}`;
  const usage = await db.getRateLimit(key) || { writes: 0, images: 0, date: today };

  // Reset if different day
  if (usage.date !== today) {
    usage.writes = 0;
    usage.images = 0;
    usage.date = today;
  }

  const currentCount = isImageAction ? usage.images : usage.writes;
  if (currentCount >= dailyLimit) {
    const planName = (AI_LIMITS[plan] || AI_LIMITS.free) === AI_LIMITS.free ? 'Free' : plan.charAt(0).toUpperCase() + plan.slice(1);
    return {
      allowed: false,
      remaining: 0,
      reason: `AI Writer daily limit reached (${currentCount}/${dailyLimit}). ${plan === 'free' ? 'Upgrade to Starter for 50/day.' : 'Upgrade your plan for more.'}`,
      model: limits.model,
    };
  }

  return {
    allowed: true,
    remaining: dailyLimit - currentCount - 1,
    model: limits.model,
    // Pass usage object so we can increment after successful call
    _usage: usage,
    _key: key,
    _isImage: isImageAction,
  };
}

async function incrementAiUsage(rateResult) {
  if (!rateResult._usage || !rateResult._key) return;
  const usage = rateResult._usage;
  if (rateResult._isImage) usage.images++;
  else usage.writes++;
  await db.saveRateLimit(rateResult._key, usage);
}

// ── HELPERS ──
function buildToneInstruction(tone) {
  return TONE_PRESETS[tone] || tone || TONE_PRESETS.casual;
}

function buildHashtagInstruction(platforms, hashtagMode) {
  if (hashtagMode === 'none') return "Do NOT include any hashtags.";
  if (hashtagMode === 'minimal') return "Include only 1-2 highly relevant hashtags.";
  if (platforms && platforms.length > 0) {
    const rules = platforms.map(p => HASHTAG_RULES[p]).filter(Boolean);
    if (rules.length > 0) {
      const avgMin = Math.round(rules.reduce((s, r) => s + r.min, 0) / rules.length);
      const avgMax = Math.round(rules.reduce((s, r) => s + r.max, 0) / rules.length);
      if (avgMax === 0) return "Do NOT include hashtags (not suited for the selected platforms).";
      return `Include ${avgMin}-${avgMax} relevant hashtags at the end. Mix popular and niche tags.`;
    }
  }
  return "Include 3-5 relevant hashtags at the end.";
}

async function callClaude(apiKey, messages, system, model) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({ model, max_tokens: 1500, system, messages })
  });
  const d = await r.json();
  if (d.error) return { error: d.error.message || "API error" };
  const text = d.content?.map(c => c.text || "").join("") || "";
  return { text };
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// ── MAIN HANDLER ──
export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return jsonRes({ error: "AI Writer not configured" }, 503);

  // ── AUTH CHECK ──
  const user = await authenticate(req);
  if (!user) return jsonRes({ error: "Unauthorised. Please log in." }, 401);

  try {
    const body = await req.json();
    const { prompt, tone, clientName, clientType, platforms, hashtagMode, imageUrl, action } = body;

    // ── RATE LIMIT CHECK ──
    const rateCheck = await checkAiRateLimit(user.email, user.plan || 'free', action || 'write');
    if (!rateCheck.allowed) {
      return jsonRes({
        error: rateCheck.reason,
        rateLimited: true,
        remaining: 0,
      }, 429);
    }

    const model = rateCheck.model;

    // ── ACTION: ANALYSE IMAGE ──
    if (action === 'analyse-image') {
      if (!imageUrl) return jsonRes({ error: "imageUrl required for image analysis" }, 400);

      const messages = [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          { type: "text", text: `You are a social media expert for "${clientName || 'a business'}".${clientType ? ` About this business: ${clientType}` : ''}

Analyse this image and return a JSON object with:
1. "description" — a 1-2 sentence description of what's in the image
2. "captionIdeas" — an array of 3 short caption ideas (each under 30 words) that would work as social media posts for this business
3. "suggestedTone" — which tone would suit this image best (professional, casual, humorous, scottish, inspirational, sales, storytelling)
4. "suggestedHashtags" — an array of 5-10 relevant hashtags (without the # symbol)

Return ONLY the JSON object, no markdown fences or explanation.` }
        ]
      }];

      const r = await callClaude(API_KEY, messages, "You are a visual content analyst for social media marketing. Always return valid JSON.", model);
      if (r.error) return jsonRes({ error: r.error }, 500);

      await incrementAiUsage(rateCheck);

      try {
        const parsed = JSON.parse(r.text);
        return jsonRes({ analysis: parsed, remaining: rateCheck.remaining });
      } catch {
        return jsonRes({ analysis: { description: r.text, captionIdeas: [], suggestedTone: 'casual', suggestedHashtags: [] }, remaining: rateCheck.remaining });
      }
    }

    // ── ACTION: GENERATE HASHTAGS ONLY ──
    if (action === 'hashtags') {
      if (!prompt) return jsonRes({ error: "prompt required" }, 400);

      const platformList = (platforms && platforms.length > 0) ? platforms.join(', ') : 'general social media';
      const messages = [{
        role: "user",
        content: `Generate hashtags for this social media post. Target platforms: ${platformList}.
Business: ${clientName || 'a business'}${clientType ? ` (${clientType})` : ''}

Post content:
${prompt}

Return ONLY a JSON object with:
- "hashtags": array of 10-15 relevant hashtags (without # symbol), ordered from most to least relevant
- "platformSuggestions": object where keys are platform names and values are arrays of the best hashtags for that specific platform

Return ONLY the JSON, no explanation.`
      }];

      const r = await callClaude(API_KEY, messages, "You are a social media hashtag strategist. Always return valid JSON.", model);
      if (r.error) return jsonRes({ error: r.error }, 500);

      await incrementAiUsage(rateCheck);

      try {
        const parsed = JSON.parse(r.text);
        return jsonRes({ hashtags: parsed, remaining: rateCheck.remaining });
      } catch {
        return jsonRes({ hashtags: { hashtags: [], platformSuggestions: {} }, remaining: rateCheck.remaining });
      }
    }

    // ── ACTION: WRITE CAPTION (default) ──
    if (!prompt) return jsonRes({ error: "Prompt required" }, 400);

    const toneInstruction = buildToneInstruction(tone);
    const hashtagInstruction = buildHashtagInstruction(platforms, hashtagMode);
    const ctx = clientType || "";

    const systemPrompt = `You are a social media writer for "${clientName || "a business"}".
${ctx ? `About this business: ${ctx}` : ""}

TONE: ${toneInstruction}

RULES:
- Use British English spelling throughout
- Include relevant emojis (sparingly, 2-4 per post)
- ${hashtagInstruction}
- Max 200 words
- Output ONLY the finished post, no explanations or preamble
- Make it specific and relevant to what this business actually does
- Never be generic — reference the business type, services, or location where appropriate
- If the tone is Scottish, weave in Scots dialect naturally without making it a caricature
- Structure the post with a hook line first, then the body, then a call-to-action, then hashtags`;

    const userContent = [];
    if (imageUrl) {
      userContent.push({ type: "image", source: { type: "url", url: imageUrl } });
      userContent.push({ type: "text", text: `Write a social media post about: ${prompt}\n\nUse the attached image as context — reference what's visible in the image to make the caption specific and authentic.` });
    } else {
      userContent.push({ type: "text", text: `Write a social media post about: ${prompt}` });
    }

    const messages = [{ role: "user", content: userContent.length === 1 ? userContent[0].text : userContent }];
    const r = await callClaude(API_KEY, messages, systemPrompt, model);
    if (r.error) return jsonRes({ error: r.error }, 500);

    await incrementAiUsage(rateCheck);

    logger.info('AI Writer used', { email: user.email, plan: user.plan, action: action || 'write', model, remaining: rateCheck.remaining });

    return jsonRes({
      text: r.text,
      tone: tone || 'casual',
      tonePresets: Object.keys(TONE_PRESETS),
      remaining: rateCheck.remaining,
      model: model.includes('haiku') ? 'fast' : 'advanced',
    });
  } catch (e) {
    logger.error('AI Writer error', { error: e.message });
    return jsonRes({ error: e.message }, 500);
  }
}

export const config = { path: "/api/ai-writer" };
