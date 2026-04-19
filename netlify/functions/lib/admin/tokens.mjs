// lib/admin/tokens.mjs — owns the `check-token-health` action (extracted from admin.mjs)
import { db } from '../db/index.mjs';
import { json } from '../http.mjs';

// eslint-disable-next-line no-unused-vars
export async function handleCheckTokenHealth(req, ctx) {
  const clients = await db.getClients();
  const results = [];
  for (const client of clients) {
    const health = { clientId: client.id, name: client.name, tokenHealth: client.tokenHealth || null };
    results.push(health);
  }
  return json(results);
}
