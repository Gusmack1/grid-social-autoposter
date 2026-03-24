// Facebook platform — feed posts, photos, reels, delete
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';
import { logger } from '../logger.mjs';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export async function postFeed(client, caption, imageUrl) {
  if (!client.fbPageId || !client.pageAccessToken) return null;
  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    let ep, bd;
    if (imageUrl) {
      ep = `${GRAPH_API}/${client.fbPageId}/photos`;
      bd = new URLSearchParams({ url: imageUrl, message: caption, access_token: token });
    } else {
      ep = `${GRAPH_API}/${client.fbPageId}/feed`;
      bd = new URLSearchParams({ message: caption, access_token: token });
    }
    const r = await fetch(ep, { method: 'POST', body: bd });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    return { success: true, id: d.id || d.post_id };
  }, { label: `fb-feed-${client.fbPageId}` }).catch(err => ({ success: false, error: err.message }));
}

export async function postReel(client, caption, videoUrl) {
  if (!client.fbPageId || !client.pageAccessToken || !videoUrl) return null;
  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    // Step 1: Init
    const initRes = await fetch(`${GRAPH_API}/${client.fbPageId}/video_reels`, {
      method: 'POST',
      body: new URLSearchParams({ upload_phase: 'start', access_token: token }),
    });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error.message);

    // Step 2: Transfer
    const upRes = await fetch(`${GRAPH_API}/${initData.video_id}`, {
      method: 'POST',
      body: new URLSearchParams({ upload_phase: 'transfer', file_url: videoUrl, access_token: token }),
    });
    const upData = await upRes.json();
    if (upData.error) throw new Error(upData.error.message);

    // Step 3: Finish
    const pubRes = await fetch(`${GRAPH_API}/${client.fbPageId}/video_reels`, {
      method: 'POST',
      body: new URLSearchParams({ upload_phase: 'finish', video_id: initData.video_id, description: caption, access_token: token }),
    });
    const pubData = await pubRes.json();
    if (pubData.error) throw new Error(pubData.error.message);
    return { success: true, id: pubData.id || initData.video_id };
  }, { label: `fb-reel-${client.fbPageId}` }).catch(err => ({ success: false, error: err.message }));
}

export async function deletePost(client, postId) {
  if (!client.pageAccessToken || !postId) return { deleted: false, error: 'Missing token or postId' };
  const token = decrypt(client.pageAccessToken);

  try {
    const d = await (await fetch(`${GRAPH_API}/${postId}?access_token=${token}`, { method: 'DELETE' })).json();
    return d.success !== false ? { deleted: true } : { deleted: false, error: d.error?.message };
  } catch (e) { return { deleted: false, error: e.message }; }
}

// Carousel: upload each image as unpublished photo, then create feed post with attached_media
export async function postCarousel(client, caption, imageUrls) {
  if (!client.fbPageId || !client.pageAccessToken || !imageUrls?.length) return null;
  if (imageUrls.length === 1) return postFeed(client, caption, imageUrls[0]);

  const token = decrypt(client.pageAccessToken);

  return withRetry(async () => {
    // Upload each image as unpublished
    const photoIds = [];
    for (const imgUrl of imageUrls.slice(0, 10)) { // FB max 10 images
      const r = await fetch(`${GRAPH_API}/${client.fbPageId}/photos`, {
        method: 'POST',
        body: new URLSearchParams({ url: imgUrl, published: 'false', access_token: token }),
      });
      const d = await r.json();
      if (d.error) throw new Error(`Photo upload failed: ${d.error.message}`);
      photoIds.push(d.id);
    }

    // Create feed post with attached_media
    const params = new URLSearchParams({ message: caption, access_token: token });
    photoIds.forEach((id, i) => params.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));

    const postRes = await fetch(`${GRAPH_API}/${client.fbPageId}/feed`, { method: 'POST', body: params });
    const postData = await postRes.json();
    if (postData.error) throw new Error(postData.error.message);
    return { success: true, id: postData.id };
  }, { label: `fb-carousel-${client.fbPageId}` }).catch(err => ({ success: false, error: err.message }));
}
