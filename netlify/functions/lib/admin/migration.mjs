// lib/admin/migration.mjs — owns migrate-tokens + migrate-to-supabase
// (extracted from admin.mjs Phase 3). Both are one-shot admin-only actions.
// Admin-role gate is enforced in the router; do NOT re-check here.
// migrate-supabase stays LAZY-imported — it's rarely-called and cold-starting
// supabase-js on every admin request would be wasteful.
import { migrateTokens } from '../migrate-tokens.mjs';
import { json, badRequest } from '../http.mjs';

// eslint-disable-next-line no-unused-vars
export async function handleMigrateTokens(req, ctx) {
  const result = await migrateTokens();
  return json({ success: true, ...result });
}

// eslint-disable-next-line no-unused-vars
export async function handleMigrateToSupabase(req, ctx) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return badRequest('SUPABASE_URL and SUPABASE_ANON_KEY env vars required');
  }
  const { migrateToSupabase } = await import('../migrate-supabase.mjs');
  const result = await migrateToSupabase();
  return json({ success: true, ...result });
}
