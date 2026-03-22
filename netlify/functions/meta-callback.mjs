// Meta OAuth — Step 2: Handle callback, exchange code for permanent page token
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return htmlResponse("OAuth Error", `<p>Facebook login was cancelled or failed.</p><p>Error: ${error || "No code received"}</p><p><a href="/">← Back to Dashboard</a></p>`);
  }

  const APP_ID = process.env.META_APP_ID;
  const APP_SECRET = process.env.META_APP_SECRET;
  const origin = url.origin;
  const redirectUri = `${origin}/api/meta-callback`;

  if (!APP_ID || !APP_SECRET) {
    return htmlResponse("Config Error", `<p>Missing env vars.</p><p>APP_ID: ${APP_ID ? "set" : "MISSING"}</p><p>APP_SECRET: ${APP_SECRET ? "set" : "MISSING"}</p><p><a href="/">← Back</a></p>`);
  }

  try {
    // Step 1: Exchange code for short-lived user token
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`);
    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch(e) { tokenData = { error: { message: "Non-JSON: " + tokenText.substring(0,200) } }; }
    if (tokenData.error) return htmlResponse("Token Error", `<p>${tokenData.error.message}</p><p><a href="/api/meta-auth">Try Again</a></p>`);

    // Step 2: Exchange for long-lived token
    const llRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`);
    const llData = await llRes.json();
    if (llData.error) return htmlResponse("Exchange Error", `<p>${llData.error.message}</p><p><a href="/">← Back</a></p>`);

    const longLivedUserToken = llData.access_token;

    // Step 3: Get page tokens
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}&fields=id,name,access_token,instagram_business_account`);
    const pagesData = await pagesRes.json();
    if (pagesData.error) return htmlResponse("Pages Error", `<p>${pagesData.error.message}</p><p><a href="/api/meta-auth">Try Again</a></p>`);

    const pages = pagesData.data || [];
    if (pages.length === 0) return htmlResponse("No Pages", `<p>No pages found. Select pages during approval.</p><p><a href="/api/meta-auth">Try Again</a></p>`);

    // Step 4: Auto-match to clients
    const clients = getStore("clients");
    const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];
    const results = [];

    for (const page of pages) {
      const igAccount = page.instagram_business_account?.id || null;
      const matchIdx = clientList.findIndex((c) => c.fbPageId === page.id);
      if (matchIdx !== -1) {
        clientList[matchIdx].pageAccessToken = page.access_token;
        if (igAccount && !clientList[matchIdx].igUserId) clientList[matchIdx].igUserId = igAccount;
        clientList[matchIdx].tokenUpdatedAt = new Date().toISOString();
        clientList[matchIdx].updatedAt = new Date().toISOString();
        results.push({ name: page.name, pageId: page.id, igId: igAccount, status: "updated", clientName: clientList[matchIdx].name });
      } else {
        results.push({ name: page.name, pageId: page.id, igId: igAccount, token: page.access_token, status: "unmatched" });
      }
    }

    await clients.setJSON("list", clientList);

    // Build interactive results page
    let cards = "";
    for (const r of results) {
      if (r.status === "updated") {
        cards += `<div class="card ok"><div class="title">✓ ${r.name}</div><div class="sub">Matched to: <strong>${r.clientName}</strong></div><div class="meta">Page: ${r.pageId}${r.igId ? " · IG: " + r.igId : ""}</div></div>`;
      } else {
        cards += `<div class="card new" id="page-${r.pageId}"><div class="title" style="color:#f59e0b;">○ ${r.name}</div><div class="sub">Not yet added as a client</div><div class="meta">Page ID: ${r.pageId}${r.igId ? " · IG: " + r.igId : ""}</div><button class="add-btn" onclick="addClient('${r.name}','${r.pageId}','${r.igId||""}','${r.token.replace(/'/g,"\\'")}',this)">+ Add ${r.name} as Client</button></div>`;
      }
    }

    const body = `
<h2>✅ Facebook Connected!</h2>
<p class="dim">Found ${pages.length} page(s). Page tokens are permanent.</p>
${cards}
<div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
  <a href="/" class="btn primary">← Back to Dashboard</a>
  <a href="/api/meta-auth" class="btn">🔄 Reconnect Pages</a>
</div>
<script>
async function addClient(name, pageId, igId, token, btn) {
  btn.disabled = true;
  btn.textContent = "Adding...";
  const key = localStorage.getItem("gsa_key");
  if (!key) { btn.textContent = "Error: Not logged in"; return; }
  try {
    const r = await fetch("/api/admin?action=add-client", {
      method: "POST",
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ name, fbPageId: pageId, igUserId: igId, pageAccessToken: token })
    });
    const d = await r.json();
    if (d.success) {
      const card = document.getElementById("page-" + pageId);
      card.className = "card ok";
      card.innerHTML = '<div class="title">✓ ' + name + '</div><div class="sub">Added as new client!</div><div class="meta">Page: ' + pageId + (igId ? ' · IG: ' + igId : '') + '</div>';
    } else {
      btn.textContent = "Error: " + (d.error || "Failed");
    }
  } catch(e) {
    btn.textContent = "Error: " + e.message;
  }
}
</script>`;

    return htmlResponse("Facebook Connected", body);

  } catch (err) {
    return htmlResponse("Error", `<p>${err.message}</p><p><a href="/">← Back</a></p>`);
  }
};

function htmlResponse(title, body) {
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Instrument Sans',system-ui,sans-serif;background:#0a0c10;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.wrap{max-width:600px;width:100%}
h2{font-size:22px;font-weight:800;margin-bottom:6px;color:#fff}
p{font-size:14px;line-height:1.6;margin-bottom:8px}
.dim{color:#8e8e8e;margin-bottom:20px}
.card{border-radius:10px;padding:16px;margin-bottom:12px;animation:fadeIn .3s ease both}
.card.ok{background:#1a2e1a;border:1px solid #2d5a2d}
.card.ok .title{color:#4ade80;font-size:16px;font-weight:700}
.card.new{background:#1a1e28;border:1px solid #252a36}
.card.new .title{font-size:16px;font-weight:700}
.sub{font-size:13px;color:#8e8e8e;margin-top:4px}
.sub strong{color:#fff}
.meta{font-size:12px;color:#6b7280;margin-top:4px}
.add-btn{margin-top:12px;padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;width:100%;transition:all .15s}
.add-btn:hover{background:#2563eb}
.add-btn:disabled{opacity:0.6;cursor:wait}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;font-family:inherit;border:1px solid #252a36;color:#8e8e8e}
.btn.primary{background:#3b82f6;color:#fff;border:none}
a{color:#3b82f6}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style></head><body><div class="wrap">${body}</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html" } });
}

export const config = { path: "/api/meta-callback" };
