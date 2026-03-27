// Migration: Netlify Blobs → Supabase
// Run via admin API: POST /api/admin?action=migrate-to-supabase
import { getStore } from '@netlify/blobs';
import { supabaseDb } from './db/supabase.mjs';
import { logger } from './logger.mjs';

// Sanitise client objects: rename/remove fields that don't match the Supabase schema
function sanitiseClient(c) {
  const copy = { ...c };
  // Rename 'logo' → 'logoUrl' (schema column is logo_url)
  if ('logo' in copy && !('logoUrl' in copy)) {
    copy.logoUrl = copy.logo;
  }
  delete copy.logo;
  // Strip any fields not in the schema to avoid PGRST204 errors
  const ALLOWED = new Set([
    'id','name','clientEmail','fbPageId','igUserId','pageAccessToken',
    'twitterApiKey','twitterApiSecret','twitterAccessToken','twitterAccessSecret',
    'linkedinAccessToken','linkedinRefreshToken','linkedinId',
    'gbpAccessToken','gbpRefreshToken','gbpLocationId',
    'tiktokAccessToken','tiktokRefreshToken',
    'threadsUserId','threadsAccessToken',
    'blueskyIdentifier','blueskyAppPassword',
    'pinterestAccessToken','pinterestRefreshToken','pinterestBoardId',
    'approvalMode','passiveApprovalHours','brandName','brandColor',
    'logoUrl','customDomain','tokenHealth','createdAt','updatedAt',
  ]);
  for (const key of Object.keys(copy)) {
    if (!ALLOWED.has(key)) delete copy[key];
  }
  return copy;
}

export async function migrateToSupabase() {
  const results = { clients: 0, posts: 0, users: 0, history: 0, errors: [] };

  try {
    // 1. Migrate clients
    logger.info('Migration: reading clients from Blobs...');
    const clientsStore = getStore('clients');
    const clientsList = await clientsStore.get('list', { type: 'json' }).catch(() => []) || [];
    if (clientsList.length > 0) {
      const cleaned = clientsList.map(sanitiseClient);
      await supabaseDb.saveClients(cleaned);
      results.clients = clientsList.length;
      logger.info(`Migration: ${clientsList.length} clients migrated`);
    }

    // 2. Migrate posts (keyed by clientId)
    const postsStore = getStore('posts');
    for (const client of clientsList) {
      try {
        const posts = await postsStore.get(client.id, { type: 'json' }).catch(() => []) || [];
        if (posts.length > 0) {
          await supabaseDb.savePosts(client.id, posts);
          results.posts += posts.length;
        }
      } catch (e) {
        results.errors.push(`Posts for ${client.id}: ${e.message}`);
      }
    }
    logger.info(`Migration: ${results.posts} posts migrated`);

    // 3. Migrate users
    const usersStore = getStore('users');
    try {
      const { blobs } = await usersStore.list();
      for (const blob of blobs) {
        try {
          const user = await usersStore.get(blob.key, { type: 'json' });
          if (user) {
            await supabaseDb.saveUser(blob.key, user);
            results.users++;
          }
        } catch (e) {
          results.errors.push(`User ${blob.key}: ${e.message}`);
        }
      }
    } catch (e) {
      results.errors.push(`Users list: ${e.message}`);
    }
    logger.info(`Migration: ${results.users} users migrated`);

    // 4. Migrate history (keyed by clientId)
    const historyStore = getStore('history');
    for (const client of clientsList) {
      try {
        const history = await historyStore.get(client.id, { type: 'json' }).catch(() => []) || [];
        if (history.length > 0) {
          await supabaseDb.saveHistory(client.id, history);
          results.history += history.length;
        }
      } catch (e) {
        results.errors.push(`History for ${client.id}: ${e.message}`);
      }
    }
    logger.info(`Migration: ${results.history} history entries migrated`);

    logger.info('Migration complete', results);
    return results;

  } catch (e) {
    logger.error('Migration failed', { error: e.message });
    results.errors.push(`Fatal: ${e.message}`);
    return results;
  }
}
