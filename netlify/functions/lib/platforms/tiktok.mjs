// TikTok — Content Posting API (photo/video)
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';

export async function postTikTok(client, caption, imageUrl) {
  const token = decrypt(client.tiktokAccessToken);
  if (!token || !imageUrl) return null;

  return withRetry(async () => {
    const pd = await (await fetch('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 2200),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [imageUrl] },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      }),
    })).json();
    if (pd.data?.publish_id) return { success: true, id: pd.data.publish_id };
    throw new Error(pd.error?.message || `HTTP ${pd.error?.code}`);
  }, { label: 'tiktok-post' }).catch(err => ({ success: false, error: err.message }));
}
