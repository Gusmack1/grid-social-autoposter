// audit-submit.mjs — buyer hits /audit/submit on gridsocial.co.uk, JS posts here.
// 1. Verifies Stripe checkout session is paid.
// 2. Captures buyer email + FB Page URL.
// 3. Upserts public.audits row (status=paid).
// 4. Fire-and-forget invokes audit-generate-background with internal shared token.
//
// POST body: { session: "cs_live_...", fbPageUrl: "https://facebook.com/foo", email?: string }
// Open CORS mirrors lib/http.mjs so gridsocial.co.uk (static) and localhost work.

import { json, cors, badRequest, serverError } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';
import { resolvePageIdFromUrl } from './lib/audit-core.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();
  if (req.method !== 'POST') return badRequest('POST required');

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const ADMIN_KEY = process.env.ADMIN_KEY;
  if (!STRIPE_KEY || !SUPABASE_URL || !SERVICE) {
    return json({ error: 'audit-submit not configured' }, 503);
  }

  let body;
  try { body = await req.json(); } catch { return badRequest('Invalid JSON'); }
  const sessionId = (body?.session || '').trim();
  const fbPageUrl = (body?.fbPageUrl || '').trim();
  const clientEmail = (body?.email || '').trim() || null;
  if (!sessionId) return badRequest('session required');
  if (!fbPageUrl) return badRequest('fbPageUrl required');

  // 1. Verify Stripe session
  const sres = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  const session = await sres.json().catch(() => ({}));
  if (!sres.ok || session?.error) {
    logger.warn('Stripe session fetch failed', { sessionId, status: sres.status });
    return json({ error: 'Could not verify Stripe session' }, 400);
  }
  if (session.payment_status !== 'paid') {
    return json({ error: 'Session is not paid', payment_status: session.payment_status }, 402);
  }
  const buyerEmail = clientEmail ||
    session?.customer_details?.email ||
    session?.customer_email ||
    null;
  if (!buyerEmail) return badRequest('No buyer email on Stripe session and none supplied');

  const pageId = resolvePageIdFromUrl(fbPageUrl);
  const auditId = `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // 2. Upsert audits row (idempotent by stripe_session_id)
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/audits`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      id: auditId,
      stripe_session_id: sessionId,
      buyer_email: buyerEmail,
      fb_page_url: fbPageUrl,
      fb_page_id: pageId,
      status: 'paid',
    }),
  });
  if (!upsertRes.ok) {
    const text = await upsertRes.text();
    logger.error('audits upsert failed', { status: upsertRes.status, text: text.slice(0, 500) });
    return serverError('Could not record audit');
  }
  const rows = await upsertRes.json();
  const row = Array.isArray(rows) ? rows[0] : rows;

  // 3. Fire-and-forget audit-generate (background)
  const selfOrigin = new URL(req.url).origin;
  const generateUrl = `${selfOrigin}/.netlify/functions/audit-generate-background`;
  try {
    // do not await — just log any immediate error
    fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': ADMIN_KEY || '' },
      body: JSON.stringify({ auditId: row?.id || auditId }),
    }).catch(e => logger.warn('audit-generate kickoff failed', { error: e.message }));
  } catch (e) {
    logger.warn('audit-generate kickoff exception', { error: e.message });
  }

  logger.info('audit submitted', { auditId: row?.id || auditId, sessionId, pageId });
  return json({
    ok: true,
    auditId: row?.id || auditId,
    message: "We've got it — check your email in the next 24h.",
  });
};

export const config = { path: '/api/audit-submit' };
