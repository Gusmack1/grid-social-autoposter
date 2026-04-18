// audit-generate-background.mjs — Netlify background function (15-min timeout).
// File-name suffix `-background` is the Netlify convention that marks the
// function as async, so the caller in audit-submit.mjs does not wait on it.
//
// Flow:
// 1. Pull audit row by id.
// 2. Resolve FB page via Meta Graph public endpoint using app access token.
// 3. Fetch up to 25 public posts.
// 4. Grade voice + compute cadence/engagement.
// 5. Generate 10 findings via Haiku.
// 6. Render PDF (pdfkit).
// 7. Upload to Supabase Storage bucket `audits`, sign URL (7d).
// 8. Update audits row: status=delivered, pdf_url, findings, delivered_at.
// 9. If RESEND_API_KEY exists, email the buyer with the signed URL.

import { logger } from './lib/logger.mjs';
import {
  resolvePageIdFromUrl,
  fetchPublicPage,
  fetchPublicPosts,
  summarisePosts,
  computeCadence,
  generateFindingsWithHaiku,
} from './lib/audit-core.mjs';
import { renderAuditPdf } from './lib/audit-pdf.mjs';

function okAdmin(req) {
  const want = process.env.ADMIN_KEY;
  const got = req.headers.get('x-admin-key') || req.headers.get('X-Admin-Key');
  return want && got && got === want;
}

async function markStatus(audits_url, service_key, auditId, patch) {
  await fetch(`${audits_url}/rest/v1/audits?id=eq.${encodeURIComponent(auditId)}`, {
    method: 'PATCH',
    headers: {
      apikey: service_key,
      Authorization: `Bearer ${service_key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  }).catch(() => {});
}

export default async (req) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const META_APP_ID = process.env.META_APP_ID;
  const META_APP_SECRET = process.env.META_APP_SECRET;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.AUDIT_FROM_EMAIL || 'hello@gridsocial.co.uk';

  if (!SUPABASE_URL || !SERVICE || !META_APP_ID || !META_APP_SECRET || !ANTHROPIC_API_KEY) {
    logger.error('audit-generate env missing');
    return new Response('Server misconfigured', { status: 503 });
  }
  if (!okAdmin(req)) return new Response('Forbidden', { status: 403 });

  let body;
  try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const auditId = (body?.auditId || '').trim();
  if (!auditId) return new Response('auditId required', { status: 400 });

  // 1. Load audit row
  const r = await fetch(`${SUPABASE_URL}/rest/v1/audits?id=eq.${encodeURIComponent(auditId)}&select=*`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const rows = await r.json().catch(() => []);
  const audit = Array.isArray(rows) ? rows[0] : null;
  if (!audit) return new Response('audit not found', { status: 404 });

  await markStatus(SUPABASE_URL, SERVICE, auditId, { status: 'generating' });

  try {
    const appToken = `${META_APP_ID}|${META_APP_SECRET}`;
    const pageRef = audit.fb_page_id || resolvePageIdFromUrl(audit.fb_page_url);
    if (!pageRef) throw new Error('Could not resolve FB Page id from URL');

    // 2. Page metadata
    const pageRes = await fetchPublicPage({ pageRef, appToken });
    if (!pageRes.ok) throw new Error(`page fetch failed: ${pageRes.error}`);
    const pageInfo = pageRes.page;

    // 3. Posts
    const postsRes = await fetchPublicPosts({ pageId: pageInfo.id, appToken, limit: 25 });
    if (!postsRes.ok) throw new Error(`posts fetch failed: ${postsRes.error}`);
    const posts = postsRes.posts;

    // 4. Grade + cadence
    const summary = summarisePosts(posts);
    const cadence = computeCadence(posts);

    // 5. Findings
    const findingsRes = await generateFindingsWithHaiku({
      pageInfo, summary, cadence, apiKey: ANTHROPIC_API_KEY,
    });
    if (!findingsRes.ok) throw new Error(`findings failed: ${findingsRes.error}`);
    const findings = findingsRes.findings;

    // 6. PDF
    const pdfBytes = await renderAuditPdf({ pageInfo, summary, cadence, findings });

    // 7. Upload to Storage
    const objectPath = `${auditId}.pdf`;
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/audits/${encodeURIComponent(objectPath)}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      },
      body: pdfBytes,
    });
    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      throw new Error(`storage upload failed: ${uploadRes.status} ${t.slice(0, 300)}`);
    }

    // Sign URL (7-day)
    const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/audits/${encodeURIComponent(objectPath)}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 7 * 24 * 60 * 60 }),
    });
    const signed = await signRes.json().catch(() => ({}));
    if (!signRes.ok || !signed?.signedURL) {
      throw new Error(`storage sign failed: ${signRes.status} ${JSON.stringify(signed).slice(0, 200)}`);
    }
    const pdfUrl = signed.signedURL.startsWith('http')
      ? signed.signedURL
      : `${SUPABASE_URL}/storage/v1${signed.signedURL}`;

    // 8. Mark delivered
    await markStatus(SUPABASE_URL, SERVICE, auditId, {
      status: 'delivered',
      pdf_url: pdfUrl,
      findings: { summary, cadence, findings },
      delivered_at: new Date().toISOString(),
    });

    // 9. Optional Resend email
    if (RESEND_API_KEY && audit.buyer_email) {
      try {
        const er = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `Grid Social <${FROM_EMAIL}>`,
            to: [audit.buyer_email],
            subject: 'Your Grid Social Facebook & Instagram audit',
            text: `Hi,\n\nYour 10-point audit is ready.\n\nDownload: ${pdfUrl}\n(Link valid for 7 days.)\n\nReply to this email if you'd like Grid Social to implement the fixes for you.\n\nGrid Social — gridsocial.co.uk`,
          }),
        });
        if (!er.ok) {
          logger.warn('resend email failed', { status: er.status });
        }
      } catch (e) {
        logger.warn('resend email exception', { error: e.message });
      }
    }

    logger.info('audit delivered', { auditId, pdfUrl, passRate: summary.passRate });
    return new Response(JSON.stringify({ ok: true, auditId, pdfUrl, passRate: summary.passRate }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('audit-generate failed', { auditId, error: err.message });
    await markStatus(SUPABASE_URL, SERVICE, auditId, {
      status: 'failed',
      findings: { error: err.message },
    });
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/.netlify/functions/audit-generate-background',
};
