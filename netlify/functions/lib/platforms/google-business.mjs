// Google Business Profile — Local Posts API
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';

export async function postGBP(client, caption, imageUrl) {
  const gbpId = client.gbpId;
  const token = decrypt(client.gbpAccessToken);
  if (!gbpId || !token) return null;

  const loc = gbpId.startsWith('accounts/') ? gbpId : `accounts/${gbpId}`;

  return withRetry(async () => {
    const body = { languageCode: 'en-GB', summary: caption.substring(0, 1500), topicType: 'STANDARD' };
    if (imageUrl) body.media = [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }];
    if (client.gbpCta && client.gbpCtaUrl) body.callToAction = { actionType: client.gbpCta, url: client.gbpCtaUrl };

    const d = await (await fetch(`https://mybusiness.googleapis.com/v4/${loc}/localPosts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })).json();
    if (d.name) return { success: true, id: d.name };
    throw new Error(d.error?.message || `HTTP ${d.error?.code}`);
  }, { label: 'gbp-post' }).catch(err => ({ success: false, error: err.message }));
}
