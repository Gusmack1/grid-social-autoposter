// Analytics API — aggregates post history + pulls platform insights
// GET /api/analytics?clientId=X&range=30 → returns analytics data
import { db } from './lib/db/index.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { json, cors } from './lib/http.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { logger } from './lib/logger.mjs';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  // Auth check
  const adminKey = process.env.ADMIN_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'Unauthorised' }, 401);

  let isAuthed = false;
  if (token === adminKey) isAuthed = true;
  else {
    const payload = await verifyJWT(token, jwtSecret);
    if (payload) isAuthed = true;
  }
  if (!isAuthed) return json({ error: 'Unauthorised' }, 401);

  const url = new URL(req.url);
  const clientId = url.searchParams.get('clientId');
  const range = parseInt(url.searchParams.get('range') || '30', 10);

  if (!clientId) return json({ error: 'clientId required' }, 400);

  const clients = await db.getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return json({ error: 'Client not found' }, 404);

  // ── Internal analytics from post history ──
  const allPosts = await db.getPosts(clientId);
  const now = Date.now();
  const rangeMs = range * 24 * 3600 * 1000;
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

  // ── Platform insights (best-effort) ──
  const insights = {};

  // Facebook Page insights
  if (client.fbPageId && client.pageAccessToken) {
    try {
      const pageToken = decrypt(client.pageAccessToken);
      const since = Math.floor((now - rangeMs) / 1000);
      const until = Math.floor(now / 1000);

      // Page-level metrics
      const metricsRes = await fetch(
        `${GRAPH_API}/${client.fbPageId}/insights?metric=page_impressions,page_engaged_users,page_fans&period=day&since=${since}&until=${until}&access_token=${pageToken}`
      );
      const metricsData = await metricsRes.json();

      if (metricsData.data && !metricsData.error) {
        for (const metric of metricsData.data) {
          const values = metric.values || [];
          const total = values.reduce((sum, v) => sum + (v.value || 0), 0);
          insights[`fb_${metric.name}`] = {
            total,
            daily: values.map(v => ({ date: v.end_time?.split('T')[0], value: v.value })),
          };
        }
      }

      // Current fan count
      const pageRes = await fetch(`${GRAPH_API}/${client.fbPageId}?fields=fan_count,followers_count&access_token=${pageToken}`);
      const pageData = await pageRes.json();
      if (!pageData.error) {
        insights.fb_fans = pageData.fan_count || 0;
        insights.fb_followers = pageData.followers_count || 0;
      }
    } catch (e) {
      logger.warn('Facebook insights error', { client: client.name, error: e.message });
    }
  }

  // Instagram insights
  if (client.igUserId && client.pageAccessToken) {
    try {
      const pageToken = decrypt(client.pageAccessToken);

      // Account-level metrics
      const igRes = await fetch(
        `${GRAPH_API}/${client.igUserId}/insights?metric=impressions,reach,profile_views&period=day&since=${Math.floor((now - rangeMs) / 1000)}&until=${Math.floor(now / 1000)}&access_token=${pageToken}`
      );
      const igData = await igRes.json();

      if (igData.data && !igData.error) {
        for (const metric of igData.data) {
          const values = metric.values || [];
          const total = values.reduce((sum, v) => sum + (v.value || 0), 0);
          insights[`ig_${metric.name}`] = {
            total,
            daily: values.map(v => ({ date: v.end_time?.split('T')[0], value: v.value })),
          };
        }
      }

      // Current follower count
      const igProfileRes = await fetch(`${GRAPH_API}/${client.igUserId}?fields=followers_count,media_count&access_token=${pageToken}`);
      const igProfile = await igProfileRes.json();
      if (!igProfile.error) {
        insights.ig_followers = igProfile.followers_count || 0;
        insights.ig_media_count = igProfile.media_count || 0;
      }
    } catch (e) {
      logger.warn('Instagram insights error', { client: client.name, error: e.message });
    }
  }

  // ── Per-post engagement (best-effort for recent posts) ──
  const postEngagement = [];
  const engagementPosts = recentPublished.slice(0, 30); // limit to 30 most recent

  for (const post of engagementPosts) {
    const eng = {
      postId: post.id,
      caption: (post.caption || '').substring(0, 80),
      publishedAt: post.publishedAt,
      postType: post.postType || 'feed',
      platforms: post.platforms || [],
      metrics: {},
    };

    // Facebook post engagement
    if (post.results?.facebook?.success && post.results.facebook.id && client.pageAccessToken) {
      try {
        const pageToken = decrypt(client.pageAccessToken);
        const fbPostId = post.results.facebook.id;
        const engRes = await fetch(
          `${GRAPH_API}/${fbPostId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${pageToken}`
        );
        const engData = await engRes.json();
        if (!engData.error) {
          eng.metrics.facebook = {
            likes: engData.likes?.summary?.total_count || 0,
            comments: engData.comments?.summary?.total_count || 0,
            shares: engData.shares?.count || 0,
          };
        }
      } catch (e) { /* skip */ }
    }

    // Instagram post engagement
    if (post.results?.instagram?.success && post.results.instagram.id && client.pageAccessToken) {
      try {
        const pageToken = decrypt(client.pageAccessToken);
        const igMediaId = post.results.instagram.id;
        const igEngRes = await fetch(
          `${GRAPH_API}/${igMediaId}?fields=like_count,comments_count,timestamp&access_token=${pageToken}`
        );
        const igEngData = await igEngRes.json();
        if (!igEngData.error) {
          eng.metrics.instagram = {
            likes: igEngData.like_count || 0,
            comments: igEngData.comments_count || 0,
          };
        }
      } catch (e) { /* skip */ }
    }

    // Only include if we got any engagement data
    if (Object.keys(eng.metrics).length > 0) {
      postEngagement.push(eng);
    }
  }

  // Build engagement-over-time series (aggregate daily)
  const engagementByDay = {};
  for (const pe of postEngagement) {
    const day = pe.publishedAt ? new Date(pe.publishedAt).toISOString().split('T')[0] : null;
    if (!day) continue;
    if (!engagementByDay[day]) engagementByDay[day] = { likes: 0, comments: 0, shares: 0 };
    for (const m of Object.values(pe.metrics)) {
      engagementByDay[day].likes += m.likes || 0;
      engagementByDay[day].comments += m.comments || 0;
      engagementByDay[day].shares += m.shares || 0;
    }
  }

  return json({
    clientId,
    clientName: client.name,
    range,
    summary: {
      totalPublished: published.length,
      recentPublished: recentPublished.length,
      queued: queued.length,
      failed: failed.length,
      successRate: recentPublished.length > 0
        ? Math.round((recentPublished.filter(p => Object.values(p.results || {}).some(r => r?.success)).length / recentPublished.length) * 100)
        : 0,
    },
    postsByDay,
    platformBreakdown,
    typeBreakdown,
    insights,
    postEngagement,
    engagementByDay,
  });
};

export const config = { path: '/api/analytics' };
