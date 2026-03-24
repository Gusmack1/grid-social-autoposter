// TikTok OAuth — Step 1: Redirect to TikTok authorization
// GET /api/tiktok-auth → admin flow (dashboard)
// GET /api/tiktok-auth?invite=TOKEN → client portal flow

export default async (req) => {
  const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
  if (!CLIENT_KEY) {
    return new Response(JSON.stringify({ error: 'TIKTOK_CLIENT_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const inviteToken = url.searchParams.get('invite');
  const redirectUri = `${origin}/api/tiktok-callback`;

  // State carries context through the OAuth redirect
  const state = btoa(JSON.stringify({
    t: Date.now(),
    invite: inviteToken || null,
    flow: inviteToken ? 'client' : 'admin',
  }));

  // CSRF code verifier (TikTok uses PKCE)
  const codeVerifier = crypto.randomUUID() + crypto.randomUUID();

  const ttUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  ttUrl.searchParams.set('client_key', CLIENT_KEY);
  ttUrl.searchParams.set('response_type', 'code');
  ttUrl.searchParams.set('redirect_uri', redirectUri);
  ttUrl.searchParams.set('state', state);
  // Content Posting API scopes
  ttUrl.searchParams.set('scope', [
    'user.info.basic',
    'video.publish',
    'video.upload',
  ].join(','));

  return Response.redirect(ttUrl.toString(), 302);
};

export const config = { path: '/api/tiktok-auth' };
