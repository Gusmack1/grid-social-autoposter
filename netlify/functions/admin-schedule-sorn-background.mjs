// admin-schedule-sorn-background.mjs — one-shot native Meta Business Suite
// scheduler for Sorn Handyman Services (client_1774201992319).
//
// Background function => 15-minute timeout (Netlify convention: the
// `-background` suffix makes the invocation async and returns 202 immediately).
//
// Usage:
//   POST /.netlify/functions/admin-schedule-sorn-background
//     header: x-admin-key: <ADMIN_KEY>
//     optional body: { "dryRun": true }
//
// Behaviour per row (id LIKE 'sornh_%' AND status='queued'):
//   • scheduled_publish_time = max(scheduled_for_ts, NOW()+601)  (FB min +10m)
//   • single-photo  → POST /{page_id}/photos  (published=false + scheduled_publish_time)
//   • multi-photo   → POST /{page_id}/photos?published=false per image → POST /{page_id}/feed with attached_media
//   • on success    → UPDATE posts SET status='scheduled_external', results={...}
//   • rate-limit    → 3 s between posts (keeps us well under Page 200/hr)
//
// Failure modes do NOT flip status. Row stays queued; error goes into .error.

import { logger } from './lib/logger.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';
const CLIENT_ID = 'client_1774201992319';
const SLUG = 'sornh_%';
const PER_POST_DELAY_MS = 3000;
const MIN_FUTURE_SECS = 601; // FB requires ≥10m ahead; +1s safety

function okAdmin(req) {
  const want = process.env.ADMIN_KEY;
  const got = req.headers.get('x-admin-key') || req.headers.get('X-Admin-Key');
  return want && got && got === want;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Thin Supabase REST helper (service anon key; posts table has row-level
//    policy that allows the Netlify function role — same pattern as scheduled-post.mjs)
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

async function getClientToken() {
  const rows = await sb(
    `clients?id=eq.${encodeURIComponent(CLIENT_ID)}&select=id,fb_page_id,page_access_token`,
  );
  const c = rows?.[0];
  if (!c) throw new Error(`client ${CLIENT_ID} not found`);
  if (!c.page_access_token) throw new Error('no page_access_token stored');
  const token = decrypt(c.page_access_token);
  return { pageId: c.fb_page_id, token };
}

async function getQueuedPosts() {
  return await sb(
    `posts?id=like.${encodeURIComponent(SLUG)}&status=eq.queued` +
      `&select=id,caption,image_url,image_urls,scheduled_for&order=scheduled_for.asc`,
  );
}

async function markScheduled(postId, facebookId, scheduledTs) {
  await sb(`posts?id=eq.${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: {
      status: 'scheduled_external',
      updated_at: new Date().toISOString(),
      results: { facebook: { scheduled_post_id: facebookId, scheduled_publish_time: scheduledTs, scheduled_at: new Date().toISOString() } },
      error: null,
    },
  });
}

async function markError(postId, err) {
  await sb(`posts?id=eq.${encodeURIComponent(postId)}`, {
    method: 'PATCH',
    body: { updated_at: new Date().toISOString(), error: String(err).slice(0, 4000) },
  });
}

async function graph(path, { method = 'POST', form } = {}) {
  const url = `${GRAPH}${path}`;
  const init = { method };
  if (form) {
    const fd = new URLSearchParams();
    for (const [k, v] of Object.entries(form)) fd.append(k, String(v));
    init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    init.body = fd.toString();
  }
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body?.error?.message || body?.error?.error_user_msg || `http ${res.status}`;
    const err = new Error(msg);
    err.body = body;
    err.status = res.status;
    throw err;
  }
  return body;
}

async function schedulePost({ pageId, token }, row) {
  const nowSec = Math.floor(Date.now() / 1000);
  const desiredTs = Math.floor(new Date(row.scheduled_for).getTime() / 1000);
  const scheduledTs = Math.max(desiredTs, nowSec + MIN_FUTURE_SECS);

  const imgs = Array.isArray(row.image_urls) && row.image_urls.length > 0
    ? row.image_urls
    : row.image_url ? [row.image_url] : [];

  if (imgs.length === 0) throw new Error('no images on row');

  // Single photo — direct scheduled photo post
  if (imgs.length === 1) {
    const body = await graph(`/${encodeURIComponent(pageId)}/photos`, {
      form: {
        url: imgs[0],
        caption: row.caption || '',
        published: 'false',
        scheduled_publish_time: scheduledTs,
        access_token: token,
      },
    });
    return { scheduledTs, scheduledPostId: body.post_id || body.id };
  }

  // Multi-photo — upload unpublished, then schedule via /feed
  const mediaIds = [];
  for (const url of imgs) {
    const body = await graph(`/${encodeURIComponent(pageId)}/photos?published=false`, {
      form: { url, access_token: token },
    });
    if (!body.id) throw new Error(`photo upload missing id for ${url}`);
    mediaIds.push(body.id);
    await sleep(300); // space photo uploads out
  }
  const attached = mediaIds.map(id => ({ media_fbid: id }));
  const body = await graph(`/${encodeURIComponent(pageId)}/feed`, {
    form: {
      message: row.caption || '',
      published: 'false',
      scheduled_publish_time: scheduledTs,
      attached_media: JSON.stringify(attached),
      access_token: token,
    },
  });
  return { scheduledTs, scheduledPostId: body.id };
}

export default async (req) => {
  if (!okAdmin(req)) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  let dryRun = false;
  try {
    if (req.method === 'POST' && req.headers.get('content-type')?.includes('json')) {
      const parsed = await req.json().catch(() => ({}));
      dryRun = !!parsed?.dryRun;
    }
  } catch {}

  logger.info('admin-schedule-sorn-background start', { dryRun });

  const report = { dryRun, totals: { rows: 0, scheduled: 0, errors: 0 }, rows: [] };

  let creds;
  try { creds = await getClientToken(); }
  catch (e) {
    logger.error('creds error', { error: e.message });
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }

  let posts;
  try { posts = await getQueuedPosts(); }
  catch (e) {
    logger.error('queue fetch error', { error: e.message });
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }

  report.totals.rows = posts.length;
  logger.info('loaded queue', { count: posts.length });

  for (const row of posts) {
    const entry = { id: row.id, status: 'pending' };
    try {
      if (dryRun) {
        entry.status = 'dryrun';
        entry.imgs = Array.isArray(row.image_urls) ? row.image_urls.length : 1;
      } else {
        const { scheduledTs, scheduledPostId } = await schedulePost(creds, row);
        await markScheduled(row.id, scheduledPostId, scheduledTs);
        entry.status = 'scheduled';
        entry.scheduled_post_id = scheduledPostId;
        entry.scheduled_ts = scheduledTs;
        report.totals.scheduled++;
      }
    } catch (e) {
      entry.status = 'error';
      entry.error = e.message;
      try { await markError(row.id, e.message); } catch {}
      report.totals.errors++;
      logger.error('schedule error', { id: row.id, error: e.message });
    }
    report.rows.push(entry);
    if (!dryRun) await sleep(PER_POST_DELAY_MS);
  }

  logger.info('admin-schedule-sorn-background done', report.totals);
  return new Response(JSON.stringify(report), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
