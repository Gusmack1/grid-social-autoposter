// ai-writer.mjs — Proxy AI caption requests to Anthropic API
export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });

  try {
    const { prompt, tone, clientName, clientType } = await req.json();
    if (!prompt) return new Response(JSON.stringify({ error: "Prompt required" }), { status: 400, headers: { "Content-Type": "application/json" } });

    const ctx = clientType || "";
    const systemPrompt = `You are a social media writer for "${clientName || "a business"}".
${ctx ? `About this business: ${ctx}` : ""}
Rules:
- Tone: ${tone || "friendly"}
- Use British English spelling throughout
- Include relevant emojis (sparingly)
- Include 3-5 relevant hashtags at the end
- Max 200 words
- Output ONLY the finished post, no explanations or preamble
- Make it specific and relevant to what this business actually does
- Never be generic — reference the business type, services, or location where appropriate`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: `Write a post about: ${prompt}` }]
      })
    });

    const d = await r.json();
    const text = d.content?.map(c => c.text || "").join("") || "";
    if (d.error) return new Response(JSON.stringify({ error: d.error.message || "API error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ text }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

export const config = { path: "/api/ai-writer" };
