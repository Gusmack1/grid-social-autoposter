// Twitter/X — OAuth 1.0a signing + v2 tweet API + v1.1 media upload
import crypto from 'crypto';
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';

function percentEncode(str) {
  return encodeURIComponent(str).replace(/!/g, '%21').replace(/\*/g, '%2A').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function oauthSig(method, url, params, consumerSecret, tokenSecret) {
  const sorted = Object.keys(params).sort().map(k => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const base = `${method}&${percentEncode(url)}&${percentEncode(sorted)}`;
  return crypto.createHmac('sha1', `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`).update(base).digest('base64');
}

function buildAuthHeader(method, url, bodyParams, apiKey, apiSecret, accessToken, accessSecret) {
  const oa = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };
  const allParams = { ...oa, ...bodyParams };
  oa.oauth_signature = oauthSig(method, url, allParams, apiSecret, accessSecret);
  return `OAuth ${Object.keys(oa).sort().map(k => `${percentEncode(k)}="${percentEncode(oa[k])}"`).join(', ')}`;
}

export async function postTweet(client, caption, imageUrl) {
  const ak = decrypt(client.twitterApiKey);
  const as = decrypt(client.twitterApiSecret);
  const at = decrypt(client.twitterAccessToken);
  const ats = decrypt(client.twitterAccessSecret);
  if (!ak || !as || !at || !ats) return null;

  return withRetry(async () => {
    let mediaId = null;

    // Upload media if image
    if (imageUrl) {
      try {
        const imgRes = await fetch(imageUrl);
        if (imgRes.ok) {
          const b64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
          const uUrl = 'https://upload.twitter.com/1.1/media/upload.json';
          const body = { media_data: b64, media_category: 'tweet_image' };
          const auth = buildAuthHeader('POST', uUrl, body, ak, as, at, ats);
          const ud = await (await fetch(uUrl, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body),
          })).json();
          if (ud.media_id_string) mediaId = ud.media_id_string;
        }
      } catch (me) { /* continue without image */ }
    }

    // Post tweet — v2 JSON body, OAuth sig WITHOUT body params
    const tUrl = 'https://api.x.com/2/tweets';
    const tb = { text: caption.substring(0, 280) };
    if (mediaId) tb.media = { media_ids: [mediaId] };
    const auth = buildAuthHeader('POST', tUrl, {}, ak, as, at, ats);
    const td = await (await fetch(tUrl, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(tb),
    })).json();
    if (td.data?.id) return { success: true, id: td.data.id };
    throw new Error(td.detail || td.title || JSON.stringify(td.errors || td));
  }, { label: 'twitter-post' }).catch(err => ({ success: false, error: err.message }));
}

export async function deleteTweet(client, tweetId) {
  const ak = decrypt(client.twitterApiKey);
  const as = decrypt(client.twitterApiSecret);
  const at = decrypt(client.twitterAccessToken);
  const ats = decrypt(client.twitterAccessSecret);
  if (!ak || !at) return { deleted: false, error: 'Missing credentials' };

  try {
    const dUrl = `https://api.x.com/2/tweets/${tweetId}`;
    const auth = buildAuthHeader('DELETE', dUrl, {}, ak, as, at, ats);
    const d = await (await fetch(dUrl, { method: 'DELETE', headers: { Authorization: auth } })).json();
    return d.data?.deleted ? { deleted: true } : { deleted: false, error: JSON.stringify(d) };
  } catch (e) { return { deleted: false, error: e.message }; }
}
