// Google Business Profile OAuth — Step 2: Handle callback
// Exchanges code for access+refresh token, lists GBP locations, stores encrypted
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
      `<p>Google login was cancelled or failed.</p>
       <p>Error: ${error || 'No code received'}</p>
       <p><a href="${backUrl}">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${url.origin}/api/gbp-callback`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return htmlResponse('Config Error',
      `<p>Google OAuth is not fully configured. Missing env vars.</p>
       <p><a href="/">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  try {
    // Step 1: Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return htmlResponse('Token Error',
        `<p>${tokenData.error_description || tokenData.error}</p>
         <p><a href="/api/gbp-auth${isClientFlow ? '?invite=' + state.invite : ''}">Try Again</a></p>`,
        isClientFlow ? 'client' : 'admin'
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();

    // Step 2: Get user profile
    let userName = 'Unknown';
    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json();
      userName = profile.name || profile.email || 'Unknown';
    } catch (e) {
      logger.warn('Could not fetch Google profile', { error: e.message });
    }

    // Step 3: List GBP accounts and locations
    let locations = [];
    try {
      // Get accounts
      const acctRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const acctData = await acctRes.json();
      const accounts = acctData.accounts || [];

      // Get locations for each account
      for (const acct of accounts) {
        try {
          const locRes = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.name}/locations?readMask=name,title,storefrontAddress`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const locData = await locRes.json();
          if (locData.locations) {
            for (const loc of locData.locations) {
              locations.push({
                id: loc.name, // e.g. "locations/123456"
                fullId: `${acct.name}/${loc.name}`,
                title: loc.title || 'Unnamed Location',
                address: loc.storefrontAddress
                  ? [loc.storefrontAddress.addressLines?.[0], loc.storefrontAddress.locality].filter(Boolean).join(', ')
                  : '',
                accountName: acct.accountName || acct.name,
              });
            }
          }
        } catch (e) {
          logger.warn('Could not fetch locations for account', { account: acct.name, error: e.message });
        }
      }
    } catch (e) {
      logger.warn('Could not fetch GBP accounts', { error: e.message });
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

      if (locations.length === 0) {
        return htmlResponse('No Locations Found',
          `<p>No Google Business Profile locations were found for this account.</p>
           <p>Make sure your Google account has access to a Business Profile.</p>
           <p><a href="/connect?invite=${state.invite}">← Back</a></p>`,
          'client'
        );
      }

      if (locations.length === 1) {
        const loc = locations[0];
        clientList[clientIdx].gbpAccessToken = encrypt(accessToken);
        clientList[clientIdx].gbpRefreshToken = refreshToken ? encrypt(refreshToken) : null;
        clientList[clientIdx].gbpId = loc.fullId;
        clientList[clientIdx].gbpName = loc.title;
        clientList[clientIdx].gbpTokenExpiresAt = tokenExpiresAt;
        clientList[clientIdx].gbpUpdatedAt = new Date().toISOString();
        await db.saveClients(clientList);
        logger.info('GBP connected via portal', { clientId: invite.clientId, gbpName: loc.title });
        return Response.redirect(`${url.origin}/connect?status=${invite.clientId}`, 302);
      }

      // Multiple locations — show picker
      const locCards = locations.map(loc =>
        `<div class="card new" id="loc-${loc.id.replace(/\//g, '-')}">
          <div class="title" style="color:#4285f4;">📍 ${loc.title}</div>
          <div class="meta">${loc.address || 'No address'}</div>
          <button class="add-btn" onclick="pickLoc('${loc.fullId}','${loc.title.replace(/'/g, "\\'")}',this)">Use this location</button>
        </div>`
      ).join('');

      return htmlResponse('Choose Location',
        `<h2>Which location is for ${clientList[clientIdx].name}?</h2>
         <p class="dim">Found ${locations.length} locations. Choose the one to connect.</p>
         ${locCards}
         <script>
         async function pickLoc(locId, locName, btn) {
           btn.disabled = true; btn.textContent = 'Connecting...';
           try {
             const r = await fetch('/api/admin?action=update-client', {
               method: 'PUT',
               headers: { 'Authorization': 'Bearer ${process.env.ADMIN_KEY}', 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 id: '${invite.clientId}',
                 gbpAccessToken: '${accessToken}',
                 gbpId: locId,
                 gbpName: locName,
                 gbpTokenExpiresAt: '${tokenExpiresAt}',
                 gbpUpdatedAt: '${new Date().toISOString()}'
               })
             });
             if ((await r.json()).success) {
               window.location.href = '/connect?status=${invite.clientId}';
             } else { btn.textContent = 'Error — try again'; btn.disabled = false; }
           } catch(e) { btn.textContent = 'Error: ' + e.message; btn.disabled = false; }
         }
         </script>`,
        'client'
      );
    }

    // ── ADMIN FLOW ──
    let cards = '';
    for (const loc of locations) {
      // Try to match to existing client by gbpId
      const matchIdx = clientList.findIndex(c => c.gbpId === loc.fullId || c.gbpId === loc.id);
      if (matchIdx !== -1) {
        clientList[matchIdx].gbpAccessToken = encrypt(accessToken);
        clientList[matchIdx].gbpRefreshToken = refreshToken ? encrypt(refreshToken) : null;
        clientList[matchIdx].gbpId = loc.fullId;
        clientList[matchIdx].gbpName = loc.title;
        clientList[matchIdx].gbpTokenExpiresAt = tokenExpiresAt;
        clientList[matchIdx].gbpUpdatedAt = new Date().toISOString();
        cards += `<div class="card ok"><div class="title">✓ ${loc.title}</div><div class="sub">Matched to: <strong>${clientList[matchIdx].name}</strong></div><div class="meta">${loc.address}</div></div>`;
      } else {
        cards += `<div class="card new"><div class="title" style="color:#4285f4;">📍 ${loc.title}</div><div class="sub">Not matched to a client</div><div class="meta">${loc.address || 'No address'} · ID: ${loc.fullId}</div></div>`;
      }
    }

    if (locations.length === 0) {
      cards = `<div class="card new"><div class="title" style="color:#f59e0b;">No locations found</div><div class="sub">The connected Google account doesn't manage any Business Profile locations.</div></div>`;
    }

    await db.saveClients(clientList);

    return htmlResponse('Google Business Connected',
      `<h2>✓ Google Business Connected!</h2>
       <p class="dim">Connected as ${userName}. Found ${locations.length} location(s).</p>
       ${cards}
       <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
         <a href="/" class="btn primary">← Back to Dashboard</a>
         <a href="/api/gbp-auth" class="btn">🔄 Reconnect</a>
       </div>`,
      'admin'
    );

  } catch (err) {
    logger.error('GBP callback error', { error: err.message });
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
.sub strong{color:#fff}
.meta{font-size:12px;color:#4b5563;margin-top:4px}
.add-btn{margin-top:12px;padding:10px 20px;background:#4285f4;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;transition:all .15s}
.add-btn:hover{background:#3367d6}
.add-btn:disabled{opacity:0.6;cursor:wait}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #1e2028;color:#6b7280}
.btn.primary{background:#3b82f6;color:#fff;border:none}
a{color:#3b82f6}
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px}
</style></head><body><div class="wrap"><div class="logo">Grid Social</div>${body}</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/api/gbp-callback' };
