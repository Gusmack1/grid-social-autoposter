// Sync debug twin of admin-schedule-sorn-background.mjs.
// Runs exactly one post (or just cred-check if ?check=1) and returns JSON.
import { decrypt } from './lib/crypto/encryption.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const CLIENT_ID = 'client_1774201992319';
const SLUG = 'sornh_%';
const MIN_FUTURE_SECS = 601;

function okAdmin(req) {
  const want = process.env.ADMIN_KEY;
  const got = req.headers.get('x-admin-key') || req.headers.get('X-Admin-Key');
  return want && got && got === want;
}

async function sb(path, { method = 'GET', body, extraHeaders = {} } = {}) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'PATCH' ? 'return=representation' : '',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`supabase ${method} ${path}: ${res.status} ${text}`);
  try { return text ? JSON.parse(text) : null; } catch { return null; }
}

export default async (req) => {
  if (!okAdmin(req)) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const url = new URL(req.url);
  const checkOnly = url.searchParams.get('check') === '1';
  const out = { env: {}, creds: {}, queue: {}, oneShot: {} };

  out.env.SUPABASE_URL = !!process.env.SUPABASE_URL;
  out.env.SUPABASE_ANON_KEY = !!process.env.SUPABASE_ANON_KEY;
  out.env.ENCRYPTION_KEY = !!process.env.ENCRYPTION_KEY;
  out.env.ADMIN_KEY = !!process.env.ADMIN_KEY;

  try {
    const rows = await sb(`clients?id=eq.${encodeURIComponent(CLIENT_ID)}&select=id,fb_page_id,page_access_token`);
    const c = rows?.[0];
    out.creds.found = !!c;
    out.creds.fb_page_id = c?.fb_page_id || null;
    out.creds.tok_prefix = c?.page_access_token?.slice(0, 10) || null;
    out.creds.tok_len = c?.page_access_token?.length || 0;
    if (c?.page_access_token) {
      try {
        const decoded = decrypt(c.page_access_token);
        out.creds.decrypt_ok = true;
        out.creds.decrypted_len = decoded.length;
        out.creds.decrypted_prefix = decoded.slice(0, 6);
      } catch (e) { out.creds.decrypt_ok = false; out.creds.decrypt_err = e.message; }
    }
  } catch (e) { out.creds.error = e.message; }

  try {
    const posts = await sb(`posts?id=like.${encodeURIComponent(SLUG)}&status=eq.queued&select=id,caption,image_url,image_urls,scheduled_for&order=scheduled_for.asc&limit=3`);
    out.queue.count = posts?.length || 0;
    out.queue.first_ids = (posts || []).map(p => p.id);
    out.queue.first_row_shape = posts?.[0] ? {
      id: posts[0].id,
      caption_len: (posts[0].caption || '').length,
      has_image_url: !!posts[0].image_url,
      image_urls_len: Array.isArray(posts[0].image_urls) ? posts[0].image_urls.length : null,
      scheduled_for: posts[0].scheduled_for,
    } : null;

    if (!checkOnly && posts?.length && out.creds.decrypt_ok) {
      const row = posts[0];
      const token = decrypt((await sb(`clients?id=eq.${encodeURIComponent(CLIENT_ID)}&select=page_access_token`))[0].page_access_token);
      const pageId = out.creds.fb_page_id;
      const nowSec = Math.floor(Date.now() / 1000);
      const desiredTs = Math.floor(new Date(row.scheduled_for).getTime() / 1000);
      const scheduledTs = Math.max(desiredTs, nowSec + MIN_FUTURE_SECS);
      const imgs = Array.isArray(row.image_urls) && row.image_urls.length > 0
        ? row.image_urls
        : row.image_url ? [row.image_url] : [];
      out.oneShot.row_id = row.id;
      out.oneShot.imgs_count = imgs.length;
      out.oneShot.scheduledTs = scheduledTs;

      if (imgs.length === 1) {
        const fd = new URLSearchParams();
        fd.append('url', imgs[0]);
        fd.append('caption', row.caption || '');
        fd.append('published', 'false');
        fd.append('scheduled_publish_time', String(scheduledTs));
        fd.append('access_token', token);
        const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd.toString(),
        });
        const body = await res.json().catch(() => ({}));
        out.oneShot.http = res.status;
        out.oneShot.body = body;
        if (res.ok && !body.error) {
          const fbId = body.post_id || body.id;
          await sb(`posts?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: {
              status: 'scheduled_external',
              updated_at: new Date().toISOString(),
              results: { facebook: { scheduled_post_id: fbId, scheduled_publish_time: scheduledTs, scheduled_at: new Date().toISOString() } },
              error: null,
            },
          });
          out.oneShot.marked = true;
          out.oneShot.scheduled_post_id = fbId;
        }
      } else if (imgs.length > 1) {
        const mediaIds = [];
        for (const imgUrl of imgs) {
          const fd = new URLSearchParams();
          fd.append('url', imgUrl);
          fd.append('access_token', token);
          const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/photos?published=false`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fd.toString(),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body.error) {
            out.oneShot.upload_fail = { http: res.status, body };
            return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          mediaIds.push(body.id);
        }
        const fd2 = new URLSearchParams();
        fd2.append('message', row.caption || '');
        fd2.append('published', 'false');
        fd2.append('scheduled_publish_time', String(scheduledTs));
        fd2.append('attached_media', JSON.stringify(mediaIds.map(id => ({ media_fbid: id }))));
        fd2.append('access_token', token);
        const res = await fetch(`${GRAPH}/${encodeURIComponent(pageId)}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: fd2.toString(),
        });
        const body = await res.json().catch(() => ({}));
        out.oneShot.http = res.status;
        out.oneShot.body = body;
        out.oneShot.media_ids = mediaIds;
        if (res.ok && !body.error) {
          const fbId = body.id;
          await sb(`posts?id=eq.${encodeURIComponent(row.id)}`, {
            method: 'PATCH',
            body: {
              status: 'scheduled_external',
              updated_at: new Date().toISOString(),
              results: { facebook: { scheduled_post_id: fbId, scheduled_publish_time: scheduledTs, scheduled_at: new Date().toISOString() } },
              error: null,
            },
          });
          out.oneShot.marked = true;
          out.oneShot.scheduled_post_id = fbId;
        }
      }
    }
  } catch (e) { out.queue.error = e.message; out.oneShot.error = e.message; }

  return new Response(JSON.stringify(out, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
