// Pinterest — Create Pin API v5
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';
import { logger } from '../logger.mjs';

const API = 'https://api.pinterest.com/v5';

export async function postPinterest(client, caption, imageUrl) {
  const token = decrypt(client.pinterestAccessToken);
  if (!token) return { success: false, error: 'No Pinterest token' };
  if (!imageUrl) return { success: false, error: 'Pinterest requires an image' };

  const boardId = client.pinterestBoardId;
  if (!boardId) return { success: false, error: 'No Pinterest board configured' };

  return withRetry(async () => {
    // Split caption into title (first line) and description (rest)
    const lines = caption.split('\n').filter(l => l.trim());
    const title = (lines[0] || 'Pin').substring(0, 100);
    const description = lines.slice(1).join('\n').substring(0, 500) || caption.substring(0, 500);

    const pinData = {
      board_id: boardId,
      title,
      description,
      media_source: {
        source_type: 'image_url',
        url: imageUrl,
      },
    };

    // Add link if there's a URL in the caption
    const urlMatch = caption.match(/https?:\/\/[^\s]+/);
    if (urlMatch) pinData.link = urlMatch[0];

    const res = await fetch(`${API}/pins`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(pinData),
    });

    const data = await res.json();

    if (res.ok && data.id) {
      return { success: true, id: data.id, url: `https://pinterest.com/pin/${data.id}` };
    }

    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }, { label: 'pinterest-pin' }).catch(err => ({ success: false, error: err.message }));
}

export async function deletePinterestPin(client, pinId) {
  const token = decrypt(client.pinterestAccessToken);
  if (!token) return { success: false, error: 'No Pinterest token' };

  try {
    const res = await fetch(`${API}/pins/${pinId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return { success: res.status === 204 || res.ok };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Refresh Pinterest token (tokens expire in 30 days)
export async function refreshPinterestToken(client) {
  const refreshToken = client.pinterestRefreshToken ? decrypt(client.pinterestRefreshToken) : null;
  if (!refreshToken) return null;

  const clientId = process.env.PINTEREST_APP_ID;
  const clientSecret = process.env.PINTEREST_APP_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await res.json();
    if (data.access_token) {
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + (data.expires_in || 2592000) * 1000).toISOString(),
      };
    }
    logger.warn('Pinterest token refresh failed', { error: data.error });
    return null;
  } catch (err) {
    logger.warn('Pinterest token refresh error', { error: err.message });
    return null;
  }
}
