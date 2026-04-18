// harvest-core.mjs — shared Graph-API post harvester used by both the
// weekly scheduled function and the manual admin-keyed endpoint.
//
// For every client with an fb_page_id + page_access_token, pulls up to 2
// pages (200 posts) from /{page_id}/posts and UPSERTs into public.client_assets
// using Supabase REST with Prefer: resolution=merge-duplicates on the
// (client_id, fb_post_id) unique key. Never logs plaintext tokens.

const GRAPH = 'https://graph.facebook.com/v21.0';
const FIELDS = [
  'id',
  'message',
  'created_time',
  'full_picture',
  'attachments{media,subattachments{media,url}}',
  'reactions.summary(total_count)',
  'comments.summary(total_count)',
  'shares',
].join(',');

function flattenAttachments(attachments) {
  const urls = [];
  if (!attachments || !Array.isArray(attachments.data)) return urls;
  for (const a of attachments.data) {
    const src = a?.media?.image?.src;
    if (src && !urls.includes(src)) urls.push(src);
    const sub = a?.subattachments?.data;
    if (Array.isArray(sub)) {
      for (const s of sub) {
        const ssrc = s?.media?.image?.src;
        if (ssrc && !urls.includes(ssrc)) urls.push(ssrc);
        if (s?.url && !urls.includes(s.url)) urls.push(s.url);
      }
    }
  }
  return urls;
}

async function upsertBatch({ SUPABASE_URL, SUPABASE_KEY, rows }) {
  if (!rows.length) return { ok: true, inserted: 0 };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/client_assets`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  }
  return { ok: true, inserted: rows.length };
}

export async function harvestClient({ client, token, SUPABASE_URL, SUPABASE_KEY, logger }) {
  const pageId = client.fbPageId;
  const clientId = client.id;
  const out = { client_id: clientId, name: client.name, posts_harvested: 0, errors: [] };

  let path = `/${encodeURIComponent(pageId)}/posts?fields=${encodeURIComponent(FIELDS)}&limit=100`;
  const rows = [];
  let page = 0;

  while (path && page < 2) {
    page++;
    const url = `${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
    let body;
    try {
      const res = await fetch(url);
      body = await res.json().catch(() => ({}));
      if (!res.ok) {
        out.errors.push(`graph_${res.status}:${body?.error?.message || 'unknown'}`);
        break;
      }
    } catch (e) {
      out.errors.push(`fetch_exception:${e.message}`);
      break;
    }

    const data = Array.isArray(body?.data) ? body.data : [];
    for (const p of data) {
      if (!p?.id || !p?.created_time) continue;
      const attachment_urls = flattenAttachments(p.attachments);
      rows.push({
        id: `${clientId}:${p.id}`,
        client_id: clientId,
        fb_post_id: p.id,
        message: p.message || null,
        full_picture: p.full_picture || null,
        attachment_urls,
        reactions_count: p.reactions?.summary?.total_count ?? 0,
        comments_count: p.comments?.summary?.total_count ?? 0,
        shares_count: p.shares?.count ?? 0,
        created_time: p.created_time,
      });
    }

    const nextUrl = body?.paging?.next;
    if (!nextUrl) break;
    try {
      const u = new URL(nextUrl);
      path = u.pathname.replace(/^\/v[0-9.]+/, '') + u.search;
    } catch {
      break;
    }
  }

  if (rows.length) {
    const up = await upsertBatch({ SUPABASE_URL, SUPABASE_KEY, rows });
    if (!up.ok) {
      out.errors.push(`upsert_${up.status}:${up.error}`);
    } else {
      out.posts_harvested = up.inserted;
    }
  }
  if (logger) logger.info('harvest client', { client_id: clientId, posts: out.posts_harvested, errors: out.errors.length });
  return out;
}

export async function harvestAll({ clients, decrypt, SUPABASE_URL, SUPABASE_KEY, logger }) {
  const per_client = [];
  let posts_harvested_total = 0;
  let clients_processed = 0;

  for (const c of clients) {
    if (!c?.fbPageId || !c?.pageAccessToken) {
      per_client.push({ client_id: c?.id, name: c?.name, skipped: 'no_fb_token_or_page' });
      continue;
    }
    let token = null;
    try {
      token = decrypt(c.pageAccessToken);
    } catch (e) {
      per_client.push({ client_id: c.id, name: c.name, skipped: 'decrypt_failed' });
      continue;
    }
    if (!token) {
      per_client.push({ client_id: c.id, name: c.name, skipped: 'token_empty' });
      continue;
    }
    const r = await harvestClient({ client: c, token, SUPABASE_URL, SUPABASE_KEY, logger });
    clients_processed++;
    posts_harvested_total += r.posts_harvested;
    per_client.push(r);
  }

  return { clients_processed, posts_harvested_total, per_client };
}
