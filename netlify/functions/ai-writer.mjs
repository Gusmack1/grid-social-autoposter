// ai-writer.mjs — AI caption generation with tone presets, hashtag control, and image analysis
// POST /api/ai-writer { prompt, tone, clientName, clientType, platforms, hashtagMode, imageUrl, action }
// action: "write" (default) | "analyse-image" | "hashtags"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
  instagram: { min: 5, max: 15, note: "Instagram performs best with 5-15 targeted hashtags. Mix popular and niche." },
  facebook: { min: 1, max: 3, note: "Facebook posts do best with 1-3 hashtags or none. Less is more." },
  threads: { min: 2, max: 5, note: "Threads works well with 2-5 relevant hashtags." },
  twitter: { min: 1, max: 3, note: "Twitter/X posts should use 1-3 hashtags max. Brevity is key." },
  linkedin: { min: 3, max: 5, note: "LinkedIn posts benefit from 3-5 industry-relevant hashtags." },
  tiktok: { min: 3, max: 8, note: "TikTok uses 3-8 trending + niche hashtags." },
  bluesky: { min: 0, max: 3, note: "Bluesky has minimal hashtag culture. 0-3 is fine." },
  pinterest: { min: 2, max: 5, note: "Pinterest uses hashtags in descriptions. 2-5 relevant ones." },
  google_business: { min: 0, max: 0, note: "Google Business Profile posts don't use hashtags." },
};

function buildToneInstruction(tone) {
  if (TONE_PRESETS[tone]) return TONE_PRESETS[tone];
  // Allow custom tone strings to pass through
  return tone || TONE_PRESETS.casual;
}

function buildHashtagInstruction(platforms, hashtagMode) {
  if (hashtagMode === 'none') return "Do NOT include any hashtags.";
  if (hashtagMode === 'minimal') return "Include only 1-2 highly relevant hashtags.";

  // Platform-aware mode (default)
  if (platforms && platforms.length > 0) {
    const rules = platforms
      .map(p => HASHTAG_RULES[p])
      .filter(Boolean);
    if (rules.length > 0) {
      // Use the median range across selected platforms
      const avgMin = Math.round(rules.reduce((s, r) => s + r.min, 0) / rules.length);
      const avgMax = Math.round(rules.reduce((s, r) => s + r.max, 0) / rules.length);
      if (avgMax === 0) return "Do NOT include hashtags (not suited for the selected platforms).";
      return `Include ${avgMin}-${avgMax} relevant hashtags at the end. Mix popular and niche tags.`;
    }
  }
  return "Include 3-5 relevant hashtags at the end.";
}

// ── MAIN HANDLER ──
export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return new Response(JSON.stringify({ error: "AI Writer not configured" }), { status: 503, headers: { ...CORS, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { prompt, tone, clientName, clientType, platforms, hashtagMode, imageUrl, action } = body;

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

      const r = await callClaude(API_KEY, messages, "You are a visual content analyst for social media marketing. Always return valid JSON.");
      if (r.error) return jsonRes({ error: r.error }, 500);

      // Parse the JSON response
      try {
        const parsed = JSON.parse(r.text);
        return jsonRes({ analysis: parsed });
      } catch {
        // If JSON parsing fails, return raw text
        return jsonRes({ analysis: { description: r.text, captionIdeas: [], suggestedTone: 'casual', suggestedHashtags: [] } });
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

      const r = await callClaude(API_KEY, messages, "You are a social media hashtag strategist. Always return valid JSON.");
      if (r.error) return jsonRes({ error: r.error }, 500);

      try {
        const parsed = JSON.parse(r.text);
        return jsonRes({ hashtags: parsed });
      } catch {
        return jsonRes({ hashtags: { hashtags: [], platformSuggestions: {} } });
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

    // If image URL provided, include it for context-aware caption
    if (imageUrl) {
      userContent.push({ type: "image", source: { type: "url", url: imageUrl } });
      userContent.push({ type: "text", text: `Write a social media post about: ${prompt}\n\nUse the attached image as context — reference what's visible in the image to make the caption specific and authentic.` });
    } else {
      userContent.push({ type: "text", text: `Write a social media post about: ${prompt}` });
    }

    const messages = [{ role: "user", content: userContent.length === 1 ? userContent[0].text : userContent }];
    const r = await callClaude(API_KEY, messages, systemPrompt);
    if (r.error) return jsonRes({ error: r.error }, 500);

    return jsonRes({ text: r.text, tone: tone || 'casual', tonePresets: Object.keys(TONE_PRESETS) });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

// ── HELPERS ──
async function callClaude(apiKey, messages, system) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system,
      messages,
    })
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

export const config = { path: "/api/ai-writer" };
