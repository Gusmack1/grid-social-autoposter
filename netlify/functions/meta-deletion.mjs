// Meta Data Deletion Callback — required by Meta App Review
// When a user removes the app from their Facebook settings, Meta calls this
// POST /api/meta-deletion → processes deletion request, returns confirmation
import { db } from './lib/db/index.mjs';
import { logger } from './lib/logger.mjs';
import crypto from 'crypto';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Meta sends signed_request in the body
    const body = await req.text();
    const params = new URLSearchParams(body);
    const signedRequest = params.get('signed_request');

    if (!signedRequest) {
      return new Response(JSON.stringify({ error: 'Missing signed_request' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse signed request
    const [sigB64, payloadB64] = signedRequest.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    const userId = payload.user_id;

    // Verify signature
    const APP_SECRET = process.env.META_APP_SECRET;
    if (APP_SECRET) {
      const expectedSig = crypto
        .createHmac('sha256', APP_SECRET)
        .update(payloadB64)
        .digest('base64url');
      if (sigB64 !== expectedSig) {
        logger.warn('Invalid signature on deletion request', { userId });
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Find and clean up any client data associated with this Facebook user
    // (We don't store FB user IDs directly, but we log the deletion request)
    const confirmationCode = `del_${Date.now()}_${userId}`;
    logger.info('Meta data deletion request received', { userId, confirmationCode });

    // In practice, tokens are per-page not per-user, so we log the request
    // and the admin can manually verify which clients need updating

    // Meta expects this exact response format
    return new Response(JSON.stringify({
      url: `https://grid-social-autoposter.netlify.app/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    logger.error('Meta deletion callback error', { error: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/meta-deletion' };
