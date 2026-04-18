// harvest-client-pages.mjs — weekly passive harvest of each client's Facebook
// Page posts into public.client_assets. Feeds Generator v2 CLIENT CONTEXT so
// captions stay grounded in each client's real products, offers and voice.
//
// Runs Sunday 03:00 UTC. No client form involved — pure Graph API pull.

import { db } from './lib/db/index.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { logger } from './lib/logger.mjs';
import { harvestAll } from './lib/harvest-core.mjs';

export default async function handler() {
  logger.info('harvest-client-pages triggered');
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(JSON.stringify({ error: 'supabase_not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const clients = await db.getClients();
  const summary = await harvestAll({ clients, decrypt, SUPABASE_URL, SUPABASE_KEY, logger });

  logger.info('harvest-client-pages complete', { clients_processed: summary.clients_processed, posts_harvested_total: summary.posts_harvested_total });
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  schedule: '0 3 * * 0',
};
