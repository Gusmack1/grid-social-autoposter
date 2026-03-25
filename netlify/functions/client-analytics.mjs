// Client-Facing Analytics — publicly shareable read-only analytics via JWT token
import { db } from './lib/db/index.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { json, cors } from './lib/http.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { logger } from './lib/logger.mjs';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

async function getAnalyticsData(clientId) {
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return null;

  const allPosts = await db.getPosts(clientId);
  const now = Date.now();
  const rangeMs = 30 * 24 * 3600 * 1000; // default 30 days
  const published = allPosts.filter(p => p.status === 'published' && p.publishedAt);
  const recentPublished = published.filter(p => (now - new Date(p.publishedAt).getTime()) < rangeMs);

  // Posts by day
  const postsByDay = {};
  for (const p of recentPublished) {
    const day = new Date(p.publishedAt).toISOString().split('T')[0];
    postsByDay[day] = (postsByDay[day] || 0) + 1;
  }

  // Platform breakdown
  const platformBreakdown = {};
  for (const p of recentPublished) {
    if (p.results) {
      for (const [platform, result] of Object.entries(p.results)) {
        if (!platformBreakdown[platform]) platformBreakdown[platform] = { total: 0, success: 0, failed: 0 };
        platformBreakdown[platform].total++;
        if (result?.success) platformBreakdown[platform].success++;
        else platformBreakdown[platform].failed++;
      }
    }
  }

  // Post type breakdown
  const typeBreakdown = {};
  for (const p of recentPublished) {
    const t = p.postType || 'feed';
    typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
  }

  // Queue stats
  const queued = allPosts.filter(p => p.status === 'queued' || p.status === 'scheduled');
  const failed = allPosts.filter(p => p.status === 'failed');

  return {
    clientName: client.name,
    postsPublished: recentPublished.length,
    postsByDay,
    platformBreakdown,
    typeBreakdown,
    queued: queued.length,
    failed: failed.length,
    total: allPosts.length,
  };
}

// Serve analytics as standalone HTML page
function serveHtmlDashboard(clientName, analyticsData) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${clientName} - Grid Social Analytics</title>
  <style>
    :root { --bg: #0f172a; --bg-card: #1e293b; --text: #f1f5f9; --accent: #3b82f6; }
    body { font-family: system-ui; background: var(--bg); color: var(--text); margin: 0; padding: 20px; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .card { background: var(--bg-card); padding: 20px; border-radius: 8px; }
    .stat { font-size: 32px; font-weight: bold; color: var(--accent); }
    .label { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .breakdown { margin-top: 20px; }
    .breakdown-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
    .breakdown-item:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${clientName} - Social Media Analytics</h1>
    <p style="color: #94a3b8; margin-bottom: 30px;">Last 30 days of performance data</p>
    
    <div class="grid">
      <div class="card">
        <div class="stat">${analyticsData.postsPublished}</div>
        <div class="label">Posts Published</div>
      </div>
      <div class="card">
        <div class="stat">${analyticsData.queued}</div>
        <div class="label">Posts Queued</div>
      </div>
      <div class="card">
        <div class="stat">${analyticsData.total}</div>
        <div class="label">Total Posts</div>
      </div>
    </div>

    <div class="card">
      <h2>Platform Breakdown</h2>
      <div class="breakdown">
        ${Object.entries(analyticsData.platformBreakdown).map(([platform, data]) => `
          <div class="breakdown-item">
            <span>${platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
            <span>${data.success}/${data.total} successful</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <h2>Post Type Breakdown</h2>
      <div class="breakdown">
        ${Object.entries(analyticsData.typeBreakdown).map(([type, count]) => `
          <div class="breakdown-item">
            <span>${type}</span>
            <span>${count} posts</span>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const url = new URL(req.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return json({ error: 'token query param required' }, 400);
  }

  // Verify JWT token
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return json({ error: 'Invalid or expired token' }, 401);
  }

  const clientId = payload.clientId;
  if (!clientId) {
    return json({ error: 'Invalid token payload' }, 400);
  }

  const analyticsData = await getAnalyticsData(clientId);
  if (!analyticsData) {
    return json({ error: 'Client not found' }, 404);
  }

  // Return JSON if Accept header is application/json
  const accept = req.headers.get('Accept') || '';
  if (accept.includes('application/json')) {
    return json(analyticsData);
  }

  // Otherwise serve HTML page
  const html = serveHtmlDashboard(analyticsData.clientName, analyticsData);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors().headers },
  });
};
