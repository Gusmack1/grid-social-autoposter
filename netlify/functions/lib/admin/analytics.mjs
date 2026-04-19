// lib/admin/analytics.mjs — owns the `export-analytics` action (extracted from admin.mjs)
import { db } from '../db/index.mjs';
import { json, badRequest } from '../http.mjs';

export async function handleExportAnalytics(req, ctx) {
  const { url, clientId } = ctx;
  if (!clientId) return badRequest('clientId required');
  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  const allPosts = await db.getPosts(clientId);
  const range = parseInt(url.searchParams.get('range') || '30');
  const since = new Date(Date.now() - range * 86400000);

  const published = allPosts.filter(p => p.status === 'published' && p.publishedAt && new Date(p.publishedAt) >= since);
  const queued = allPosts.filter(p => p.status === 'queued' || p.status === 'scheduled');
  const failed = allPosts.filter(p => p.status === 'failed');

  const platformBreakdown = {};
  for (const p of published) {
    for (const plat of (p.platforms || [])) {
      if (!platformBreakdown[plat]) platformBreakdown[plat] = { success: 0, failed: 0 };
      const r = p.results?.[plat];
      if (r?.success) platformBreakdown[plat].success++;
      else platformBreakdown[plat].failed++;
    }
  }

  const postsByDay = {};
  for (const p of published) {
    const day = new Date(p.publishedAt).toISOString().split('T')[0];
    postsByDay[day] = (postsByDay[day] || 0) + 1;
  }

  const report = {
    clientName: client?.name || clientId,
    range,
    generatedAt: new Date().toISOString(),
    summary: {
      totalPublished: published.length,
      queued: queued.length,
      failed: failed.length,
      successRate: published.length > 0 ? Math.round((published.filter(p => {
        const results = p.results || {};
        return Object.values(results).some(r => r?.success);
      }).length / published.length) * 100) : 0,
    },
    platformBreakdown,
    postsByDay,
    recentPosts: published.slice(0, 20).map(p => ({
      caption: (p.caption || '').substring(0, 100),
      platforms: p.platforms,
      publishedAt: p.publishedAt,
      postType: p.postType,
    })),
  };

  return json(report);
}
