// Bluesky — AT Protocol posting
// No OAuth needed — uses app passwords (identifier + password)
// Simplest integration: authenticate, create post, done
// Docs: https://docs.bsky.app/docs/api/
import { withRetry } from '../retry.mjs';
import { decrypt } from '../crypto/encryption.mjs';

const BSKY_API = 'https://bsky.social/xrpc';

async function authenticate(identifier, password) {
  const res = await fetch(`${BSKY_API}/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.message || data.error);
  return { accessJwt: data.accessJwt, did: data.did, handle: data.handle };
}

async function uploadImage(accessJwt, imageUrl) {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Bluesky limit: 1MB for images
    if (buffer.length > 1000000) return null;

    const uploadRes = await fetch(`${BSKY_API}/com.atproto.repo.uploadBlob`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessJwt}`,
        'Content-Type': contentType,
      },
      body: buffer,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.error) return null;
    return uploadData.blob;
  } catch {
    return null;
  }
}

// Parse URLs and mentions into facets for rich text
function parseFacets(text) {
  const facets = [];

  // URLs
  const urlRegex = /https?:\/\/[^\s<>)"']+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const start = Buffer.byteLength(text.substring(0, match.index), 'utf8');
    const end = start + Buffer.byteLength(url, 'utf8');
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }

  // Mentions (@handle.bsky.social)
  const mentionRegex = /@([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?/g;
  while ((match = mentionRegex.exec(text)) !== null) {
    const handle = match[0].slice(1); // remove @
    const start = Buffer.byteLength(text.substring(0, match.index), 'utf8');
    const end = start + Buffer.byteLength(match[0], 'utf8');
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: handle }],
    });
  }

  // Hashtags
  const hashtagRegex = /#[a-zA-Z0-9_]+/g;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const tag = match[0].slice(1); // remove #
    const start = Buffer.byteLength(text.substring(0, match.index), 'utf8');
    const end = start + Buffer.byteLength(match[0], 'utf8');
    facets.push({
      index: { byteStart: start, byteEnd: end },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    });
  }

  return facets.length > 0 ? facets : undefined;
}

export async function postBluesky(client, caption, imageUrl) {
  const identifier = client.blueskyIdentifier; // e.g. handle.bsky.social or DID
  const appPassword = client.blueskyAppPassword ? decrypt(client.blueskyAppPassword) : null;

  if (!identifier || !appPassword) return null;

  return withRetry(async () => {
    // Step 1: Authenticate
    const session = await authenticate(identifier, appPassword);

    // Step 2: Upload image if provided
    let embed = undefined;
    if (imageUrl) {
      const blob = await uploadImage(session.accessJwt, imageUrl);
      if (blob) {
        embed = {
          $type: 'app.bsky.embed.images',
          images: [{ alt: caption.substring(0, 300), image: blob }],
        };
      }
    }

    // Step 3: Truncate caption (Bluesky limit: 300 graphemes / ~300 chars)
    const truncatedCaption = caption.length > 300 ? caption.substring(0, 297) + '...' : caption;

    // Step 4: Create post record
    const record = {
      $type: 'app.bsky.feed.post',
      text: truncatedCaption,
      createdAt: new Date().toISOString(),
      langs: ['en'],
    };

    const facets = parseFacets(truncatedCaption);
    if (facets) record.facets = facets;
    if (embed) record.embed = embed;

    const res = await fetch(`${BSKY_API}/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.message || data.error);

    return {
      success: true,
      id: data.uri,
      cid: data.cid,
      platform: 'bluesky',
    };
  }, { label: 'bluesky-post' }).catch(err => ({
    success: false,
    error: err.message,
    platform: 'bluesky',
  }));
}

export async function deleteBlueskyPost(client, postUri) {
  const identifier = client.blueskyIdentifier;
  const appPassword = client.blueskyAppPassword ? decrypt(client.blueskyAppPassword) : null;
  if (!identifier || !appPassword || !postUri) return { success: false, error: 'Missing credentials or post URI' };

  try {
    const session = await authenticate(identifier, appPassword);
    // Extract rkey from at:// URI
    const parts = postUri.split('/');
    const rkey = parts[parts.length - 1];

    const res = await fetch(`${BSKY_API}/com.atproto.repo.deleteRecord`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        rkey,
      }),
    });

    if (res.ok) return { success: true };
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.message || `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
