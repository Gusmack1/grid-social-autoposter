// Meta OAuth — Step 2: Handle callback, exchange code for permanent page token
// GET /api/meta-callback?code=...&state=...

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

  try {
    // Step 1: Exchange code for short-lived user token
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", APP_ID);
    tokenUrl.searchParams.set("client_secret", APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return htmlResponse("Token Error", `<p>Failed to get access token.</p><p>${tokenData.error.message}</p><p><a href="/">← Back to Dashboard</a></p>`);
    }

    const shortToken = tokenData.access_token;

    // Step 2: Exchange short-lived token for long-lived token (60 days)
    const llUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    llUrl.searchParams.set("grant_type", "fb_exchange_token");
    llUrl.searchParams.set("client_id", APP_ID);
    llUrl.searchParams.set("client_secret", APP_SECRET);
    llUrl.searchParams.set("fb_exchange_token", shortToken);

    const llRes = await fetch(llUrl.toString());
    const llData = await llRes.json();

    if (llData.error) {
      return htmlResponse("Token Exchange Error", `<p>Failed to get long-lived token.</p><p>${llData.error.message}</p><p><a href="/">← Back to Dashboard</a></p>`);
    }

    const longLivedUserToken = llData.access_token;
    const expiresIn = llData.expires_in || 0;

    // Step 3: Get page tokens (these are permanent when derived from long-lived user token)
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}&fields=id,name,access_token,instagram_business_account`);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      return htmlResponse("Pages Error", `<p>Failed to get page tokens.</p><p>${pagesData.error.message}</p><p>Make sure you granted page permissions during login.</p><p><a href="/api/meta-auth">Try Again</a> | <a href="/">← Dashboard</a></p>`);
    }

    const pages = pagesData.data || [];

    if (pages.length === 0) {
      return htmlResponse("No Pages Found", `<p>No Facebook Pages found with this account.</p><p>Make sure you:</p><ul><li>Have admin access to a Facebook Page</li><li>Selected the page during the OAuth approval</li></ul><p><a href="/api/meta-auth">Try Again</a> | <a href="/">← Dashboard</a></p>`);
    }

    // Step 4: Auto-match pages to clients in the blob store
    const clients = getStore("clients");
    const clientList = (await clients.get("list", { type: "json" }).catch(() => null)) || [];

    const results = [];

    for (const page of pages) {
      const igAccount = page.instagram_business_account?.id || null;

      // Try to match to an existing client by FB page ID
      const matchIdx = clientList.findIndex((c) => c.fbPageId === page.id);

      if (matchIdx !== -1) {
        // Update existing client with permanent page token
        clientList[matchIdx].pageAccessToken = page.access_token;
        if (igAccount && !clientList[matchIdx].igUserId) {
          clientList[matchIdx].igUserId = igAccount;
        }
        clientList[matchIdx].tokenUpdatedAt = new Date().toISOString();
        clientList[matchIdx].updatedAt = new Date().toISOString();
        results.push({ name: page.name, pageId: page.id, igId: igAccount, status: "updated", clientName: clientList[matchIdx].name });
      } else {
        results.push({ name: page.name, pageId: page.id, igId: igAccount, token: page.access_token, status: "unmatched" });
      }
    }

    // Save updated clients
    await clients.setJSON("list", clientList);

    // Build results page
    let html = `<h2>✅ Facebook Connected Successfully!</h2>`;
    html += `<p style="color:#8e8e8e;margin-bottom:24px;">Found ${pages.length} page(s). Token expires in ~${Math.round(expiresIn / 86400)} days (page tokens are permanent).</p>`;

    for (const r of results) {
      if (r.status === "updated") {
        html += `<div style="background:#1a2e1a;border:1px solid #2d5a2d;border-radius:10px;padding:16px;margin-bottom:12px;">`;
        html += `<div style="font-size:16px;font-weight:700;color:#4ade80;">✓ ${r.name}</div>`;
        html += `<div style="font-size:13px;color:#8e8e8e;margin-top:4px;">Matched to client: <strong style="color:#fff;">${r.clientName}</strong></div>`;
        html += `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Page ID: ${r.pageId}${r.igId ? ` · IG: ${r.igId}` : " · No Instagram linked"}</div>`;
        html += `</div>`;
      } else {
        html += `<div style="background:#1a1e28;border:1px solid #252a36;border-radius:10px;padding:16px;margin-bottom:12px;">`;
        html += `<div style="font-size:16px;font-weight:700;color:#f59e0b;">○ ${r.name}</div>`;
        html += `<div style="font-size:13px;color:#8e8e8e;margin-top:4px;">Not matched to any client. Add this page in the dashboard.</div>`;
        html += `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Page ID: <code style="background:#252a36;padding:2px 6px;border-radius:4px;">${r.pageId}</code>${r.igId ? ` · IG ID: <code style="background:#252a36;padding:2px 6px;border-radius:4px;">${r.igId}</code>` : ""}</div>`;
        // Provide a button to copy the token
        html += `<div style="margin-top:8px;"><input type="text" value="${r.token}" readonly style="width:100%;padding:8px;background:#12151c;border:1px solid #333;border-radius:6px;color:#e5e7eb;font-size:11px;font-family:monospace;" onclick="this.select();document.execCommand('copy');" /><div style="font-size:10px;color:#6b7280;margin-top:4px;">Click to copy token. Paste in Dashboard → Clients → Edit → Page Access Token</div></div>`;
        html += `</div>`;
      }
    }

    html += `<div style="margin-top:24px;"><a href="/" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">← Back to Dashboard</a></div>`;

    return htmlResponse("Facebook Connected", html);

  } catch (err) {
    return htmlResponse("Error", `<p>Something went wrong.</p><p>${err.message}</p><p><a href="/">← Back to Dashboard</a></p>`);
  }
};

function htmlResponse(title, body) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — Grid Social</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0c10;--surface:#12151c;--border:#252a36;--text:#e5e7eb;--accent:#3b82f6}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Instrument Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:32px;max-width:600px;width:100%;animation:fadeIn .4s ease both}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
h2{font-size:22px;font-weight:800;margin-bottom:8px;color:#fff}
p{font-size:14px;line-height:1.6}
ul{margin:8px 0 8px 20px;font-size:13px;color:#8e8e8e}
code{background:#252a36;padding:2px 6px;border-radius:4px;font-size:12px}
a{color:var(--accent)}
</style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } });
}

export const config = { path: "/api/meta-callback" };
