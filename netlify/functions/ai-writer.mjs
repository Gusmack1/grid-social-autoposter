// ai-writer.mjs — AI caption generation (BYOK: Bring Your Own Key)
// Users provide their own Anthropic API key. Free trial: 5 calls/day using platform key.
// POST /api/ai-writer { prompt, tone, clientName, clientType, platforms, hashtagMode, imageUrl, action }

import { db } from './lib/db/index.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { logger } from './lib/logger.mjs';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Free trial limits (uses platform key)
const FREE_TRIAL = { daily: 5, imageAnalysis: 2 };

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

// ── GET USER'S API KEY ──
async function getUserApiKey(email) {
  if (email === 'admin') return null; // Admin uses platform key
  const emailKey = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const userData = await db.getUser(emailKey);
  if (userData?.anthropicApiKey) {
    try {
      return decrypt(userData.anthropicApiKey);
    } catch { return null; }
  }
  return null;
}

// ── FREE TRIAL RATE LIMITING ──
async function checkFreeTrialLimit(email, action) {
  const isImageAction = action === 'analyse-image';
  const dailyLimit = isImageAction ? FREE_TRIAL.imageAnalysis : FREE_TRIAL.daily;

  const today = new Date().toISOString().slice(0, 10);
  const key = `ai_trial_${email}_${today}`;
  const usage = await db.getRateLimit(key) || { writes: 0, images: 0, date: today };

  if (usage.date !== today) {
    usage.writes = 0;
    usage.images = 0;
    usage.date = today;
  }

  const currentCount = isImageAction ? usage.images : usage.writes;
  if (currentCount >= dailyLimit) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Free AI trial limit reached (${currentCount}/${dailyLimit} today). Add your own Anthropic API key in Settings for unlimited use.`,
    };
  }

  return { allowed: true, remaining: dailyLimit - currentCount - 1, _usage: usage, _key: key, _isImage: isImageAction };
}

async function incrementTrialUsage(rateResult) {
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
  if (d.error) {
    // Give helpful message for common errors
    if (d.error.message?.includes('invalid x-api-key')) {
      return { error: 'Invalid API key. Please check your Anthropic API key in Settings.' };
    }
    if (d.error.message?.includes('credit')) {
      return { error: 'Your Anthropic account has no credits. Top up at console.anthropic.com.' };
    }
    return { error: d.error.message || "API error" };
  }
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

  // ── AUTH CHECK ──
  const user = await authenticate(req);
  if (!user) return jsonRes({ error: "Unauthorised. Please log in." }, 401);

  try {
    const body = await req.json();
    const { prompt, tone, clientName, clientType, platforms, hashtagMode, imageUrl, action } = body;

    // ── RESOLVE API KEY (user's own key or free trial) ──
    const userKey = await getUserApiKey(user.email);
    const platformKey = process.env.ANTHROPIC_API_KEY;
    const usingOwnKey = !!userKey;
    let apiKey;
    let trialCheck = null;

    if (usingOwnKey) {
      // User has their own key — no limits, use Sonnet
      apiKey = userKey;
    } else if (platformKey) {
      // No user key — use platform key with free trial limits
      trialCheck = await checkFreeTrialLimit(user.email, action || 'write');
      if (!trialCheck.allowed) {
        return jsonRes({
          error: trialCheck.reason,
          rateLimited: true,
          remaining: 0,
          needsApiKey: true,
        }, 429);
      }
      apiKey = platformKey;
    } else {
      return jsonRes({
        error: "AI Writer requires an Anthropic API key. Add yours in Settings → API Key.",
        needsApiKey: true,
      }, 503);
    }

    // Use Sonnet for own-key users, Haiku for trial
    const model = usingOwnKey ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-5-20251001';

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

      const r = await callClaude(apiKey, messages, "You are a visual content analyst for social media marketing. Always return valid JSON.", model);
      if (r.error) return jsonRes({ error: r.error }, 500);

      if (trialCheck) await incrementTrialUsage(trialCheck);

      try {
        const parsed = JSON.parse(r.text);
        return jsonRes({ analysis: parsed, remaining: trialCheck?.remaining ?? -1, usingOwnKey });
      } catch {
        return jsonRes({ analysis: { description: r.text, captionIdeas: [], suggestedTone: 'casual', suggestedHashtags: [] }, remaining: trialCheck?.remaining ?? -1, usingOwnKey });
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

      const r = await callClaude(apiKey, messages, "You are a social media hashtag strategist. Always return valid JSON.", model);
      if (r.error) return jsonRes({ error: r.error }, 500);

      if (trialCheck) await incrementTrialUsage(trialCheck);

      try {
        const parsed = JSON.parse(r.text);
        return jsonRes({ hashtags: parsed, remaining: trialCheck?.remaining ?? -1, usingOwnKey });
      } catch {
        return jsonRes({ hashtags: { hashtags: [], platformSuggestions: {} }, remaining: trialCheck?.remaining ?? -1, usingOwnKey });
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
    const r = await callClaude(apiKey, messages, systemPrompt, model);
    if (r.error) return jsonRes({ error: r.error }, 500);

    if (trialCheck) await incrementTrialUsage(trialCheck);

    logger.info('AI Writer used', { email: user.email, usingOwnKey, action: action || 'write', model });

    return jsonRes({
      text: r.text,
      tone: tone || 'casual',
      tonePresets: Object.keys(TONE_PRESETS),
      remaining: trialCheck?.remaining ?? -1,
      usingOwnKey,
      model: model.includes('haiku') ? 'trial' : 'full',
    });
  } catch (e) {
    logger.error('AI Writer error', { error: e.message });
    return jsonRes({ error: e.message }, 500);
  }
}

export const config = { path: "/api/ai-writer" };
