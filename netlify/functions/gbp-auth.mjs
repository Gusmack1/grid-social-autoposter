// Google Business Profile OAuth — Step 1: Redirect to Google authorization
// GET /api/gbp-auth → admin flow (dashboard)
// GET /api/gbp-auth?invite=TOKEN → client portal flow

export default async (req) => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'GOOGLE_CLIENT_ID not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const inviteToken = url.searchParams.get('invite');
  const redirectUri = `${origin}/api/gbp-callback`;

  // State carries context through the OAuth redirect
  const state = btoa(JSON.stringify({
    t: Date.now(),
    invite: inviteToken || null,
    flow: inviteToken ? 'client' : 'admin',
  }));

  const gUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  gUrl.searchParams.set('client_id', CLIENT_ID);
  gUrl.searchParams.set('redirect_uri', redirectUri);
  gUrl.searchParams.set('response_type', 'code');
  gUrl.searchParams.set('state', state);
  gUrl.searchParams.set('access_type', 'offline'); // get refresh token
  gUrl.searchParams.set('prompt', 'consent');
  gUrl.searchParams.set('scope', [
    'https://www.googleapis.com/auth/business.manage',
    'https://www.googleapis.com/auth/userinfo.profile',
  ].join(' '));

  return Response.redirect(gUrl.toString(), 302);
};

export const config = { path: '/api/gbp-auth' };
