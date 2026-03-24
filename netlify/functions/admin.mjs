// Admin API v4 — Modular, uses shared lib
import { db } from './lib/db/index.mjs';
import { verifyJWT } from './lib/crypto/jwt.mjs';
import { encrypt, decrypt } from './lib/crypto/encryption.mjs';
import { publishToAll, deleteFromPlatforms } from './lib/publisher.mjs';
import { uploadMedia } from './lib/r2.mjs';
import { migrateTokens } from './lib/migrate-tokens.mjs';
import { generateInviteLink, generateApprovalLink } from './lib/invites.mjs';
import { notifyClientPostsReady } from './lib/email.mjs';
import { json, cors, unauthorized, forbidden, badRequest, notFound, serverError } from './lib/http.mjs';
import { logger } from './lib/logger.mjs';

// Authenticate request — returns user object or null
async function authenticate(req) {
  const adminKey = process.env.ADMIN_KEY;
  const jwtSecret = process.env.JWT_SECRET || 'gridsocial-jwt-secret-2026';
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  if (token === adminKey) return { role: 'admin', email: 'admin', assignedClients: [] };
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role, assignedClients: payload.assignedClients || [] };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors();

  const user = await authenticate(req);
  if (!user) return unauthorized();

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const clientId = url.searchParams.get('clientId');

  // Permission checks
  const writeActions = ['add-post', 'update-post', 'delete-post', 'publish-now', 'post-now', 'upload-image', 'delete-from-platform'];
  if (user.role !== 'admin' && clientId && writeActions.includes(action)) {
    if (!user.assignedClients.includes(clientId)) return forbidden("You don't have permission for this client");
  }
  const adminActions = ['add-client', 'update-client', 'delete-client', 'migrate-tokens', 'generate-invite', 'check-token-health', 'generate-approval-link', 'set-approval-mode', 'set-approval-status'];
  if (user.role !== 'admin' && adminActions.includes(action)) return forbidden('Admin access required');

  try {
    // ── CLIENT MANAGEMENT ──
    if (action === 'get-clients') {
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
        _hasTokens: !!(c.pageAccessToken || c.twitterAccessToken || c.linkedinAccessToken || c.gbpAccessToken || c.tiktokAccessToken || c.threadsAccessToken || c.blueskyAppPassword),
      })));
    }

    if (action === 'add-client' && req.method === 'POST') {
      const body = await req.json();
      if (!body.name) return badRequest('Client name required');
      const list = await db.getClients();
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
      list.push(nc);
      await db.saveClients(list);
      return json({ success: true, client: nc });
    }

    if (action === 'update-client' && req.method === 'PUT') {
      const body = await req.json();
      const list = await db.getClients();
      const idx = list.findIndex(c => c.id === body.id);
      if (idx === -1) return notFound('Client not found');
      // Encrypt any new token values (skip masked values)
      const tokenFields = ['pageAccessToken', 'twitterApiKey', 'twitterApiSecret', 'twitterAccessToken', 'twitterAccessSecret', 'linkedinAccessToken', 'linkedinRefreshToken', 'gbpAccessToken', 'tiktokAccessToken', 'threadsAccessToken', 'blueskyAppPassword'];
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

    if (action === 'delete-client' && req.method === 'DELETE') {
      const body = await req.json();
      let list = await db.getClients();
      list = list.filter(c => c.id !== body.id);
      await db.saveClients(list);
      return json({ success: true });
    }

    // ── POST MANAGEMENT ──
    if (!clientId && ['get-posts', 'add-post', 'update-post', 'delete-post', 'publish-now', 'post-now', 'delete-from-platform'].includes(action)) {
      return badRequest('clientId required');
    }

    if (action === 'get-posts') return json(await db.getPosts(clientId));

    if (action === 'add-post' && req.method === 'POST') {
      const body = await req.json();
      if (!body.caption) return badRequest('Caption required');
      const list = await db.getPosts(clientId);
      // Get client's approval mode
      const clients = await db.getClients();
      const client = clients.find(c => c.id === clientId);
      const approvalMode = client?.approvalMode || 'auto';
      let approvalStatus = 'approved'; // auto mode = no approval needed
      if (approvalMode === 'manual') approvalStatus = 'pending';
      if (approvalMode === 'passive') approvalStatus = 'pending';
      const np = {
        id: 'post_' + Date.now(), clientId, caption: body.caption,
        imageUrl: body.imageUrl || null, videoUrl: body.videoUrl || null,
        postType: body.postType || 'feed', platforms: body.platforms || ['facebook'],
        status: body.scheduledFor ? 'scheduled' : 'queued',
        scheduledFor: body.scheduledFor || null,
        approvalStatus,
        approvalMode,
        passiveDeadline: approvalMode === 'passive' ? new Date(Date.now() + (client?.passiveApprovalHours || 72) * 3600 * 1000).toISOString() : null,
        createdAt: new Date().toISOString(), publishedAt: null, results: null,
      };
      list.push(np);
      await db.savePosts(clientId, list);

      // Email client if post needs approval
      if (approvalStatus === 'pending' && client?.clientEmail) {
        const approvalUrl = `${url.origin}/approve`;
        await notifyClientPostsReady({
          clientEmail: client.clientEmail,
          clientName: client.name,
          approvalUrl,
          postCount: 1,
        }).catch(e => logger.warn('Approval email failed', { error: e.message }));
      }

      return json({ success: true, post: np });
    }

    if (action === 'update-post' && req.method === 'PUT') {
      const body = await req.json();
      const list = await db.getPosts(clientId);
      const idx = list.findIndex(p => p.id === body.postId);
      if (idx === -1) return notFound('Post not found');
      Object.assign(list[idx], body);
      await db.savePosts(clientId, list);
      return json({ success: true, post: list[idx] });
    }

    if (action === 'delete-post' && req.method === 'DELETE') {
      const body = await req.json();
      let list = await db.getPosts(clientId);
      list = list.filter(p => p.id !== body.postId);
      await db.savePosts(clientId, list);
      return json({ success: true });
    }

    if (action === 'post-now' && req.method === 'POST') {
      const body = await req.json();
      if (!body.caption) return badRequest('Caption required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === clientId);
      if (!client) return notFound('Client not found');
      const np = {
        id: 'post_' + Date.now(), clientId, caption: body.caption,
        imageUrl: body.imageUrl || null, videoUrl: body.videoUrl || null,
        postType: body.postType || 'feed', platforms: body.platforms || ['facebook'],
        status: 'publishing', createdAt: new Date().toISOString(), publishedAt: null, results: null,
      };
      const results = await publishToAll(client, np);
      np.status = 'published';
      np.publishedAt = new Date().toISOString();
      np.results = results;
      const list = await db.getPosts(clientId);
      list.push(np);
      await db.savePosts(clientId, list);
      return json({ success: true, post: np, results });
    }

    if (action === 'publish-now' && req.method === 'POST') {
      const body = await req.json();
      const clients = await db.getClients();
      const client = clients.find(c => c.id === clientId);
      if (!client) return badRequest('Client not configured');
      const pl = await db.getPosts(clientId);
      const post = pl.find(p => p.id === body.postId);
      if (!post) return notFound('Post not found');
      const results = await publishToAll(client, post);
      const pi = pl.findIndex(p => p.id === body.postId);
      pl[pi].status = 'published';
      pl[pi].publishedAt = new Date().toISOString();
      pl[pi].results = results;
      await db.savePosts(clientId, pl);
      return json({ success: true, results });
    }

    if (action === 'delete-from-platform' && req.method === 'POST') {
      const body = await req.json();
      const clients = await db.getClients();
      const client = clients.find(c => c.id === clientId);
      if (!client) return notFound('Client not found');
      const pl = await db.getPosts(clientId);
      const post = pl.find(p => p.id === body.postId);
      if (!post) return notFound('Post not found');
      if (!post.results) return badRequest('No publish results');
      const dr = await deleteFromPlatforms(client, post);
      const pi = pl.findIndex(p => p.id === body.postId);
      pl[pi].status = 'deleted';
      pl[pi].deletedAt = new Date().toISOString();
      pl[pi].deleteResults = dr;
      await db.savePosts(clientId, pl);
      return json({ success: true, deleteResults: dr });
    }

    // ── IMAGE UPLOAD ──
    if (action === 'upload-image' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'Request body too large or invalid JSON. Try a smaller image.' }, 413); }
      if (!body.filename || !body.content) return badRequest('filename and content required');
      const estSize = Math.round(body.content.length * 0.75 / 1024);
      if (body.content.length > 6 * 1024 * 1024) return json({ error: `Image too large (${estSize}KB). Max ~4MB after compression.` }, 413);
      try {
        const result = await uploadMedia(body.filename, body.content);
        return json({ success: true, url: result.url, path: result.path, size: `${estSize}KB`, provider: result.provider });
      } catch (e) { return serverError(e.message); }
    }

    // ── CONFIG ──
    if (action === 'config') {
      return json({
        metaAppId: process.env.META_APP_ID || '',
        hasSecret: !!process.env.META_APP_SECRET,
        hasGithubToken: !!process.env.GITHUB_TOKEN,
        hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
        hasQStash: !!process.env.QSTASH_TOKEN,
        hasR2: !!process.env.R2_BUCKET,
        user: { email: user.email, name: user.name, role: user.role, assignedClients: user.assignedClients },
      });
    }

    // ── TOKEN MIGRATION (one-time admin action) ──
    if (action === 'migrate-tokens' && req.method === 'POST') {
      const result = await migrateTokens();
      return json({ success: true, ...result });
    }

    // ── GENERATE INVITE LINK ──
    if (action === 'generate-invite' && req.method === 'POST') {
      const body = await req.json();
      if (!body.clientId) return badRequest('clientId required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === body.clientId);
      if (!client) return notFound('Client not found');
      const url = new URL(req.url);
      const invite = await generateInviteLink(body.clientId, client.name, url.origin);
      return json({ success: true, ...invite });
    }

    // ── GENERATE APPROVAL LINK ──
    if (action === 'generate-approval-link' && req.method === 'POST') {
      const body = await req.json();
      if (!body.clientId) return badRequest('clientId required');
      const clients = await db.getClients();
      const client = clients.find(c => c.id === body.clientId);
      if (!client) return notFound('Client not found');
      const url = new URL(req.url);
      const approval = await generateApprovalLink(body.clientId, client.name, url.origin);
      return json({ success: true, ...approval });
    }

    // ── SET CLIENT APPROVAL MODE ──
    if (action === 'set-approval-mode' && req.method === 'PUT') {
      const body = await req.json();
      if (!body.clientId || !body.approvalMode) return badRequest('clientId and approvalMode required');
      const validModes = ['auto', 'manual', 'passive'];
      if (!validModes.includes(body.approvalMode)) return badRequest('approvalMode must be: auto, manual, or passive');
      const clients = await db.getClients();
      const idx = clients.findIndex(c => c.id === body.clientId);
      if (idx === -1) return notFound('Client not found');
      clients[idx].approvalMode = body.approvalMode;
      clients[idx].passiveApprovalHours = body.passiveApprovalHours || 72;
      await db.saveClients(clients);
      return json({ success: true, approvalMode: body.approvalMode });
    }

    // ── SET POST APPROVAL STATUS ──
    if (action === 'set-approval-status' && req.method === 'PUT') {
      const body = await req.json();
      if (!clientId || !body.postId || !body.approvalStatus) return badRequest('clientId, postId, and approvalStatus required');
      const validStatuses = ['pending', 'approved', 'changes_requested'];
      if (!validStatuses.includes(body.approvalStatus)) return badRequest('Invalid approval status');
      const posts = await db.getPosts(clientId);
      const idx = posts.findIndex(p => p.id === body.postId);
      if (idx === -1) return notFound('Post not found');
      posts[idx].approvalStatus = body.approvalStatus;
      if (body.approvalStatus === 'approved') {
        posts[idx].approvedAt = new Date().toISOString();
        posts[idx].approvedBy = user.email;
      }
      await db.savePosts(clientId, posts);
      return json({ success: true, post: posts[idx] });
    }

    // ── CHECK TOKEN HEALTH (manual trigger) ──
    if (action === 'check-token-health') {
      const clients = await db.getClients();
      const results = [];
      for (const client of clients) {
        const health = { clientId: client.id, name: client.name, tokenHealth: client.tokenHealth || null };
        results.push(health);
      }
      return json(results);
    }

    return badRequest('Unknown action: ' + action);
  } catch (err) {
    logger.error('Admin API error', { action, error: err.message, stack: err.stack });
    return serverError(err.message);
  }
};
