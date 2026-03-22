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
    return htmlResponse("Config Error", `<p>Missing env vars.</p><p>APP_ID: ${APP_ID ? "set" : "MISSING"}</p><p>APP_SECRET: ${APP_SECRET ? "set (" + APP_SECRET.substring(0,4) + "...)" : "MISSING"}</p><p><a href="/">← Back to Dashboard</a></p>`);
  }

  try {
    // Step 1: Exchange code for short-lived user token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(tokenText); } catch(e) { tokenData = { error: { message: "Non-JSON: " + tokenText.substring(0,200) } }; }

    if (tokenData.error) {
      return htmlResponse("Token Error", `<p>Failed to get access token.</p><p><strong>${tokenData.error.message}</strong></p><p style="font-size:11px;color:#666;margin-top:12px;">Debug info:<br>App ID: ${APP_ID}<br>Secret: ${APP_SECRET.substring(0,6)}...${APP_SECRET.substring(APP_SECRET.length-4)}<br>Redirect: ${redirectUri}<br>Code: ${code.substring(0,20)}...</p><p><a href="/api/meta-auth">Try Again</a> | <a href="/">← Dashboard</a></p>`);
    }

    const shortToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token
    const llRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortToken}`);
    const llData = await llRes.json();
    if (llData.error) return htmlResponse("Exchange Error", `<p>Failed to get long-lived token.</p><p>${llData.error.message}</p><p><a href="/">← Dashboard</a></p>`);

    const longLivedUserToken = llData.access_token;
    const expiresIn = llData.expires_in || 0;

    // Step 3: Get page tokens
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}&fields=id,name,access_token,instagram_business_account`);
    const pagesData = await pagesRes.json();
    if (pagesData.error) return htmlResponse("Pages Error", `<p>${pagesData.error.message}</p><p><a href="/api/meta-auth">Try Again</a></p>`);

    const pages = pagesData.data || [];
    if (pages.length === 0) return htmlResponse("No Pages", `<p>No pages found. Make sure you selected pages during approval.</p><p><a href="/api/meta-auth">Try Again</a></p>`);

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

    let html = `<h2>✅ Facebook Connected!</h2>`;
    html += `<p style="color:#8e8e8e;margin-bottom:20px;">Found ${pages.length} page(s). Page tokens are permanent.</p>`;
    for (const r of results) {
      if (r.status === "updated") {
        html += `<div style="background:#1a2e1a;border:1px solid #2d5a2d;border-radius:10px;padding:16px;margin-bottom:12px;"><div style="font-size:16px;font-weight:700;color:#4ade80;">✓ ${r.name}</div><div style="font-size:13px;color:#8e8e8e;margin-top:4px;">Matched to: <strong style="color:#fff;">${r.clientName}</strong></div><div style="font-size:12px;color:#6b7280;margin-top:4px;">Page: ${r.pageId}${r.igId ? ` · IG: ${r.igId}` : ""}</div></div>`;
      } else {
        html += `<div style="background:#1a1e28;border:1px solid #252a36;border-radius:10px;padding:16px;margin-bottom:12px;"><div style="font-size:16px;font-weight:700;color:#f59e0b;">○ ${r.name}</div><div style="font-size:13px;color:#8e8e8e;margin-top:4px;">No matching client. Page ID: <code style="background:#252a36;padding:2px 6px;border-radius:4px;">${r.pageId}</code>${r.igId ? ` · IG: <code style="background:#252a36;padding:2px 6px;border-radius:4px;">${r.igId}</code>` : ""}</div><div style="margin-top:8px;"><input type="text" value="${r.token}" readonly style="width:100%;padding:8px;background:#12151c;border:1px solid #333;border-radius:6px;color:#e5e7eb;font-size:11px;font-family:monospace;" onclick="this.select();document.execCommand('copy');" /><div style="font-size:10px;color:#6b7280;margin-top:4px;">Click to copy → Dashboard → Clients → Edit → Paste token</div></div></div>`;
      }
    }
    html += `<div style="margin-top:20px;"><a href="/" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">← Back to Dashboard</a></div>`;
    return htmlResponse("Facebook Connected", html);

  } catch (err) {
    return htmlResponse("Error", `<p>${err.message}</p><p style="font-size:11px;color:#666;">${err.stack}</p><p><a href="/">← Dashboard</a></p>`);
  }
};

function htmlResponse(title, body) {
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700;800&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Instrument Sans',system-ui,sans-serif;background:#0a0c10;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#12151c;border:1px solid #252a36;border-radius:16px;padding:32px;max-width:600px;width:100%}h2{font-size:22px;font-weight:800;margin-bottom:8px;color:#fff}p{font-size:14px;line-height:1.6;margin-bottom:8px}code{background:#252a36;padding:2px 6px;border-radius:4px;font-size:12px}a{color:#3b82f6}strong{color:#fff}</style></head><body><div class="card">${body}</div></body></html>`, { status: 200, headers: { "Content-Type": "text/html" } });
}

export const config = { path: "/api/meta-callback" };
