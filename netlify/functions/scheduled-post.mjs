// Scheduled auto-poster v4 — delegates to publisher module
// Runs every 15 minutes so per-post scheduledFor timestamps actually fire on time.
//
// Voice gate (task #48): publishToAll returns a VOICE_REJECTED sentinel when the
// pre-publish rubric fails. We mark the post status='voice_rejected', log the
// failure reasons in post.error, and do NOT mark it as published.
//
// Image gate (task #49): publishToAll returns an IMAGE_REJECTED sentinel when
// the pre-publish HEAD-check fails (non-2xx / zero length / bad mime / 3s
// timeout). We mark post.status='image_rejected', persist post.imageFailure
// JSON addendum, and do NOT call Meta.
import { db } from './lib/db/index.mjs';
import { publishToAll, VOICE_REJECTED, IMAGE_REJECTED } from './lib/publisher.mjs';
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
    const hasAnyToken = client.pageAccessToken || client.twitterAccessToken || client.linkedinAccessToken || client.gbpAccessToken || client.tiktokAccessToken || client.threadsUserId || client.blueskyIdentifier || client.pinterestAccessToken;
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

    // Auto-approve passive posts that have passed their deadline
    const now = new Date();
    let passiveApproved = 0;
    for (let i = 0; i < postList.length; i++) {
      const p = postList[i];
      if (p.approvalStatus === 'pending' && p.approvalMode === 'passive' && p.passiveDeadline) {
        if (new Date(p.passiveDeadline) <= now) {
          postList[i].approvalStatus = 'approved';
          postList[i].approvedAt = now.toISOString();
          postList[i].approvedBy = 'passive-auto';
          passiveApproved++;
        }
      }
    }
    if (passiveApproved > 0) {
      await db.savePosts(client.id, postList);
      logger.info('Passive approval auto-approved posts', { client: client.name, count: passiveApproved });
    }

    // Find next queued or due scheduled post that is approved (or has no approval status = legacy)
    const nextPost = postList.find(p => {
      const isReady = p.status === 'queued' || (p.status === 'scheduled' && p.scheduledFor && new Date(p.scheduledFor) <= now);
      if (!isReady) return false;
      // Approval gate: only publish approved posts (or legacy posts without approval status)
      const isApproved = !p.approvalStatus || p.approvalStatus === 'approved';
      return isApproved;
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

    // Publish via unified publisher (parallel, with retry). The publisher runs
    // the fail-closed voice gate first and will short-circuit with a sentinel
    // if the caption fails the rubric.
    const postResults = await publishToAll(client, nextPost);

    const idx = postList.findIndex(p => p.id === nextPost.id);
    if (postResults && postResults[VOICE_REJECTED]) {
      // Voice gate rejected — do NOT mark as published and do NOT log to history.
      postList[idx].status = 'voice_rejected';
      postList[idx].voiceRejectedAt = new Date().toISOString();
      postList[idx].error = postResults.error;
      postList[idx].voiceFailures = postResults.failuresByPlatform;
      await db.savePosts(client.id, postList);
      logger.warn('Post voice-rejected', {
        client: client.name,
        postId: nextPost.id,
        error: postResults.error,
      });
      results.push({
        client: client.name,
        status: 'voice_rejected',
        postId: nextPost.id,
        error: postResults.error,
      });
      continue;
    }

    if (postResults && postResults[IMAGE_REJECTED]) {
      // Image gate rejected — do NOT mark as published and do NOT log to history.
      postList[idx].status = 'image_rejected';
      postList[idx].imageRejectedAt = new Date().toISOString();
      postList[idx].error = postResults.error;
      postList[idx].imageFailure = postResults.imageFailure;
      await db.savePosts(client.id, postList);
      logger.warn('Post image-rejected', {
        client: client.name,
        postId: nextPost.id,
        error: postResults.error,
        imageFailure: postResults.imageFailure,
      });
      results.push({
        client: client.name,
        status: 'image_rejected',
        postId: nextPost.id,
        error: postResults.error,
        imageFailure: postResults.imageFailure,
      });
      continue;
    }

    // Update post status
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
  schedule: '*/15 * * * *',
};
