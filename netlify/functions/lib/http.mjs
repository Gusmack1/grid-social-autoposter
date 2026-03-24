// HTTP response helpers
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...SECURITY },
  });
}

export function cors() {
  return new Response(null, { status: 204, headers: CORS });
}

export function unauthorized() { return json({ error: 'Unauthorised' }, 401); }
export function forbidden(msg = 'Forbidden') { return json({ error: msg }, 403); }
export function badRequest(msg) { return json({ error: msg }, 400); }
export function notFound(msg = 'Not found') { return json({ error: msg }, 404); }
export function serverError(msg) { return json({ error: msg }, 500); }
