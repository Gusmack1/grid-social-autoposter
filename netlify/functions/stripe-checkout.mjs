// Stripe Checkout — create checkout sessions for subscription plans
// POST /api/stripe-checkout { priceId, email } → returns checkout URL
// GET /api/stripe-checkout?action=portal&customerId=X → returns customer portal URL
import { json, cors, badRequest, serverError } from './lib/http.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { logger } from './lib/logger.mjs';

// Grid Social pricing tiers
const PLANS = {
  free:        { name: 'Free',        profiles: 3,  users: 1,  price: 0 },
  starter:     { name: 'Starter',     profiles: 10, users: 2,  price: 1500 },   // £15 in pence
  agency:      { name: 'Agency',      profiles: 25, users: 5,  price: 5900 },
  agency_pro:  { name: 'Agency Pro',  profiles: 50, users: -1, price: 11900 },  // -1 = unlimited
  enterprise:  { name: 'Enterprise',  profiles: -1, users: -1, price: null },    // custom
};

async function authenticate(req) {
  const adminKey = process.env.ADMIN_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  if (token === adminKey) return { role: 'admin', email: 'admin' };
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) return null;
  return payload;
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) {
    return json({ error: 'Stripe is not configured yet. Add STRIPE_SECRET_KEY to environment variables.' }, 503);
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // Auth check
  const user = await authenticate(req);
  if (!user) return json({ error: 'Unauthorised' }, 401);

  try {
    // ── CREATE CHECKOUT SESSION ──
    if (req.method === 'POST' && (!action || action === 'checkout')) {
      const body = await req.json();
      const { priceId, successUrl, cancelUrl } = body;

      if (!priceId) return badRequest('priceId required');

      const params = new URLSearchParams();
      params.set('mode', 'subscription');
      params.set('payment_method_types[0]', 'card');
      params.set('line_items[0][price]', priceId);
      params.set('line_items[0][quantity]', '1');
      params.set('success_url', successUrl || `${url.origin}/?billing=success`);
      params.set('cancel_url', cancelUrl || `${url.origin}/?billing=cancelled`);
      params.set('subscription_data[trial_period_days]', '14');
      if (user.email && user.email !== 'admin') {
        params.set('customer_email', user.email);
      }

      const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const session = await res.json();

      if (session.error) {
        logger.error('Stripe checkout error', { error: session.error.message });
        return json({ error: session.error.message }, 400);
      }

      logger.info('Checkout session created', { sessionId: session.id, email: user.email });
      return json({ url: session.url, sessionId: session.id });
    }

    // ── CUSTOMER PORTAL ──
    if (action === 'portal') {
      const customerId = url.searchParams.get('customerId');
      if (!customerId) return badRequest('customerId required');

      const params = new URLSearchParams();
      params.set('customer', customerId);
      params.set('return_url', `${url.origin}/`);

      const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const portal = await res.json();

      if (portal.error) return json({ error: portal.error.message }, 400);
      return json({ url: portal.url });
    }

    // ── GET PLANS INFO ──
    if (action === 'plans') {
      return json({ plans: PLANS });
    }

    return badRequest('Unknown action');
  } catch (err) {
    logger.error('Stripe checkout error', { error: err.message });
    return serverError(err.message);
  }
};

export const config = { path: '/api/stripe-checkout' };
