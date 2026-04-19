// lib/admin/meta.mjs — owns the `config` action (extracted from admin.mjs)
import { db, DB_BACKEND } from '../db/index.mjs';
import { json } from '../http.mjs';

// eslint-disable-next-line no-unused-vars
export async function handleConfig(req, ctx) {
  const { user } = ctx;
  return json({
    metaAppId: process.env.META_APP_ID || '',
    hasSecret: !!process.env.META_APP_SECRET,
    hasGithubToken: !!process.env.GITHUB_TOKEN,
    hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
    hasQStash: !!process.env.QSTASH_TOKEN,
    hasR2: !!process.env.R2_BUCKET,
    hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    dbBackend: DB_BACKEND,
    user: { email: user.email, name: user.name, role: user.role, plan: user.plan || 'free', assignedClients: user.assignedClients },
  });
}

// Silence unused-import lint — db is not actually needed for config but keeps
// the extraction byte-equivalent with the historical import graph.
void db;
