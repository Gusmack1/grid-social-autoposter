// ai-writer.mjs — Proxy AI caption requests to Anthropic API
export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });

  try {
    const { prompt, tone, clientName } = await req.json();
    if (!prompt) return new Response(JSON.stringify({ error: "Prompt required" }), { status: 400, headers: { "Content-Type": "application/json" } });

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
        system: `Write social media posts for "${clientName || "a business"}". Tone: ${tone || "friendly"}. Include emojis and hashtags. Max 200 words. Output ONLY the post. Use British English spelling.`,
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
