// Threads — Meta's Threads API (threads_basic + threads_content_publish)
// Uses the same page access token as Instagram (linked via Meta Business)
// API docs: https://developers.facebook.com/docs/threads
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';

const THREADS_API = 'https://graph.threads.net/v1.0';

export async function postThreads(client, caption, imageUrl) {
  const threadsUserId = client.threadsUserId;
  const token = client.threadsAccessToken
    ? decrypt(client.threadsAccessToken)
    : client.pageAccessToken
      ? decrypt(client.pageAccessToken)
      : null;

  if (!threadsUserId || !token) return null;

  return withRetry(async () => {
    // Step 1: Create a media container
    const containerParams = new URLSearchParams({
      text: caption,
      access_token: token,
    });

    if (imageUrl) {
      containerParams.set('media_type', 'IMAGE');
      containerParams.set('image_url', imageUrl);
    } else {
      containerParams.set('media_type', 'TEXT');
    }

    const containerRes = await fetch(
      `${THREADS_API}/${threadsUserId}/threads`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: containerParams.toString(),
      }
    );
    const containerData = await containerRes.json();

    if (containerData.error) {
      throw new Error(containerData.error.message || 'Container creation failed');
    }

    const containerId = containerData.id;
    if (!containerId) throw new Error('No container ID returned');

    // Step 2: Wait for container to be ready (Threads processes media async)
    let ready = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await fetch(
        `${THREADS_API}/${containerId}?fields=status&access_token=${token}`
      );
      const statusData = await statusRes.json();
      if (statusData.status === 'FINISHED') { ready = true; break; }
      if (statusData.status === 'ERROR') throw new Error('Media processing failed');
    }

    if (!ready) throw new Error('Media processing timeout');

    // Step 3: Publish the container
    const publishRes = await fetch(
      `${THREADS_API}/${threadsUserId}/threads_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: token,
        }).toString(),
      }
    );
    const publishData = await publishRes.json();

    if (publishData.error) {
      throw new Error(publishData.error.message || 'Publish failed');
    }

    return {
      success: true,
      id: publishData.id,
      platform: 'threads',
    };
  }, { label: 'threads-post' }).catch(err => ({
    success: false,
    error: err.message,
    platform: 'threads',
  }));
}

export async function deleteThread(client, postId) {
  // Threads API doesn't currently support deletion via API
  return { success: false, error: 'Threads API does not support post deletion' };
}
