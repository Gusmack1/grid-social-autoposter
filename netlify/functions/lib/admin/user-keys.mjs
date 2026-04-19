// lib/admin/user-keys.mjs — owns save-api-key / remove-api-key / check-api-key
// (extracted from admin.mjs Phase 2). The emailKey transform below is COPIED
// VERBATIM from admin.mjs — its reverse lives in lib/db/supabase.mjs (indexOf(_)).
// ANY divergence corrupts every user's Anthropic-key lookup. Do not "refactor".
// See claude_brain fact #300.
import { db } from '../db/index.mjs';
import { encrypt } from '../crypto/encryption.mjs';
import { logger } from '../logger.mjs';
import { json, badRequest } from '../http.mjs';

export async function handleSaveApiKey(req, ctx) {
  const { user } = ctx;
  const body = await req.json();
  const { apiKey } = body;
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    return badRequest('Invalid Anthropic API key. It should start with sk-ant-');
  }
  const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const userData = await db.getUser(emailKey) || { email: user.email };
  userData.anthropicApiKey = encrypt(apiKey);
  userData.apiKeySetAt = new Date().toISOString();
  await db.saveUser(emailKey, userData);
  logger.info('User saved Anthropic API key', { email: user.email });
  return json({ success: true, hasKey: true });
}

// eslint-disable-next-line no-unused-vars
export async function handleRemoveApiKey(req, ctx) {
  const { user } = ctx;
  const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const userData = await db.getUser(emailKey);
  if (userData) {
    delete userData.anthropicApiKey;
    delete userData.apiKeySetAt;
    await db.saveUser(emailKey, userData);
  }
  return json({ success: true, hasKey: false });
}

// eslint-disable-next-line no-unused-vars
export async function handleCheckApiKey(req, ctx) {
  const { user } = ctx;
  const emailKey = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const userData = await db.getUser(emailKey);
  return json({
    hasKey: !!(userData?.anthropicApiKey),
    setAt: userData?.apiKeySetAt || null,
  });
}
