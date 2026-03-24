// Scheduled auto-poster v4 — delegates to publisher module
// Runs daily at 10:00 UTC (11:00 BST)
import { db } from './lib/db/index.mjs';
import { publishToAll } from './lib/publisher.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  logger.info('Scheduler triggered');

  const clientList = await db.getClients();
  if (!clientList || clientList.length === 0) {
    logger.info('No clients configured');
    return new Response(JSON.stringify({ message: 'No clients' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const results = [];

  for (const client of clientList) {
    const hasAnyToken = client.pageAccessToken || client.twitterAccessToken || client.linkedinAccessToken || client.gbpAccessToken || client.tiktokAccessToken;
    if (!hasAnyToken) {
      logger.info('No API tokens, skipping', { client: client.name });
      results.push({ client: client.name, status: 'skipped', reason: 'No API tokens' });
      continue;
    }

    const postList = await db.getPosts(client.id);
    if (!postList || postList.length === 0) {
      results.push({ client: client.name, status: 'skipped', reason: 'No posts' });
      continue;
    }

    // Find next queued or due scheduled post
    const now = new Date();
    const nextPost = postList.find(p => {
      if (p.status === 'queued') return true;
      if (p.status === 'scheduled' && p.scheduledFor) return new Date(p.scheduledFor) <= now;
      return false;
    });

    if (!nextPost) {
      results.push({ client: client.name, status: 'skipped', reason: 'No queued posts' });
      continue;
    }

    logger.info('Publishing post', {
      client: client.name,
      postId: nextPost.id,
      postType: nextPost.postType || 'feed',
      platforms: nextPost.platforms,
      caption: nextPost.caption.substring(0, 50),
    });

    // Publish via unified publisher (parallel, with retry)
    const postResults = await publishToAll(client, nextPost);

    // Update post status
    const idx = postList.findIndex(p => p.id === nextPost.id);
    postList[idx].status = 'published';
    postList[idx].publishedAt = new Date().toISOString();
    postList[idx].results = postResults;
    await db.savePosts(client.id, postList);

    // Log to history
    const historyData = await db.getHistory(client.id);
    historyData.push({
      id: nextPost.id,
      caption: nextPost.caption.substring(0, 100),
      publishedAt: postList[idx].publishedAt,
      platforms: nextPost.platforms,
      results: postResults,
    });
    await db.saveHistory(client.id, historyData);

    results.push({
      client: client.name,
      status: 'published',
      postId: nextPost.id,
      platforms: Object.keys(postResults),
      results: postResults,
    });
  }

  logger.info('Scheduler complete', { processed: results.length });
  return new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

export const config = {
  schedule: '0 10 * * *',
};
