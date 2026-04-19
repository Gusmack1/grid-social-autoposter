// lib/admin/clients.mjs — owns get-clients / add-client / update-client /
// delete-client (extracted from admin.mjs Phase 3). The three token-field
// lists below (mask in get-clients, encrypt on add-client, encrypt-or-skip on
// update-client) are COPIED VERBATIM from admin.mjs. Any reordering or name
// drift breaks the frontend client modal + corrupts token storage.
// Phase 4 will centralise these into lib/admin/_token-fields.mjs; until then,
// KEEP THEM BYTE-IDENTICAL. See refactor plan §"Top risks" item 2.
import { db } from '../db/index.mjs';
import { encrypt, decrypt } from '../crypto/encryption.mjs';
import { checkPlanLimit } from '../plan-limits.mjs';
import { json, badRequest, notFound } from '../http.mjs';

// eslint-disable-next-line no-unused-vars
export async function handleGetClients(req, ctx) {
  const clients = await db.getClients();
  // Strip decrypted tokens from response (show only whether they exist)
  return json(clients.map(c => ({
    ...c,
    pageAccessToken: c.pageAccessToken ? '••••' + (decrypt(c.pageAccessToken) || '').slice(-6) : null,
    twitterApiKey: c.twitterApiKey ? '••••' : null,
    twitterApiSecret: c.twitterApiSecret ? '••••' : null,
    twitterAccessToken: c.twitterAccessToken ? '••••' : null,
    twitterAccessSecret: c.twitterAccessSecret ? '••••' : null,
    linkedinAccessToken: c.linkedinAccessToken ? '••••' : null,
    gbpAccessToken: c.gbpAccessToken ? '••••' : null,
    tiktokAccessToken: c.tiktokAccessToken ? '••••' : null,
    threadsAccessToken: c.threadsAccessToken ? '••••' : null,
    blueskyAppPassword: c.blueskyAppPassword ? '••••' : null,
    linkedinRefreshToken: c.linkedinRefreshToken ? '••••' : null,
    pinterestAccessToken: c.pinterestAccessToken ? '••••' : null,
    pinterestRefreshToken: c.pinterestRefreshToken ? '••••' : null,
    _hasTokens: !!(c.pageAccessToken || c.twitterAccessToken || c.linkedinAccessToken || c.gbpAccessToken || c.tiktokAccessToken || c.threadsAccessToken || c.blueskyAppPassword || c.pinterestAccessToken),
  })));
}

export async function handleAddClient(req, ctx) {
  const { user } = ctx;
  const body = await req.json();
  if (!body.name) return badRequest('Client name required');
  const list = await db.getClients();

  // Plan limit check
  const userPlan = user.plan || 'free';
  const limitCheck = await checkPlanLimit(userPlan, 'add-client', { clientCount: list.length });
  if (!limitCheck.allowed) return json({ error: limitCheck.reason, usage: limitCheck.usage }, 403);

  // Encrypt tokens on save
  const nc = { id: 'client_' + Date.now(), ...body, createdAt: new Date().toISOString() };
  if (nc.pageAccessToken) nc.pageAccessToken = encrypt(nc.pageAccessToken);
  if (nc.twitterApiKey) nc.twitterApiKey = encrypt(nc.twitterApiKey);
  if (nc.twitterApiSecret) nc.twitterApiSecret = encrypt(nc.twitterApiSecret);
  if (nc.twitterAccessToken) nc.twitterAccessToken = encrypt(nc.twitterAccessToken);
  if (nc.twitterAccessSecret) nc.twitterAccessSecret = encrypt(nc.twitterAccessSecret);
  if (nc.linkedinAccessToken) nc.linkedinAccessToken = encrypt(nc.linkedinAccessToken);
  if (nc.gbpAccessToken) nc.gbpAccessToken = encrypt(nc.gbpAccessToken);
  if (nc.tiktokAccessToken) nc.tiktokAccessToken = encrypt(nc.tiktokAccessToken);
  if (nc.threadsAccessToken) nc.threadsAccessToken = encrypt(nc.threadsAccessToken);
  if (nc.blueskyAppPassword) nc.blueskyAppPassword = encrypt(nc.blueskyAppPassword);
  if (nc.linkedinRefreshToken) nc.linkedinRefreshToken = encrypt(nc.linkedinRefreshToken);
  if (nc.pinterestAccessToken) nc.pinterestAccessToken = encrypt(nc.pinterestAccessToken);
  if (nc.pinterestRefreshToken) nc.pinterestRefreshToken = encrypt(nc.pinterestRefreshToken);
  list.push(nc);
  await db.saveClients(list);
  return json({ success: true, client: nc });
}

// eslint-disable-next-line no-unused-vars
export async function handleUpdateClient(req, ctx) {
  const body = await req.json();
  const list = await db.getClients();
  const idx = list.findIndex(c => c.id === body.id);
  if (idx === -1) return notFound('Client not found');
  // Encrypt any new token values (skip masked values)
  const tokenFields = ['pageAccessToken', 'twitterApiKey', 'twitterApiSecret', 'twitterAccessToken', 'twitterAccessSecret', 'linkedinAccessToken', 'linkedinRefreshToken', 'gbpAccessToken', 'tiktokAccessToken', 'threadsAccessToken', 'blueskyAppPassword', 'pinterestAccessToken', 'pinterestRefreshToken'];
  for (const f of tokenFields) {
    if (body[f] && !body[f].startsWith('••••') && !body[f].startsWith('enc:')) {
      body[f] = encrypt(body[f]);
    } else if (body[f]?.startsWith('••••')) {
      delete body[f]; // Don't overwrite with masked value
    }
  }
  list[idx] = { ...list[idx], ...body, updatedAt: new Date().toISOString() };
  await db.saveClients(list);
  return json({ success: true, client: list[idx] });
}

// eslint-disable-next-line no-unused-vars
export async function handleDeleteClient(req, ctx) {
  const body = await req.json();
  let list = await db.getClients();
  list = list.filter(c => c.id !== body.id);
  await db.saveClients(list);
  return json({ success: true });
}
