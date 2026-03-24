// Instagram platform — feed posts, stories, reels
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';
import { logger } from '../logger.mjs';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

// Shared container → wait → publish flow
async function createAndPublish(igUserId, token, containerParams, { pollInterval = 3000, maxAttempts = 10 } = {}) {
  // Step 1: Create container
  const cr = await fetch(`${GRAPH_API}/${igUserId}/media`, {
    method: 'POST',
    body: new URLSearchParams({ ...containerParams, access_token: token }),
  });
  const cd = await cr.json();
  if (cd.error) throw new Error(cd.error.message);

  // Step 2: Poll for processing
  let ready = false, attempts = 0;
  while (!ready && attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, pollInterval));
    const sr = await fetch(`${GRAPH_API}/${cd.id}?fields=status_code&access_token=${token}`);
    const sd = await sr.json();
    if (sd.status_code === 'FINISHED') ready = true;
    else if (sd.status_code === 'ERROR') throw new Error('Media processing failed');
    attempts++;
  }
  if (!ready) throw new Error('Media processing timed out');

  // Step 3: Publish
  const pr = await fetch(`${GRAPH_API}/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: cd.id, access_token: token }),
  });
  const pd = await pr.json();
  if (pd.error) throw new Error(pd.error.message);
  return { success: true, id: pd.id };
}

export async function postFeed(client, caption, imageUrl) {
  if (!client.igUserId || !client.pageAccessToken || !imageUrl) return null;
  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    return createAndPublish(client.igUserId, token, { image_url: imageUrl, caption });
  }, { label: `ig-feed-${client.igUserId}` }).catch(err => ({ success: false, error: err.message }));
}

export async function postStory(client, caption, imageUrl) {
  if (!client.igUserId || !client.pageAccessToken || !imageUrl) return null;
  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    return createAndPublish(client.igUserId, token, { image_url: imageUrl, media_type: 'STORIES' });
  }, { label: `ig-story-${client.igUserId}` }).catch(err => ({ success: false, error: err.message }));
}

export async function postReel(client, caption, videoUrl) {
  if (!client.igUserId || !client.pageAccessToken || !videoUrl) return null;
  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    return createAndPublish(client.igUserId, token, {
      video_url: videoUrl, caption, media_type: 'REELS', share_to_feed: 'true',
    }, { pollInterval: 5000, maxAttempts: 30 });
  }, { label: `ig-reel-${client.igUserId}` }).catch(err => ({ success: false, error: err.message }));
}

export async function deletePost(client, postId) {
  if (!client.pageAccessToken || !postId) return { deleted: false, error: 'Missing token or postId' };
  const token = decrypt(client.pageAccessToken);
  try {
    const d = await (await fetch(`${GRAPH_API}/${postId}?access_token=${token}`, { method: 'DELETE' })).json();
    return d.success !== false ? { deleted: true } : { deleted: false, error: d.error?.message };
  } catch (e) { return { deleted: false, error: e.message }; }
}
