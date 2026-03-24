// LinkedIn OAuth — Step 1: Redirect to LinkedIn authorization
// GET /api/linkedin-auth → admin flow (dashboard)
// GET /api/linkedin-auth?invite=TOKEN → client portal flow

export default async (req) => {
  const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
  if (!CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'LINKEDIN_CLIENT_ID not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const origin = url.origin;
  const inviteToken = url.searchParams.get('invite');
  const redirectUri = `${origin}/api/linkedin-callback`;

  // State carries context through the OAuth redirect
  const state = btoa(JSON.stringify({
    t: Date.now(),
    invite: inviteToken || null,
    flow: inviteToken ? 'client' : 'admin',
  }));

  const liUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
  liUrl.searchParams.set('response_type', 'code');
  liUrl.searchParams.set('client_id', CLIENT_ID);
  liUrl.searchParams.set('redirect_uri', redirectUri);
  liUrl.searchParams.set('state', state);
  // Community Management API scopes for posting to company pages
  liUrl.searchParams.set('scope', [
    'openid',
    'profile',
    'w_member_social',
    'w_organization_social',
    'rw_organization_admin',
  ].join(' '));

  return Response.redirect(liUrl.toString(), 302);
};

export const config = { path: '/api/linkedin-auth' };
