// Client Connect Portal — branded page for client OAuth onboarding
// GET /connect?invite=TOKEN → shows connect page
// GET /connect?status=CLIENT_ID → shows connection status
import { db } from './lib/db/index.mjs';
import { verifyInviteToken, generateInviteLink } from './lib/invites.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { json, cors } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  const url = new URL(req.url);
  const inviteToken = url.searchParams.get('invite');
  const statusId = url.searchParams.get('status');
  const action = url.searchParams.get('action');

  // ── ADMIN: Generate invite link ──
  if (action === 'generate-invite' && req.method === 'POST') {
    const adminKey = process.env.ADMIN_KEY;
    const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return json({ error: 'Unauthorised' }, 401);

    let isAdmin = false;
    if (token === adminKey) isAdmin = true;
    else {
      const payload = await verifyJWT(token, jwtSecret);
      if (payload?.role === 'admin') isAdmin = true;
    }
    if (!isAdmin) return json({ error: 'Admin access required' }, 403);

    const body = await req.json();
    if (!body.clientId || !body.clientName) return json({ error: 'clientId and clientName required' }, 400);

    const invite = await generateInviteLink(body.clientId, body.clientName, url.origin);
    logger.info('Invite link generated', { clientId: body.clientId, clientName: body.clientName });
    return json({ success: true, ...invite });
  }

  // ── STATUS CHECK (for connected clients) ──
  if (statusId) {
    const clients = await db.getClients();
    const client = clients.find(c => c.id === statusId);
    if (!client) return renderPage('Not Found', '<p>This client was not found.</p>', url.origin);

    const platforms = [];
    if (client.fbPageId && client.pageAccessToken) platforms.push({ name: 'Facebook', icon: 'fb', connected: true });
    else platforms.push({ name: 'Facebook', icon: 'fb', connected: false });
    if (client.igUserId && client.pageAccessToken) platforms.push({ name: 'Instagram', icon: 'ig', connected: true });
    else platforms.push({ name: 'Instagram', icon: 'ig', connected: false });
    if (client.twitterAccessToken) platforms.push({ name: 'X / Twitter', icon: 'x', connected: true });
    else platforms.push({ name: 'X / Twitter', icon: 'x', connected: false });
    if (client.linkedinAccessToken) platforms.push({ name: 'LinkedIn', icon: 'li', connected: true });
    else platforms.push({ name: 'LinkedIn', icon: 'li', connected: false });
    if (client.tiktokAccessToken) platforms.push({ name: 'TikTok', icon: 'tt', connected: true });
    else platforms.push({ name: 'TikTok', icon: 'tt', connected: false });
    if (client.gbpAccessToken) platforms.push({ name: 'Google Business', icon: 'gbp', connected: true });
    else platforms.push({ name: 'Google Business', icon: 'gbp', connected: false });
    if (client.threadsUserId) platforms.push({ name: 'Threads', icon: 'th', connected: true });
    else platforms.push({ name: 'Threads', icon: 'th', connected: false });
    if (client.blueskyIdentifier) platforms.push({ name: 'Bluesky', icon: 'bsky', connected: true });
    else platforms.push({ name: 'Bluesky', icon: 'bsky', connected: false });
    if (client.pinterestAccessToken) platforms.push({ name: 'Pinterest', icon: 'pin', connected: true });
    else platforms.push({ name: 'Pinterest', icon: 'pin', connected: false });

    const connectedCount = platforms.filter(p => p.connected).length;
    const cards = platforms.map(p =>
      `<div class="platform-card ${p.connected ? 'connected' : 'disconnected'}">
        <span class="platform-icon">${platformEmoji(p.icon)}</span>
        <span class="platform-name">${p.name}</span>
        <span class="platform-status">${p.connected ? '✓ Connected' : '✗ Not connected'}</span>
      </div>`
    ).join('');

    return renderPage(
      `${client.name} — Connection Status`,
      `<h2>${client.name}</h2>
       <p class="dim">${connectedCount} of ${platforms.length} platforms connected</p>
       <div class="platform-grid">${cards}</div>
       <p style="margin-top:20px;font-size:13px;color:#6b7280;">
         If you need to reconnect or add platforms, please contact your account manager.
       </p>`,
      url.origin,
      { logoUrl: client.logoUrl, brandColor: client.brandColor, brandName: client.brandName }
    );
  }

  // ── CONNECT PAGE (invite required) ──
  if (!inviteToken) {
    return renderPage('Connect Your Accounts',
      `<h2>Connect Your Social Media</h2>
       <p>You need an invitation link to connect your accounts. Please contact your account manager for a link.</p>`,
      url.origin
    );
  }

  // Verify invite
  const invite = await verifyInviteToken(inviteToken);
  if (!invite) {
    return renderPage('Invalid Link',
      `<h2>Link Expired or Invalid</h2>
       <p>This invitation link has expired or is invalid. Please contact your account manager for a new link.</p>`,
      url.origin
    );
  }

  // Get client data
  const clients = await db.getClients();
  const client = clients.find(c => c.id === invite.clientId);
  const clientName = client?.name || invite.clientName;

  // Build connect buttons
  const metaConnectUrl = `/api/meta-auth?invite=${inviteToken}`;

  const platforms = [
    {
      name: 'Facebook & Instagram',
      icon: 'meta',
      description: 'Connect your Facebook Page and Instagram Business account',
      url: metaConnectUrl,
      available: true,
      connected: !!(client?.fbPageId && client?.pageAccessToken),
    },
    {
      name: 'X / Twitter',
      icon: 'x',
      description: 'Connect your X account for tweet scheduling',
      url: null,
      available: false,
      connected: !!client?.twitterAccessToken,
      note: 'Coming soon',
    },
    {
      name: 'LinkedIn',
      icon: 'li',
      description: 'Connect your LinkedIn Company Page',
      url: process.env.LINKEDIN_CLIENT_ID ? `/api/linkedin-auth?invite=${inviteToken}` : null,
      available: !!process.env.LINKEDIN_CLIENT_ID,
      connected: !!client?.linkedinAccessToken,
      note: process.env.LINKEDIN_CLIENT_ID ? null : 'Coming soon',
    },
    {
      name: 'TikTok',
      icon: 'tt',
      description: 'Connect your TikTok Business account',
      url: process.env.TIKTOK_CLIENT_KEY ? `/api/tiktok-auth?invite=${inviteToken}` : null,
      available: !!process.env.TIKTOK_CLIENT_KEY,
      connected: !!client?.tiktokAccessToken,
      note: process.env.TIKTOK_CLIENT_KEY ? null : 'Coming soon',
    },
    {
      name: 'Google Business Profile',
      icon: 'gbp',
      description: 'Connect your Google Business listing',
      url: process.env.GOOGLE_CLIENT_ID ? `/api/gbp-auth?invite=${inviteToken}` : null,
      available: !!process.env.GOOGLE_CLIENT_ID,
      connected: !!client?.gbpAccessToken,
      note: process.env.GOOGLE_CLIENT_ID ? null : 'Coming soon',
    },
    {
      name: 'Pinterest',
      icon: 'pin',
      description: 'Connect your Pinterest Business account',
      url: process.env.PINTEREST_APP_ID ? `/api/pinterest-auth?invite=${inviteToken}` : null,
      available: !!process.env.PINTEREST_APP_ID,
      connected: !!client?.pinterestAccessToken,
      note: process.env.PINTEREST_APP_ID ? null : 'Coming soon',
    },
  ];

  const cards = platforms.map(p => {
    if (p.connected) {
      return `<div class="connect-card connected">
        <div class="connect-icon">${platformEmoji(p.icon)}</div>
        <div class="connect-info">
          <div class="connect-name">${p.name}</div>
          <div class="connect-desc">✓ Connected</div>
        </div>
        <div class="connect-badge badge-connected">Connected</div>
      </div>`;
    }
    if (!p.available) {
      return `<div class="connect-card disabled">
        <div class="connect-icon">${platformEmoji(p.icon)}</div>
        <div class="connect-info">
          <div class="connect-name">${p.name}</div>
          <div class="connect-desc">${p.note || p.description}</div>
        </div>
        <div class="connect-badge badge-soon">Soon</div>
      </div>`;
    }
    return `<div class="connect-card">
      <div class="connect-icon">${platformEmoji(p.icon)}</div>
      <div class="connect-info">
        <div class="connect-name">${p.name}</div>
        <div class="connect-desc">${p.description}</div>
      </div>
      <a href="${p.url}" class="connect-btn">Connect</a>
    </div>`;
  }).join('');

  return renderPage(
    `Connect — ${clientName}`,
    `<div class="connect-header">
       <h2>Connect Your Accounts</h2>
       <p class="dim">Hi ${clientName}! Click the buttons below to securely connect your social media accounts. We'll handle the rest.</p>
     </div>
     <div class="connect-list">${cards}</div>
     <div class="connect-footer">
       <p>Your credentials are encrypted and stored securely. We only request the minimum permissions needed to schedule and publish posts on your behalf.</p>
       <p>Need help? Contact your account manager.</p>
     </div>`,
    url.origin,
    { logoUrl: client?.logoUrl, brandColor: client?.brandColor, brandName: client?.brandName }
  );
};

function platformEmoji(icon) {
  const map = {
    fb: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#e4405f"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
    meta: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    li: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#0a66c2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    tt: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#fff"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    gbp: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#4285f4"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34a853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fbbc05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#ea4335"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="24" height="24" fill="#e60023"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>',
  };
  return map[icon] || icon;
}

function renderPage(title, body, origin, branding = {}) {
  const brandColor = branding.brandColor || '#3b82f6';
  const brandName = branding.brandName || 'Grid Social';
  const logoHtml = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${brandName}" style="height:32px;margin-bottom:24px;" />`
    : `<div class="logo" style="color:${brandColor}">${brandName}</div>`;
  return new Response(`<!DOCTYPE html><html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Grid Social</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#0a0c10;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.wrap{max-width:520px;width:100%}
h2{font-size:24px;font-weight:700;color:#fff;margin-bottom:8px}
p{font-size:14px;line-height:1.6;margin-bottom:8px}
.dim{color:#6b7280;margin-bottom:24px}

/* Connect cards */
.connect-list{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.connect-card{display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;background:#111318;border:1px solid #1e2028;transition:all .15s}
.connect-card:not(.disabled):not(.connected):hover{border-color:#3b82f6;background:#12151c}
.connect-card.connected{border-color:#166534;background:#0f1a14}
.connect-card.disabled{opacity:0.5}
.connect-icon{width:40px;height:40px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#1a1d24;flex-shrink:0}
.connect-info{flex:1;min-width:0}
.connect-name{font-size:15px;font-weight:600;color:#fff}
.connect-desc{font-size:12px;color:#6b7280;margin-top:2px}
.connect-btn{padding:8px 20px;background:${brandColor};color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap;transition:background .15s}
.connect-btn:hover{background:${brandColor}dd}
.connect-badge{padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;white-space:nowrap}
.badge-connected{background:#166534;color:#86efac}
.badge-soon{background:#1e2028;color:#6b7280}

/* Status grid */
.platform-grid{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
.platform-card{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;background:#111318;border:1px solid #1e2028}
.platform-card.connected{border-color:#166534}
.platform-card.disconnected{opacity:0.5}
.platform-icon{font-size:18px}
.platform-name{flex:1;font-size:14px;font-weight:500}
.platform-status{font-size:12px;font-weight:500}
.platform-card.connected .platform-status{color:#4ade80}
.platform-card.disconnected .platform-status{color:#6b7280}

/* Footer */
.connect-footer{margin-top:24px;padding-top:20px;border-top:1px solid #1e2028}
.connect-footer p{font-size:12px;color:#4b5563;line-height:1.5}

/* Logo */
.logo{font-size:14px;font-weight:700;color:#3b82f6;margin-bottom:24px;letter-spacing:-0.5px}
</style>
</head><body>
<div class="wrap">
  ${logoHtml}
  ${body}
</div>
</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

export const config = { path: '/connect' };
