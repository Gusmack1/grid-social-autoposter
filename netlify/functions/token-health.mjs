// Token Health Monitor — runs daily, checks all client tokens are valid
// Logs results and marks unhealthy tokens for admin attention
// Auto-refreshes LinkedIn tokens within 7 days of expiry
import { db } from './lib/db/index.mjs';
import { decrypt, encrypt } from './lib/crypto/encryption.mjs';
import { notifyClientTokenExpiring } from './lib/email.mjs';
import { logger } from './lib/logger.mjs';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

async function checkMetaToken(token) {
  try {
    const res = await fetch(`${GRAPH_API}/me?access_token=${token}&fields=id,name`);
    const data = await res.json();
    if (data.error) return { valid: false, error: data.error.message, code: data.error.code };
    return { valid: true, id: data.id, name: data.name };
  } catch (e) { return { valid: false, error: e.message }; }
}

async function checkFacebookPage(pageId, token) {
  try {
    const res = await fetch(`${GRAPH_API}/${pageId}?access_token=${token}&fields=id,name,fan_count`);
    const data = await res.json();
    if (data.error) return { valid: false, error: data.error.message, code: data.error.code };
    return { valid: true, pageId: data.id, name: data.name };
  } catch (e) { return { valid: false, error: e.message }; }
}

async function refreshLinkedInToken(client) {
  const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
  const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { success: false, error: 'LINKEDIN_CLIENT_ID or SECRET not configured' };
  }

  if (!client.linkedinRefreshToken) {
    return { success: false, error: 'No refresh token stored — client must reconnect' };
  }

  try {
    const refreshToken = decrypt(client.linkedinRefreshToken);
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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

    if (data.error || !data.access_token) {
      return { success: false, error: data.error_description || data.error || 'Unknown error' };
    }

    // Update client record with new tokens
    const clientList = await db.getClients();
    const idx = clientList.findIndex(c => c.id === client.id);
    if (idx === -1) return { success: false, error: 'Client not found in DB' };

    const newExpiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
    clientList[idx].linkedinAccessToken = encrypt(data.access_token);
    clientList[idx].linkedinTokenExpiresAt = newExpiresAt;
    clientList[idx].linkedinUpdatedAt = new Date().toISOString();

    // Store new refresh token if provided (LinkedIn may rotate it)
    if (data.refresh_token) {
      clientList[idx].linkedinRefreshToken = encrypt(data.refresh_token);
    }

    await db.saveClients(clientList);

    return { success: true, expiresAt: newExpiresAt };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export default async (req) => {
  logger.info('Token health check started');

  const clientList = await db.getClients();
  if (!clientList || clientList.length === 0) {
    logger.info('No clients to check');
    return new Response(JSON.stringify({ message: 'No clients' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const results = [];

  for (const client of clientList) {
    const health = { clientId: client.id, name: client.name, platforms: {} };

    // Check Facebook/Instagram token
    if (client.pageAccessToken) {
      const token = decrypt(client.pageAccessToken);
      if (client.fbPageId) {
        const fbResult = await checkFacebookPage(client.fbPageId, token);
        health.platforms.facebook = fbResult;
        if (!fbResult.valid) {
          logger.warn('Facebook token invalid', { client: client.name, error: fbResult.error });
        }
      }
      if (client.igUserId) {
        // Instagram uses the same page token
        try {
          const res = await fetch(`${GRAPH_API}/${client.igUserId}?access_token=${token}&fields=id,username,followers_count`);
          const data = await res.json();
          if (data.error) {
            health.platforms.instagram = { valid: false, error: data.error.message };
            logger.warn('Instagram token invalid', { client: client.name, error: data.error.message });
          } else {
            health.platforms.instagram = { valid: true, username: data.username, followers: data.followers_count };
          }
        } catch (e) {
          health.platforms.instagram = { valid: false, error: e.message };
        }
      }
    }

    // Check token age
    if (client.tokenUpdatedAt) {
      const age = Date.now() - new Date(client.tokenUpdatedAt).getTime();
      const daysSinceUpdate = Math.floor(age / (24 * 3600 * 1000));
      health.tokenAge = `${daysSinceUpdate} days`;
      // Meta page tokens don't expire, but user tokens expire in 60 days
      // Flag if token is over 50 days old (might be a user token, not a page token)
      if (daysSinceUpdate > 50) {
        health.warning = 'Token is over 50 days old — verify it is a permanent page token';
      }
    }

    // Check LinkedIn token
    if (client.linkedinAccessToken) {
      const liToken = decrypt(client.linkedinAccessToken);
      try {
        const res = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${liToken}` },
        });
        const data = await res.json();
        if (res.status === 401 || data.status === 401) {
          health.platforms.linkedin = { valid: false, error: 'Token expired or revoked' };
          logger.warn('LinkedIn token invalid', { client: client.name });
        } else {
          health.platforms.linkedin = { valid: true, name: data.name || client.linkedinName };
        }
      } catch (e) {
        health.platforms.linkedin = { valid: false, error: e.message };
      }

      // Check if LinkedIn token is nearing expiry (60 day tokens)
      if (client.linkedinTokenExpiresAt) {
        const expiresAt = new Date(client.linkedinTokenExpiresAt).getTime();
        const daysUntilExpiry = Math.floor((expiresAt - Date.now()) / (24 * 3600 * 1000));

        if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
          // Attempt auto-refresh
          const refreshResult = await refreshLinkedInToken(client);
          if (refreshResult.success) {
            health.platforms.linkedin = {
              ...health.platforms.linkedin,
              refreshed: true,
              newExpiresAt: refreshResult.expiresAt,
            };
            logger.info('LinkedIn token auto-refreshed', { client: client.name, newExpiresAt: refreshResult.expiresAt });
          } else {
            health.platforms.linkedin = {
              ...health.platforms.linkedin,
              warning: `Token expires in ${daysUntilExpiry} days — refresh failed: ${refreshResult.error}`,
            };
            logger.warn('LinkedIn token refresh failed', { client: client.name, daysUntilExpiry, error: refreshResult.error });
            // Notify client via email if they have an email address
            if (client.clientEmail) {
              await notifyClientTokenExpiring({
                clientEmail: client.clientEmail,
                clientName: client.name,
                platform: 'LinkedIn',
                daysUntilExpiry,
              });
            }
          }
        } else if (daysUntilExpiry <= 0) {
          health.platforms.linkedin = { valid: false, error: 'Token has expired' };
          logger.warn('LinkedIn token expired', { client: client.name });
          if (client.clientEmail) {
            await notifyClientTokenExpiring({
              clientEmail: client.clientEmail,
              clientName: client.name,
              platform: 'LinkedIn',
              daysUntilExpiry: 0,
            });
          }
        }
      }
    }

    results.push(health);
  }

  // Update client records with health status
  const updatedClients = await db.getClients();
  for (const health of results) {
    const idx = updatedClients.findIndex(c => c.id === health.clientId);
    if (idx !== -1) {
      updatedClients[idx].tokenHealth = {
        checkedAt: new Date().toISOString(),
        platforms: health.platforms,
        warning: health.warning || null,
      };
    }
  }
  await db.saveClients(updatedClients);

  const healthy = results.filter(r => Object.values(r.platforms).every(p => p.valid));
  const unhealthy = results.filter(r => Object.values(r.platforms).some(p => !p.valid));

  logger.info('Token health check complete', {
    total: results.length,
    healthy: healthy.length,
    unhealthy: unhealthy.length,
    details: unhealthy.map(r => ({
      client: r.name,
      issues: Object.entries(r.platforms).filter(([, p]) => !p.valid).map(([name, p]) => `${name}: ${p.error}`),
    })),
  });

  return new Response(JSON.stringify({
    checkedAt: new Date().toISOString(),
    total: results.length,
    healthy: healthy.length,
    unhealthy: unhealthy.length,
    results,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// Run daily at 6:00 UTC (7:00 BST) — before the 10:00 scheduled posts
export const config = {
  schedule: '0 6 * * *',
};
