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

  // Fetch permalink for public link
  let permalink = null;
  try {
    const plr = await fetch(`${GRAPH_API}/${pd.id}?fields=permalink&access_token=${token}`);
    const pld = await plr.json();
    permalink = pld.permalink || null;
  } catch (_) { /* non-critical */ }

  return { success: true, id: pd.id, permalink };
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

// Carousel: create item containers, then carousel container, then publish
export async function postCarousel(client, caption, imageUrls) {
  if (!client.igUserId || !client.pageAccessToken || !imageUrls?.length) return null;
  if (imageUrls.length === 1) return postFeed(client, caption, imageUrls[0]);

  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    // Step 1: Create individual item containers
    const itemIds = [];
    for (const imgUrl of imageUrls.slice(0, 10)) { // IG max 10
      const r = await fetch(`${GRAPH_API}/${client.igUserId}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          image_url: imgUrl,
          is_carousel_item: 'true',
          access_token: token,
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(`Item container failed: ${d.error.message}`);
      itemIds.push(d.id);
    }

    // Step 2: Create carousel container
    const carouselRes = await fetch(`${GRAPH_API}/${client.igUserId}/media`, {
      method: 'POST',
      body: new URLSearchParams({
        media_type: 'CAROUSEL',
        caption,
        children: itemIds.join(','),
        access_token: token,
      }),
    });
    const carouselData = await carouselRes.json();
    if (carouselData.error) throw new Error(carouselData.error.message);

    // Step 3: Wait for processing
    let ready = false, attempts = 0;
    while (!ready && attempts < 15) {
      await new Promise(r => setTimeout(r, 3000));
      const sr = await fetch(`${GRAPH_API}/${carouselData.id}?fields=status_code&access_token=${token}`);
      const sd = await sr.json();
      if (sd.status_code === 'FINISHED') ready = true;
      else if (sd.status_code === 'ERROR') throw new Error('Carousel processing failed');
      attempts++;
    }
    if (!ready) throw new Error('Carousel processing timed out');

    // Step 4: Publish
    const pubRes = await fetch(`${GRAPH_API}/${client.igUserId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: carouselData.id, access_token: token }),
    });
    const pubData = await pubRes.json();
    if (pubData.error) throw new Error(pubData.error.message);
    return { success: true, id: pubData.id };
  }, { label: `ig-carousel-${client.igUserId}` }).catch(err => ({ success: false, error: err.message }));
}
