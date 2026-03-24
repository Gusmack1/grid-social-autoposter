// One-time migration: encrypt all plaintext tokens in client records
import { db } from './db/index.mjs';
import { encrypt, isEncrypted } from './crypto/encryption.mjs';
import { logger } from './logger.mjs';

const TOKEN_FIELDS = [
  'pageAccessToken', 'twitterApiKey', 'twitterApiSecret',
  'twitterAccessToken', 'twitterAccessSecret', 'linkedinAccessToken',
  'gbpAccessToken', 'tiktokAccessToken',
];

export async function migrateTokens() {
  const clients = await db.getClients();
  let migrated = 0;
  let skipped = 0;

  for (const client of clients) {
    let changed = false;
    for (const field of TOKEN_FIELDS) {
      if (client[field] && !isEncrypted(client[field])) {
        client[field] = encrypt(client[field]);
        changed = true;
        migrated++;
      } else if (client[field] && isEncrypted(client[field])) {
        skipped++;
      }
    }
    if (changed) {
      logger.info('Encrypted tokens for client', { clientId: client.id, name: client.name });
    }
  }

  if (migrated > 0) {
    await db.saveClients(clients);
  }

  logger.info('Token migration complete', { migrated, skipped, totalClients: clients.length });
  return { migrated, skipped, totalClients: clients.length };
}
