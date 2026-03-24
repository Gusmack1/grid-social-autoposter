// LinkedIn OAuth — Step 2: Handle callback, exchange code for access token
// Supports admin flow (back to dashboard) and client flow (back to connect portal)
import { db } from './lib/db/index.mjs';
import { encrypt } from './lib/crypto/encryption.mjs';
import { verifyInviteToken } from './lib/invites.mjs';
import { logger } from './lib/logger.mjs';

const LI_API = 'https://api.linkedin.com/v2';

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
      `<p>LinkedIn login was cancelled or failed.</p>
       <p>Error: ${errorDesc || error || 'No code received'}</p>
       <p><a href="${backUrl}">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
  const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = `${url.origin}/api/linkedin-callback`;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return htmlResponse('Config Error',
      `<p>LinkedIn OAuth is not fully configured. Missing env vars.</p>
       <p><a href="/">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  try {
    // Step 1: Exchange code for access token
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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
         <p><a href="/api/linkedin-auth${isClientFlow ? '?invite=' + state.invite : ''}">Try Again</a></p>`,
        isClientFlow ? 'client' : 'admin'
      );
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null; // LinkedIn may provide a refresh token
    const expiresIn = tokenData.expires_in; // typically 5184000 (60 days)

    // Step 2: Get user profile to identify who connected
    const profileRes = await fetch(`${LI_API}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await profileRes.json();

    // Step 3: Get organizations the user administers
    let organizations = [];
    try {
      const orgRes = await fetch(
        `${LI_API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,vanityName,logoV2)))`,
        { headers: { Authorization: `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' } }
      );
      const orgData = await orgRes.json();
      if (orgData.elements) {
        organizations = orgData.elements.map(e => ({
          id: e['organization~']?.id?.toString() || e.organization?.split(':').pop(),
          name: e['organization~']?.localizedName || 'Unknown',
          vanity: e['organization~']?.vanityName || '',
        })).filter(o => o.id);
      }
    } catch (e) {
      logger.warn('Could not fetch LinkedIn organizations', { error: e.message });
    }

    // Calculate token expiry date
    const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();
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

      const client = clientList[clientIdx];

      if (organizations.length === 0) {
        // No company pages — save as personal LinkedIn
        clientList[clientIdx].linkedinAccessToken = encrypt(accessToken);
        clientList[clientIdx].linkedinRefreshToken = refreshToken ? encrypt(refreshToken) : null;
        clientList[clientIdx].linkedinId = profile.sub; // OpenID user ID
        clientList[clientIdx].linkedinType = 'personal';
        clientList[clientIdx].linkedinName = profile.name || `${profile.given_name} ${profile.family_name}`;
        clientList[clientIdx].linkedinTokenExpiresAt = tokenExpiresAt;
        clientList[clientIdx].linkedinUpdatedAt = new Date().toISOString();
        await db.saveClients(clientList);
        logger.info('LinkedIn connected (personal) via portal', { clientId: invite.clientId, linkedinName: profile.name });
        return Response.redirect(`${url.origin}/connect?status=${invite.clientId}`, 302);
      }

      if (organizations.length === 1) {
        // Auto-assign single organization
        const org = organizations[0];
        clientList[clientIdx].linkedinAccessToken = encrypt(accessToken);
        clientList[clientIdx].linkedinRefreshToken = refreshToken ? encrypt(refreshToken) : null;
        clientList[clientIdx].linkedinId = org.id;
        clientList[clientIdx].linkedinType = 'organization';
        clientList[clientIdx].linkedinName = org.name;
        clientList[clientIdx].linkedinTokenExpiresAt = tokenExpiresAt;
        clientList[clientIdx].linkedinUpdatedAt = new Date().toISOString();
        await db.saveClients(clientList);
        logger.info('LinkedIn connected (org) via portal', { clientId: invite.clientId, orgId: org.id, orgName: org.name });
        return Response.redirect(`${url.origin}/connect?status=${invite.clientId}`, 302);
      }

      // Multiple organizations — show picker
      const orgCards = organizations.map(org =>
        `<div class="card new" id="org-${org.id}">
          <div class="title" style="color:#0a66c2;">○ ${org.name}</div>
          <div class="meta">ID: ${org.id}${org.vanity ? ' · linkedin.com/company/' + org.vanity : ''}</div>
          <button class="add-btn" onclick="pickOrg('${org.id}','${org.name}',this)">Use this page</button>
        </div>`
      ).join('');

      return htmlResponse('Choose LinkedIn Page',
        `<h2>Which LinkedIn page is for ${client.name}?</h2>
         <p class="dim">You admin ${organizations.length} pages. Choose the one to connect.</p>
         ${orgCards}
         <script>
         async function pickOrg(orgId, orgName, btn) {
           btn.disabled = true; btn.textContent = 'Connecting...';
           try {
             const r = await fetch('/api/admin?action=update-client', {
               method: 'PUT',
               headers: { 'Authorization': 'Bearer ${process.env.ADMIN_KEY}', 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 id: '${invite.clientId}',
                 linkedinAccessToken: '${accessToken}',
                 linkedinId: orgId,
                 linkedinType: 'organization',
                 linkedinName: orgName,
                 linkedinTokenExpiresAt: '${tokenExpiresAt}',
                 linkedinUpdatedAt: '${new Date().toISOString()}'
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
    const results = [];

    // Try to match organizations to existing clients
    for (const org of organizations) {
      let matchIdx = clientList.findIndex(c => c.linkedinId === org.id);
      if (matchIdx === -1) {
        matchIdx = clientList.findIndex(c => {
          if (!c.name || c.linkedinId) return false;
          const cn = c.name.toLowerCase();
          const on = org.name.toLowerCase();
          return cn === on || cn.includes(on) || on.includes(cn);
        });
      }

      if (matchIdx !== -1) {
        clientList[matchIdx].linkedinAccessToken = encrypt(accessToken);
        clientList[matchIdx].linkedinRefreshToken = refreshToken ? encrypt(refreshToken) : null;
        clientList[matchIdx].linkedinId = org.id;
        clientList[matchIdx].linkedinType = 'organization';
        clientList[matchIdx].linkedinName = org.name;
        clientList[matchIdx].linkedinTokenExpiresAt = tokenExpiresAt;
        clientList[matchIdx].linkedinUpdatedAt = new Date().toISOString();
        results.push({ name: org.name, orgId: org.id, status: 'updated', clientName: clientList[matchIdx].name });
      } else {
        results.push({ name: org.name, orgId: org.id, vanity: org.vanity, status: 'unmatched', token: accessToken });
      }
    }

    await db.saveClients(clientList);

    // Build admin results page
    let cards = '';
    for (const r of results) {
      if (r.status === 'updated') {
        cards += `<div class="card ok"><div class="title">✓ ${r.name}</div><div class="sub">Matched to: <strong>${r.clientName}</strong></div><div class="meta">Org ID: ${r.orgId}</div></div>`;
      } else {
        cards += `<div class="card new"><div class="title" style="color:#0a66c2;">○ ${r.name}</div><div class="sub">Not matched to a client</div><div class="meta">Org ID: ${r.orgId}${r.vanity ? ' · linkedin.com/company/' + r.vanity : ''}</div></div>`;
      }
    }

    if (organizations.length === 0) {
      cards = `<div class="card new"><div class="title" style="color:#f59e0b;">No company pages found</div><div class="sub">The connected LinkedIn account doesn't admin any company pages. Personal posting is supported but organization pages are preferred for business accounts.</div></div>`;
    }

    const expiryDate = new Date(tokenExpiresAt).toLocaleDateString('en-GB');
    return htmlResponse('LinkedIn Connected',
      `<h2>✓ LinkedIn Connected!</h2>
       <p class="dim">Connected as ${profile.name || 'Unknown'}. Found ${organizations.length} organisation(s). Token expires ${expiryDate}.</p>
       ${cards}
       <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
         <a href="/" class="btn primary">← Back to Dashboard</a>
         <a href="/api/linkedin-auth" class="btn">🔄 Reconnect</a>
       </div>`,
      'admin'
    );

  } catch (err) {
    logger.error('LinkedIn callback error', { error: err.message });
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
.card{border-radius:10px;padding:16px;margin-bottom:12px;animation:fadeIn .3s ease both}
.card.ok{background:#0f1a14;border:1px solid #166534}
.card.ok .title{color:#4ade80;font-size:16px;font-weight:700}
.card.new{background:#111318;border:1px solid #1e2028}
.card.new .title{font-size:16px;font-weight:700}
.sub{font-size:13px;color:#6b7280;margin-top:4px}
.sub strong{color:#fff}
.meta{font-size:12px;color:#4b5563;margin-top:4px}
.add-btn{margin-top:12px;padding:10px 20px;background:#0a66c2;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;transition:all .15s}
.add-btn:hover{background:#084d94}
.add-btn:disabled{opacity:0.6;cursor:wait}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #1e2028;color:#6b7280}
.btn.primary{background:#3b82f6;color:#fff;border:none}
a{color:#3b82f6}
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style></head><body><div class="wrap"><div class="logo">Grid Social</div>${body}</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/api/linkedin-callback' };
