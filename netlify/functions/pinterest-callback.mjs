// Pinterest OAuth — Step 2: Handle callback, exchange code for access token
import { db } from './lib/db/index.mjs';
import { encrypt } from './lib/crypto/encryption.mjs';
import { verifyInviteToken } from './lib/invites.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');

  let state = {};
  try { state = JSON.parse(atob(stateParam)); } catch {}
  const isClientFlow = state.flow === 'client' && state.invite;

  if (error || !code) {
    const backUrl = isClientFlow ? `/connect?invite=${state.invite}` : '/';
    return htmlResponse('OAuth Error',
      `<p>Pinterest login was cancelled or failed.</p>
       <p>Error: ${error || 'No code received'}</p>
       <p><a href="${backUrl}">← Back</a></p>`
    );
  }

  const CLIENT_ID = process.env.PINTEREST_APP_ID;
  const CLIENT_SECRET = process.env.PINTEREST_APP_SECRET;
  const redirectUri = `${url.origin}/api/pinterest-callback`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return htmlResponse('Config Error',
      `<p>Pinterest OAuth is not fully configured. Missing env vars.</p>
       <p><a href="/">← Back</a></p>`
    );
  }

  try {
    // Exchange code for access token
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      return htmlResponse('Token Error',
        `<p>${tokenData.error_description || tokenData.error || 'Could not get access token'}</p>
         <p><a href="/api/pinterest-auth${isClientFlow ? '?invite=' + state.invite : ''}">Try Again</a></p>`
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 2592000; // 30 days default
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get user profile
    const profileRes = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();
    const username = profile.username || 'unknown';

    // Get boards for the user
    let boards = [];
    try {
      const boardsRes = await fetch('https://api.pinterest.com/v5/boards', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const boardsData = await boardsRes.json();
      boards = (boardsData.items || []).map(b => ({
        id: b.id,
        name: b.name,
        description: b.description || '',
      }));
    } catch (e) {
      logger.warn('Could not fetch Pinterest boards', { error: e.message });
    }

    const clientList = await db.getClients();

    // ── CLIENT PORTAL FLOW ──
    if (isClientFlow) {
      const invite = await verifyInviteToken(state.invite);
      if (!invite) {
        return htmlResponse('Invalid Link',
          '<p>Your invitation link has expired. Please contact your account manager for a new link.</p>'
        );
      }

      const clientIdx = clientList.findIndex(c => c.id === invite.clientId);
      if (clientIdx === -1) {
        return htmlResponse('Client Not Found',
          '<p>The client associated with this link was not found.</p>'
        );
      }

      // If user has boards, pick the first one as default (or show picker)
      const defaultBoard = boards[0]?.id || null;

      clientList[clientIdx].pinterestAccessToken = encrypt(accessToken);
      clientList[clientIdx].pinterestRefreshToken = refreshToken ? encrypt(refreshToken) : null;
      clientList[clientIdx].pinterestUsername = username;
      clientList[clientIdx].pinterestBoardId = defaultBoard;
      clientList[clientIdx].pinterestTokenExpiresAt = tokenExpiresAt;
      clientList[clientIdx].pinterestUpdatedAt = new Date().toISOString();
      await db.saveClients(clientList);

      logger.info('Pinterest connected via portal', { clientId: invite.clientId, username });
      return Response.redirect(`${url.origin}/connect?status=${invite.clientId}`, 302);
    }

    // ── ADMIN FLOW ──
    // Try to match to an existing client by name
    let matched = false;
    for (let i = 0; i < clientList.length; i++) {
      const c = clientList[i];
      if (c.pinterestUsername === username || (!c.pinterestAccessToken && c.name.toLowerCase().includes(username.toLowerCase()))) {
        clientList[i].pinterestAccessToken = encrypt(accessToken);
        clientList[i].pinterestRefreshToken = refreshToken ? encrypt(refreshToken) : null;
        clientList[i].pinterestUsername = username;
        clientList[i].pinterestBoardId = boards[0]?.id || null;
        clientList[i].pinterestTokenExpiresAt = tokenExpiresAt;
        clientList[i].pinterestUpdatedAt = new Date().toISOString();
        matched = true;
        break;
      }
    }
    await db.saveClients(clientList);

    const boardsList = boards.map(b =>
      `<div class="card new"><div class="title">${b.name}</div><div class="meta">ID: ${b.id}</div></div>`
    ).join('') || '<p class="dim">No boards found.</p>';

    return htmlResponse('Pinterest Connected',
      `<h2>✓ Pinterest Connected!</h2>
       <p class="dim">Connected as @${username}. Found ${boards.length} board(s). Token expires ${new Date(tokenExpiresAt).toLocaleDateString('en-GB')}.</p>
       ${matched ? '<div class="card ok"><div class="title">✓ Matched to existing client</div></div>' : '<div class="card new"><div class="title" style="color:#f59e0b;">⚠ Not auto-matched — assign manually in Clients tab</div></div>'}
       <h3 style="margin:16px 0 8px;font-size:15px;color:#fff;">Boards</h3>
       ${boardsList}
       <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
         <a href="/" class="btn primary">← Back to Dashboard</a>
         <a href="/api/pinterest-auth" class="btn">🔄 Reconnect</a>
       </div>`
    );

  } catch (err) {
    logger.error('Pinterest callback error', { error: err.message });
    const backUrl = isClientFlow ? `/connect?invite=${state.invite}` : '/';
    return htmlResponse('Error', `<p>${err.message}</p><p><a href="${backUrl}">← Back</a></p>`);
  }
};

function htmlResponse(title, body) {
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
.meta{font-size:12px;color:#4b5563;margin-top:4px}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #1e2028;color:#6b7280}
.btn.primary{background:#3b82f6;color:#fff;border:none}
a{color:#3b82f6}
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px}
</style></head><body><div class="wrap"><div class="logo">Grid Social</div>${body}</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/api/pinterest-callback' };
