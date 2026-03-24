// Stripe Webhook — handles subscription lifecycle events
// POST /api/stripe-webhook → called by Stripe with event payload
import { db } from './lib/db/index.mjs';
import { logger } from './lib/logger.mjs';
import crypto from 'crypto';

// Verify Stripe webhook signature
function verifySignature(payload, sigHeader, secret) {
  if (!secret) return true; // Skip verification in dev
  const elements = sigHeader.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.slice(2);
  const signature = elements.find(e => e.startsWith('v1='))?.slice(3);
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// Plan limits
const PLAN_LIMITS = {
  free:       { profiles: 3,  users: 1  },
  starter:    { profiles: 10, users: 2  },
  agency:     { profiles: 25, users: 5  },
  agency_pro: { profiles: 50, users: -1 }, // -1 = unlimited
  enterprise: { profiles: -1, users: -1 },
};

function getPlanFromPrice(priceId) {
  // Map Stripe price IDs to plan names
  // These need to be set after creating products in Stripe
  const priceMap = {
    [process.env.STRIPE_PRICE_STARTER]: 'starter',
    [process.env.STRIPE_PRICE_AGENCY]: 'agency',
    [process.env.STRIPE_PRICE_AGENCY_PRO]: 'agency_pro',
    [process.env.STRIPE_PRICE_ENTERPRISE]: 'enterprise',
  };
  return priceMap[priceId] || 'free';
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') || '';

  // Verify signature
  if (WEBHOOK_SECRET) {
    try {
      if (!verifySignature(rawBody, sigHeader, WEBHOOK_SECRET)) {
        logger.warn('Stripe webhook signature verification failed');
        return new Response('Invalid signature', { status: 400 });
      }
    } catch (e) {
      logger.error('Stripe signature error', { error: e.message });
      return new Response('Signature error', { status: 400 });
    }
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerEmail = session.customer_email || session.customer_details?.email;
        const customerId = session.customer;
        const subscriptionId = session.subscription;

        if (customerEmail) {
          // Find user and update their plan
          const emailKey = customerEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
          const user = await db.getUser(emailKey);
          if (user) {
            user.stripeCustomerId = customerId;
            user.stripeSubscriptionId = subscriptionId;
            user.plan = 'starter'; // Will be updated by subscription.updated event
            user.planUpdatedAt = new Date().toISOString();
            await db.saveUser(emailKey, user);
            logger.info('User plan updated after checkout', { email: customerEmail, customerId });
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const plan = getPlanFromPrice(priceId);
        const status = subscription.status; // active, trialing, past_due, cancelled

        // Find user by stripeCustomerId
        const allUsers = await db.listUsers();
        const user = allUsers.find(u => u.stripeCustomerId === customerId);
        if (user) {
          const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
          user.plan = plan;
          user.planStatus = status;
          user.planLimits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
          user.stripeSubscriptionId = subscription.id;
          user.planUpdatedAt = new Date().toISOString();
          await db.saveUser(emailKey, user);
          logger.info('Subscription updated', { email: user.email, plan, status });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const allUsers = await db.listUsers();
        const user = allUsers.find(u => u.stripeCustomerId === customerId);
        if (user) {
          const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
          user.plan = 'free';
          user.planStatus = 'cancelled';
          user.planLimits = PLAN_LIMITS.free;
          user.planUpdatedAt = new Date().toISOString();
          await db.saveUser(emailKey, user);
          logger.info('Subscription cancelled', { email: user.email });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        logger.warn('Payment failed', { customerId, amount: invoice.amount_due });
        // Could send notification email here
        break;
      }

      default:
        logger.info('Unhandled Stripe event', { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    logger.error('Stripe webhook processing error', { error: err.message, type: event.type });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/stripe-webhook' };
