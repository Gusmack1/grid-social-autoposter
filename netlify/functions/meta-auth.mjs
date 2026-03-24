// Meta OAuth — Step 1: Redirect to Facebook login
// Supports both admin and client portal flows
// GET /api/meta-auth → admin flow (dashboard)
// GET /api/meta-auth?invite=TOKEN → client portal flow
import { encrypt } from './lib/crypto/encryption.mjs';

export default async (req) => {
  const APP_ID = process.env.META_APP_ID;
  if (!APP_ID) {
    return new Response(JSON.stringify({ error: 'META_APP_ID not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const inviteToken = url.searchParams.get('invite');
  const redirectUri = `${origin}/api/meta-callback`;

  // State carries context through the OAuth redirect
  const state = btoa(JSON.stringify({
    t: Date.now(),
    invite: inviteToken || null,
    flow: inviteToken ? 'client' : 'admin',
  }));

  const fbUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  fbUrl.searchParams.set('client_id', APP_ID);
  fbUrl.searchParams.set('redirect_uri', redirectUri);
  fbUrl.searchParams.set('state', state);
  fbUrl.searchParams.set('scope', [
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_show_list',
    'pages_read_user_content',
    'instagram_basic',
    'instagram_content_publish',
  ].join(','));

  return Response.redirect(fbUrl.toString(), 302);
};

export const config = { path: '/api/meta-auth' };
