// harvest-client-pages-now.mjs — manual on-demand version of the weekly
// Sunday harvester. Requires ?key=${ADMIN_KEY} query param (mirrors
// admin-wipe.mjs auth pattern).

import { db } from './lib/db/index.mjs';
import { decrypt } from './lib/crypto/encryption.mjs';
import { json, cors } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';
import { harvestAll } from './lib/harvest-core.mjs';

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key || key !== process.env.ADMIN_KEY) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ ok: false, error: 'supabase_not_configured' }, 503);
  }

  const clients = await db.getClients();
  const summary = await harvestAll({ clients, decrypt, SUPABASE_URL, SUPABASE_KEY, logger });

  logger.info('harvest-client-pages-now complete', { clients_processed: summary.clients_processed, posts_harvested_total: summary.posts_harvested_total });
  return json({ ok: true, ...summary });
};
