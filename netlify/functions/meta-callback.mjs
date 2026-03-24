// Meta OAuth — Step 2: Handle callback, exchange code for permanent page token
// Supports admin flow (back to dashboard) and client flow (back to connect portal)
import { db } from './lib/db/index.mjs';
import { encrypt } from './lib/crypto/encryption.mjs';
import { verifyInviteToken } from './lib/invites.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const stateParam = url.searchParams.get('state');

  // Parse state
  let state = {};
  try { state = JSON.parse(atob(stateParam)); } catch {}
  const isClientFlow = state.flow === 'client' && state.invite;

  if (error || !code) {
    const backUrl = isClientFlow ? `/connect?invite=${state.invite}` : '/';
    return htmlResponse('OAuth Error',
      `<p>Facebook login was cancelled or failed.</p><p>Error: ${error || 'No code received'}</p><p><a href="${backUrl}">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  const APP_ID = process.env.META_APP_ID;
  const APP_SECRET = process.env.META_APP_SECRET;
  const redirectUri = `${url.origin}/api/meta-callback`;

  if (!APP_ID || !APP_SECRET) {
    return htmlResponse('Config Error',
      `<p>Missing env vars.</p><p><a href="/">← Back</a></p>`,
      isClientFlow ? 'client' : 'admin'
    );
  }

  try {
    // Step 1: Exchange code for short-lived user token
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`);
    const tokenData = await tokenRes.json().catch(() => ({ error: { message: 'Invalid response' } }));
    if (tokenData.error) {
      return htmlResponse('Token Error', `<p>${tokenData.error.message}</p><p><a href="/api/meta-auth${isClientFlow ? '?invite=' + state.invite : ''}">Try Again</a></p>`, isClientFlow ? 'client' : 'admin');
    }

    // Step 2: Exchange for long-lived token
    const llRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${tokenData.access_token}`);
    const llData = await llRes.json();
    if (llData.error) {
      return htmlResponse('Exchange Error', `<p>${llData.error.message}</p>`, isClientFlow ? 'client' : 'admin');
    }

    const longLivedUserToken = llData.access_token;

    // Step 3: Get ALL page tokens (with pagination)
    let pages = [];
    let nextUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}&fields=id,name,access_token,instagram_business_account&limit=100`;
    while (nextUrl) {
      const pagesRes = await fetch(nextUrl);
      const pagesData = await pagesRes.json();
      if (pagesData.error) break;
      if (pagesData.data) pages = pages.concat(pagesData.data);
      nextUrl = pagesData.paging?.next || null;
    }

    // Step 4: Match to clients and save (encrypt tokens!)
    const clientList = await db.getClients();
    const results = [];

    // ── CLIENT PORTAL FLOW ──
    if (isClientFlow) {
      const invite = await verifyInviteToken(state.invite);
      if (!invite) {
        return htmlResponse('Invalid Link', '<p>Your invitation link has expired. Please contact your account manager for a new link.</p>', 'client');
      }

      const clientIdx = clientList.findIndex(c => c.id === invite.clientId);
      if (clientIdx === -1) {
        return htmlResponse('Client Not Found', '<p>The client associated with this link was not found.</p>', 'client');
      }

      const client = clientList[clientIdx];
      let matched = false;

      // Try matching by fbPageId first
      if (client.fbPageId) {
        const page = pages.find(p => p.id === client.fbPageId);
        if (page) {
          clientList[clientIdx].pageAccessToken = encrypt(page.access_token);
          if (page.instagram_business_account?.id && !client.igUserId) {
            clientList[clientIdx].igUserId = page.instagram_business_account.id;
          }
          clientList[clientIdx].tokenUpdatedAt = new Date().toISOString();
          matched = true;
          results.push({ name: page.name, status: 'connected', igId: page.instagram_business_account?.id });
        } else {
          // Try direct page token fetch for New Pages Experience
          try {
            const directRes = await fetch(`https://graph.facebook.com/v21.0/${client.fbPageId}?fields=access_token,name,instagram_business_account&access_token=${longLivedUserToken}`);
            const directData = await directRes.json();
            if (directData.access_token) {
              clientList[clientIdx].pageAccessToken = encrypt(directData.access_token);
              if (directData.instagram_business_account?.id && !client.igUserId) {
                clientList[clientIdx].igUserId = directData.instagram_business_account.id;
              }
              clientList[clientIdx].tokenUpdatedAt = new Date().toISOString();
              matched = true;
              results.push({ name: directData.name || client.name, status: 'connected', igId: directData.instagram_business_account?.id });
            }
          } catch {}
        }
      }

      // If no fbPageId set, let client pick from their pages
      if (!matched && pages.length > 0) {
        if (pages.length === 1) {
          // Auto-assign single page
          const page = pages[0];
          clientList[clientIdx].fbPageId = page.id;
          clientList[clientIdx].pageAccessToken = encrypt(page.access_token);
          if (page.instagram_business_account?.id) clientList[clientIdx].igUserId = page.instagram_business_account.id;
          clientList[clientIdx].tokenUpdatedAt = new Date().toISOString();
          matched = true;
          results.push({ name: page.name, status: 'connected', igId: page.instagram_business_account?.id });
        } else {
          // Multiple pages — show picker
          await db.saveClients(clientList);
          const pageCards = pages.map(p => 
            `<div class="card new" id="page-${p.id}">
              <div class="title" style="color:#f59e0b;">○ ${p.name}</div>
              <div class="meta">Page ID: ${p.id}${p.instagram_business_account?.id ? ' · IG: ' + p.instagram_business_account.id : ''}</div>
              <button class="add-btn" onclick="pickPage('${p.id}','${p.name}','${p.instagram_business_account?.id || ''}','${p.access_token.replace(/'/g, "\\'")}',this)">Use this page</button>
            </div>`
          ).join('');

          return htmlResponse('Choose Your Page',
            `<h2>Which page is for ${client.name}?</h2>
             <p class="dim">We found ${pages.length} pages. Choose the one you'd like to connect.</p>
             ${pageCards}
             <script>
             async function pickPage(pageId, name, igId, token, btn) {
               btn.disabled = true; btn.textContent = 'Connecting...';
               try {
                 const r = await fetch('/api/admin?action=update-client', {
                   method: 'PUT',
                   headers: { 'Authorization': 'Bearer ${process.env.ADMIN_KEY}', 'Content-Type': 'application/json' },
                   body: JSON.stringify({ id: '${invite.clientId}', fbPageId: pageId, igUserId: igId, pageAccessToken: token })
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
      }

      if (!matched && pages.length === 0) {
        return htmlResponse('No Pages Found',
          `<p>No Facebook Pages were found on your account. Make sure you're an admin of the page you want to connect.</p>
           <p><a href="/api/meta-auth?invite=${state.invite}">Try Again</a></p>`,
          'client'
        );
      }

      await db.saveClients(clientList);
      logger.info('Client connected via portal', { clientId: invite.clientId, platforms: results });

      // Redirect to status page
      return Response.redirect(`${url.origin}/connect?status=${invite.clientId}`, 302);
    }

    // ── ADMIN FLOW (existing behaviour) ──
    for (const page of pages) {
      const igAccount = page.instagram_business_account?.id || null;
      let matchIdx = clientList.findIndex(c => c.fbPageId === page.id);
      if (matchIdx === -1) {
        matchIdx = clientList.findIndex(c => {
          if (!c.name || c.fbPageId) return false;
          const cn = c.name.toLowerCase();
          const pn = page.name.toLowerCase();
          return cn === pn || cn.includes(pn) || pn.includes(cn);
        });
      }
      if (matchIdx !== -1) {
        clientList[matchIdx].pageAccessToken = encrypt(page.access_token);
        if (!clientList[matchIdx].fbPageId) clientList[matchIdx].fbPageId = page.id;
        if (igAccount && !clientList[matchIdx].igUserId) clientList[matchIdx].igUserId = igAccount;
        clientList[matchIdx].tokenUpdatedAt = new Date().toISOString();
        results.push({ name: page.name, pageId: page.id, igId: igAccount, status: 'updated', clientName: clientList[matchIdx].name });
      } else {
        results.push({ name: page.name, pageId: page.id, igId: igAccount, token: page.access_token, status: 'unmatched' });
      }
    }

    // Direct fetch for unmatched clients
    for (let i = 0; i < clientList.length; i++) {
      const c = clientList[i];
      if (c.fbPageId && !results.find(r => r.pageId === c.fbPageId && r.status === 'updated')) {
        try {
          const directRes = await fetch(`https://graph.facebook.com/v21.0/${c.fbPageId}?fields=access_token,name,instagram_business_account&access_token=${longLivedUserToken}`);
          const directData = await directRes.json();
          if (directData.access_token) {
            clientList[i].pageAccessToken = encrypt(directData.access_token);
            if (directData.instagram_business_account?.id && !clientList[i].igUserId) clientList[i].igUserId = directData.instagram_business_account.id;
            clientList[i].tokenUpdatedAt = new Date().toISOString();
            results.push({ name: directData.name || c.name, pageId: c.fbPageId, igId: directData.instagram_business_account?.id || null, status: 'updated', clientName: c.name });
          }
        } catch {}
      }
    }

    await db.saveClients(clientList);

    // Build admin results page
    let cards = '';
    for (const r of results) {
      if (r.status === 'updated') {
        cards += `<div class="card ok"><div class="title">✓ ${r.name}</div><div class="sub">Matched to: <strong>${r.clientName}</strong></div><div class="meta">Page: ${r.pageId}${r.igId ? ' · IG: ' + r.igId : ''}</div></div>`;
      } else {
        cards += `<div class="card new" id="page-${r.pageId}"><div class="title" style="color:#f59e0b;">○ ${r.name}</div><div class="sub">Not yet added as a client</div><div class="meta">Page ID: ${r.pageId}${r.igId ? ' · IG: ' + r.igId : ''}</div><button class="add-btn" onclick="addClient('${r.name}','${r.pageId}','${r.igId || ''}','${r.token.replace(/'/g, "\\'")}',this)">+ Add as Client</button></div>`;
      }
    }

    return htmlResponse('Facebook Connected',
      `<h2>✅ Facebook Connected!</h2>
       <p class="dim">Found ${pages.length} page(s). Tokens are now encrypted.</p>
       ${cards}
       <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap;">
         <a href="/" class="btn primary">← Back to Dashboard</a>
         <a href="/api/meta-auth" class="btn">🔄 Reconnect</a>
       </div>
       <script>
       async function addClient(name, pageId, igId, token, btn) {
         btn.disabled = true; btn.textContent = 'Adding...';
         const key = localStorage.getItem('gs_token') || localStorage.getItem('gsa_key');
         if (!key) { btn.textContent = 'Error: Not logged in'; return; }
         try {
           const r = await fetch('/api/admin?action=add-client', {
             method: 'POST',
             headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
             body: JSON.stringify({ name, fbPageId: pageId, igUserId: igId, pageAccessToken: token })
           });
           const d = await r.json();
           if (d.success) {
             const card = document.getElementById('page-' + pageId);
             card.className = 'card ok';
             card.innerHTML = '<div class="title">✓ ' + name + '</div><div class="sub">Added as new client!</div>';
           } else { btn.textContent = 'Error: ' + (d.error || 'Failed'); }
         } catch(e) { btn.textContent = 'Error: ' + e.message; }
       }
       </script>`,
      'admin'
    );

  } catch (err) {
    logger.error('Meta callback error', { error: err.message });
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
.add-btn{margin-top:12px;padding:10px 20px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;width:100%;transition:all .15s}
.add-btn:hover{background:#2563eb}
.add-btn:disabled{opacity:0.6;cursor:wait}
.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid #1e2028;color:#6b7280}
.btn.primary{background:#3b82f6;color:#fff;border:none}
a{color:#3b82f6}
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
</style></head><body><div class="wrap"><div class="logo">Grid Social</div>${body}</div></body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/api/meta-callback' };
