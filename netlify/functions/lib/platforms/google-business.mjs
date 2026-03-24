// Google Business Profile — Local Posts API
// Google access tokens expire in 1 hour, so we refresh inline before posting
import { withRetry } from '../retry.mjs';
import { decrypt, encrypt } from '../crypto/encryption.mjs';
import { db } from '../db/index.mjs';
import { logger } from '../logger.mjs';

async function getValidToken(client) {
  let token = decrypt(client.gbpAccessToken);
  if (!token) return null;

  // Check if token is near expiry (within 10 minutes)
  if (client.gbpTokenExpiresAt) {
    const expiresAt = new Date(client.gbpTokenExpiresAt).getTime();
    const minsLeft = (expiresAt - Date.now()) / (60 * 1000);

    if (minsLeft <= 10 && client.gbpRefreshToken) {
      const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
      const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
      if (CLIENT_ID && CLIENT_SECRET) {
        try {
          const refreshToken = decrypt(client.gbpRefreshToken);
          const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: refreshToken,
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
            }),
          });
          const data = await res.json();
          if (data.access_token) {
            token = data.access_token;
            const clientList = await db.getClients();
            const idx = clientList.findIndex(c => c.id === client.id);
            if (idx !== -1) {
              clientList[idx].gbpAccessToken = encrypt(data.access_token);
              clientList[idx].gbpTokenExpiresAt = new Date(Date.now() + ((data.expires_in || 3600) * 1000)).toISOString();
              clientList[idx].gbpUpdatedAt = new Date().toISOString();
              await db.saveClients(clientList);
            }
            logger.info('GBP token refreshed inline', { client: client.name });
          }
        } catch (e) {
          logger.warn('GBP inline refresh failed', { client: client.name, error: e.message });
        }
      }
    }
  }
  return token;
}

export async function postGBP(client, caption, imageUrl) {
  const gbpId = client.gbpId;
  if (!gbpId) return null;
  const token = await getValidToken(client);
  if (!token) return null;

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
