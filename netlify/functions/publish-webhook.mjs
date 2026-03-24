// Publish webhook — called by QStash for per-post scheduling
import { db } from './lib/db/index.mjs';
import { publishToAll } from './lib/publisher.mjs';
import { logger } from './lib/logger.mjs';

export default async (req) => {
  try {
    const body = await req.json();
    const { postId, clientId } = body;

    if (!postId || !clientId) {
      return new Response(JSON.stringify({ error: 'postId and clientId required' }), { status: 400 });
    }

    logger.info('Webhook triggered', { postId, clientId });

    // Get client and post
    const clients = await db.getClients();
    const client = clients.find(c => c.id === clientId);
    if (!client) {
      logger.error('Client not found', { clientId });
      return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404 });
    }

    const postList = await db.getPosts(clientId);
    const post = postList.find(p => p.id === postId);
    if (!post) {
      logger.error('Post not found', { postId });
      return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404 });
    }

    if (post.status === 'published') {
      logger.warn('Post already published', { postId });
      return new Response(JSON.stringify({ message: 'Already published' }), { status: 200 });
    }

    // Publish
    const results = await publishToAll(client, post);

    // Update
    const idx = postList.findIndex(p => p.id === postId);
    postList[idx].status = 'published';
    postList[idx].publishedAt = new Date().toISOString();
    postList[idx].results = results;
    await db.savePosts(clientId, postList);

    // History
    const historyData = await db.getHistory(clientId);
    historyData.push({
      id: postId,
      caption: post.caption.substring(0, 100),
      publishedAt: postList[idx].publishedAt,
      platforms: post.platforms,
      results,
    });
    await db.saveHistory(clientId, historyData);

    logger.info('Webhook publish complete', { postId, clientId, results });
    return new Response(JSON.stringify({ success: true, results }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    logger.error('Webhook error', { error: err.message, stack: err.stack });
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
