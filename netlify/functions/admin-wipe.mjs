// admin-wipe.mjs — one-shot wipe of Facebook unpublished/scheduled posts
// and Instagram outstanding containers (IG containers auto-expire in 24h).
// Usage:
//   GET /.netlify/functions/admin-wipe?key=${ADMIN_KEY}&dryRun=1
//   GET /.netlify/functions/admin-wipe?key=${ADMIN_KEY}
//
// Auth: requires ?key= query param to equal process.env.ADMIN_KEY.
// Safety: dryRun=1 lists what would be deleted, deletes nothing.

import { db } from './lib/db/index.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { json, cors } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';

const GRAPH = 'https://graph.facebook.com/v21.0';

async function graphGet(path, token) {
  const url = `${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function graphDelete(path, token) {
  const url = `${GRAPH}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function collectPagedIds(initialPath, token) {
  // Walks paging.next until exhausted. Returns array of node ids.
  const ids = [];
  let path = initialPath;
  let guard = 0;
  while (path && guard++ < 20) {
    const { ok, body } = await graphGet(path, token);
    if (!ok) return { ids, error: body?.error?.message || 'graph error', lastPath: path };
    for (const row of body?.data || []) {
      if (row?.id) ids.push(row.id);
    }
    const nextUrl = body?.paging?.next;
    if (!nextUrl) break;
    // nextUrl is a full URL — strip the GRAPH prefix so we can re-use token handling
    try {
      const u = new URL(nextUrl);
      path = u.pathname.replace(/^\/v[0-9.]+/, '') + u.search;
    } catch {
      break;
    }
  }
  return { ids };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key || key !== process.env.ADMIN_KEY) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  const dryRun = url.searchParams.get('dryRun') === '1';

  const clients = await db.getClients();
  const report = {
    dryRun,
    totals: { clients: clients.length, fb_unpublished: 0, fb_scheduled: 0, fb_deleted: 0, ig_outstanding: 0, errors: 0 },
    per_client: [],
  };

  for (const c of clients) {
    const entry = {
      client_id: c.id,
      name: c.name,
      fb_page_id: c.fbPageId || null,
      ig_user_id: c.igUserId || null,
      fb_unpublished: 0,
      fb_scheduled: 0,
      fb_deleted: 0,
      ig_outstanding: 0,
      errors: [],
    };

    let token = null;
    try {
      token = c.pageAccessToken ? decrypt(c.pageAccessToken) : null;
    } catch (e) {
      entry.errors.push(`decrypt_failed: ${e.message}`);
      report.totals.errors++;
      report.per_client.push(entry);
      continue;
    }

    if (!token || !c.fbPageId) {
      entry.errors.push('no_fb_page_token');
      report.per_client.push(entry);
      continue;
    }

    // ── Facebook unpublished promotable posts ──
    try {
      const { ids: unpubIds, error: unpubErr } = await collectPagedIds(
        `/${encodeURIComponent(c.fbPageId)}/promotable_posts?is_published=false&limit=100`,
        token
      );
      entry.fb_unpublished = unpubIds.length;
      report.totals.fb_unpublished += unpubIds.length;
      if (unpubErr) entry.errors.push(`promotable_posts: ${unpubErr}`);

      if (!dryRun) {
        for (const pid of unpubIds) {
          const { ok, body } = await graphDelete(`/${encodeURIComponent(pid)}`, token);
          if (ok) {
            entry.fb_deleted++;
            report.totals.fb_deleted++;
          } else {
            entry.errors.push(`delete_${pid}: ${body?.error?.message || 'fail'}`);
            report.totals.errors++;
          }
        }
      }
    } catch (e) {
      entry.errors.push(`fb_unpub_exception: ${e.message}`);
      report.totals.errors++;
    }

    // ── Facebook scheduled_posts ──
    try {
      const { ids: schedIds, error: schedErr } = await collectPagedIds(
        `/${encodeURIComponent(c.fbPageId)}/scheduled_posts?limit=100`,
        token
      );
      entry.fb_scheduled = schedIds.length;
      report.totals.fb_scheduled += schedIds.length;
      if (schedErr) entry.errors.push(`scheduled_posts: ${schedErr}`);

      if (!dryRun) {
        for (const pid of schedIds) {
          const { ok, body } = await graphDelete(`/${encodeURIComponent(pid)}`, token);
          if (ok) {
            entry.fb_deleted++;
            report.totals.fb_deleted++;
          } else {
            entry.errors.push(`delete_sched_${pid}: ${body?.error?.message || 'fail'}`);
            report.totals.errors++;
          }
        }
      }
    } catch (e) {
      entry.errors.push(`fb_sched_exception: ${e.message}`);
      report.totals.errors++;
    }

    // ── Instagram: containers auto-expire in 24h; just report anything visible ──
    if (c.igUserId) {
      try {
        // Meta does not expose a direct "list outstanding containers" endpoint.
        // Best we can do without persistent container_ids: check media that is
        // not yet published (IG Graph returns only published media via /media).
        // So we report 0 and note auto-expiry.
        entry.ig_outstanding = 0;
        entry.ig_note = 'IG containers auto-expire 24h; no list endpoint available';
      } catch (e) {
        entry.errors.push(`ig_exception: ${e.message}`);
      }
    }

    report.per_client.push(entry);
  }

  logger.info('admin-wipe completed', { dryRun, totals: report.totals });
  return json(report);
};
