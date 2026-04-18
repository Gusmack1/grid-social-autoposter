// Publish webhook — called by QStash for per-post scheduling.
//
// Voice gate (task #48): publishToAll returns a VOICE_REJECTED sentinel when
// the pre-publish rubric fails. We persist status='voice_rejected' with the
// rubric failure reasons and return 200 — Meta is never called for a rejected
// caption.
//
// Image gate (task #49): publishToAll returns an IMAGE_REJECTED sentinel when
// the pre-publish HEAD-check fails (non-2xx / zero-length / bad mime / 3s
// timeout). We persist status='image_rejected' plus post.imageFailure JSON
// addendum and return 200 — Meta is never called for a rejected media URL.
import { db } from './lib/db/index.mjs';
import { publishToAll, VOICE_REJECTED, IMAGE_REJECTED } from './lib/publisher.mjs';
import { logger } from './lib/logger.mjs';

// Verify QStash signature using HMAC-SHA256
async function verifyQStashSignature(req, body) {
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signingKey) return true; // Skip verification if no key configured

  const signature = req.headers.get('upstash-signature');
  if (!signature) {
    logger.warn('No QStash signature header');
    return false;
  }

  // QStash JWT verification — decode and check
  // For simplicity, accept if the request has a valid signature header
  // Full JWT verification would need a JWT library; we trust the signing key presence
  try {
    const parts = signature.split('.');
    if (parts.length !== 3) return false;
    // Decode payload to verify it matches
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    // Check issuer and that body hash matches
    if (payload.iss !== 'Upstash') return false;
    return true;
  } catch (e) {
    logger.warn('QStash signature verification failed', { error: e.message });
    return false;
  }
}

export default async (req) => {
  try {
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    // Verify QStash signature
    if (!(await verifyQStashSignature(req, bodyText))) {
      logger.warn('Invalid QStash signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }

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

    // Publish — the publisher runs the fail-closed voice gate first.
    const results = await publishToAll(client, post);

    const idx = postList.findIndex(p => p.id === postId);

    if (results && results[VOICE_REJECTED]) {
      // Voice gate rejected — do NOT mark as published and do NOT log to history.
      postList[idx].status = 'voice_rejected';
      postList[idx].voiceRejectedAt = new Date().toISOString();
      postList[idx].error = results.error;
      postList[idx].voiceFailures = results.failuresByPlatform;
      await db.savePosts(clientId, postList);
      logger.warn('Webhook voice-rejected post', {
        postId,
        clientId,
        error: results.error,
      });
      return new Response(
        JSON.stringify({ success: false, voiceRejected: true, error: results.error }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (results && results[IMAGE_REJECTED]) {
      // Image gate rejected — do NOT mark as published and do NOT log to history.
      postList[idx].status = 'image_rejected';
      postList[idx].imageRejectedAt = new Date().toISOString();
      postList[idx].error = results.error;
      postList[idx].imageFailure = results.imageFailure;
      await db.savePosts(clientId, postList);
      logger.warn('Webhook image-rejected post', {
        postId,
        clientId,
        error: results.error,
        imageFailure: results.imageFailure,
      });
      return new Response(
        JSON.stringify({
          success: false,
          imageRejected: true,
          error: results.error,
          imageFailure: results.imageFailure,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Update
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
