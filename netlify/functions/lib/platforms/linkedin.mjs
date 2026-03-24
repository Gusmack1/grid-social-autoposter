// LinkedIn — UGC Post API with image upload
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';

export async function postLinkedIn(client, caption, imageUrl) {
  const linkedinId = client.linkedinId;
  const token = decrypt(client.linkedinAccessToken);
  if (!linkedinId || !token) return null;

  const orgUrn = linkedinId.startsWith('urn:') ? linkedinId : `urn:li:organization:${linkedinId}`;

  return withRetry(async () => {
    let mediaAsset = null;

    if (imageUrl) {
      try {
        const rd = await (await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
          body: JSON.stringify({
            registerUploadRequest: {
              recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
              owner: orgUrn,
              serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }],
            },
          }),
        })).json();

        const uploadUrl = rd.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
        const asset = rd.value?.asset;

        if (uploadUrl && asset) {
          const ir = await fetch(imageUrl);
          if (ir.ok) {
            await fetch(uploadUrl, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': ir.headers.get('content-type') || 'image/jpeg' },
              body: Buffer.from(await ir.arrayBuffer()),
            });
            mediaAsset = asset;
          }
        }
      } catch (me) { /* continue without image */ }
    }

    const pb = {
      author: orgUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: mediaAsset ? 'IMAGE' : 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };
    if (mediaAsset) pb.specificContent['com.linkedin.ugc.ShareContent'].media = [{ status: 'READY', media: mediaAsset }];

    const pr = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' },
      body: JSON.stringify(pb),
    });
    if (pr.status === 201) return { success: true, id: pr.headers.get('x-restli-id') || 'created' };
    const ed = await pr.json().catch(() => ({}));
    throw new Error(ed.message || `HTTP ${pr.status}`);
  }, { label: 'linkedin-post' }).catch(err => ({ success: false, error: err.message }));
}
