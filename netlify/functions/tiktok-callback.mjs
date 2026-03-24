// TikTok OAuth — Step 2: Handle callback, exchange code for access token
// Supports admin flow (back to dashboard) and client flow (back to connect portal)
import { db } from './lib/db/index.mjs';
import { encrypt } from './lib/crypto/encryption.mjs';
import { verifyInviteToken } from './lib/invites.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDesc = url.searchParams.get('error_description');
  const stateParam = url.searchParams.get('state');

  // Parse state
  let state = {};
  try { state = JSON.parse(atob(stateParam)); } catch {}
  const isClientFlow = state.flow === 'client' && state.invite;

  if (error || !code) {
    const backUrl = isClientFlow ? `/connect?invite=${state.invite}` : '/';
    return htmlResponse('OAuth Error',
      `<p>TikTok login was cancelled or failed.</p>
       <p>Error: ${errorDesc || error || 'No code received'}</p>
       <p><a href="${backUrl}">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = `${url.origin}/api/tiktok-callback`;

  if (!CLIENT_KEY || !CLIENT_SECRET) {
    return htmlResponse('Config Error',
      `<p>TikTok OAuth is not fully configured. Missing env vars.</p>
       <p><a href="/">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  try {
    // Step 1: Exchange code for access token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.data?.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || tokenData.data?.description || 'Token exchange failed';
      return htmlResponse('Token Error',
        `<p>${errMsg}</p>
         <p><a href="/api/tiktok-auth${isClientFlow ? '?invite=' + state.invite : ''}">Try Again</a></p>`,
        isClientFlow ? 'client' : 'admin'
      );
    }

    const { access_token, refresh_token, expires_in, open_id, scope } = tokenData.data;
    const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString();

    // Step 2: Get user info
    let displayName = open_id;
    try {
      const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url,username', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userData = await userRes.json();
      if (userData.data?.user) {
        displayName = userData.data.user.display_name || userData.data.user.username || open_id;
      }
    } catch (e) {
      logger.warn('Could not fetch TikTok user info', { error: e.message });
    }

    const clientList = await db.getClients();

    // ── CLIENT PORTAL FLOW ──
    if (isClientFlow) {
      const invite = await verifyInviteToken(state.invite);
      if (!invite) {
        return htmlResponse('Invalid Link',
          '<p>Your invitation link has expired. Please contact your account manager for a new link.</p>',
          'client'
        );
      }

      const clientIdx = clientList.findIndex(c => c.id === invite.clientId);
      if (clientIdx === -1) {
        return htmlResponse('Client Not Found',
          '<p>The client associated with this link was not found.</p>',
          'client'
        );
      }

      clientList[clientIdx].tiktokAccessToken = encrypt(access_token);
      clientList[clientIdx].tiktokRefreshToken = refresh_token ? encrypt(refresh_token) : null;
      clientList[clientIdx].tiktokOpenId = open_id;
      clientList[clientIdx].tiktokName = displayName;
      clientList[clientIdx].tiktokTokenExpiresAt = tokenExpiresAt;
      clientList[clientIdx].tiktokUpdatedAt = new Date().toISOString();
      await db.saveClients(clientList);

      logger.info('TikTok connected via portal', { clientId: invite.clientId, tiktokName: displayName });
      return Response.redirect(`${url.origin}/connect?status=${invite.clientId}`, 302);
    }

    // ── ADMIN FLOW ──
    // Try to match to a client by name
    let matched = false;
    for (let i = 0; i < clientList.length; i++) {
      if (clientList[i].tiktokOpenId === open_id) {
        clientList[i].tiktokAccessToken = encrypt(access_token);
        clientList[i].tiktokRefreshToken = refresh_token ? encrypt(refresh_token) : null;
        clientList[i].tiktokName = displayName;
        clientList[i].tiktokTokenExpiresAt = tokenExpiresAt;
        clientList[i].tiktokUpdatedAt = new Date().toISOString();
        matched = true;
        break;
      }
    }

    await db.saveClients(clientList);

    const expiryDate = new Date(tokenExpiresAt).toLocaleDateString('en-GB');
    const statusMsg = matched
      ? `<div class="card ok"><div class="title">✓ Updated existing connection</div><div class="sub">${displayName} — token refreshed</div></div>`
      : `<div class="card new"><div class="title" style="color:#000;">○ ${displayName}</div><div class="sub">Open ID: ${open_id}</div><div class="meta">Not yet matched to a client. Go to Clients &amp; API → edit a client → paste the Open ID.</div></div>`;

    return htmlResponse('TikTok Connected',
      `<h2>✓ TikTok Connected!</h2>
       <p class="dim">Connected as ${displayName}. Token expires ${expiryDate}. Scopes: ${scope || 'unknown'}.</p>
       ${statusMsg}
       <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
         <a href="/" class="btn primary">← Back to Dashboard</a>
         <a href="/api/tiktok-auth" class="btn">🔄 Reconnect</a>
       </div>`,
      'admin'
    );

  } catch (err) {
    logger.error('TikTok callback error', { error: err.message });
    const backUrl = isClientFlow ? `/connect?invite=${state.invite}` : '/';
    return htmlResponse('Error', `<p>${err.message}</p><p><a href="${backUrl}">← Back</a></p>`, isClientFlow ? 'client' : 'admin');
  }
};

function htmlResponse(title, body, flow = 'admin') {
  return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#0a0c10;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.wrap{max-width:600px;width:100%}
h2{font-size:22px;font-weight:700;margin-bottom:6px;color:#fff}
p{font-size:14px;line-height:1.6;margin-bottom:8px}
.dim{color:#6b7280;margin-bottom:20px}
.card{border-radius:10px;padding:16px;margin-bottom:12px}
.card.ok{background:#0f1a14;border:1px solid #166534}
.card.ok .title{color:#4ade80;font-size:16px;font-weight:700}
.card.new{background:#111318;border:1px solid #1e2028}
.card.new .title{font-size:16px;font-weight:700}
.sub{font-size:13px;color:#6b7280;margin-top:4px}
.meta{font-size:12px;color:#4b5563;margin-top:4px}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #1e2028;color:#6b7280}
.btn.primary{background:#3b82f6;color:#fff;border:none}
a{color:#3b82f6}
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px}
</style></head><body><div class="wrap"><div class="logo">Grid Social</div>${body}</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/api/tiktok-callback' };
