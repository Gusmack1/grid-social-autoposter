// Meta long-lived token refresh — runs weekly (Sundays 03:00 UTC)
// Meta user-level long-lived tokens expire after ~60 days; page tokens derived
// from a long-lived user token inherit that lifetime. Exchanging the current
// token via fb_exchange_token before it expires issues a fresh 60-day token.
// Reference: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived
import { db } from './lib/db/index.mjs';
import { decrypt, encrypt } from './lib/crypto/encryption.mjs';
import { logger } from './lib/logger.mjs';

const GRAPH_API = 'https://graph.facebook.com/v21.0';

async function exchangeLongLivedToken(appId, appSecret, currentToken) {
  const url = `${GRAPH_API}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(currentToken)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({ error: { message: 'Invalid response' } }));
  if (data.error) return { success: false, error: data.error.message };
  if (!data.access_token) return { success: false, error: 'No access_token returned' };
  return { success: true, accessToken: data.access_token, expiresIn: data.expires_in || null };
}

export default async (req) => {
  logger.info('Meta token refresh started');

  const APP_ID = process.env.META_APP_ID;
  const APP_SECRET = process.env.META_APP_SECRET;

  if (!APP_ID || !APP_SECRET) {
    logger.error('Meta token refresh: META_APP_ID or META_APP_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Meta app credentials not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const clientList = await db.getClients();
  if (!clientList || clientList.length === 0) {
    logger.info('No clients to refresh');
    return new Response(JSON.stringify({ message: 'No clients' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const results = [];
  let mutated = false;

  for (let i = 0; i < clientList.length; i++) {
    const client = clientList[i];
    if (!client.pageAccessToken) {
      results.push({ clientId: client.id, name: client.name, status: 'skipped', reason: 'no pageAccessToken' });
      continue;
    }

    let current;
    try {
      current = decrypt(client.pageAccessToken);
    } catch (e) {
      logger.warn('Meta token refresh: decrypt failed', { client: client.name, error: e.message });
      results.push({ clientId: client.id, name: client.name, status: 'error', error: `decrypt failed: ${e.message}` });
      continue;
    }

    const exchange = await exchangeLongLivedToken(APP_ID, APP_SECRET, current);
    if (!exchange.success) {
      logger.warn('Meta token refresh failed', { client: client.name, error: exchange.error });
      results.push({ clientId: client.id, name: client.name, status: 'failed', error: exchange.error });
      continue;
    }

    clientList[i].pageAccessToken = encrypt(exchange.accessToken);
    clientList[i].tokenUpdatedAt = new Date().toISOString();
    if (exchange.expiresIn) {
      clientList[i].metaTokenExpiresAt = new Date(Date.now() + (exchange.expiresIn * 1000)).toISOString();
    }
    mutated = true;
    results.push({
      clientId: client.id,
      name: client.name,
      status: 'refreshed',
      expiresIn: exchange.expiresIn,
    });
    logger.info('Meta token refreshed', { client: client.name, expiresIn: exchange.expiresIn });
  }

  if (mutated) {
    await db.saveClients(clientList);
  }

  const refreshed = results.filter(r => r.status === 'refreshed').length;
  const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  logger.info('Meta token refresh complete', { total: results.length, refreshed, failed, skipped });

  return new Response(JSON.stringify({
    checkedAt: new Date().toISOString(),
    total: results.length,
    refreshed,
    failed,
    skipped,
    results,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

// Schedule defined in netlify.toml
