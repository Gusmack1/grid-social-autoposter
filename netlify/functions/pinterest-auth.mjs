// Pinterest OAuth — Step 1: Redirect to Pinterest authorization
// GET /api/pinterest-auth?invite=TOKEN → client portal flow
// GET /api/pinterest-auth → admin flow

export default async (req) => {
  const CLIENT_ID = process.env.PINTEREST_APP_ID;
  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'PINTEREST_APP_ID not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const inviteToken = url.searchParams.get('invite');
  const redirectUri = `${origin}/api/pinterest-callback`;

  const state = btoa(JSON.stringify({
    t: Date.now(),
    invite: inviteToken || null,
    flow: inviteToken ? 'client' : 'admin',
  }));

  const pinUrl = new URL('https://www.pinterest.com/oauth/');
  pinUrl.searchParams.set('response_type', 'code');
  pinUrl.searchParams.set('client_id', CLIENT_ID);
  pinUrl.searchParams.set('redirect_uri', redirectUri);
  pinUrl.searchParams.set('state', state);
  pinUrl.searchParams.set('scope', 'boards:read,boards:write,pins:read,pins:write');

  return Response.redirect(pinUrl.toString(), 302);
};

export const config = { path: '/api/pinterest-auth' };
